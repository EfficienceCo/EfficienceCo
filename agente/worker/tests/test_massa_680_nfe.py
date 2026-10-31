"""As entradas versionadas da #680 passam pelo parser/assinatura reais do agente."""

from pathlib import Path
from xml.etree import ElementTree as ET

import pytest

from automacoes.processar_nfe import parsear_nfe

FIXTURES = Path(__file__).resolve().parents[3] / "backend" / "tests" / "fixtures" / "massa-680"
NS = {"n": "http://www.portalfiscal.inf.br/nfe"}


@pytest.mark.parametrize("contexto", ["a", "b"])
@pytest.mark.parametrize("caso", [
    "entrada-autorizada", "saida-autorizada", "saida-cancelada",
    "entrada-sem-protocolo", "entrada-emitente-cpf",
])
def test_massa_680_entradas_nfe(contexto, caso, monkeypatch):
    # Configuração de teste: as fixtures locais não dependem da pasta do cliente.
    monkeypatch.delenv("PASTA_BASE", raising=False)
    monkeypatch.setattr("comunicacao.api_client.PASTA_BASE", "")
    arquivo = FIXTURES / f"nfe-{contexto}-{caso}.xml"
    if caso == "entrada-sem-protocolo":
        with pytest.raises(ValueError, match="protocolo"):
            parsear_nfe(str(arquivo))
        return

    # Inclui a nota original dos casos cancelados; não é um evento procEventoNFe.
    dados = parsear_nfe(str(arquivo))
    raiz = ET.parse(arquivo).getroot()
    inf = raiz.find("n:NFe/n:infNFe", NS)
    tag_emitente = "CPF" if caso == "entrada-emitente-cpf" else "CNPJ"
    emitente = inf.findtext(f"n:emit/n:{tag_emitente}", namespaces=NS)
    assert len(emitente) == (11 if tag_emitente == "CPF" else 14)
    assert dados["cnpj_emitente"] == emitente
    assert dados["cnpj_destinatario"] == inf.findtext("n:dest/n:CNPJ", namespaces=NS)
    assert dados["chave_nfe"] == inf.attrib["Id"][3:]
    assert len(dados["itens"]) == 1
