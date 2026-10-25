"""Testes do parser de NF-e SEFAZ e classificação entrada/saída."""

from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest

from automacoes.processar_nfe import _cnpj_valido, _cpf_valido, identificar_tipo_operacao, parsear_nfe
from helpers_nfe_assinatura import assinar_xml_nfe, gravar_nfe_assinada

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "nfe"
CNPJ_CLIENTE = "12345678000195"


def _envolver_nfe_autorizada(xml: str, *, assinar: bool = True) -> str:
    conteudo = xml.split("?>", 1)[-1]
    wrapped = f"""<?xml version="1.0" encoding="UTF-8"?>
    <nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
      {conteudo}
      <protNFe><infProt><cStat>100</cStat></infProt></protNFe>
    </nfeProc>"""
    return assinar_xml_nfe(wrapped) if assinar else wrapped


def _fixture_assinada(tmp_path, nome: str) -> str:
    xml = (FIXTURES / nome).read_text(encoding="utf-8")
    return str(gravar_nfe_assinada(tmp_path / nome, xml))


@pytest.fixture(autouse=True)
def _sem_pasta_base(monkeypatch):
    """Evita que PASTA_BASE do .env local falhe nos parses de fixture/tmp."""
    monkeypatch.delenv("PASTA_BASE", raising=False)
    monkeypatch.setattr("comunicacao.api_client.PASTA_BASE", "")


def test_parsear_nfe_entrada(tmp_path):
    dados = parsear_nfe(_fixture_assinada(tmp_path, "entrada.xml"))

    assert dados["chave_nfe"] == "35260712345678000190550010000000011000000011"
    assert len(dados["chave_nfe"]) == 44
    assert dados["chave_nfe"].isascii() and dados["chave_nfe"].isdigit()
    assert dados["cnpj_emitente"] == "98765432000198"
    assert dados["cnpj_destinatario"] == CNPJ_CLIENTE
    assert dados["valor_total"] == Decimal("1500.00")
    assert dados["icms"] == Decimal("270.00")
    assert dados["pis"] == Decimal("24.75")
    assert dados["cofins"] == Decimal("114.00")
    assert dados["ipi"] == Decimal("50.00")
    assert dados["data_emissao"] == date(2026, 7, 15)
    assert dados["tp_nf"] == 1
    assert dados["itens"][0]["cfop"] == "5102"
    assert isinstance(dados["valor_total"], Decimal)
    assert isinstance(dados["data_emissao"], date)


def test_parsear_nfe_saida_sem_vipi_e_demi(tmp_path):
    dados = parsear_nfe(_fixture_assinada(tmp_path, "saida.xml"))

    assert dados["chave_nfe"] == "35260712345678000195550010000000021000000022"
    assert dados["cnpj_emitente"] == CNPJ_CLIENTE
    assert dados["cnpj_destinatario"] == "11222333000181"
    assert dados["valor_total"] == Decimal("890.50")
    assert dados["ipi"] == Decimal("0")
    assert dados["data_emissao"] == date(2026, 7, 20)


def test_identificar_entrada_e_saida(tmp_path):
    entrada = parsear_nfe(_fixture_assinada(tmp_path, "entrada.xml"))
    assert (
        identificar_tipo_operacao(
            entrada["cnpj_emitente"],
            entrada["cnpj_destinatario"],
            CNPJ_CLIENTE,
        )
        == "entrada"
    )

    saida = parsear_nfe(_fixture_assinada(tmp_path, "saida.xml"))
    assert (
        identificar_tipo_operacao(
            saida["cnpj_emitente"],
            saida["cnpj_destinatario"],
            CNPJ_CLIENTE,
        )
        == "saida"
    )


def test_identificar_normaliza_mascara():
    assert (
        identificar_tipo_operacao(
            "98.765.432/0001-10",
            "12.345.678/0001-99",
            "12.345.678/0001-99",
        )
        == "entrada"
    )


def test_identificar_prioriza_entrada_quando_ambos():
    assert (
        identificar_tipo_operacao(CNPJ_CLIENTE, CNPJ_CLIENTE, CNPJ_CLIENTE)
        == "entrada"
    )


def test_xml_malformado(tmp_path):
    caminho = tmp_path / "quebrado.xml"
    caminho.write_text("<nfeProc><NFe>", encoding="utf-8")
    with pytest.raises(ValueError, match="XML malformado"):
        parsear_nfe(str(caminho))


def test_arquivo_inexistente():
    with pytest.raises(ValueError, match="arquivo XML não encontrado"):
        parsear_nfe("/caminho/inexistente/nota.xml")


