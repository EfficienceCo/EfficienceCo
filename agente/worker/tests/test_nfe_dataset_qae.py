"""TEST-10 (#687): dataset do QA-E (NF-e) com resultado esperado conferido de fora do código.

ORIGEM DOS NÚMEROS (todos de fora do código; nenhum esperado sai de uma função do agente):
  - vault: problemas/escrituracao-fiscal-qa-e-2026-10-12 (relatório do QA-E) e o gerador
    problemas/anexos-qa-e-2026-10-12/gen_nfe3.py. O relatório traz "números refeitos à mão":
    valor, ICMS, PIS, COFINS e IPI de cada nota (14/14 linhas conferidas contra o XML).
  - Alíquotas do gerador: ICMS 18%, PIS 1,65%, COFINS 7,6%, arredondamento HALF_UP no centavo.
    Os impostos abaixo foram refeitos à mão (ex.: v08, 50,00 x 1,65% = 0,825 -> 0,83) e batem
    com os totais do relatório (março: ICMS 428,06, PIS 39,25, COFINS 180,74, que incluem as 3
    notas indevidas n04-n06 de 777, 666 e 555).
  - Dígito verificador da chave: Manual de Orientação do Contribuinte da NF-e, módulo 11, pesos
    2 a 9 da direita para a esquerda (cálculo escrito passo a passo em test_chave_*).
  - DV de CPF/CNPJ: regra da Receita (módulo 11), contas à mão nos comentários.

As 33 fixtures ficam em fixtures/nfe/qae-2026-10-12/ e são geradas por gerar.py (ali mesmo; derivado de
gen_nfe3.py, com o que mudou e como regenerar documentados no cabeçalho dele), com o
cliente Dev = 11111111000191 (o 11111111000111 da bateria de 12/10 não passa a DOC-1: DV errado).
Notas com nfeProc saem assinadas com certificado de teste (NFE-8); n03/n04/n05, n16, eventos,
n13-n15 não têm Signature.

Bug achado vira skip com "BUG (...)": o PR que corrigir tira o skip. Veja o catálogo do vault
(referencias/catalogo-problemas-viram-teste-2026-10).
"""

import re
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from lxml import etree

from automacoes.nfe_assinatura import _parser, validar_assinatura_nfe
from automacoes.processar_nfe import (
    identificar_tipo_operacao,
    parsear_evento_cancelamento,
    parsear_nfe,
    processar_pasta_nfe,
)
from helpers_nfe_assinatura import assinar_xml_nfe, gravar_nfe_assinada

QAE = Path(__file__).resolve().parent / "fixtures" / "nfe" / "qae-2026-10-12"

DEV = "11111111000191"  # Cliente Teste Dev (licença do agente na bateria)
TESTE = "00000000000272"  # Cliente Teste (outro cliente do escritório)
FORN1 = "11222333000181"
FORN2 = "44555666000181"
TERC_A = "12345678000195"
TERC_B = "98765432000198"
CPF_OK = "52998224725"
CPF_PRODUTOR = "11144477735"
CLIENTE_ID_DEV = "dddddddd-dddd-dddd-dddd-dddddddddddd"
NOME_DEV = "Cliente Teste Dev"
NCM_PADARIA = "19059090"

# Chaves do gen_nfe3.py (35 + AAMM + CNPJ 14 + 55 912 nNF + 1 + cNF + DV).
CHAVE = {
    "v01": "35250111222333000181559120000000011202610130",
    "v02": "35250144555666000181559120000000021202610145",
    "v03": "35250111111111000191559120000000031202610150",
    "v04": "35250111111111000191559120000000041202610166",
    "v05": "35250244555666000181559120000000051202610175",
    "v06": "35250211111111000191559120000000061202610180",
    "v07": "35250311222333000181559120000000071202610190",
    "v08": "35250311111111000191559120000000081202610200",
    "v09": "35250300000000000272559120000000091202610219",
    "v10": "35250311111111000191559120000000101202610225",
    "v11": "35250311222333000181559120000000111202610230",
    "n10": "35250300011144477735559120000000301202610428",
}


@pytest.fixture(autouse=True)
def _sem_pasta_base(monkeypatch):
    monkeypatch.delenv("PASTA_BASE", raising=False)
    monkeypatch.setattr("comunicacao.api_client.PASTA_BASE", "")


def _caminho(nome: str) -> str:
    return str(QAE / f"{nome}.xml")


def _variante(tmp_path, base: str, trocas=(), *, assinar=True, nome="variante", **kw_assinatura) -> str:
    """Cópia de uma fixture com trocas de texto, reassinada (a assinatura original não vale mais)."""
    xml = (QAE / f"{base}.xml").read_text(encoding="utf-8")
    xml = re.sub(r"<ds:Signature.*?</ds:Signature>", "", xml, flags=re.DOTALL)
    for antes, depois in trocas:
        assert antes in xml, f"troca sem efeito: {antes!r}"
        xml = xml.replace(antes, depois)
    destino = tmp_path / f"{nome}.xml"
    if assinar:
        gravar_nfe_assinada(destino, xml, **kw_assinatura)
    else:
        destino.write_text(xml, encoding="utf-8")
    return str(destino)


# ---------------------------------------------------------------------------
# 1. As 11 notas válidas (v01-v11): campo a campo, conferido à mão
# ---------------------------------------------------------------------------

