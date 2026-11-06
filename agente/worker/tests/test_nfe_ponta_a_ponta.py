"""TEST-11 (#688): o caminho da NF-e do agente até a escrituração, de ponta a ponta.

O agente lê o XML na pasta do cliente (`processar_pasta_nfe`), consulta o cadastro, posta o
lançamento e arquiva o arquivo, falando por HTTP com o backend REAL (app.js sem jobs) sobre o
banco descartável da TEST-1 com a massa #680 (ver `apoio_backend_real.py` e o `conftest.py`). Nada é
mockado no caminho: nem a API, nem o banco. O que o governo responderia vem de arquivo gravado
(`fixtures/nfe/evento-cancelamento-homologado.xml` e os XMLs assinados da massa), sem chamada à SEFAZ.

O resultado é conferido no BANCO (as duas tabelas, nota e itens) e na pasta, contra o que a massa
#680 declara de cada nota: chave, emitente, destinatário, valor, data, tpNF e itens. Status e
cancelamento ficam de fora: o XML é a autorização. O cancelamento é conferido nos testes próprios
deste arquivo. O único relógio é o do prazo de 90 s do cancelamento órfão, que o teste controla (não dorme).

Só roda sob `npm test` na raiz (precisa do banco descartável); fora dele o teste é pulado com o motivo.
"""

import os
import re
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

import pytest

import automacoes.processar_nfe as processar_nfe
from automacoes.processar_nfe import ESPERA_CANCELAMENTO_SEM_NOTA_SEGUNDOS, processar_pasta_nfe

MASSA = Path(__file__).resolve().parents[3] / "backend" / "tests" / "fixtures" / "massa-680"
EVENTO_CANCELAMENTO = Path(__file__).resolve().parent / "fixtures" / "nfe" / "evento-cancelamento-homologado.xml"
# Notas da massa que o backend escritura (têm protocolo de autorização): ver criarMassaDominio680.
CASOS_ESCRITURAVEIS = ["entrada-autorizada", "saida-autorizada", "saida-cancelada", "entrada-emitente-cpf"]
TODOS_OS_CASOS = [*CASOS_ESCRITURAVEIS, "entrada-sem-protocolo"]


# --- apoio ---------------------------------------------------------------------------------------

def _colocar_na_pasta(pasta: Path, caso: str, rotulo: str = "a", como: str | None = None) -> Path:
    """Copia o XML assinado da massa para a pasta de entrada do agente."""
    origem = MASSA / f"nfe-{rotulo}-{caso}.xml"
    destino = pasta / (como or origem.name)
    destino.write_bytes(origem.read_bytes())
    return destino


def _nota_da_massa(agente, caso: str, rotulo: str = "a") -> dict:
    return next(
        e for e in agente.backend.entradas
        if e["caso"] == caso and e["cliente_id"] == agente.backend.clientes[rotulo]["id"]
    )


# Chave de uma nota que o sistema nunca recebeu: número 999999 (fora da massa). DV 3 calculado à mão
# (módulo 11, pesos 2..9 da direita para a esquerda): soma 899, 899 % 11 = 8, DV = 11 - 8 = 3.
CHAVE_DE_NOTA_QUE_O_SISTEMA_NUNCA_RECEBEU = "35261068090001000108550010009999991009999993"


def _colocar_evento(pasta: Path, nome: str, chave: str) -> Path:
    destino = pasta / nome
    destino.write_text(EVENTO_CANCELAMENTO.read_text(encoding="utf-8").replace("{chave}", chave), encoding="utf-8")
    return destino


def _confere_lancamento_contra_a_massa(linha: dict, esperada: dict) -> None:
    """Chave, valor, direção, emitente, destinatário, data, tpNF e itens, contra o que a massa declara."""
    assert linha["cliente_id"] == esperada["cliente_id"]
    assert linha["chave_nfe"] == esperada["chave_nfe"]
    assert linha["tipo"] == esperada["tipo"]
    assert linha["cnpj_emitente"] == esperada["cnpj_emitente"]
    assert linha["cnpj_destinatario"] == esperada["cnpj_destinatario"]
    for campo in ("valor_total", "icms", "pis", "cofins", "ipi"):
        assert Decimal(str(linha[campo])) == Decimal(str(esperada[campo])), campo
    assert linha["data_emissao"] == esperada["data_emissao"]
    assert linha["tp_nf"] == esperada["tp_nf"]
    # O XML é só a autorização: status "ativa" e sem cancelado_em; o cancelamento chega por evento.
    assert linha["status"] == "ativa"
    assert linha["cancelado_em"] is None
    assert linha["itens"] == esperada["itens"]
    assert linha["itens"], "nota sem itens na segunda tabela"