def test_sem_inf_nfe(tmp_path):
    caminho = tmp_path / "sem_inf.xml"
    caminho.write_text(
        '<?xml version="1.0"?><root xmlns="http://www.portalfiscal.inf.br/nfe"/>',
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="infNFe"):
        parsear_nfe(str(caminho))


def test_campo_obrigatorio_ausente(tmp_path):
    xml = _envolver_nfe_autorizada("""<?xml version="1.0" encoding="UTF-8"?>
    <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
      <infNFe Id="NFe35260712345678000190550010000000011000000011" versao="4.00">
        <ide><dhEmi>2026-07-15T14:30:00-03:00</dhEmi></ide>
        <emit><CNPJ>98765432000198</CNPJ></emit>
        <dest><CNPJ>12345678000195</CNPJ></dest>
        <total><ICMSTot>
          <vICMS>0.00</vICMS><vPIS>0.00</vPIS><vCOFINS>0.00</vCOFINS>
        </ICMSTot></total>
      </infNFe>
    </NFe>
    """)
    caminho = tmp_path / "sem_vnf.xml"
    caminho.write_text(xml, encoding="utf-8")
    with pytest.raises(ValueError, match="total/ICMSTot/vNF"):
        parsear_nfe(str(caminho))


def _det(cfop: str = "5102", ncm: str = "19059090", n_item: int = 1) -> str:
    return (
        f'<det nItem="{n_item}">'
        f"<prod><cProd>1</cProd><xProd>Item</xProd>"
        f"<NCM>{ncm}</NCM><CFOP>{cfop}</CFOP><vProd>10.00</vProd></prod>"
        f"</det>"
    )


def _xml_nfe(
    emit: str,
    dest: str,
    valor: str = "10.00",
    *,
    tp_nf: str = "1",
    det: str | None = None,
) -> str:
    bloco_det = det if det is not None else _det()
    return _envolver_nfe_autorizada(f"""<?xml version="1.0" encoding="UTF-8"?>
    <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
      <infNFe Id="NFe35260712345678000195550010000000021000000022" versao="4.00">
        <ide><tpNF>{tp_nf}</tpNF><dhEmi>2026-07-15T14:30:00-03:00</dhEmi></ide>
        <emit>{emit}</emit>
        <dest>{dest}</dest>
        {bloco_det}
        <total><ICMSTot>
          <vNF>{valor}</vNF><vICMS>0.00</vICMS><vPIS>0.00</vPIS><vCOFINS>0.00</vCOFINS>
        </ICMSTot></total>
      </infNFe>
    </NFe>
    """)


def test_parsear_nfe_saida_dest_cpf(tmp_path):
    """Venda para pessoa física: dest/CPF vira cnpj_destinatario (11 dígitos) e saída."""
    caminho = tmp_path / "b2c.xml"
    caminho.write_text(
        _xml_nfe(f"<CNPJ>{CNPJ_CLIENTE}</CNPJ>", "<CPF>12345678909</CPF>", "250.00"),
        encoding="utf-8",
    )

    dados = parsear_nfe(str(caminho))

    assert dados["cnpj_emitente"] == CNPJ_CLIENTE
    assert dados["cnpj_destinatario"] == "12345678909"
    assert len(dados["cnpj_destinatario"]) == 11
    assert dados["valor_total"] == Decimal("250.00")
    assert (
        identificar_tipo_operacao(
            dados["cnpj_emitente"],
            dados["cnpj_destinatario"],
            CNPJ_CLIENTE,
        )
        == "saida"
    )


def test_parsear_nfe_dest_cpf_com_mascara(tmp_path):
    caminho = tmp_path / "b2c-mascara.xml"
    caminho.write_text(
        _xml_nfe(f"<CNPJ>{CNPJ_CLIENTE}</CNPJ>", "<CPF>123.456.789-09</CPF>"),
        encoding="utf-8",
    )

    dados = parsear_nfe(str(caminho))
    assert dados["cnpj_destinatario"] == "12345678909"


def test_dest_sem_cnpj_nem_cpf(tmp_path):
    caminho = tmp_path / "sem_doc.xml"
    caminho.write_text(
        _xml_nfe(f"<CNPJ>{CNPJ_CLIENTE}</CNPJ>", "<xNome>Consumidor</xNome>"),
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="dest/CNPJ ou dest/CPF"):
        parsear_nfe(str(caminho))