# (arquivo, emitente, destinatário, vNF, vICMS, vPIS, vCOFINS, vIPI, emissão, cfop, razão)
VALIDAS = [
    ("v01-entrada", "v01", FORN1, DEV, "1234.56", "222.22", "20.37", "93.83", "61.73",
     date(2025, 1, 10), "5102", "NF-e autorizada (cStat 100), assinatura íntegra, com IPI"),
    ("v02-entrada", "v02", FORN2, DEV, "987.65", "177.78", "16.30", "75.06", "0",
     date(2025, 1, 20), "6102", "CFOP 6102 (interestadual); sem vIPI: IPI = 0"),
    ("v03-saida", "v03", DEV, TERC_A, "2500.00", "450.00", "41.25", "190.00", "0",
     date(2025, 1, 25), "5102", "emitida pelo cliente"),
    ("v04-saida-cpf", "v04", DEV, CPF_OK, "640.00", "115.20", "10.56", "48.64", "0",
     date(2025, 1, 28), "5102", "destinatário pessoa física: CPF de 11 dígitos, DV certo"),
    ("v05-entrada-latin1", "v05", FORN2, DEV, "333.33", "60.00", "5.50", "25.33", "0",
     date(2025, 2, 5), "5102", "xNome com acento (ç, ã)"),
    ("v06-saida-a-cancelar", "v06", DEV, TERC_B, "1500.00", "270.00", "24.75", "114.00", "0",
     date(2025, 2, 14), "5102", "será cancelada pelo ev1"),
    ("v07-entrada-dEmi", "v07", FORN1, DEV, "100.10", "18.02", "1.65", "7.61", "0",
     date(2025, 3, 3), "5102", "data em ide/dEmi (sem hora)"),
    ("v08-emit-igual-dest", "v08", DEV, DEV, "50.00", "9.00", "0.83", "3.80", "0",
     date(2025, 3, 10), "5102", "emitente = destinatário; PIS 0,825 sobe para 0,83"),
    ("v09-teste-para-dev", "v09", TESTE, DEV, "200.00", "36.00", "3.30", "15.20", "0",
     date(2025, 3, 12), "5102", "emitente é outro cliente do escritório"),
    ("v10-saida-cfop-entrada", "v10", DEV, TERC_A, "10.00", "1.80", "0.17", "0.76", "0",
     date(2025, 3, 15), "1102", "saída com CFOP de entrada: o agente lê e não recusa; PIS 0,165 sobe para 0,17"),
    ("v11-cstat150", "v11", FORN1, DEV, "20.00", "3.60", "0.33", "1.52", "0",
     date(2025, 3, 18), "5102", "cStat 150 (autorizada fora de prazo) também vale"),
]


@pytest.mark.parametrize(
    "arquivo,chave,emit,dest,vnf,icms,pis,cofins,ipi,emissao,cfop,razao",
    VALIDAS,
    ids=[v[0] for v in VALIDAS],
)
def test_dataset_valida_vira_lancamento_com_os_numeros_do_qae(
    arquivo, chave, emit, dest, vnf, icms, pis, cofins, ipi, emissao, cfop, razao
):
    dados = parsear_nfe(_caminho(arquivo))

    assert dados["chave_nfe"] == CHAVE[chave], razao
    assert dados["cnpj_emitente"] == emit
    assert dados["cnpj_destinatario"] == dest
    assert dados["valor_total"] == Decimal(vnf)
    assert dados["icms"] == Decimal(icms)
    assert dados["pis"] == Decimal(pis)
    assert dados["cofins"] == Decimal(cofins)
    assert dados["ipi"] == Decimal(ipi)
    assert dados["data_emissao"] == emissao
    assert dados["cstat"] == ("150" if arquivo == "v11-cstat150" else "100")
    assert dados["tp_nf"] == 1
    assert dados["itens"] == [{"n_item": 1, "cfop": cfop, "ncm": NCM_PADARIA}]


# ---------------------------------------------------------------------------
# 2. Negativos n01-n18: o que o parser faz e por quê
# ---------------------------------------------------------------------------

# (arquivo, trecho da mensagem, razão)
RECUSADAS = [
    ("n01-denegada-110", r"cStat=110", "SEFAZ denegou: sem efeito fiscal"),
    ("n02-cancelada-101", r"cStat=101", "SEFAZ cancelou: sem efeito fiscal"),
    ("n03-sem-nfeproc", r"sem protocolo de autorização", "NFe solta, sem protNFe: não foi autorizada"),
    ("n04-lote-enviNFe", r"enviNFe", "lote de ENVIO à SEFAZ não é nota"),
    ("n05-raiz-qualquer", r"raiz 'pacote'", "envelope inventado em volta da NFe"),
    ("n06-prot-de-outra-nota", r"refere outra NF-e", "protNFe cita a chave de outra nota"),
    ("n09-cpf-dv-invalido", r"dest/CPF inválido \(dígito verificador\)", "CPF 52998224726: DV errado"),
    ("n13-malformado", r"XML malformado", "XML cortado no meio"),
    ("n14-nao-nfe", r"raiz 'pedido'", "XML que não é NF-e"),
    ("n15-xxe", r"XML malformado", "entidade externa recusada pelo parser, sem ler o arquivo"),
    ("n16-sem-assinatura", r"sem assinatura digital", "nfeProc válido, mas sem Signature"),
    ("n17-vnf-adulterado", r"adulterada", "vNF 12,00 trocado por 99,00 depois de assinada"),
    ("n18-cert-outro-emitente", r"não pertence ao emitente", "certificado de outro CNPJ"),
]


