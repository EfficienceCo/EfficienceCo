"""Gerador das fixtures do QA-E (TEST-10, #687). Derivado de gen_nfe3.py (vault: problemas/anexos-qa-e-2026-10-12).

COMO REGENERAR (a partir de agente/worker/tests/fixtures/nfe/qae-2026-10-12):
    python gerar.py            # reescreve os 33 XMLs aqui, sem o prefixo "QA-E 2026-10-12 "
    python gerar.py <pasta>    # ou em outra pasta
Os certificados de teste são novos a cada execução: as assinaturas mudam, os testes não dependem delas.

O QUE MUDA EM RELAÇÃO À EVIDÊNCIA DE 12/10 (o gen_nfe3.py do vault ficou como estava):
  1. Três CNPJs tinham DV errado pela DOC-1 (módulo 11) e foram trocados por CNPJs de DV válido, com a mesma
     base de 12 dígitos. Conta à mão (pesos 5,4,3,2,9,8,7,6,5,4,3,2 para o DV1 e 6,5,4,3,2,9,8,7,6,5,4,3,2 para o DV2):
       FORN2  44555666000172 -> 44555666000181: DV1: soma 234, 234 mod 11 = 3, DV1 = 8; DV2: soma 252, mod 11 = 10, DV2 = 1
       TERC_B 98765432000110 -> 98765432000198: DV1: soma 222, mod 11 = 2, DV1 = 9; DV2: soma 245, mod 11 = 3, DV2 = 8
       TESTE  00000000000100 -> 00000000000272: DV1: soma 4, mod 11 = 4, DV1 = 7; DV2: soma 20, mod 11 = 9, DV2 = 2
     (a base 000000000001 daria 00000000000191, CNPJ real do Banco do Brasil; por isso a base 000000000002.)
  2. O Cliente Dev 11111111000111 já havia sido trocado por 11111111000191 no gen_nfe3.py de 23/10.
  3. A chave de acesso embute o CNPJ do emitente e termina no DV da chave: as chaves de v02, v05 e v09 mudaram
     (v02: ...149 -> ...145; v05: ...179 -> ...175; v09: ...210 -> ...219 e CNPJ no meio). Os valores, datas e
     impostos de todas as notas são os do relatório do QA-E.
  Os XMLs da pasta de anexos do vault seguem com os CNPJs de 12/10 (evidência); estes são os usados nos testes.
"""
import os
import sys
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

_WORKER = Path(__file__).resolve().parents[4]
for _p in (_WORKER, _WORKER / "tests"):
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

from helpers_nfe_assinatura import assinar_xml_nfe  # noqa: E402

DEV = "11111111000191"      # Cliente Teste Dev (seed-dev.js; DV válido — o 11111111000111 da bateria 2026-10-12 não passa DOC-1)
TESTE = "00000000000272"    # Cliente Teste no dataset (DV valido; o 00000000000100 da bateria de 12/10 nao passa DOC-1). TEST-10
FORN1 = "11222333000181"
FORN2 = "44555666000181"      # DV valido (era 44555666000172, DV errado pela DOC-1). TEST-10
TERC_A = "12345678000195"
TERC_B = "98765432000198"     # DV valido (era 98765432000110, DV errado pela DOC-1). TEST-10
CPF_OK = "52998224725"      # CPF valido (DV ok)
CPF_DV_RUIM = "52998224726"
CPF_PRODUTOR = "11144477735"  # CPF valido, emitente produtor rural

PFX = "QA-E 2026-10-12 "


