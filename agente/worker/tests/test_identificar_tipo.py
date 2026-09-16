"""Regressão do matcher por nome (BUG-ORG-05 / #483)."""

from core.identificar_tipo import identificar_tipo_no_nome
from core.estrutura_pastas import subpasta_para_tipo


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