def _arquivos(pasta: Path) -> list[str]:
    return sorted(p.name for p in pasta.iterdir() if p.is_file())


class Relogio:
    """Relógio do teste para o prazo de 90 s do cancelamento sem nota: o teste avança, não dorme."""

    def __init__(self):
        self.agora = datetime(2026, 10, 16, 12, 0, tzinfo=timezone.utc)

    def __call__(self):
        return self.agora

    def avancar(self, segundos: float):
        self.agora += timedelta(seconds=segundos)


# --- 1. XML na pasta vira lançamento no banco ----------------------------------------------------

@pytest.mark.parametrize("caso", CASOS_ESCRITURAVEIS)
def test_xml_na_pasta_vira_lancamento_com_os_campos_conferidos(agente_nfe, caso):
    nota = _nota_da_massa(agente_nfe, caso)
    _colocar_na_pasta(agente_nfe.inbox, caso)

    processar_pasta_nfe(str(agente_nfe.inbox))

    linhas = agente_nfe.backend.lancamentos()
    assert len(linhas) == 1
    esperada = agente_nfe.backend.esperadas[nota["chave"]]
    _confere_lancamento_contra_a_massa(linhas[0], esperada)
    if caso == "entrada-emitente-cpf":
        # NFE-5 (#659): produtor rural (emitente CPF) entra com 11 dígitos, sem padar para 14.
        assert len(linhas[0]["cnpj_emitente"]) == 11
    # O caminho gravado no banco aponta para o arquivo que de fato foi arquivado na pasta do cliente.
    relativo = f"{agente_nfe.nome_a}/Notas Fiscais/{esperada['data_emissao'][:7]}/nfe-a-{caso}.xml"
    assert linhas[0]["arquivo_xml"] == relativo
    assert (agente_nfe.base / relativo).is_file()
    assert _arquivos(agente_nfe.inbox) == []


def test_pasta_com_todas_as_notas_do_escritorio_escritura_so_as_autorizadas(agente_nfe):
    for caso in TODOS_OS_CASOS:
        _colocar_na_pasta(agente_nfe.inbox, caso)

    processar_pasta_nfe(str(agente_nfe.inbox))

    linhas = agente_nfe.backend.lancamentos()
    assert sorted(linha["chave_nfe"] for linha in linhas) == sorted(
        _nota_da_massa(agente_nfe, caso)["chave"] for caso in CASOS_ESCRITURAVEIS
    )
    for linha in linhas:
        _confere_lancamento_contra_a_massa(linha, agente_nfe.backend.esperadas[linha["chave_nfe"]])
    # Todas as linhas e só os itens delas: nada solto na segunda tabela.
    assert agente_nfe.backend.contar("lancamentos_fiscais_itens") == len(CASOS_ESCRITURAVEIS)
    assert _arquivos(agente_nfe.inbox) == []


# --- 2. arquivo repetido não duplica -------------------------------------------------------------

def test_arquivo_repetido_nao_duplica_o_lancamento(agente_nfe):
    nota = _nota_da_massa(agente_nfe, "saida-autorizada")
    _colocar_na_pasta(agente_nfe.inbox, "saida-autorizada")
    processar_pasta_nfe(str(agente_nfe.inbox))
    antes = agente_nfe.backend.lancamentos()
    assert len(antes) == 1

    # O mesmo XML cai de novo na pasta (cópia do contador, com outro nome).
    _colocar_na_pasta(agente_nfe.inbox, "saida-autorizada", como="copia-da-nota.xml")
    processar_pasta_nfe(str(agente_nfe.inbox))

    assert agente_nfe.backend.lancamentos() == antes
    assert agente_nfe.backend.contar("lancamentos_fiscais_itens") == 1
    assert (agente_nfe.inbox / "duplicadas" / "copia-da-nota.xml").is_file()
    assert _arquivos(agente_nfe.inbox) == []
    assert antes[0]["chave_nfe"] == nota["chave"]