def q(v):
    return str(Decimal(v).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def imp(v):
    v = Decimal(v)
    return dict(vNF=q(v), vICMS=q(v * Decimal("0.18")), vPIS=q(v * Decimal("0.0165")),
                vCOFINS=q(v * Decimal("0.076")))


def dv_mod11(base43):
    pesos = [2, 3, 4, 5, 6, 7, 8, 9]
    soma = sum(int(d) * pesos[i % 8] for i, d in enumerate(reversed(base43)))
    r = soma % 11
    return "0" if r in (0, 1) else str(11 - r)


def chave(n, cnpj_emit, aamm):
    cnpj_emit = cnpj_emit.rjust(14, "0")
    base = f"35{aamm}{cnpj_emit}55912{n:09d}1{20261012 + n:08d}"[:43]
    s = base + dv_mod11(base)
    assert len(s) == 44, len(s)
    return s


def nfe(n, emit, dest, data, imps, aamm, ipi=None, dest_tag="CNPJ", emit_tag="CNPJ", cstat="100",
        data_tag="dhEmi", xnome_emit="Fornecedor Alfa Ltda", enc="UTF-8", root="nfeProc",
        cfop="5102", ch=None, prot_ch=None):
    ch = ch or chave(n, emit if emit_tag == "CNPJ" else "000" + emit, aamm)
    ipi_xml = f"<vIPI>{ipi}</vIPI>" if ipi is not None else ""
    inf = (f'<infNFe versao="4.00" Id="NFe{ch}">'
           f'<ide><cUF>35</cUF><natOp>Venda</natOp><mod>55</mod><serie>912</serie><nNF>{n}</nNF>'
           f'<{data_tag}>{data}</{data_tag}><tpNF>1</tpNF></ide>'
           f'<emit><{emit_tag}>{emit}</{emit_tag}><xNome>{xnome_emit}</xNome></emit>'
           f'<dest><{dest_tag}>{dest}</{dest_tag}><xNome>Destinatario Beta</xNome></dest>'
           f'<det nItem="1"><prod><cProd>1</cProd><xProd>Item QA-E</xProd><NCM>19059090</NCM>'
           f'<CFOP>{cfop}</CFOP><vProd>{imps["vNF"]}</vProd></prod></det>'
           f'<total><ICMSTot><vBC>{imps["vNF"]}</vBC><vICMS>{imps["vICMS"]}</vICMS>{ipi_xml}'
           f'<vPIS>{imps["vPIS"]}</vPIS><vCOFINS>{imps["vCOFINS"]}</vCOFINS><vNF>{imps["vNF"]}</vNF>'
           f'</ICMSTot></total></infNFe>')
    nfe_xml = f'<NFe xmlns="http://www.portalfiscal.inf.br/nfe">{inf}</NFe>'
    prot = (f'<protNFe versao="4.00"><infProt><chNFe>{prot_ch or ch}</chNFe><cStat>{cstat}</cStat>'
            f'<xMotivo>x</xMotivo><nProt>135250000000001</nProt></infProt></protNFe>')
    if root == "nfeProc":
        body = f'<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">{nfe_xml}{prot}</nfeProc>'
    elif root == "NFe":
        body = nfe_xml
    elif root == "enviNFe":  # lote de ENVIO (nao autorizado), sem protocolo
        body = (f'<enviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><idLote>1</idLote>'
                f'<indSinc>1</indSinc>{nfe_xml}</enviNFe>')
    elif root == "qualquer":
        body = f'<pacote xmlns="http://www.portalfiscal.inf.br/nfe">{nfe_xml}</pacote>'
    else:
        raise ValueError(root)
    return ch, f'<?xml version="1.0" encoding="{enc}"?>\n{body}'


def evento(ch, tp="110111", cstat="135", just="QA-E 2026-10-12 cancelamento de teste"):
    return ('<?xml version="1.0" encoding="UTF-8"?>'
            '<procEventoNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">'
            f'<evento versao="1.00"><infEvento Id="ID{tp}{ch}01"><cOrgao>35</cOrgao><tpAmb>2</tpAmb>'
            f'<chNFe>{ch}</chNFe><dhEvento>2025-02-20T10:00:00-03:00</dhEvento><tpEvento>{tp}</tpEvento>'
            f'<nSeqEvento>1</nSeqEvento><detEvento versao="1.00"><descEvento>Cancelamento</descEvento>'
            f'<nProt>135250000000001</nProt><xJust>{just}</xJust></detEvento></infEvento></evento>'
            f'<retEvento versao="1.00"><infEvento><cStat>{cstat}</cStat><xMotivo>x</xMotivo>'
            f'<chNFe>{ch}</chNFe><dhRegEvento>2025-02-20T10:05:00-03:00</dhRegEvento>'
            f'<nProt>135250000009999</nProt></infEvento></retEvento></procEventoNFe>')


files = {}
chaves = {}


def add(nome, par, *, assinar=True, documento_cert=None):
    ch, xml = par
    chaves[nome] = ch
    if assinar and "<nfeProc" in xml:
        xml = assinar_xml_nfe(xml, documento_cert=documento_cert)
    files[PFX + nome + ".xml"] = xml


# ---- validos (devem virar lancamento) ----
add("v01-entrada", nfe(1, FORN1, DEV, "2025-01-10T10:30:00-03:00", imp("1234.56"), "2501", ipi=q("61.73"), cfop="5102"))
add("v02-entrada", nfe(2, FORN2, DEV, "2025-01-20T09:00:00-03:00", imp("987.65"), "2501", cfop="6102"))
add("v03-saida", nfe(3, DEV, TERC_A, "2025-01-25T15:00:00-03:00", imp("2500.00"), "2501", cfop="5102"))
add("v04-saida-cpf", nfe(4, DEV, CPF_OK, "2025-01-28T11:00:00-03:00", imp("640.00"), "2501", dest_tag="CPF"))
add("v05-entrada-latin1", nfe(5, FORN2, DEV, "2025-02-05T08:00:00-03:00", imp("333.33"), "2502",
                               xnome_emit="Comércio e Ação Ltda"))
add("v06-saida-a-cancelar", nfe(6, DEV, TERC_B, "2025-02-14T14:00:00-03:00", imp("1500.00"), "2502"))
add("v07-entrada-dEmi", nfe(7, FORN1, DEV, "2025-03-03", imp("100.10"), "2503", data_tag="dEmi"))
add("v08-emit-igual-dest", nfe(8, DEV, DEV, "2025-03-10T10:00:00-03:00", imp("50.00"), "2503"))
add("v09-teste-para-dev", nfe(9, TESTE, DEV, "2025-03-12T10:00:00-03:00", imp("200.00"), "2503"))
add("v10-saida-cfop-entrada", nfe(10, DEV, TERC_A, "2025-03-15T10:00:00-03:00", imp("10.00"), "2503", cfop="1102"))
add("v11-cstat150", nfe(11, FORN1, DEV, "2025-03-18T10:00:00-03:00", imp("20.00"), "2503", cstat="150"))

# ---- borda / negativos ----
add("n01-denegada-110", nfe(21, FORN1, DEV, "2025-03-20T10:00:00-03:00", imp("880.00"), "2503", cstat="110"))
add("n02-cancelada-101", nfe(22, FORN1, DEV, "2025-03-20T10:00:00-03:00", imp("880.00"), "2503", cstat="101"))
add("n03-sem-nfeproc", nfe(23, FORN1, DEV, "2025-03-20T10:00:00-03:00", imp("880.00"), "2503", root="NFe"), assinar=False)
add("n04-lote-enviNFe", nfe(24, FORN1, DEV, "2025-03-21T10:00:00-03:00", imp("777.00"), "2503", root="enviNFe"), assinar=False)
add("n05-raiz-qualquer", nfe(25, FORN1, DEV, "2025-03-22T10:00:00-03:00", imp("666.00"), "2503", root="qualquer"), assinar=False)
add("n06-prot-de-outra-nota", nfe(26, FORN1, DEV, "2025-03-23T10:00:00-03:00", imp("555.00"), "2503",
                                  prot_ch=chave(99, FORN1, "2503")))
add("n07-cnpj-outro-cliente", nfe(27, FORN1, TESTE, "2025-03-24T10:00:00-03:00", imp("444.00"), "2503"))
add("n08-terceiros", nfe(28, TERC_A, TERC_B, "2025-03-24T10:00:00-03:00", imp("100.00"), "2503"))
add("n09-cpf-dv-invalido", nfe(29, DEV, CPF_DV_RUIM, "2025-03-24T10:00:00-03:00", imp("100.00"), "2503", dest_tag="CPF"))
add("n10-emitente-produtor-cpf", nfe(30, CPF_PRODUTOR, DEV, "2025-03-25T10:00:00-03:00", imp("300.00"), "2503", emit_tag="CPF"))
add("n11-data-futura", nfe(31, FORN1, DEV, "2026-12-01T10:00:00-03:00", imp("15.00"), "2612"))
add("n12-vnf-negativo", nfe(32, FORN1, DEV, "2025-03-26T10:00:00-03:00", {**imp("1.00"), "vNF": "-10.00"}, "2503"))
# NFE-8 (#662): casos de assinatura. n16 é nfeProc válido sem Signature.
_n16 = nfe(33, FORN1, DEV, "2025-03-27T10:00:00-03:00", imp("12.00"), "2503")
add("n16-sem-assinatura", _n16, assinar=False)
_n17_ch, _n17_xml = nfe(34, FORN1, DEV, "2025-03-27T11:00:00-03:00", imp("12.00"), "2503")
_n17_assinado = assinar_xml_nfe(_n17_xml)
files[PFX + "n17-vnf-adulterado.xml"] = _n17_assinado.replace("<vNF>12.00</vNF>", "<vNF>99.00</vNF>", 1)
chaves["n17-vnf-adulterado"] = _n17_ch
add("n18-cert-outro-emitente", nfe(35, FORN1, DEV, "2025-03-27T12:00:00-03:00", imp("12.00"), "2503"),
    documento_cert=TERC_B)
files[PFX + "n13-malformado.xml"] = "<?xml version='1.0'?><nfeProc><NFe><infNFe Id=\"NFe123\"><ide>"
files[PFX + "n14-nao-nfe.xml"] = "<?xml version='1.0'?><pedido><item>1</item></pedido>"
files[PFX + "n15-xxe.xml"] = ('<?xml version="1.0"?><!DOCTYPE r [<!ENTITY x SYSTEM "file:///C:/Windows/win.ini">]>'
                              '<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe&x;"/></NFe></nfeProc>')
# eventos
files[PFX + "ev1-cancela-v06.xml"] = evento(chaves["v06-saida-a-cancelar"])
files[PFX + "ev2-cancela-inexistente.xml"] = evento(chave(98, DEV, "2502"))
files[PFX + "ev3-cce-110110.xml"] = evento(chaves["v03-saida"], tp="110110")
files[PFX + "ev4-cancel-nao-homologado.xml"] = evento(chaves["v03-saida"], cstat="573")

out = sys.argv[1] if len(sys.argv) > 1 else str(Path(__file__).resolve().parent)
os.makedirs(out, exist_ok=True)
for name, content in files.items():
    # Assinado sai UTF-8 (C14N). v05-entrada-latin1 perde o encoding original
    # depois do NFE-8; o conteúdo (ç/ã) continua no xNome.
    enc = "utf-8"
    if "latin1" in name and "Signature" not in content:
        enc = "iso-8859-1"
    with open(os.path.join(out, name.removeprefix(PFX)), "wb") as f:
        f.write(content.encode(enc))
print(len(files), "arquivos em", out)
for k, v in chaves.items():
    print(k, v)
