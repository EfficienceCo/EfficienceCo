"""Parser de XML de NF-e SEFAZ + classificação entrada/saída pelo CNPJ do cliente.

# TODO (#297 / João): ligar cnpj_cliente à configuração do agente quando o campo
# existir em core/configuracao (hoje só regras/pastas). Esta issue recebe o CNPJ
# por parâmetro.
"""

from __future__ import annotations

import sys
import xml.etree.ElementTree as ET
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path

from core.utils import validar_caminho

NS = {"nfe": "http://www.portalfiscal.inf.br/nfe"}
_ASCII_DIGITS = "0123456789"


def _find(pai: ET.Element, path: str) -> ET.Element | None:
    return pai.find(path, NS)


def _text(pai: ET.Element, path: str) -> str | None:
    el = _find(pai, path)
    return el.text if el is not None else None


def _inf_nfe(root: ET.Element) -> ET.Element:
    inf = root.find(".//nfe:infNFe", NS)
    if inf is None:
        raise ValueError("tag infNFe não encontrada (XML não é NF-e SEFAZ?)")
    return inf


def _somente_digitos(v: str) -> str:
    """Extrai apenas dígitos ASCII 0-9 (não usa str.isdigit — evita Unicode)."""
    return "".join(c for c in v if c in _ASCII_DIGITS)


def _digitos(valor: str | None, campo: str) -> str:
    if not valor:
        raise ValueError(f"campo obrigatório ausente: {campo}")
    so = _somente_digitos(valor)
    if len(so) != 14:
        raise ValueError(f"{campo} inválido (esperado 14 dígitos): {valor!r}")
    return so


def _dec(texto: str | None, campo: str, obrigatorio: bool = True) -> Decimal:
    if texto is None or texto.strip() == "":
        if obrigatorio:
            raise ValueError(f"campo obrigatório ausente: {campo}")
        return Decimal("0")
    try:
        return Decimal(texto.strip())
    except InvalidOperation as e:
        raise ValueError(f"valor inválido em {campo}: {texto!r}") from e


def _data_emissao(inf: ET.Element) -> date:
    texto = (_text(inf, "nfe:ide/nfe:dhEmi") or _text(inf, "nfe:ide/nfe:dEmi") or "").strip()
    if not texto:
        raise ValueError("data de emissão ausente (ide/dhEmi ou ide/dEmi)")
    try:
        return date.fromisoformat(texto[:10])
    except ValueError as e:
        raise ValueError(f"data de emissão inválida: {texto!r}") from e


def parsear_nfe(caminho_xml: str) -> dict:
    """Lê XML de NF-e SEFAZ e retorna campos relevantes tipados."""
    validar_caminho(caminho_xml)

    path = Path(caminho_xml)
    if not path.is_file():
        raise ValueError(f"arquivo XML não encontrado: {caminho_xml}")

    try:
        tree = ET.parse(path)
        root = tree.getroot()
    except ET.ParseError as e:
        raise ValueError(f"XML malformado: {e}") from e
    except UnicodeDecodeError as e:
        raise ValueError(f"encoding inválido no XML: {e}") from e
    except OSError as e:
        raise ValueError(f"falha ao ler XML: {e}") from e

    inf = _inf_nfe(root)

    id_attr = inf.get("Id") or ""
    chave = id_attr[3:] if id_attr.startswith("NFe") else id_attr
    if len(chave) != 44 or _somente_digitos(chave) != chave:
        raise ValueError(f"chave_nfe inválida no atributo Id: {id_attr!r}")

    cnpj_emit = _digitos(_text(inf, "nfe:emit/nfe:CNPJ"), "emit/CNPJ")
    cnpj_dest = _digitos(_text(inf, "nfe:dest/nfe:CNPJ"), "dest/CNPJ")

    return {
        "chave_nfe": chave,
        "cnpj_emitente": cnpj_emit,
        "cnpj_destinatario": cnpj_dest,
        "valor_total": _dec(_text(inf, "nfe:total/nfe:ICMSTot/nfe:vNF"), "total/ICMSTot/vNF"),
        "icms": _dec(_text(inf, "nfe:total/nfe:ICMSTot/nfe:vICMS"), "total/ICMSTot/vICMS"),
        "pis": _dec(_text(inf, "nfe:total/nfe:ICMSTot/nfe:vPIS"), "total/ICMSTot/vPIS"),
        "cofins": _dec(_text(inf, "nfe:total/nfe:ICMSTot/nfe:vCOFINS"), "total/ICMSTot/vCOFINS"),
        "ipi": _dec(_text(inf, "nfe:total/nfe:ICMSTot/nfe:vIPI"), "total/ICMSTot/vIPI", obrigatorio=False),
        "data_emissao": _data_emissao(inf),
    }


def identificar_tipo_operacao(
    cnpj_emitente: str,
    cnpj_destinatario: str,
    cnpj_cliente: str,
) -> str:
    """Retorna 'entrada' ou 'saida' relativo ao CNPJ do cliente atendido.

    Não usa ide/tpNF — entrada/saída é do ponto de vista do cliente Efficience.
    """
    emit = _somente_digitos(cnpj_emitente)
    dest = _somente_digitos(cnpj_destinatario)
    cli = _somente_digitos(cnpj_cliente)

    if not cli:
        raise ValueError("cnpj_cliente vazio")

    if dest == cli:
        return "entrada"
    if emit == cli:
        return "saida"
    raise ValueError(
        f"CNPJ do cliente ({cli}) não é emitente nem destinatário "
        f"(emit={emit}, dest={dest})"
    )


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(
            "uso: python -m automacoes.processar_nfe <caminho.xml> <cnpj_cliente>",
            file=sys.stderr,
        )
        sys.exit(1)

    dados = parsear_nfe(sys.argv[1])
    tipo = identificar_tipo_operacao(
        dados["cnpj_emitente"],
        dados["cnpj_destinatario"],
        sys.argv[2],
    )
    print(tipo, dados["chave_nfe"], dados["valor_total"], dados["data_emissao"])