@pytest.mark.parametrize("arquivo,trecho,razao", RECUSADAS, ids=[r[0] for r in RECUSADAS])
def test_dataset_negativa_e_recusada_pelo_motivo_certo(arquivo, trecho, razao):
    with pytest.raises(ValueError, match=trecho):
        parsear_nfe(_caminho(arquivo))


def test_dataset_n07_n08_o_parser_aceita_e_a_recusa_vem_do_vinculo_com_o_cliente():
    """n07 (destino é o Cliente Teste) e n08 (terceiros) são notas válidas; não são do cliente Dev."""
    n07 = parsear_nfe(_caminho("n07-cnpj-outro-cliente"))
    n08 = parsear_nfe(_caminho("n08-terceiros"))
    assert (n07["cnpj_emitente"], n07["cnpj_destinatario"]) == (FORN1, TESTE)
    assert (n08["cnpj_emitente"], n08["cnpj_destinatario"]) == (TERC_A, TERC_B)
    for dados in (n07, n08):
        with pytest.raises(ValueError, match="não é emitente nem destinatário"):
            identificar_tipo_operacao(dados["cnpj_emitente"], dados["cnpj_destinatario"], DEV)


def test_dataset_n11_data_futura_o_parser_le_a_data():
    """O parser só lê a data (a regra de futuro é do pipeline). O motivo da quarentena de n11 é afirmado em
    test_pipeline_pasta_do_qae_posta_as_12_aceitas_com_o_tipo_certo."""
    dados = parsear_nfe(_caminho("n11-data-futura"))
    assert dados["data_emissao"] == date(2026, 12, 1)  # dhEmi do XML; a regra de futuro é do pipeline


def test_dataset_n12_vnf_negativo_o_agente_le_o_valor_e_o_backend_recusa():
    """O agente não julga o sinal (o backend devolve 422 'não pode ser negativo': ver
    backend/tests/nfe-dataset-qae.test.js)."""
    assert parsear_nfe(_caminho("n12-vnf-negativo"))["valor_total"] == Decimal("-10.00")


# ---------------------------------------------------------------------------
# 3. Entrada ou saída: do ponto de vista do cliente (CNPJ), nunca somadas
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "emit,dest,esperado",
    [
        (FORN1, DEV, "entrada"),  # v01
        (DEV, TERC_A, "saida"),  # v03
        (DEV, CPF_OK, "saida"),  # v04
        (DEV, DEV, "entrada"),  # v08: destinatário vence (mesma regra de resolver_empresas_nfe)
        (TESTE, DEV, "entrada"),  # v09
    ],
)
def test_dataset_direcao_pelo_cnpj_do_cliente(emit, dest, esperado):
    assert identificar_tipo_operacao(emit, dest, DEV) == esperado


def test_tpnf_zero_e_um_sao_lidos_e_outro_valor_recusa(tmp_path):
    zero = _variante(tmp_path, "v03-saida", [("<tpNF>1</tpNF>", "<tpNF>0</tpNF>")], nome="tp0")
    assert parsear_nfe(zero)["tp_nf"] == 0
    for ruim in ("2", "", "S"):
        caminho = _variante(
            tmp_path, "v03-saida", [("<tpNF>1</tpNF>", f"<tpNF>{ruim}</tpNF>")], nome=f"tp{ruim or 'vazio'}"
        )
        with pytest.raises(ValueError, match="ide/tpNF inválido"):
            parsear_nfe(caminho)


@pytest.mark.skip(
    reason="DECISÃO PENDENTE (PRB-E-39, sem issue): nota emitida pelo PRÓPRIO cliente com tpNF=0 "
    "(entrada própria, ex.: compra de produtor rural) é 'entrada' ou 'saída' no livro? Hoje "
    "identificar_tipo_operacao classifica pelo CNPJ (emitente = cliente => saída) e ignora tpNF. "
    "O teste não afirma nenhum lado antes de o João decidir."
)
def test_decisao_nota_do_cliente_com_tpnf_zero_entrada_ou_saida():
    pass


# ---------------------------------------------------------------------------
# 4. Protocolo de autorização (NFE-1, #653)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("cstat", ["100", "150"])
def test_protocolo_cstat_100_e_150_autorizam(tmp_path, cstat):
    caminho = _variante(tmp_path, "v01-entrada", [("<cStat>100</cStat>", f"<cStat>{cstat}</cStat>")])
    assert parsear_nfe(caminho)["cstat"] == cstat


@pytest.mark.parametrize(
    "cstat",
    # 101 cancelamento, 102 inutilização, 110/301/302/303 uso denegado, 135/155 evento registrado,
    # 204 duplicidade, 217 NF-e não consta, 999 erro não catalogado: nenhum vale como autorização.
    ["101", "102", "110", "135", "155", "204", "217", "301", "302", "303", "999", "0", "1000"],
)
def test_protocolo_cstat_diferente_de_100_e_150_recusa(tmp_path, cstat):
    caminho = _variante(tmp_path, "v01-entrada", [("<cStat>100</cStat>", f"<cStat>{cstat}</cStat>")])
    with pytest.raises(ValueError, match=rf"sem autorização fiscal \(cStat={cstat}\)"):
        parsear_nfe(caminho)


