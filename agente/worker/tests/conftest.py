"""Configura o path do agente para imports absolutos (core.*, automacoes.*)."""

import socket
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

HOSTS_LOCAIS = {"127.0.0.1", "::1", "localhost"}
RAIZ_AGENTE = Path(__file__).resolve().parent.parent
TESTES = Path(__file__).resolve().parent
for caminho in (RAIZ_AGENTE, TESTES):
    if str(caminho) not in sys.path:
        sys.path.insert(0, str(caminho))



@pytest.fixture(autouse=True)
def _sem_rede_externa(monkeypatch):
    """Nenhum teste do agente sai do próprio computador (nem SEFAZ, nem internet): só loopback e socket local."""
    conectar_original = socket.socket.connect

    def conectar(self, endereco, *args, **kwargs):
        host = endereco[0] if isinstance(endereco, tuple) else None
        if self.family != socket.AF_UNIX and host not in HOSTS_LOCAIS:
            raise AssertionError(f"chamada de rede fora do computador bloqueada: {endereco!r}")
        return conectar_original(self, endereco, *args, **kwargs)

    monkeypatch.setattr(socket.socket, "connect", conectar)


@pytest.fixture(autouse=True)
def _isolar_pasta_base(monkeypatch):
    """PASTA_BASE vem do .env local (load_dotenv) e vazaria para os testes; cada teste define a sua."""
    monkeypatch.delenv("PASTA_BASE", raising=False)


# --- TEST-11 (#688): o agente falando com o backend real (banco descartável + massa #680) ---

NOME_CLIENTE_A = "Cliente Sintetico A"


@pytest.fixture(scope="session")
def backend_real(tmp_path_factory):
    """Backend real (app.js sem jobs) no banco descartável, com a massa #680. Sobe uma vez por sessão."""
    import apoio_backend_real as apoio

    motivo = apoio.ambiente_disponivel()
    if motivo:
        pytest.skip(motivo)
    backend = apoio.iniciar(tmp_path_factory.mktemp("backend-real"))
    # O nome da massa ("Contexto sintético A #680") tem "#", que o agente recusa em nome de pasta
    # (core.utils.validar_nome). Aqui o nome só serve de pasta do cliente; o resto da massa não muda.
    backend.renomear_cliente(backend.clientes["a"]["id"], NOME_CLIENTE_A)
    yield backend
    backend.encerrar()


@pytest.fixture
def agente_nfe(backend_real, tmp_path, monkeypatch):
    """Agente do escritório A apontado para o backend real: pasta do cliente vazia e banco sem notas."""
    backend_real.limpar_estado_de_teste()
    base = tmp_path / "escritorio"
    inbox = base / "NFe"
    inbox.mkdir(parents=True)
    cliente_a = backend_real.clientes["a"]
    # Máquina com HTTP(S)_PROXY (rede corporativa, VPN) mandaria o requests do agente para o proxy mesmo
    # com destino 127.0.0.1; o backend real sobe local, então o loopback fica fora do proxy.
    monkeypatch.setenv("NO_PROXY", "127.0.0.1,localhost")
    monkeypatch.setenv("PASTA_BASE", str(base))
    monkeypatch.setattr("comunicacao.api_client.API_URL", backend_real.url)
    monkeypatch.setattr("comunicacao.api_client.LICENSE_TOKEN", cliente_a["token"])
    monkeypatch.setattr("comunicacao.api_client.CLIENTE_ID", cliente_a["id"])
    monkeypatch.setattr("comunicacao.api_client.PASTA_BASE", str(base))
    monkeypatch.setattr("comunicacao.fila_eventos.FILA_PATH", str(tmp_path / "fila_eventos.json"))
    return SimpleNamespace(backend=backend_real, inbox=inbox, base=base, a=cliente_a, nome_a=NOME_CLIENTE_A)