def test_dest_cpf_tamanho_invalido_nao_acusa_cnpj_ausente(tmp_path):
    caminho = tmp_path / "cpf_curto.xml"
    caminho.write_text(
        _xml_nfe(f"<CNPJ>{CNPJ_CLIENTE}</CNPJ>", "<CPF>1234567890</CPF>"),
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="dest/CPF") as exc:
        parsear_nfe(str(caminho))
    assert "dest/CNPJ" not in str(exc.value)


def test_dest_cnpj_nao_numerico_nao_acusa_ausente(tmp_path):
    caminho = tmp_path / "cnpj_na.xml"
    caminho.write_text(
        _xml_nfe(f"<CNPJ>{CNPJ_CLIENTE}</CNPJ>", "<CNPJ>N/A</CNPJ>"),
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="dest/CNPJ inválido") as exc:
        parsear_nfe(str(caminho))
    assert "N/A" in str(exc.value)
    assert "ausente" not in str(exc.value)


def test_dest_cpf_sem_digito_verificador(tmp_path):
    caminho = tmp_path / "cpf_invalido.xml"
    caminho.write_text(
        _xml_nfe(f"<CNPJ>{CNPJ_CLIENTE}</CNPJ>", "<CPF>11111111111</CPF>"),
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="dígito verificador"):
        parsear_nfe(str(caminho))


def test_dest_cpf_dv_errado_com_emitente_valido_recusa_pelo_cpf(tmp_path):
    """Emitente com CNPJ válido: a recusa tem que vir do CPF, não do CNPJ (#658)."""
    caminho = tmp_path / "cpf_dv_errado.xml"
    caminho.write_text(
        _xml_nfe(f"<CNPJ>{CNPJ_CLIENTE}</CNPJ>", "<CPF>123.456.789-00</CPF>"),
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match=r"dest/CPF inválido \(dígito verificador\)"):
        parsear_nfe(str(caminho))


def test_cnpj_cliente_ausente_na_nota():
    with pytest.raises(ValueError, match="não é emitente nem destinatário"):
        identificar_tipo_operacao(
            "98765432000198",
            "11222333000181",
            CNPJ_CLIENTE,
        )


def test_cnpj_cliente_vazio():
    with pytest.raises(ValueError, match="cnpj_cliente vazio"):
        identificar_tipo_operacao("98765432000198", "12345678000195", "abc")


def test_caminho_fora_pasta_base(monkeypatch, tmp_path):
    base = tmp_path / "cliente"
    base.mkdir()
    fora = tmp_path / "fora.xml"
    fora.write_text("<a/>", encoding="utf-8")
    monkeypatch.setenv("PASTA_BASE", str(base))
    monkeypatch.setattr("comunicacao.api_client.PASTA_BASE", str(base))
    with pytest.raises(ValueError, match="PASTA_BASE"):
        parsear_nfe(str(fora))


def test_chave_com_digito_unicode_rejeitada(tmp_path):
    # 43 ASCII + ² (isdigit True, mas não ASCII 0-9)
    chave_ruim = "3" * 43 + "²"
    xml = _envolver_nfe_autorizada(
        f"""<?xml version="1.0" encoding="UTF-8"?>
    <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
      <infNFe Id="NFe{chave_ruim}" versao="4.00">
        <ide><dhEmi>2026-07-15T14:30:00-03:00</dhEmi></ide>
        <emit><CNPJ>98765432000198</CNPJ></emit>
        <dest><CNPJ>12345678000195</CNPJ></dest>
        <total><ICMSTot>
          <vNF>10.00</vNF><vICMS>0.00</vICMS><vPIS>0.00</vPIS><vCOFINS>0.00</vCOFINS>
        </ICMSTot></total>
      </infNFe>
    </NFe>
    """,
        assinar=False,
    )
    caminho = tmp_path / "unicode_id.xml"
    caminho.write_text(xml, encoding="utf-8")
    with pytest.raises(ValueError, match="chave_nfe inválida"):
        parsear_nfe(str(caminho))


def test_nfe_proc_denegada_nao_tem_efeito_fiscal(tmp_path):
    xml = (FIXTURES / "entrada.xml").read_text(encoding="utf-8")
    xml = xml.replace("<cStat>100</cStat>", "<cStat>110</cStat>")
    caminho = tmp_path / "denegada.xml"
    caminho.write_text(xml, encoding="utf-8")

    with pytest.raises(ValueError, match=r"sem autorização fiscal \(cStat=110\)"):
        parsear_nfe(str(caminho))