def test_protocolo_cstat_vazio_ou_ausente_recusa(tmp_path):
    vazio = _variante(tmp_path, "v01-entrada", [("<cStat>100</cStat>", "<cStat></cStat>")], nome="vazio")
    with pytest.raises(ValueError, match=r"cStat=ausente"):
        parsear_nfe(vazio)
    ausente = _variante(tmp_path, "v01-entrada", [("<cStat>100</cStat>", "")], nome="ausente")
    with pytest.raises(ValueError, match=r"cStat=ausente"):
        parsear_nfe(ausente)


def test_protocolo_duplicado_recusa_mesmo_com_os_dois_corretos(tmp_path):
    xml = (QAE / "v01-entrada.xml").read_text(encoding="utf-8")
    prot = re.search(r"<protNFe.*?</protNFe>", xml, flags=re.DOTALL).group(0)
    caminho = _variante(tmp_path, "v01-entrada", [(prot, prot + prot)])
    with pytest.raises(ValueError, match="mais de um protocolo"):
        parsear_nfe(caminho)


def test_protocolo_de_outra_chave_recusa_ate_com_cstat_100(tmp_path):
    outra = CHAVE["v02"]
    caminho = _variante(
        tmp_path, "v01-entrada", [(f"<chNFe>{CHAVE['v01']}</chNFe>", f"<chNFe>{outra}</chNFe>")]
    )
    with pytest.raises(ValueError, match="refere outra NF-e"):
        parsear_nfe(caminho)


# ---------------------------------------------------------------------------
# 5. Chave de acesso (44 dígitos, DV módulo 11)
# ---------------------------------------------------------------------------

def _trocar_chave(tmp_path, base: str, original: str, nova: str, nome: str) -> str:
    return _variante(
        tmp_path, base,
        [(f'Id="NFe{original}"', f'Id="NFe{nova}"'), (f"<chNFe>{original}</chNFe>", f"<chNFe>{nova}</chNFe>")],
        nome=nome,
    )


def _soma_pesos_chave(corpo43: str) -> int:
    """Pesos 2..9 (repetindo) da direita para a esquerda, como no Manual da NF-e."""
    pesos = [2, 3, 4, 5, 6, 7, 8, 9]
    return sum(int(d) * pesos[i % 8] for i, d in enumerate(reversed(corpo43)))


def test_chave_dv_certo_a_conta_a_mao_da_v02_e_aceita():
    """Chave da v02 = 3525014455566600018155912000000002120261014 (43 dígitos) + DV 5.

    A conta à mão (soma dos 43 produtos = 578; 578 mod 11 = 6; DV = 11 - 6 = 5) é feita aqui sobre os
    dígitos LITERAIS da chave e os pesos do Manual, não sobre o código do agente: documenta de onde vem
    o 5 que está na fixture. O teste do código é o parsear_nfe devolver a chave íntegra.
    """
    corpo = "3525014455566600018155912000000002120261014"
    assert CHAVE["v02"] == corpo + "5" and len(corpo) == 43
    soma = _soma_pesos_chave(corpo)
    assert soma == 578 and soma % 11 == 6 and 11 - soma % 11 == int(CHAVE["v02"][-1])
    assert parsear_nfe(_caminho("v02-entrada"))["chave_nfe"] == CHAVE["v02"]


def test_chave_dv_zero_quando_o_resto_e_0_ou_1():
    """v01: a soma dá resto 1 -> regra do Manual: resto 0 ou 1 dá DV 0 (não 11 - 1 = 10).
    A conta é sobre os dígitos literais da chave (documentação da conta, não do código)."""
    corpo = CHAVE["v01"][:-1]
    soma = _soma_pesos_chave(corpo)
    assert soma == 441 and soma % 11 == 1
    assert CHAVE["v01"].endswith("0")
    assert parsear_nfe(_caminho("v01-entrada"))["chave_nfe"] == CHAVE["v01"]


@pytest.mark.skip(
    reason="BUG (#661, NFE-7; PR #676 aberto): o agente não confere o dígito verificador da chave de "
    "acesso. A v02 com DV 4 em vez de 5 (módulo 11 = 5, ver test_chave_dv_certo_*) é escriturada."
)
def test_chave_dv_errado_recusa(tmp_path):
    ruim = CHAVE["v02"][:-1] + "4"
    caminho = _trocar_chave(tmp_path, "v02-entrada", CHAVE["v02"], ruim, "dv_errado")
    with pytest.raises(ValueError, match="dígito verificador"):
        parsear_nfe(caminho)


@pytest.mark.parametrize("cortar", [1, 5])
def test_chave_com_menos_de_44_digitos_recusa(tmp_path, cortar):
    curta = CHAVE["v02"][:-cortar]
    caminho = _trocar_chave(tmp_path, "v02-entrada", CHAVE["v02"], curta, f"curta{cortar}")
    with pytest.raises(ValueError, match=r"chave(_nfe| de acesso) inválida"):
        parsear_nfe(caminho)


def test_chave_com_mais_de_44_digitos_recusa(tmp_path):
    caminho = _trocar_chave(tmp_path, "v02-entrada", CHAVE["v02"], CHAVE["v02"] + "0", "longa")
    with pytest.raises(ValueError, match=r"chave(_nfe| de acesso) inválida"):
        parsear_nfe(caminho)


@pytest.mark.parametrize("posicao,letra", [(0, "A"), (20, "x"), (43, "Z")])
def test_chave_com_letra_recusa(tmp_path, posicao, letra):
    chave = CHAVE["v02"]
    com_letra = chave[:posicao] + letra + chave[posicao + 1:]
    assert len(com_letra) == 44
    caminho = _trocar_chave(tmp_path, "v02-entrada", chave, com_letra, f"letra{posicao}")
    with pytest.raises(ValueError, match=r"chave(_nfe| de acesso) inválida"):
        parsear_nfe(caminho)