def test_mesmo_arquivo_duas_vezes_na_mesma_varredura_grava_uma_nota(agente_nfe):
    _colocar_na_pasta(agente_nfe.inbox, "entrada-autorizada")
    _colocar_na_pasta(agente_nfe.inbox, "entrada-autorizada", como="nfe-a-entrada-autorizada-segunda-via.xml")

    processar_pasta_nfe(str(agente_nfe.inbox))

    assert len(agente_nfe.backend.lancamentos()) == 1
    assert agente_nfe.backend.contar("lancamentos_fiscais_itens") == 1
    assert len(list((agente_nfe.inbox / "duplicadas").iterdir())) == 1


# --- 3. nota sem protocolo não vira lançamento ---------------------------------------------------

def _autorizada_com_cstat(cstat: str) -> str:
    """A nota autorizada da massa com o cStat do protocolo trocado. A assinatura cobre o infNFe, não o
    protNFe, então continua válida: só a falta de autorização fiscal pode recusar a nota."""
    xml = (MASSA / "nfe-a-entrada-autorizada.xml").read_text(encoding="utf-8")
    assert xml.count("<cStat>100</cStat>") == 1
    return xml.replace("<cStat>100</cStat>", f"<cStat>{cstat}</cStat>")


@pytest.mark.parametrize("variante, motivo", [
    ("nfe-raiz", "protocolo"),            # <NFe> pura, como saiu do emissor, sem nfeProc
    ("cstat-110", "cStat=110"),           # nfeProc com uso denegado
    ("cstat-204", "cStat=204"),           # nfeProc com rejeição (duplicidade de NF-e)
])
def test_nota_sem_autorizacao_nao_vira_lancamento(agente_nfe, capsys, variante, motivo):
    nome = "nota.xml"
    if variante == "nfe-raiz":
        _colocar_na_pasta(agente_nfe.inbox, "entrada-sem-protocolo", como=nome)
    else:
        (agente_nfe.inbox / nome).write_text(_autorizada_com_cstat(variante.split("-")[1]), encoding="utf-8")

    processar_pasta_nfe(str(agente_nfe.inbox))

    assert agente_nfe.backend.lancamentos() == []
    assert agente_nfe.backend.contar("lancamentos_fiscais_itens") == 0
    # Fica na quarentena, com o motivo no log, e não volta para a varredura.
    assert (agente_nfe.inbox / "nao_identificado" / nome).is_file()
    assert _arquivos(agente_nfe.inbox) == []
    assert motivo in capsys.readouterr().out


def test_nota_sem_assinatura_digital_nao_vira_lancamento(agente_nfe, capsys):
    xml = (MASSA / "nfe-a-entrada-autorizada.xml").read_text(encoding="utf-8")
    sem_assinatura = re.sub(r"<ds:Signature.*?</ds:Signature>", "", xml, flags=re.DOTALL)
    assert sem_assinatura != xml
    (agente_nfe.inbox / "sem-assinatura.xml").write_text(sem_assinatura, encoding="utf-8")

    processar_pasta_nfe(str(agente_nfe.inbox))

    assert agente_nfe.backend.lancamentos() == []
    assert agente_nfe.backend.contar("lancamentos_fiscais_itens") == 0
    assert (agente_nfe.inbox / "nao_identificado" / "sem-assinatura.xml").is_file()
    assert _arquivos(agente_nfe.inbox) == []
    assert "assinatura" in capsys.readouterr().out.lower()


# --- isolamento entre escritórios, vindo do lado do agente ---------------------------------------

def test_nota_de_outro_escritorio_na_pasta_nao_entra_em_nenhum_livro(agente_nfe):
    """Agente do A recebe o XML do B: a consulta de cadastro não resolve o CNPJ do B para a licença do A."""
    _colocar_na_pasta(agente_nfe.inbox, "entrada-autorizada", rotulo="b")

    processar_pasta_nfe(str(agente_nfe.inbox))

    assert agente_nfe.backend.lancamentos() == []
    assert (agente_nfe.inbox / "nao_identificado" / "nfe-b-entrada-autorizada.xml").is_file()


