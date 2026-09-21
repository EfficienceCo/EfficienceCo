"""Regressão do matcher por nome (BUG-ORG-05 / #483)."""

from core.identificar_tipo import identificar_tipo_no_nome
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