# ---------------------------------------------------------------------------
# 6. Emitente: CNPJ, CPF (produtor rural) e documento inválido
# ---------------------------------------------------------------------------

def test_emitente_cnpj_valido_entra_com_14_digitos():
    assert parsear_nfe(_caminho("v01-entrada"))["cnpj_emitente"] == "11222333000181"


def test_emitente_cnpj_dv_certo_a_conta_a_mao():
    """11.222.333/0001-81. DV1: pesos 5,4,3,2,9,8,7,6,5,4,3,2 sobre 1,1,2,2,2,3,3,3,0,0,0,1 somam 102;
    102 mod 11 = 3; DV1 = 11-3 = 8. DV2: pesos 6,5,4,3,2,9,8,7,6,5,4,3,2 sobre ...,1,8 somam 120;
    120 mod 11 = 10; DV2 = 11-10 = 1. A conta é feita sobre os dígitos literais do CNPJ (documenta
    de onde vem o 81); o teste do código é o parsear_nfe aceitar o CNPJ."""
    base = [int(d) for d in "112223330001"]
    soma1 = sum(d * p for d, p in zip(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]))
    assert soma1 == 102 and 11 - soma1 % 11 == 8
    soma2 = sum(d * p for d, p in zip(base + [8], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]))
    assert soma2 == 120 and 11 - soma2 % 11 == 1
    assert parsear_nfe(_caminho("v01-entrada"))["cnpj_emitente"] == "11222333000181"


@pytest.mark.parametrize(
    "emit_ruim",
    [
        pytest.param("11222333000182", id="ultimo-digito-trocado-DV2-deveria-ser-1"),
        pytest.param("11222333000191", id="penultimo-digito-trocado-DV1-deveria-ser-8"),
        pytest.param("11111111111111", id="todos-os-digitos-iguais"),
        pytest.param("1122233300018", id="13-digitos"),
        pytest.param("112223330001810", id="15-digitos"),
    ],
)
def test_emitente_cnpj_invalido_recusa(tmp_path, emit_ruim):
    caminho = _variante(
        tmp_path, "v01-entrada",
        [("<emit><CNPJ>11222333000181</CNPJ>", f"<emit><CNPJ>{emit_ruim}</CNPJ>")],
        nome="emit_ruim",
        documento_cert=FORN1,  # o helper não deduz o documento de um emitente malformado
    )
    with pytest.raises(ValueError, match=r"emit/CNPJ inválido"):
        parsear_nfe(caminho)


def test_emitente_ausente_recusa(tmp_path):
    caminho = _variante(
        tmp_path, "v01-entrada", [("<CNPJ>11222333000181</CNPJ>", "")], nome="sem_emit_doc", documento_cert=FORN1
    )
    with pytest.raises(ValueError, match="emit"):
        parsear_nfe(caminho)


def test_emitente_cpf_de_11_digitos_entra_sem_padar():
    """n10: emit/CPF 111.444.777-35, destinatário = Cliente Dev, valor 300,00.

    CPF 111.444.777-35: DV1: 1x10+1x9+1x8+4x7+4x6+4x5+7x4+7x3+7x2 = 162; 162x10 mod 11 = 1620 mod 11
    = 3. DV2: 1x11+1x10+1x9+4x8+4x7+4x6+7x5+7x4+7x3+3x2 = 204; 2040 mod 11 = 5. -> 35.
    Na CHAVE o CPF vai com zeros à esquerda (14 posições: 00011144477735); no campo
    cnpj_emitente ele fica com os 11 dígitos, sem padar.
    """
    cpf = [int(d) for d in "11144477735"]
    soma1 = sum(d * p for d, p in zip(cpf[:9], range(10, 1, -1)))
    soma2 = sum(d * p for d, p in zip(cpf[:10], range(11, 1, -1)))
    assert soma1 == 162 and (soma1 * 10) % 11 == cpf[9] == 3
    assert soma2 == 204 and (soma2 * 10) % 11 == cpf[10] == 5
    dados = parsear_nfe(_caminho("n10-emitente-produtor-cpf"))
    assert dados["cnpj_emitente"] == CPF_PRODUTOR
    assert len(dados["cnpj_emitente"]) == 11
    assert dados["chave_nfe"] == CHAVE["n10"] and "00011144477735" in dados["chave_nfe"]
    assert dados["valor_total"] == Decimal("300.00")
    assert dados["cnpj_destinatario"] == DEV


def test_emitente_cpf_com_dv_errado_recusa(tmp_path):
    caminho = _variante(
        tmp_path, "n10-emitente-produtor-cpf",
        [("<CPF>11144477735</CPF>", "<CPF>11144477736</CPF>")],
        nome="cpf_ruim",
    )
    with pytest.raises(ValueError, match=r"emit/CPF inválido \(dígito verificador\)"):
        parsear_nfe(caminho)


def test_emitente_cpf_com_tamanho_errado_recusa(tmp_path):
    caminho = _variante(
        tmp_path, "n10-emitente-produtor-cpf",
        [("<CPF>11144477735</CPF>", "<CPF>1114447773</CPF>")],
        nome="cpf_curto",
        documento_cert=CPF_PRODUTOR,  # o helper não deduz o documento de um CPF malformado
    )
    with pytest.raises(ValueError, match=r"emit/CPF inválido \(esperado 11 dígitos\)"):
        parsear_nfe(caminho)