def test_licenca_invalida_nao_grava_e_nao_perde_o_arquivo(agente_nfe, monkeypatch):
    monkeypatch.setattr("comunicacao.api_client.LICENSE_TOKEN", "licenca-que-nao-existe")
    _colocar_na_pasta(agente_nfe.inbox, "entrada-autorizada")

    processar_pasta_nfe(str(agente_nfe.inbox))

    # Invariantes que valem de qualquer jeito: nada escriturado, nada avisado, o XML não some nem se duplica.
    for tabela in ("lancamentos_fiscais", "lancamentos_fiscais_itens", "eventos"):
        assert agente_nfe.backend.contar(tabela) == 0, tabela
    assert [p.name for p in agente_nfe.base.rglob("*.xml")] == ["nfe-a-entrada-autorizada.xml"]


@pytest.mark.skipif(
    os.environ.get("RODAR_BUGS_CONHECIDOS") != "1",
    reason="BUG (sem issue; precisa de issue `bug`, catálogo PRB-E-43): licença inválida/vencida dá 401 na "
    "consulta GET /clientes/por-cnpj, que o agente lê como 'nenhuma empresa cadastrada'; a nota vai para "
    "nao_identificado/, que a varredura ignora, e não é reenviada quando a licença é corrigida (o 401 do POST "
    "já é tratado como transitório). Ao corrigir, tirar este skip."
)
def test_licenca_invalida_deixa_o_arquivo_no_inbox_para_reenvio(agente_nfe, monkeypatch):
    monkeypatch.setattr("comunicacao.api_client.LICENSE_TOKEN", "licenca-que-nao-existe")
    _colocar_na_pasta(agente_nfe.inbox, "entrada-autorizada")

    processar_pasta_nfe(str(agente_nfe.inbox))

    assert _arquivos(agente_nfe.inbox) == ["nfe-a-entrada-autorizada.xml"]


# --- 4. cancelamento -----------------------------------------------------------------------------

def test_cancelamento_de_nota_existente_atualiza_o_lancamento(agente_nfe):
    nota = _nota_da_massa(agente_nfe, "saida-autorizada")
    _colocar_na_pasta(agente_nfe.inbox, "saida-autorizada")
    processar_pasta_nfe(str(agente_nfe.inbox))
    [antes] = agente_nfe.backend.lancamentos()
    assert antes["status"] == "ativa"

    _colocar_evento(agente_nfe.inbox, "evento-cancelamento.xml", nota["chave"])
    processar_pasta_nfe(str(agente_nfe.inbox))

    [depois] = agente_nfe.backend.lancamentos()
    assert depois["status"] == "cancelada"
    # dhRegEvento do arquivo gravado: 2026-10-16T10:00:01-03:00 = 13:00:01 UTC (conta à mão).
    assert datetime.fromisoformat(depois["cancelado_em"]) == datetime(2026, 10, 16, 13, 0, 1, tzinfo=timezone.utc)
    assert depois["motivo_cancelamento"] == "Cancelamento sintetico de teste 688"
    assert depois["protocolo_cancelamento"] == "268000000000099"
    # A nota não some: valores, chave e itens continuam para a auditoria.
    for campo in ("id", "chave_nfe", "valor_total", "tipo", "cnpj_emitente", "cnpj_destinatario", "itens"):
        assert depois[campo] == antes[campo], campo
    assert (agente_nfe.inbox / "eventos_cancelamento" / "evento-cancelamento.xml").is_file()
    assert _arquivos(agente_nfe.inbox) == []
    assert agente_nfe.backend.contar("eventos") == 0


