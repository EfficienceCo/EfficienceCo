"""Backend REAL para o teste do agente (TEST-11, #688).

Sobe `backend/tests/helpers/servidor-agente-e2e.js` (app.js sem jobs, banco descartável da TEST-1,
massa #680 e uma licença por escritório) e deixa o agente falar com ele por HTTP de verdade. O
teste confere o resultado lendo o banco pela API REST do próprio Supabase local (chave de serviço
do banco descartável), nunca pelo que o agente imprime.

Só roda sob `npm test` na raiz: é o executor que sobe o banco descartável e exporta o destino.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
from pathlib import Path

import requests

RAIZ_REPO = Path(__file__).resolve().parents[3]
BACKEND = RAIZ_REPO / "backend"
SERVIDOR = BACKEND / "tests" / "helpers" / "servidor-agente-e2e.js"
MARCA_PRONTO = "E2E-PRONTO "
VARIAVEIS_DO_EXECUTOR = ("TEST_SUPABASE_URL", "TEST_SUPABASE_SERVICE_KEY", "TEST_SUPABASE_PROJECT_ID")


def ambiente_disponivel() -> str | None:
    """None se dá para subir o backend de teste; senão, o motivo (usado no skip)."""
    faltando = [nome for nome in VARIAVEIS_DO_EXECUTOR if not os.environ.get(nome)]
    if faltando:
        return f"sem banco descartável ({', '.join(faltando)} ausente): rode `npm test` na raiz"
    if not shutil.which("node"):
        return "node não encontrado no PATH"
    return None


class BackendReal:
    def __init__(self, processo: subprocess.Popen, info: dict):
        self._processo = processo
        self.url = info["baseUrl"]
        # Destino e chave do banco descartável vêm do ambiente do executor, não do log do servidor.
        self._url_banco = os.environ["TEST_SUPABASE_URL"]
        self._chave_banco = os.environ["TEST_SUPABASE_SERVICE_KEY"]
        self.clientes = info["clientes"]
        self.esperadas = {nota["chave_nfe"]: nota for nota in info["esperadas"]}
        self.entradas = info["entradas"]

    # --- leitura direta do banco (PostgREST local, chave de serviço do descartável) ---
    def _cabecalhos(self) -> dict:
        return {"apikey": self._chave_banco, "Authorization": f"Bearer {self._chave_banco}"}

    def ler(self, tabela: str, colunas: str = "*", **filtros) -> list[dict]:
        params = {"select": colunas, **{k: f"eq.{v}" for k, v in filtros.items()}}
        resposta = requests.get(
            f"{self._url_banco}/rest/v1/{tabela}", params=params, headers=self._cabecalhos(), timeout=10
        )
        resposta.raise_for_status()
        return resposta.json()

    def lancamentos(self, **filtros) -> list[dict]:
        """Lançamentos com os itens (as duas tabelas), ordenados por chave e cliente."""
        linhas = self.ler("lancamentos_fiscais", "*,lancamentos_fiscais_itens(n_item,cfop,ncm)", **filtros)
        for linha in linhas:
            linha["itens"] = sorted(linha.pop("lancamentos_fiscais_itens"), key=lambda i: i["n_item"])
        return sorted(linhas, key=lambda linha: (linha["chave_nfe"], linha["cliente_id"]))

    def contar(self, tabela: str) -> int:
        return len(self.ler(tabela, "id"))

    def limpar_estado_de_teste(self) -> None:
        """Entre um teste e outro: zera o que o agente grava. Clientes e licenças ficam."""
        for tabela in ("lancamentos_fiscais_itens", "lancamentos_fiscais", "eventos", "notificacoes"):
            resposta = requests.delete(
                f"{self._url_banco}/rest/v1/{tabela}",
                params={"id": "not.is.null"},
                headers=self._cabecalhos(),
                timeout=10,
            )
            resposta.raise_for_status()

    def renomear_cliente(self, cliente_id: str, nome: str) -> None:
        resposta = requests.patch(
            f"{self._url_banco}/rest/v1/clientes",
            params={"id": f"eq.{cliente_id}"},
            json={"nome": nome},
            headers=self._cabecalhos(),
            timeout=10,
        )
        resposta.raise_for_status()

    def encerrar(self) -> None:
        try:
            if self._processo.stdin:
                self._processo.stdin.close()
            self._processo.wait(timeout=60)
        except Exception:
            self._processo.kill()


def iniciar(pasta_log: Path, tempo_limite: float = 240.0) -> BackendReal:
    log = pasta_log / "servidor-agente-e2e.log"
    with open(log, "wb") as saida:
        processo = subprocess.Popen(
            [shutil.which("node"), str(SERVIDOR)],
            cwd=str(BACKEND),
            env=os.environ.copy(),
            stdin=subprocess.PIPE,
            stdout=saida,
            stderr=subprocess.STDOUT,
        )
    limite = time.monotonic() + tempo_limite
    while time.monotonic() < limite:
        texto = log.read_text(encoding="utf-8", errors="replace")
        for linha in texto.splitlines():
            if linha.startswith(MARCA_PRONTO):
                return BackendReal(processo, json.loads(linha[len(MARCA_PRONTO):]))
        if processo.poll() is not None:
            raise RuntimeError(f"backend de teste terminou ({processo.returncode}):\n{texto[-3000:]}")
        time.sleep(0.5)
    processo.kill()
    raise RuntimeError(f"backend de teste não ficou pronto em {tempo_limite} s:\n{log.read_text(errors='replace')[-3000:]}")