# ---------------------------------------------------------------------------
# 7. Assinatura digital (NFE-8, #662)
# ---------------------------------------------------------------------------

def test_assinatura_valida_dataset_inteiro_passa():
    """As 11 notas v01-v11 vêm assinadas com certificado cujo CNPJ é o do emitente; todas entram."""
    for arquivo, *_ in VALIDAS:
        parsear_nfe(_caminho(arquivo))


def test_assinatura_adulterada_n17_recusa_e_a_mesma_nota_sem_adulterar_entra(tmp_path):
    """n17 = nota de vNF 12,00 assinada e depois trocada para 99,00. Reassinada com 99,00 entra."""
    with pytest.raises(ValueError, match="adulterada"):
        parsear_nfe(_caminho("n17-vnf-adulterado"))
    caminho = _variante(tmp_path, "n17-vnf-adulterado", nome="n17_refeita")
    assert parsear_nfe(caminho)["valor_total"] == Decimal("99.00")


def test_assinatura_certificado_vencido_depois_da_emissao_nao_recusa(tmp_path):
    """Decisão do João (12/10): nota emitida em 10/01/2025 com certificado válido de 01/01/2024 a
    01/02/2025 (vencido hoje, mas depois da emissão) continua valendo."""
    caminho = _variante(
        tmp_path, "v01-entrada", nome="vencido",
        not_before=datetime(2024, 1, 1, tzinfo=timezone.utc),
        not_after=datetime(2025, 2, 1, tzinfo=timezone.utc),
    )
    dados = parsear_nfe(caminho)
    assert dados["chave_nfe"] == CHAVE["v01"]
    assert dados["valor_total"] == Decimal("1234.56")


def test_assinatura_certificado_de_outro_cnpj_recusa_n18_e_variante_de_cpf(tmp_path):
    with pytest.raises(ValueError, match="não pertence ao emitente"):
        parsear_nfe(_caminho("n18-cert-outro-emitente"))
    # CPF no certificado, CNPJ no emitente: também não é o mesmo documento.
    caminho = _variante(tmp_path, "v01-entrada", nome="cert_cpf", documento_cert=CPF_OK)
    with pytest.raises(ValueError, match="não pertence ao emitente"):
        parsear_nfe(caminho)


# ---------------------------------------------------------------------------
# 8. CFOP e NCM por item
# ---------------------------------------------------------------------------

_DET2 = (
    '<det nItem="2"><prod><cProd>2</cProd><xProd>Item 2</xProd><NCM>22030000</NCM>'
    '<CFOP>6102</CFOP><vProd>10.00</vProd></prod></det>'
)


def test_itens_dois_itens_lidos_e_ordenados_por_nitem(tmp_path):
    """O item 2 vem ANTES do item 1 no XML; a leitura devolve por nItem. NCM 22030000 = cerveja de
    malte; 19059090 = outros produtos de padaria (Tabela NCM/TIPI)."""
    xml = (QAE / "v01-entrada.xml").read_text(encoding="utf-8")
    det1 = re.search(r'<det nItem="1">.*?</det>', xml, flags=re.DOTALL).group(0)
    caminho = _variante(tmp_path, "v01-entrada", [(det1, _DET2 + det1)])
    assert parsear_nfe(caminho)["itens"] == [
        {"n_item": 1, "cfop": "5102", "ncm": "19059090"},
        {"n_item": 2, "cfop": "6102", "ncm": "22030000"},
    ]


@pytest.mark.parametrize("cfop", ["510", "51022", "ABCD", ""])
def test_cfop_com_formato_invalido_recusa(tmp_path, cfop):
    caminho = _variante(tmp_path, "v01-entrada", [("<CFOP>5102</CFOP>", f"<CFOP>{cfop}</CFOP>")])
    with pytest.raises(ValueError, match=r"CFOP"):
        parsear_nfe(caminho)


@pytest.mark.parametrize("ncm", ["1905909", "190590901", "ABCDEFGH", ""])
def test_ncm_com_formato_invalido_recusa(tmp_path, ncm):
    caminho = _variante(tmp_path, "v01-entrada", [("<NCM>19059090</NCM>", f"<NCM>{ncm}</NCM>")])
    with pytest.raises(ValueError, match=r"NCM"):
        parsear_nfe(caminho)


def test_cfop_incompativel_com_tpnf_e_ncm_fora_da_tipi_o_agente_le_e_nao_recusa(tmp_path):
    """v10 = saída (tpNF=1) com CFOP 1102 (de entrada). NCM 99999999 tem 8 dígitos mas não existe na
    TIPI. O agente só confere o FORMATO; o alerta nasce no backend (recomputarInconsistencias)."""
    dados = parsear_nfe(_caminho("v10-saida-cfop-entrada"))
    assert dados["tp_nf"] == 1 and dados["itens"][0]["cfop"] == "1102"
    caminho = _variante(tmp_path, "v10-saida-cfop-entrada", [("<NCM>19059090</NCM>", "<NCM>99999999</NCM>")])
    assert parsear_nfe(caminho)["itens"][0]["ncm"] == "99999999"


def test_item_com_nitem_duplicado_recusa(tmp_path):
    xml = (QAE / "v01-entrada.xml").read_text(encoding="utf-8")
    det1 = re.search(r'<det nItem="1">.*?</det>', xml, flags=re.DOTALL).group(0)
    caminho = _variante(tmp_path, "v01-entrada", [(det1, det1 + det1)])
    with pytest.raises(ValueError, match="duplicado"):
        parsear_nfe(caminho)


