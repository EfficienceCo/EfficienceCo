"""Testes do parser de NF-e SEFAZ e classificação entrada/saída."""

from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest

from automacoes.processar_nfe import identificar_tipo_operacao, parsear_nfe

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "nfe"
CNPJ_CLIENTE = "12345678000199"


def test_parsear_nfe_entrada():
    dados = parsear_nfe(str(FIXTURES / "entrada.xml"))

    assert dados["chave_nfe"] == "35260712345678000190550010000000011000000011"
    assert len(dados["chave_nfe"]) == 44
    assert dados["chave_nfe"].isascii() and dados["chave_nfe"].isdigit()
    assert dados["cnpj_emitente"] == "98765432000110"
    assert dados["cnpj_destinatario"] == CNPJ_CLIENTE
    assert dados["valor_total"] == Decimal("1500.00")
    assert dados["icms"] == Decimal("270.00")
    assert dados["pis"] == Decimal("24.75")
    assert dados["cofins"] == Decimal("114.00")
    assert dados["ipi"] == Decimal("50.00")
    assert dados["data_emissao"] == date(2026, 7, 15)
    assert isinstance(dados["valor_total"], Decimal)
    assert isinstance(dados["data_emissao"], date)


def test_parsear_nfe_saida_sem_vipi_e_demi():
    dados = parsear_nfe(str(FIXTURES / "saida.xml"))

    assert dados["chave_nfe"] == "35260712345678000199550010000000021000000022"
    assert dados["cnpj_emitente"] == CNPJ_CLIENTE
    assert dados["cnpj_destinatario"] == "11222333000181"
    assert dados["valor_total"] == Decimal("890.50")
    assert dados["ipi"] == Decimal("0")
    assert dados["data_emissao"] == date(2026, 7, 20)


def test_identificar_entrada_e_saida():
    entrada = parsear_nfe(str(FIXTURES / "entrada.xml"))
    assert (
        identificar_tipo_operacao(
            entrada["cnpj_emitente"],
            entrada["cnpj_destinatario"],
            CNPJ_CLIENTE,
        )
        == "entrada"
    )

    saida = parsear_nfe(str(FIXTURES / "saida.xml"))
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
    xml = """<?xml version="1.0" encoding="UTF-8"?>
    <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
      <infNFe Id="NFe35260712345678000190550010000000011000000011" versao="4.00">
        <ide><dhEmi>2026-07-15T14:30:00-03:00</dhEmi></ide>
        <emit><CNPJ>98765432000110</CNPJ></emit>
        <dest><CNPJ>12345678000199</CNPJ></dest>
        <total><ICMSTot>
          <vICMS>0.00</vICMS><vPIS>0.00</vPIS><vCOFINS>0.00</vCOFINS>
        </ICMSTot></total>
      </infNFe>
    </NFe>
    """
    caminho = tmp_path / "sem_vnf.xml"
    caminho.write_text(xml, encoding="utf-8")
    with pytest.raises(ValueError, match="total/ICMSTot/vNF"):
        parsear_nfe(str(caminho))


def test_dest_cpf_rejeitado(tmp_path):
    xml = """<?xml version="1.0" encoding="UTF-8"?>
    <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
      <infNFe Id="NFe35260712345678000190550010000000011000000011" versao="4.00">
        <ide><dhEmi>2026-07-15T14:30:00-03:00</dhEmi></ide>
        <emit><CNPJ>98765432000110</CNPJ></emit>
        <dest><CPF>12345678901</CPF></dest>
        <total><ICMSTot>
          <vNF>10.00</vNF><vICMS>0.00</vICMS><vPIS>0.00</vPIS><vCOFINS>0.00</vCOFINS>
        </ICMSTot></total>
      </infNFe>
    </NFe>
    """
    caminho = tmp_path / "b2c.xml"
    caminho.write_text(xml, encoding="utf-8")
    with pytest.raises(ValueError, match="dest/CNPJ"):
        parsear_nfe(str(caminho))


def test_cnpj_cliente_ausente_na_nota():
    with pytest.raises(ValueError, match="não é emitente nem destinatário"):
        identificar_tipo_operacao(
            "98765432000110",
            "11222333000181",
            CNPJ_CLIENTE,
        )


def test_cnpj_cliente_vazio():
    with pytest.raises(ValueError, match="cnpj_cliente vazio"):
        identificar_tipo_operacao("98765432000110", "12345678000199", "abc")


def test_caminho_fora_pasta_base(monkeypatch, tmp_path):
    base = tmp_path / "cliente"
    base.mkdir()
    fora = tmp_path / "fora.xml"
    fora.write_text("<a/>", encoding="utf-8")
    monkeypatch.setenv("PASTA_BASE", str(base))
    with pytest.raises(ValueError, match="PASTA_BASE"):
        parsear_nfe(str(fora))


def test_chave_com_digito_unicode_rejeitada(tmp_path):
    # 43 ASCII + ² (isdigit True, mas não ASCII 0-9)
    chave_ruim = "3" * 43 + "²"
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
    <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
      <infNFe Id="NFe{chave_ruim}" versao="4.00">
        <ide><dhEmi>2026-07-15T14:30:00-03:00</dhEmi></ide>
        <emit><CNPJ>98765432000110</CNPJ></emit>
        <dest><CNPJ>12345678000199</CNPJ></dest>
        <total><ICMSTot>
          <vNF>10.00</vNF><vICMS>0.00</vICMS><vPIS>0.00</vPIS><vCOFINS>0.00</vCOFINS>
        </ICMSTot></total>
      </infNFe>
    </NFe>
    """
    caminho = tmp_path / "unicode_id.xml"
    caminho.write_text(xml, encoding="utf-8")
    with pytest.raises(ValueError, match="chave_nfe inválida"):
        parsear_nfe(str(caminho))