def test_nfe_sem_nfe_proc_nao_tem_efeito_fiscal(tmp_path):
    xml = """<?xml version="1.0" encoding="UTF-8"?>
    <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
      <infNFe Id="NFe35260712345678000190550010000000011000000011" versao="4.00" />
    </NFe>
    """
    caminho = tmp_path / "sem-protocolo.xml"
    caminho.write_text(xml, encoding="utf-8")

    with pytest.raises(ValueError, match="sem protocolo de autorização"):
        parsear_nfe(str(caminho))


@pytest.mark.parametrize("cstat", ["100", "150"])
def test_nfe_proc_autorizada_tem_efeito_fiscal(tmp_path, cstat):
    xml = (FIXTURES / "entrada.xml").read_text(encoding="utf-8")
    xml = xml.replace("<cStat>100</cStat>", f"<cStat>{cstat}</cStat>")
    caminho = gravar_nfe_assinada(tmp_path / f"autorizada-{cstat}.xml", xml)

    assert parsear_nfe(str(caminho))["cstat"] == cstat


def test_parsear_nfe_le_tpnf_e_itens(tmp_path):
    dados = parsear_nfe(_fixture_assinada(tmp_path, "entrada.xml"))
    assert dados["tp_nf"] == 1
    assert dados["itens"] == [{"n_item": 1, "cfop": "5102", "ncm": "19059090"}]


def test_parsear_nfe_tpnf_0_com_cfop_entrada_nao_recusa(tmp_path):
    caminho = tmp_path / "entrada-propria.xml"
    caminho.write_text(
        _xml_nfe(
            f"<CNPJ>{CNPJ_CLIENTE}</CNPJ>",
            "<CNPJ>98765432000198</CNPJ>",
            tp_nf="0",
            det=_det("1102"),
        ),
        encoding="utf-8",
    )
    dados = parsear_nfe(str(caminho))
    assert dados["tp_nf"] == 0
    assert dados["itens"][0]["cfop"] == "1102"


def test_parsear_nfe_cfop_incompativel_ainda_parseia(tmp_path):
    """v10: tpNF=1 + CFOP 1102. Recusa é formato, não a inconsistência fiscal."""
    caminho = tmp_path / "v10.xml"
    caminho.write_text(
        _xml_nfe(
            f"<CNPJ>{CNPJ_CLIENTE}</CNPJ>",
            "<CNPJ>98765432000198</CNPJ>",
            det=_det("1102"),
        ),
        encoding="utf-8",
    )
    dados = parsear_nfe(str(caminho))
    assert dados["tp_nf"] == 1
    assert dados["itens"][0]["cfop"] == "1102"


def test_sem_det_recusa(tmp_path):
    caminho = tmp_path / "sem-det.xml"
    caminho.write_text(
        _xml_nfe(f"<CNPJ>{CNPJ_CLIENTE}</CNPJ>", "<CNPJ>98765432000198</CNPJ>", det=""),
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="det"):
        parsear_nfe(str(caminho))


def test_cfop_formato_invalido_recusa(tmp_path):
    caminho = tmp_path / "cfop-curto.xml"
    caminho.write_text(
        _xml_nfe(
            f"<CNPJ>{CNPJ_CLIENTE}</CNPJ>",
            "<CNPJ>98765432000198</CNPJ>",
            det=_det("51"),
        ),
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="CFOP"):
        parsear_nfe(str(caminho))


def test_ncm_formato_invalido_recusa(tmp_path):
    caminho = tmp_path / "ncm-curto.xml"
    caminho.write_text(
        _xml_nfe(
            f"<CNPJ>{CNPJ_CLIENTE}</CNPJ>",
            "<CNPJ>98765432000198</CNPJ>",
            det=_det(ncm="1905909"),
        ),
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="NCM"):
        parsear_nfe(str(caminho))


# Mesma bateria de backend/tests/comum.util.test.js e do front (esocial-tabelas.js).
@pytest.mark.parametrize("cnpj,esperado", [
    ("12345678000195", True),
    ("11222333000181", True),
    ("12345678000190", False),
    ("12345678000185", False),
    ("11111111111111", False),
    ("0000000000000", False),
    ("1234567800019", False),
])
def test_cnpj_valido(cnpj, esperado):
    assert _cnpj_valido(cnpj) is esperado


@pytest.mark.parametrize("cpf,esperado", [
    ("52998224725", True),
    ("52998224724", False),
    ("52998224735", False),
    ("11111111111", False),
])
def test_cpf_valido_bateria_comum(cpf, esperado):
    assert _cpf_valido(cpf) is esperado