# ---------------------------------------------------------------------------
# 9. Eventos ev1-ev4
# ---------------------------------------------------------------------------

def test_evento_ev1_cancelamento_homologado_da_v06():
    evento = parsear_evento_cancelamento(_caminho("ev1-cancela-v06"))
    assert evento == {
        "chave_nfe": CHAVE["v06"],
        "motivo": "QA-E 2026-10-12 cancelamento de teste",
        "protocolo": "135250000009999",
        "data_evento": "2025-02-20T10:05:00-03:00",
        "cstat": "135",
    }


def test_evento_ev2_cancelamento_de_chave_inexistente_e_lido_normalmente():
    """O parser não sabe se a nota existe; quem decide (404 e espera de 90 s) é o pipeline (NFE-4)."""
    evento = parsear_evento_cancelamento(_caminho("ev2-cancela-inexistente"))
    assert evento["chave_nfe"] == "35250211111111000191559120000000981202611103"
    assert evento["cstat"] == "135"


def test_evento_ev3_carta_de_correcao_110110_nao_cancela():
    with pytest.raises(ValueError, match=r"tpEvento=110110"):
        parsear_evento_cancelamento(_caminho("ev3-cce-110110"))


def test_evento_ev4_cancelamento_nao_homologado_cstat_573_recusa():
    with pytest.raises(ValueError, match=r"cStat=573"):
        parsear_evento_cancelamento(_caminho("ev4-cancel-nao-homologado"))


def test_nota_nao_e_evento():
    assert parsear_evento_cancelamento(_caminho("v01-entrada")) is None


# ---------------------------------------------------------------------------
# 10. Pipeline: a pasta inteira do QA-E, com a licença do Cliente Dev
# ---------------------------------------------------------------------------

@pytest.fixture
def pasta_qae(tmp_path, monkeypatch):
    base = tmp_path / "escritorio"
    inbox = base / "NFe"
    inbox.mkdir(parents=True)
    monkeypatch.setenv("PASTA_BASE", str(base))
    monkeypatch.setenv("CLIENTE_ID", CLIENTE_ID_DEV)
    monkeypatch.setattr("comunicacao.api_client.CLIENTE_ID", CLIENTE_ID_DEV)
    monkeypatch.setattr("comunicacao.api_client.LICENSE_TOKEN", "tok-teste")
    monkeypatch.setattr("comunicacao.api_client.PASTA_BASE", str(base))
    monkeypatch.setattr("comunicacao.fila_eventos.FILA_PATH", str(tmp_path / "fila_eventos.json"))
    return inbox, base


def _lookup_dev(cnpj):
    """GET /clientes/por-cnpj com escopo da licença (#462): só o Cliente Dev resolve."""
    digitos = "".join(c for c in str(cnpj) if c.isdigit())
    return {"id": CLIENTE_ID_DEV, "nome": NOME_DEV} if digitos == DEV else None


class _Hoje(date):
    @classmethod
    def today(cls):
        return cls(2026, 10, 31)


def test_pipeline_pasta_do_qae_posta_as_12_aceitas_com_o_tipo_certo(pasta_qae, monkeypatch, capsys):
    inbox, _base = pasta_qae
    monkeypatch.setattr("automacoes.processar_nfe.date", _Hoje)
    fora = {"n12-vnf-negativo"}  # recusa do vNF negativo é do backend, não do agente
    nomes = [p.stem for p in QAE.glob("*.xml") if not p.stem.startswith("ev") and p.stem not in fora]
    assert len(nomes) == 29 - 1
    for nome in nomes:
        (inbox / f"{nome}.xml").write_bytes((QAE / f"{nome}.xml").read_bytes())

    with (
        patch("automacoes.processar_nfe.buscar_empresa_por_cnpj", side_effect=_lookup_dev),
        patch("automacoes.processar_nfe.client.post") as mock_post,
    ):
        mock_post.return_value = MagicMock()
        processar_pasta_nfe(str(inbox))

    postados = {c.args[1]["chave_nfe"]: c.args[1] for c in mock_post.call_args_list}
    assert len(mock_post.call_args_list) == 12 and len(postados) == 12
    esperado = {
        "v01": "entrada", "v02": "entrada", "v03": "saida", "v04": "saida", "v05": "entrada",
        "v06": "saida", "v07": "entrada", "v08": "entrada", "v09": "entrada", "v10": "saida",
        "v11": "entrada",
        "n10": "entrada",  # emitente CPF (produtor rural), destinatário = Cliente Dev: compra, NFE-5
    }
    assert {k: postados[CHAVE[k]]["tipo"] for k in esperado} == esperado
    assert all(p["cliente_id"] == CLIENTE_ID_DEV for p in postados.values())
    assert postados[CHAVE["v01"]]["valor_total"] == "1234.56"
    assert postados[CHAVE["v10"]]["itens"] == [{"n_item": 1, "cfop": "1102", "ncm": NCM_PADARIA}]
    assert not any(Path(p["arquivo_xml"]).is_absolute() for p in postados.values())

    # As 16 negativas saem do inbox para nao_identificado/ e nada delas é postado.
    quarentena = {p.stem for p in (inbox / "nao_identificado").glob("*.xml")}
    assert quarentena == {
        "n01-denegada-110", "n02-cancelada-101", "n03-sem-nfeproc", "n04-lote-enviNFe",
        "n05-raiz-qualquer", "n06-prot-de-outra-nota", "n07-cnpj-outro-cliente", "n08-terceiros",
        "n09-cpf-dv-invalido", "n11-data-futura", "n13-malformado", "n14-nao-nfe", "n15-xxe",
        "n16-sem-assinatura", "n17-vnf-adulterado", "n18-cert-outro-emitente",
    }
    assert not list(inbox.glob("*.xml"))

    # O MOTIVO da quarentena de n11 e de n07/n08 (não basta estar no conjunto).
    log = capsys.readouterr().out
    def linha(nome):
        achadas = [l for l in log.splitlines() if f"({nome}.xml)" in l and "não identificado" in l]
        assert len(achadas) == 1, f"{nome}: {achadas}"
        return achadas[0]
    assert "data de emissão futura (2026-12-01)" in linha("n11-data-futura")
    for nome in ("n07-cnpj-outro-cliente", "n08-terceiros"):
        assert "nenhuma empresa cadastrada é emitente nem destinatário" in linha(nome)


