"""Regressão do matcher por nome (BUG-ORG-05 / #483) + diagnóstico ML (#514)."""

import sys
from unittest.mock import patch

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


def test_modulo_classificador_ausente_nao_acusa_deps(capsys):
    with patch.dict(sys.modules, {"automacoes.rede.classificador": None}):
        assert classificar_arquivo("doc.pdf") == "nao_identificado"

    log = capsys.readouterr().out
    assert "Módulo do classificador ausente" in log
    assert "Dependência da rede neural ausente" not in log


def test_dep_torch_ausente_acusa_deps(capsys):
    # None em torch faz o import real do classificador levantar ModuleNotFoundError.
    # O pop fica dentro do patch.dict, que devolve o módulo em cache ao sair.
    with patch.dict(sys.modules, {"torch": None}):
        sys.modules.pop("automacoes.rede.classificador", None)
        assert classificar_arquivo("doc.pdf") == "nao_identificado"

    log = capsys.readouterr().out
    assert "Dependência da rede neural ausente" in log
    assert "torch" in log
    assert "Módulo do classificador ausente" not in log


def test_pesos_ausentes_repassa_causa_do_dict(capsys):
    erro = (
        "O arquivo de modelo 'classificador_documentos.pth' não existe. "
        "Execute o treinamento primeiro."
    )
    with patch(
        "automacoes.rede.classificador.classificar_documento",
        return_value={"erro": erro},
    ):
        assert classificar_arquivo("doc.pdf") == "nao_identificado"

    log = capsys.readouterr().out
    assert erro in log
    assert "Dependência da rede neural ausente" not in log
    assert "Módulo do classificador ausente" not in log
