"""Regressão do matcher por nome (BUG-ORG-05 / #483) + diagnóstico ML (#514)."""

import sys
from types import ModuleType
from unittest.mock import MagicMock, patch

from core.identificar_tipo import classificar_arquivo, identificar_tipo_no_nome
from core.estrutura_pastas import subpasta_para_tipo
import pytest


def test_nota_fiscal_no_nome_reconhece_tipo():
    assert identificar_tipo_no_nome("nota_fiscal_Padaria_Central.pdf") == "nota_fiscal"


def test_alias_nf_no_nome_reconhece_tipo():
    assert identificar_tipo_no_nome("NF_Padaria_Central.pdf") == "nf"


def test_tipos_mapeados_em_estrutura_pastas_resolvem_subpasta():
    for tipo in ("nota_fiscal", "nf", "declaracao", "recibo"):
        assert subpasta_para_tipo(tipo) is not None


def test_declaracao_e_recibo_no_nome():
    assert identificar_tipo_no_nome("declaracao_Padaria_2026.pdf") == "declaracao"
    assert identificar_tipo_no_nome("recibo_Padaria_2026.pdf") == "recibo"


@pytest.mark.parametrize("nome", ["informacoes_Padaria.pdf", "conferencia.pdf", "enfermagem.pdf"])
def test_alias_nf_nao_casa_dentro_de_palavras(nome):
    assert identificar_tipo_no_nome(nome) is None


@pytest.mark.parametrize("nome", ["NF_Padaria.pdf", "Padaria NF 123.pdf", "NF-e_123.pdf"])
def test_alias_nf_com_separadores(nome):
    assert identificar_tipo_no_nome(nome) == "nf"


# ---------------------------------------------------------------------------
# BUG-ML-06 / #514 — mensagem distingue módulo × deps × pesos
# ---------------------------------------------------------------------------


def _instalar_fake_classificador(classificar_documento):
    """Injeta automacoes.rede.classificador no sys.modules pra o from-import."""
    automacoes = ModuleType("automacoes")
    rede = ModuleType("automacoes.rede")
    classificador = ModuleType("automacoes.rede.classificador")
    classificador.classificar_documento = classificar_documento
    rede.classificador = classificador
    automacoes.rede = rede
    return {
        "automacoes": automacoes,
        "automacoes.rede": rede,
        "automacoes.rede.classificador": classificador,
    }


def test_modulo_classificador_ausente_nao_acusa_deps(capsys):
    import builtins
    original = builtins.__import__

    def fake_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name == "automacoes.rede.classificador" or (
            name == "automacoes.rede" and fromlist
        ):
            raise ModuleNotFoundError(
                "No module named 'automacoes.rede.classificador'",
                name="automacoes.rede.classificador",
            )
        return original(name, globals, locals, fromlist, level)

    # Remove qualquer cache do pacote pra forçar o import.
    for chave in list(sys.modules):
        if chave == "automacoes" or chave.startswith("automacoes."):
            sys.modules.pop(chave, None)

    with patch("builtins.__import__", fake_import):
        assert classificar_arquivo("doc.pdf") == "nao_identificado"

    log = capsys.readouterr().out
    assert "Módulo do classificador ausente" in log
    assert "Dependência da rede neural ausente" not in log
    assert "Dependências da rede neural não instaladas" not in log


def test_dep_torch_ausente_acusa_deps(capsys):
    import builtins
    original = builtins.__import__

    def fake_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name == "automacoes.rede.classificador" or (
            name == "automacoes.rede" and fromlist
        ):
            # Espelha o que acontece quando classificador.py importa torch
            # no load do módulo e torch não está instalado.
            raise ModuleNotFoundError("No module named 'torch'", name="torch")
        return original(name, globals, locals, fromlist, level)

    for chave in list(sys.modules):
        if chave == "automacoes" or chave.startswith("automacoes."):
            sys.modules.pop(chave, None)

    with patch("builtins.__import__", fake_import):
        assert classificar_arquivo("doc.pdf") == "nao_identificado"

    log = capsys.readouterr().out
    assert "Dependência da rede neural ausente" in log
    assert "torch" in log
    assert "Módulo do classificador ausente" not in log


def test_pesos_ausentes_via_dict_de_erro(capsys):
    mock_fn = MagicMock(
        return_value={
            "erro": (
                "O arquivo de modelo '/tmp/classificador_documentos.pth' não existe. "
                "Execute o treinamento primeiro."
            )
        }
    )
    fakes = _instalar_fake_classificador(mock_fn)

    with patch.dict(sys.modules, fakes):
        assert classificar_arquivo("doc.pdf") == "nao_identificado"

    log = capsys.readouterr().out
    assert "Pesos do classificador ausentes" in log
    assert "Dependências da rede neural não instaladas" not in log


def test_erro_de_extensao_nao_vira_pesos_ausentes(capsys):
    mock_fn = MagicMock(
        return_value={"erro": "Extensão '.txt' não suportada. Use PDF, XLSX, XLS ou imagens."}
    )
    fakes = _instalar_fake_classificador(mock_fn)

    with patch.dict(sys.modules, fakes):
        assert classificar_arquivo("notas.txt") == "nao_identificado"

    log = capsys.readouterr().out
    assert "Classificador:" in log
    assert "Pesos do classificador ausentes" not in log