# ---------------------------------------------------------------------------
# 11. XXE (PRB-E-21): a entidade externa nunca é resolvida, em nenhum dos dois parsers
# ---------------------------------------------------------------------------

SENTINELA = "SENTINELA-XXE-NAO-PODE-VAZAR-9f3a"


def _nota_xxe(tmp_path, entidade: str, onde: str, nome: str) -> str:
    """v01 (nota de verdade) com um DOCTYPE que aponta para um arquivo local com a sentinela."""
    segredo = tmp_path / "segredo.txt"
    segredo.write_text(SENTINELA, encoding="utf-8")
    uri = segredo.resolve().as_uri()
    xml = (QAE / "v01-entrada.xml").read_text(encoding="utf-8")
    decl_fim = xml.index("?>") + 2
    doctype = {
        "geral": f'<!DOCTYPE nfeProc [<!ENTITY xxe SYSTEM "{uri}">]>',
        "parametro": f'<!DOCTYPE nfeProc [<!ENTITY % xxe SYSTEM "{uri}"> %xxe;]>',
        "dtd_externo": f'<!DOCTYPE nfeProc SYSTEM "{uri}">',
    }[entidade]
    xml = xml[:decl_fim] + doctype + xml[decl_fim:]
    if onde == "texto":
        xml = xml.replace("<xNome>Fornecedor Alfa Ltda</xNome>", "<xNome>&xxe;</xNome>", 1)
    elif onde == "valor":
        xml = xml.replace("<vNF>1234.56</vNF>", "<vNF>&xxe;</vNF>", 1)
    destino = tmp_path / f"{nome}.xml"
    destino.write_text(xml, encoding="utf-8")
    return str(destino)


@pytest.mark.parametrize(
    "entidade,onde",
    [("geral", "texto"), ("geral", "valor"), ("parametro", "nenhum"), ("dtd_externo", "nenhum")],
)
def test_xxe_nao_vaza_o_arquivo_local_no_parser_do_agente(tmp_path, capsys, entidade, onde):
    caminho = _nota_xxe(tmp_path, entidade, onde, "xxe")
    try:
        dados = parsear_nfe(caminho)
        resultado = repr(dados)  # se um dia ler sem recusar, o conteúdo não pode estar nos dados
    except ValueError as erro:
        resultado = str(erro)
    assert SENTINELA not in resultado
    assert SENTINELA not in capsys.readouterr().out


@pytest.mark.parametrize("entidade,onde", [("geral", "texto"), ("geral", "valor"), ("parametro", "nenhum")])
def test_xxe_nao_vaza_o_arquivo_local_no_parser_da_assinatura(tmp_path, entidade, onde):
    """A conferência da assinatura usa lxml (outro parser): entidade fica sem resolver."""
    caminho = _nota_xxe(tmp_path, entidade, onde, "xxe_sig")
    # Pode passar (entidade fica sem resolver) ou falhar (ValueError, ou XMLSyntaxError do lxml quando
    # a referência perde o DOCTYPE); em nenhum caso a sentinela pode aparecer.
    try:
        validar_assinatura_nfe(caminho)
        resultado = ""
    except Exception as erro:  # noqa: BLE001
        resultado = f"{type(erro).__name__}: {erro}"
    assert SENTINELA not in resultado
    # O que importa: o parser da assinatura não carrega o conteúdo do arquivo na árvore.
    try:
        arvore = etree.tostring(etree.fromstring(Path(caminho).read_bytes(), parser=_parser())).decode()
    except etree.XMLSyntaxError:
        arvore = ""
    assert SENTINELA not in arvore


def test_xxe_na_pasta_vai_para_nao_identificado_sem_vazar_no_log_nem_postar(pasta_qae, capsys):
    inbox, _base = pasta_qae
    caminho = _nota_xxe(inbox.parent, "geral", "texto", "xxe_pasta")
    (inbox / "xxe_pasta.xml").write_bytes(Path(caminho).read_bytes())

    with (
        patch("automacoes.processar_nfe.buscar_empresa_por_cnpj", side_effect=_lookup_dev),
        patch("automacoes.processar_nfe.client.post") as mock_post,
    ):
        processar_pasta_nfe(str(inbox))

    mock_post.assert_not_called()
    assert (inbox / "nao_identificado" / "xxe_pasta.xml").is_file()
    assert SENTINELA not in capsys.readouterr().out