def test_cancelamento_que_chega_antes_da_nota_espera_e_cancela_quando_a_nota_entra(agente_nfe, monkeypatch):
    relogio = Relogio()
    monkeypatch.setattr(processar_nfe, "_agora_utc", relogio)
    nota = _nota_da_massa(agente_nfe, "saida-autorizada")
    evento = _colocar_evento(agente_nfe.inbox, "evento-cancelamento.xml", nota["chave"])

    processar_pasta_nfe(str(agente_nfe.inbox))
    assert evento.is_file()
    assert (agente_nfe.inbox / "evento-cancelamento.xml.espera-cancel").is_file()
    assert agente_nfe.backend.lancamentos() == []

    relogio.avancar(30)
    _colocar_na_pasta(agente_nfe.inbox, "saida-autorizada", como="a-nota.xml")
    processar_pasta_nfe(str(agente_nfe.inbox))

    [linha] = agente_nfe.backend.lancamentos()
    assert linha["chave_nfe"] == nota["chave"]
    assert linha["status"] == "cancelada"
    assert not (agente_nfe.inbox / "evento-cancelamento.xml.espera-cancel").exists()
    assert (agente_nfe.inbox / "eventos_cancelamento" / "evento-cancelamento.xml").is_file()
    assert agente_nfe.backend.contar("eventos") == 0


def test_cancelamento_de_nota_inexistente_espera_90s_e_vira_orfao_no_prazo(agente_nfe, monkeypatch):
    assert ESPERA_CANCELAMENTO_SEM_NOTA_SEGUNDOS == 90, "o prazo do desenho atual é 90 s"
    relogio = Relogio()
    monkeypatch.setattr(processar_nfe, "_agora_utc", relogio)
    chave_fantasma = CHAVE_DE_NOTA_QUE_O_SISTEMA_NUNCA_RECEBEU
    evento = _colocar_evento(agente_nfe.inbox, "evento-orfao.xml", chave_fantasma)
    sidecar = agente_nfe.inbox / "evento-orfao.xml.espera-cancel"

    inicio = relogio.agora
    # Varreduras a cada 30 s (INTERVALO_POLLING_SEGUNDOS) e uma a 89 s: nenhuma esgota o prazo.
    for segundos_desde_o_inicio in (0, 30, 60, 89):
        relogio.agora = inicio + timedelta(seconds=segundos_desde_o_inicio)
        processar_pasta_nfe(str(agente_nfe.inbox))
        assert evento.is_file(), f"t={segundos_desde_o_inicio}s: ainda dentro do prazo, fica na pasta"
        assert sidecar.is_file()
        assert agente_nfe.backend.contar("eventos") == 0, f"t={segundos_desde_o_inicio}s: sem aviso antes do prazo"

    relogio.agora = inicio + timedelta(seconds=90)
    processar_pasta_nfe(str(agente_nfe.inbox))

    assert not evento.exists()
    assert not sidecar.exists()
    assert (agente_nfe.inbox / "eventos_pendentes" / "evento-orfao.xml").is_file()
    assert agente_nfe.backend.lancamentos() == []
    [aviso] = agente_nfe.backend.ler("eventos")
    assert aviso["cliente_id"] == agente_nfe.a["id"]
    assert aviso["sucesso"] is False
    assert "sem nota" in aviso["descricao"] and "evento-orfao.xml" in aviso["descricao"]
    assert chave_fantasma not in aviso["descricao"]
    [notificacao] = agente_nfe.backend.ler("notificacoes")
    assert notificacao["cliente_id"] == agente_nfe.a["id"]
    assert notificacao["tipo"] == "arquivo_erro"


# --- bug conhecido ---------------------------------------------------------------------------------

@pytest.mark.skipif(
    os.environ.get("RODAR_BUGS_CONHECIDOS") != "1",
    reason="BUG (sem issue; precisa de issue `bug`, catálogo PRB-E-42): core.utils.validar_nome só aceita "
    "[\\w\\s\\-.,&]; cliente cujo nome tem '/' (S/A) ou apóstrofo (D'Ávila) nunca é escriturado: "
    "toda nota dele vai para nao_identificado/. Ao corrigir, tirar este skip."
)
def test_cliente_com_barra_ou_apostrofo_no_nome_tem_a_nota_escriturada(agente_nfe):
    agente_nfe.backend.renomear_cliente(agente_nfe.a["id"], "Mercado D'Avila Comercio S/A")
    try:
        _colocar_na_pasta(agente_nfe.inbox, "entrada-autorizada")
        processar_pasta_nfe(str(agente_nfe.inbox))
        assert len(agente_nfe.backend.lancamentos()) == 1
    finally:
        agente_nfe.backend.renomear_cliente(agente_nfe.a["id"], agente_nfe.nome_a)
