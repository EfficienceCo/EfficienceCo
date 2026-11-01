"""Parser de XML de NF-e SEFAZ + classificação entrada/saída + monitor de pasta.

CNPJ da empresa atendida: resolvido via GET /clientes/por-cnpj (cadastro no backend),
não via env. Inbox: {PASTA_BASE}/NFe.
"""

from __future__ import annotations

import shutil
import sys
import xml.etree.ElementTree as ET
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path

import comunicacao.api_client as client
from comunicacao.api_client import ApiError
from comunicacao.buscar_empresa import (
    EmpresaLookupIndisponivel,
    buscar_empresa_por_cnpj_estrito as buscar_empresa_por_cnpj,
)
from comunicacao.reportar_evento import reportar_evento
from core.configuracao import (
    INTERVALO_POLLING_SEGUNDOS,
    obter_pasta_base,
    obter_pasta_nfe,
)
from core.estrutura_pastas import criar_estrutura_empresa_em, resolver_destino
from automacoes.nfe_assinatura import validar_assinatura_nfe
from core.utils import validar_caminho, validar_nome

NS = {"nfe": "http://www.portalfiscal.inf.br/nfe"}
_ASCII_DIGITS = "0123456789"
PASTA_NAO_IDENTIFICADO = "nao_identificado"
PASTA_EVENTOS_CANCELAMENTO = "eventos_cancelamento"
# 404 no cancelamento após esgotar a espera pela nota (NFE-4 / #656).
PASTA_EVENTOS_PENDENTES = "eventos_pendentes"
# Erro 4xx do POST não some reenviando; fica fora do inbox (polling de 30s).
PASTA_REJEITADOS = "rejeitados"
# 409: a NF-e já está no ledger — não gera outra cópia em Notas Fiscais/.
PASTA_DUPLICADAS = "duplicadas"
# 408/429 são 4xx, mas transitórios (timeout / rate limit).
# 401/403 também: token ou licença, não defeito do XML — renovam e o próximo ciclo reenvia.
_STATUS_4XX_TRANSITORIOS = frozenset({401, 403, 408, 429})
ENDPOINT_LANCAMENTOS = "/lancamentos-fiscais"
ENDPOINT_CANCELAMENTO = "/lancamentos-fiscais/cancelar"
_CSTAT_AUTORIZADOS = {"100", "150"}
_CSTAT_CANCELAMENTO_AUTORIZADO = {"135", "155"}
# Pior caso legitimo (QA-E / polling): 1o 404, ciclo seguinte escritura a nota,
# ciclo seguinte cancela = 2 * INTERVALO. Margem 150% = 3 * INTERVALO (90s se 30s).
ESPERA_CANCELAMENTO_SEM_NOTA_SEGUNDOS = int(INTERVALO_POLLING_SEGUNDOS * 2 * 1.5)
_SUFIXO_ESPERA_CANCEL = ".espera-cancel"


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


def _nome_local(elemento: ET.Element) -> str:
    return elemento.tag.rsplit("}", 1)[-1]


def _ler_xml(caminho_xml: str) -> ET.Element:
    validar_caminho(caminho_xml)

    path = Path(caminho_xml)
    if not path.is_file():
        raise ValueError(f"arquivo XML não encontrado: {caminho_xml}")

    try:
        return ET.parse(path).getroot()
    except ET.ParseError as e:
        raise ValueError(f"XML malformado: {e}") from e
    except UnicodeDecodeError as e:
        raise ValueError(f"encoding inválido no XML: {e}") from e
    except OSError as e:
        raise ValueError(f"falha ao ler XML: {e}") from e


def _inf_prot_unico(root: ET.Element) -> ET.Element:
    """Um nfeProc oficial traz um único protNFe; cStat e chNFe saem desse infProt."""
    protocolos = root.findall(".//nfe:protNFe", NS)
    if not protocolos:
        raise ValueError("nfeProc sem protocolo de autorização da SEFAZ")
    if len(protocolos) > 1:
        raise ValueError("nfeProc com mais de um protocolo de autorização")
    inf_prot = protocolos[0].find("nfe:infProt", NS)
    if inf_prot is None:
        inf_prot = protocolos[0].find(".//nfe:infProt", NS)
    if inf_prot is None:
        raise ValueError("nfeProc sem infProt no protocolo de autorização")
    return inf_prot


def _validar_protocolo_autorizacao(root: ET.Element) -> tuple[str, ET.Element]:
    """Exige nfeProc com um protocolo de autorização da própria nota (cStat 100/150).

    Fail-closed: qualquer raiz que não seja nfeProc é recusada. Lote de envio
    (enviNFe) e envelopes inventados não têm efeito fiscal. cStat e chNFe
    vêm do mesmo infProt — dois protNFe não se complementam.
    """
    nome_raiz = _nome_local(root)
    if nome_raiz == "NFe":
        raise ValueError("NF-e sem protocolo de autorização da SEFAZ")
    if nome_raiz == "enviNFe":
        raise ValueError(
            "arquivo de envio à SEFAZ (enviNFe), sem autorização — não escritura"
        )
    if nome_raiz != "nfeProc":
        raise ValueError(
            f"XML com raiz '{nome_raiz}' não é NF-e autorizada (nfeProc)"
        )

    inf_prot = _inf_prot_unico(root)
    cstat = (_text(inf_prot, "nfe:cStat") or "").strip()
    if cstat not in _CSTAT_AUTORIZADOS:
        status = cstat or "ausente"
        raise ValueError(f"NF-e sem autorização fiscal (cStat={status})")
    return cstat, inf_prot


def _validar_chave_protocolo(inf_prot: ET.Element, chave_nfe: str) -> None:
    """Garante que o mesmo infProt cita a chave da nota (sem expor as chaves)."""
    ch_prot = (_text(inf_prot, "nfe:chNFe") or "").strip()
    if not ch_prot:
        raise ValueError("nfeProc sem chNFe no protocolo de autorização")
    # Sem _somente_digitos: letra extra não pode virar match com a chave da nota.
    if len(ch_prot) != 44 or _somente_digitos(ch_prot) != ch_prot:
        raise ValueError("nfeProc com chNFe inválido no protocolo de autorização")
    if ch_prot != chave_nfe:
        # Chave embute CNPJ do emitente; motivo pode ir a log/evento — não expor.
        raise ValueError("protocolo de autorização refere outra NF-e")


def _somente_digitos(v: str) -> str:
    """Extrai apenas dígitos ASCII 0-9 (não usa str.isdigit — evita Unicode)."""
    return "".join(c for c in v if c in _ASCII_DIGITS)


def _cnpj_valido(cnpj: str) -> bool:
    """Mesma regra de cnpjValido em backend/src/utils/comum.util.js."""
    if len(cnpj) != 14 or not cnpj.isascii() or not cnpj.isdigit() or cnpj == cnpj[0] * 14:
        return False

    def digito(quantidade: int) -> int:
        peso = quantidade - 7
        soma = 0
        for i in range(quantidade):
            soma += int(cnpj[i]) * peso
            peso = 9 if peso == 2 else peso - 1
        resto = soma % 11
        return 0 if resto < 2 else 11 - resto

    return digito(12) == int(cnpj[12]) and digito(13) == int(cnpj[13])


def _cpf_valido(cpf: str) -> bool:
    """Mesma regra de cpfValido em backend/src/utils/comum.util.js."""
    if len(cpf) != 11 or not cpf.isdigit() or cpf == cpf[0] * 11:
        return False

    def digito(quantidade: int) -> int:
        soma = sum(int(cpf[i]) * (quantidade + 1 - i) for i in range(quantidade))
        resto = (soma * 10) % 11
        return 0 if resto == 10 else resto

    return digito(9) == int(cpf[9]) and digito(10) == int(cpf[10])


def _dv_chave_nfe(base43: str) -> int:
    """Módulo 11 da chave NF-e. Mesma regra de chaveNfeDvValido no backend."""
    pesos = (2, 3, 4, 5, 6, 7, 8, 9)
    soma = 0
    for i, d in enumerate(reversed(base43)):
        soma += int(d) * pesos[i % 8]
    resto = soma % 11
    return 0 if resto < 2 else 11 - resto


def _chave_nfe_dv_valida(chave: str) -> bool:
    """Mesma regra de chaveNfeDvValido em backend/src/utils/comum.util.js."""
    if len(chave) != 44 or _somente_digitos(chave) != chave:
        return False
    return int(chave[43]) == _dv_chave_nfe(chave[:43])


def _documento_na_chave(doc: str) -> str:
    """Slot 7–20 da chave SEFAZ: CNPJ ou CPF com zfill(14). NFE-5 / NFE-7."""
    if len(doc) == 11:
        return doc.zfill(14)
    return doc


def _validar_consistencia_chave(
    chave: str, inf: ET.Element, cnpj_emit: str, data_emissao: date
) -> None:
    """Confere UF, AAMM e documento do emitente contra a chave. Sem ecoar a chave."""
    cuf_bruto = _text(inf, "nfe:ide/nfe:cUF")
    if cuf_bruto is None or not str(cuf_bruto).strip():
        raise ValueError("campo obrigatório ausente: ide/cUF")
    cuf = _somente_digitos(cuf_bruto)
    if len(cuf) != 2:
        raise ValueError("ide/cUF inválido (esperado 2 dígitos)")
    if chave[0:2] != cuf:
        raise ValueError("chave de acesso inconsistente com a UF do emitente")
    aamm = f"{data_emissao.year % 100:02d}{data_emissao.month:02d}"
    if chave[2:6] != aamm:
        raise ValueError("chave de acesso inconsistente com a data de emissão")
    if chave[6:20] != _documento_na_chave(cnpj_emit):
        raise ValueError("chave de acesso inconsistente com o emitente")


def _documento_destinatario(inf: ET.Element) -> str:
    """CNPJ (14) ou CPF (11) do destinatário.

    Venda a pessoa física é NF-e legítima. O CPF entra em cnpj_destinatario:
    a coluna é VARCHAR(14), então 11 dígitos cabem sem migration. Só dígitos,
    no mesmo formato do CNPJ.
    """
    cnpj_bruto = _text(inf, "nfe:dest/nfe:CNPJ")
    cpf_bruto = _text(inf, "nfe:dest/nfe:CPF")
    cnpj = _somente_digitos(cnpj_bruto) if cnpj_bruto else ""
    cpf = _somente_digitos(cpf_bruto) if cpf_bruto else ""

    if len(cnpj) == 14:
        if not _cnpj_valido(cnpj):
            raise ValueError(f"dest/CNPJ inválido (dígito verificador): {cnpj_bruto!r}")
        return cnpj
    if len(cpf) == 11:
        if not _cpf_valido(cpf):
            raise ValueError(f"dest/CPF inválido (dígito verificador): {cpf_bruto!r}")
        return cpf
    if cnpj_bruto:
        raise ValueError(f"dest/CNPJ inválido (esperado 14 dígitos): {cnpj_bruto!r}")
    if cpf_bruto is not None:
        raise ValueError(f"dest/CPF inválido (esperado 11 dígitos): {cpf_bruto!r}")
    raise ValueError("campo obrigatório ausente: dest/CNPJ ou dest/CPF")


def _documento_emitente(inf: ET.Element) -> str:
    """CNPJ (14) ou CPF (11) do emitente.

    Produtor rural pessoa física emite NF-e com CPF. O CPF entra em
    cnpj_emitente: a coluna é VARCHAR(14), então 11 dígitos cabem sem
    padar. Só dígitos, no mesmo formato do destinatário (#566 / #659).
    Mensagens sem o número — a chave/CPF não vai para log (NFE-1 / LGPD).
    """
    cnpj_bruto = _text(inf, "nfe:emit/nfe:CNPJ")
    cpf_bruto = _text(inf, "nfe:emit/nfe:CPF")
    cnpj = _somente_digitos(cnpj_bruto) if cnpj_bruto else ""
    cpf = _somente_digitos(cpf_bruto) if cpf_bruto else ""

    if len(cnpj) == 14:
        if not _cnpj_valido(cnpj):
            raise ValueError("emit/CNPJ inválido (dígito verificador)")
        return cnpj
    if len(cpf) == 11:
        if not _cpf_valido(cpf):
            raise ValueError("emit/CPF inválido (dígito verificador)")
        return cpf
    if cnpj_bruto:
        raise ValueError("emit/CNPJ inválido (esperado 14 dígitos)")
    if cpf_bruto is not None:
        raise ValueError("emit/CPF inválido (esperado 11 dígitos)")
    raise ValueError("campo obrigatório ausente: emit/CNPJ ou emit/CPF")


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


def _tp_nf(inf: ET.Element) -> int:
    texto = (_text(inf, "nfe:ide/nfe:tpNF") or "").strip()
    if texto not in {"0", "1"}:
        raise ValueError(f"ide/tpNF inválido (esperado 0 ou 1): {texto!r}")
    return int(texto)


def _codigo_digitos(valor: str | None, campo: str, tamanho: int) -> str:
    if not valor or not str(valor).strip():
        raise ValueError(f"campo obrigatório ausente: {campo}")
    so = valor.strip()
    if len(so) != tamanho or _somente_digitos(so) != so:
        raise ValueError(f"{campo} inválido (esperado {tamanho} dígitos): {valor!r}")
    return so


def _itens_nfe(inf: ET.Element) -> list[dict]:
    dets = inf.findall("nfe:det", NS)
    if not dets:
        raise ValueError("campo obrigatório ausente: det")

    itens: list[dict] = []
    vistos: set[int] = set()
    for det in dets:
        n_item_bruto = (det.get("nItem") or "").strip()
        if not n_item_bruto.isdigit() or int(n_item_bruto) < 1:
            raise ValueError(f"det/@nItem inválido: {n_item_bruto!r}")
        n_item = int(n_item_bruto)
        if n_item in vistos:
            raise ValueError(f"det/@nItem duplicado: {n_item}")
        vistos.add(n_item)
        itens.append(
            {
                "n_item": n_item,
                "cfop": _codigo_digitos(
                    _text(det, "nfe:prod/nfe:CFOP"),
                    f"det[@nItem={n_item}]/prod/CFOP",
                    4,
                ),
                "ncm": _codigo_digitos(
                    _text(det, "nfe:prod/nfe:NCM"),
                    f"det[@nItem={n_item}]/prod/NCM",
                    8,
                ),
            }
        )
    itens.sort(key=lambda item: item["n_item"])
    return itens


def _parsear_nfe_root(root: ET.Element, caminho_xml: str) -> dict:
    cstat, inf_prot = _validar_protocolo_autorizacao(root)

    inf = _inf_nfe(root)

    # Só o leiaute 4.00 é suportado. Não introduz exigência de atributos
    # ausentes nos envelopes legados, mas recusa versões declaradas diferentes.
    for elemento in [root, inf, *root.findall(".//nfe:protNFe", NS)]:
        if elemento.get("versao") is not None and elemento.get("versao") != "4.00":
            raise ValueError("versão de leiaute da NF-e não suportada (esperado 4.00)")

    id_attr = inf.get("Id") or ""
    chave = id_attr[3:] if id_attr.startswith("NFe") else id_attr
    if len(chave) != 44 or _somente_digitos(chave) != chave:
        raise ValueError("chave de acesso inválida no atributo Id")
    if not _chave_nfe_dv_valida(chave):
        raise ValueError("chave de acesso com dígito verificador inválido")
    _validar_chave_protocolo(inf_prot, chave)

    cnpj_emit = _documento_emitente(inf)
    cnpj_dest = _documento_destinatario(inf)
    data_emissao = _data_emissao(inf)
    _validar_consistencia_chave(chave, inf, cnpj_emit, data_emissao)
    dados = {
        "chave_nfe": chave,
        "cnpj_emitente": cnpj_emit,
        "cnpj_destinatario": cnpj_dest,
        "valor_total": _dec(_text(inf, "nfe:total/nfe:ICMSTot/nfe:vNF"), "total/ICMSTot/vNF"),
        "icms": _dec(_text(inf, "nfe:total/nfe:ICMSTot/nfe:vICMS"), "total/ICMSTot/vICMS"),
        "pis": _dec(_text(inf, "nfe:total/nfe:ICMSTot/nfe:vPIS"), "total/ICMSTot/vPIS"),
        "cofins": _dec(_text(inf, "nfe:total/nfe:ICMSTot/nfe:vCOFINS"), "total/ICMSTot/vCOFINS"),
        "ipi": _dec(_text(inf, "nfe:total/nfe:ICMSTot/nfe:vIPI"), "total/ICMSTot/vIPI", obrigatorio=False),
        "data_emissao": data_emissao,
        "cstat": cstat,
        "tp_nf": _tp_nf(inf),
        "itens": _itens_nfe(inf),
    }
    # Depois dos campos: XML incompleto falha no campo, não na Signature.
    # A conferência usa os bytes originais do arquivo (C14N).
    validar_assinatura_nfe(caminho_xml)
    return dados


def parsear_nfe(caminho_xml: str) -> dict:
    """Lê XML de NF-e SEFAZ e retorna campos relevantes tipados."""
    return _parsear_nfe_root(_ler_xml(caminho_xml), caminho_xml)


def _parsear_evento_cancelamento_root(root: ET.Element) -> dict | None:
    if _nome_local(root) != "procEventoNFe":
        return None

    inf_evento = root.find(".//nfe:evento/nfe:infEvento", NS)
    if inf_evento is None:
        raise ValueError("tag evento/infEvento não encontrada")

    tipo_evento = (_text(inf_evento, "nfe:tpEvento") or "").strip()
    if tipo_evento != "110111":
        raise ValueError(f"evento de NF-e não suportado (tpEvento={tipo_evento or 'ausente'})")

    inf_retorno = root.find(".//nfe:retEvento/nfe:infEvento", NS)
    cstat = (_text(inf_retorno, "nfe:cStat") or "").strip() if inf_retorno is not None else ""
    if cstat not in _CSTAT_CANCELAMENTO_AUTORIZADO:
        raise ValueError(f"cancelamento sem homologação fiscal (cStat={cstat or 'ausente'})")

    chave = (_text(inf_evento, "nfe:chNFe") or "").strip()
    if len(chave) != 44 or _somente_digitos(chave) != chave:
        raise ValueError("chNFe inválida no evento de cancelamento")
    if not _chave_nfe_dv_valida(chave):
        raise ValueError("chNFe com dígito verificador inválido no evento de cancelamento")

    # R18 do MOC: quando informado, o retorno deve citar a mesma chave da entrada.
    chave_retorno = _text(inf_retorno, "nfe:chNFe")
    if chave_retorno is not None and chave_retorno.strip() != chave:
        raise ValueError("retorno de cancelamento refere outra NF-e")

    # R19/R21 são opcionais; quando declarados, devem identificar o mesmo evento.
    tipo_retorno = _find(inf_retorno, "nfe:tpEvento")
    if tipo_retorno is not None and (tipo_retorno.text or "").strip() != tipo_evento:
        raise ValueError("retorno de cancelamento refere outro tipo de evento")

    sequencia_retorno = _find(inf_retorno, "nfe:nSeqEvento")
    if sequencia_retorno is not None:
        try:
            mesma_sequencia = int(sequencia_retorno.text or "") == int(
                _text(inf_evento, "nfe:nSeqEvento") or ""
            )
        except ValueError:
            mesma_sequencia = False
        if not mesma_sequencia:
            raise ValueError("retorno de cancelamento refere outra sequência de evento")

    return {
        "chave_nfe": chave,
        "motivo": (_text(inf_evento, "nfe:detEvento/nfe:xJust") or "").strip() or None,
        "protocolo": (_text(inf_retorno, "nfe:nProt") or "").strip() or None,
        "data_evento": (
            (_text(inf_retorno, "nfe:dhRegEvento") or "").strip()
            or (_text(inf_evento, "nfe:dhEvento") or "").strip()
            or None
        ),
        "cstat": cstat,
    }


def parsear_evento_cancelamento(caminho_xml: str) -> dict | None:
    """Retorna os dados de um procEventoNFe de cancelamento, ou None para NF-e."""
    return _parsear_evento_cancelamento_root(_ler_xml(caminho_xml))


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
    raise ValueError("documento do cliente não é emitente nem destinatário")


def resolver_empresas_nfe(cnpj_emitente: str, cnpj_destinatario: str) -> list[dict]:
    """Empresas do escritório presentes na nota (GET /clientes/por-cnpj).

    Destinatário cadastrado -> entrada; emitente cadastrado -> saida.
    Com por-cnpj tenant-scoped (#462), no máximo o cliente da licença resolve.
    Se emitente == destinatário, só entrada (mesma regra de identificar_tipo_operacao).
    Cada item traz cliente_id (UUID) e nome vindos do lookup.
    """
    emit = _somente_digitos(cnpj_emitente)
    dest = _somente_digitos(cnpj_destinatario)

    empresas: list[dict] = []

    dest_info = buscar_empresa_por_cnpj(dest)
    if dest_info and dest_info.get("id") and dest_info.get("nome"):
        empresas.append(
            {
                "cnpj": dest,
                "nome": dest_info["nome"].strip(),
                "cliente_id": dest_info["id"].strip(),
                "tipo": "entrada",
            }
        )

    if emit != dest:
        emit_info = buscar_empresa_por_cnpj(emit)
        if emit_info and emit_info.get("id") and emit_info.get("nome"):
            empresas.append(
                {
                    "cnpj": emit,
                    "nome": emit_info["nome"].strip(),
                    "cliente_id": emit_info["id"].strip(),
                    "tipo": "saida",
                }
            )
    elif not empresas:
        emit_info = buscar_empresa_por_cnpj(emit)
        if emit_info and emit_info.get("id") and emit_info.get("nome"):
            empresas.append(
                {
                    "cnpj": emit,
                    "nome": emit_info["nome"].strip(),
                    "cliente_id": emit_info["id"].strip(),
                    "tipo": "entrada",
                }
            )

    if not empresas:
        raise ValueError("nenhuma empresa cadastrada é emitente nem destinatário")
    return empresas


def _empresas_no_escopo_licenca(empresas: list[dict]) -> list[dict]:
    """Mantém só empresas cujo cliente_id é o da licença do agente (CLIENTE_ID)."""
    licenca_id = (client.CLIENTE_ID or "").strip()
    if not licenca_id:
        return []
    return [e for e in empresas if (e.get("cliente_id") or "").strip() == licenca_id]


def resolver_empresa_nfe(cnpj_emitente: str, cnpj_destinatario: str) -> dict:
    """Compat: primeira empresa resolvida (destinatário tem prioridade)."""
    return resolver_empresas_nfe(cnpj_emitente, cnpj_destinatario)[0]


def _listar_xmls(pasta: Path) -> list[Path]:
    """XMLs diretamente sob pasta (não recursivo; ignora nao_identificado/)."""
    if not pasta.is_dir():
        return []
    return sorted(
        p
        for p in pasta.iterdir()
        if p.is_file() and p.suffix.lower() == ".xml"
    )


def _destino_nfe(pasta_base: str, nome_empresa: str, data_emissao: date, nome_arquivo: str) -> Path:
    """Pasta canônica Notas Fiscais/{YYYY-MM} via estrutura_pastas."""
    validar_nome(nome_empresa)
    pasta_empresa = str(Path(pasta_base) / nome_empresa)
    # Cria estrutura antes do POST; criação de pastas é idempotente, então um
    # POST que falhe depois não deixa rastros problemáticos.
    criar_estrutura_empresa_em(pasta_empresa)
    mes = f"{data_emissao.year:04d}-{data_emissao.month:02d}"
    destino_dir = resolver_destino("nota_fiscal", nome_empresa, pasta_base, mes=mes)
    if not destino_dir:
        raise ValueError(f"destino Notas Fiscais não resolvido para {nome_empresa!r}")
    return Path(destino_dir) / nome_arquivo


def _caminho_livre(destino: Path) -> Path:
    if not destino.exists():
        return destino
    stem, suffix = destino.stem, destino.suffix
    n = 1
    while True:
        candidato = destino.parent / f"{stem}_{n}{suffix}"
        if not candidato.exists():
            return candidato
        n += 1


def _caminho_xml_relativo(caminho_real: Path, pasta_base: Path) -> str:
    """Relativo à PASTA_BASE; se resolve() sair da base, usa sufixo canônico."""
    try:
        return caminho_real.resolve().relative_to(pasta_base.resolve()).as_posix()
    except ValueError:
        partes = caminho_real.parts
        try:
            idx = next(i for i, p in enumerate(partes) if p == "Notas Fiscais")
            if idx == 0:
                raise ValueError("sem empresa antes de Notas Fiscais")
            return "/".join(partes[idx - 1 :])
        except (StopIteration, ValueError):
            return caminho_real.name


def _copiar_xml(origem: Path, destino: Path) -> Path:
    validar_caminho(str(origem))
    validar_caminho(str(destino))
    destino.parent.mkdir(parents=True, exist_ok=True)
    final = _caminho_livre(destino)
    shutil.copy2(str(origem), str(final))
    return final


def _mover_xml(origem: Path, destino: Path) -> Path:
    validar_caminho(str(origem))
    validar_caminho(str(destino))
    destino.parent.mkdir(parents=True, exist_ok=True)
    final = _caminho_livre(destino)
    shutil.move(str(origem), str(final))
    return final


def _arquivar_nas_empresas(origem: Path, destinos: list[Path]) -> list[Path]:
    """Copia para todos os destinos e remove o original (move no último)."""
    arquivados: list[Path] = []
    for destino in destinos[:-1]:
        arquivados.append(_copiar_xml(origem, destino))
    arquivados.append(_mover_xml(origem, destinos[-1]))
    return arquivados


def _payload_lancamento(
    dados: dict, tipo: str, caminho_destino: str, cliente_id: str
) -> dict:
    cliente = (cliente_id or "").strip()
    if not cliente:
        raise ValueError("cliente_id ausente — necessário para POST /lancamentos-fiscais")

    return {
        "chave_nfe": dados["chave_nfe"],
        "tipo": tipo,
        "cnpj_emitente": dados["cnpj_emitente"],
        "cnpj_destinatario": dados["cnpj_destinatario"],
        "valor_total": str(dados["valor_total"]),
        "icms": str(dados["icms"]),
        "pis": str(dados["pis"]),
        "cofins": str(dados["cofins"]),
        "ipi": str(dados["ipi"]),
        "data_emissao": dados["data_emissao"].isoformat(),
        "arquivo_xml": caminho_destino,
        "cliente_id": cliente,
        "tp_nf": dados["tp_nf"],
        "itens": dados["itens"],
    }


def _postar_lancamento(payload: dict) -> str:
    """POST na API. Retorna 'criado' | 'duplicata'. Outros erros propagam."""
    try:
        client.post(
            ENDPOINT_LANCAMENTOS,
            payload,
            timeout=30,
            addToHeaders={"x-licenca-token": client.LICENSE_TOKEN},
        )
        return "criado"
    except ApiError as e:
        if e.status_code == 409:
            return "duplicata"
        raise


def _postar_cancelamento(evento: dict) -> None:
    client.post(
        ENDPOINT_CANCELAMENTO,
        evento,
        timeout=30,
        addToHeaders={"x-licenca-token": client.LICENSE_TOKEN},
    )


def _erro_post_permanente(exc: BaseException) -> bool:
    """4xx de validação não se resolve no próximo ciclo. 5xx, rede, 401 e 403, sim.

    409 já volta como 'duplicata' em _postar_lancamento. 401/403/408/429 reenviam.
    """
    if not isinstance(exc, ApiError):
        return False
    codigo = exc.status_code
    if not isinstance(codigo, int) or not (400 <= codigo < 500):
        return False
    if codigo == 409 or codigo in _STATUS_4XX_TRANSITORIOS:
        return False
    return True


def _mover_para_subpasta(
    xml_path: Path, pasta_path: Path, subpasta: str, rotulo: str, motivo: str
) -> None:
    nome = xml_path.name
    destino = pasta_path / subpasta / nome
    try:
        movido = _mover_xml(xml_path, destino)
        detalhe = f": {motivo}" if motivo else ""
        print(f"[processar_nfe] {rotulo} ({nome}){detalhe} -> {movido}")
    except Exception as move_err:
        print(f"[processar_nfe] falha ao mover {nome} para {subpasta}/: {move_err}")
        raise


def _mover_nao_identificado(xml_path: Path, pasta_path: Path, motivo: str) -> None:
    _mover_para_subpasta(xml_path, pasta_path, PASTA_NAO_IDENTIFICADO, "não identificado", motivo)


def _caminho_espera_cancelamento(xml_path: Path) -> Path:
    return xml_path.with_name(xml_path.name + _SUFIXO_ESPERA_CANCEL)


def _agora_utc() -> datetime:
    return datetime.now(timezone.utc)


def _limpar_espera_cancelamento(xml_path: Path) -> None:
    sidecar = _caminho_espera_cancelamento(xml_path)
    try:
        if sidecar.is_file():
            sidecar.unlink()
    except OSError:
        pass


def _espera_cancelamento_esgotada(xml_path: Path) -> bool:
    """Registra o 1º 404 e diz se a espera pela nota já estourou (NFE-4).

    Sidecar com timestamp da primeira falha 404 — mede duração da espera, não
    quantos polls o agente fez. Retorna False na primeira vez (ainda dentro da
    janela); True quando agora − início ≥ ESPERA_CANCELAMENTO_SEM_NOTA_SEGUNDOS.
    """
    agora = _agora_utc()
    sidecar = _caminho_espera_cancelamento(xml_path)
    if not sidecar.is_file():
        try:
            sidecar.write_text(agora.isoformat(), encoding="utf-8")
        except OSError as e:
            print(f"[processar_nfe] falha ao gravar espera de cancelamento: {e}")
        return False

    try:
        inicio = datetime.fromisoformat(sidecar.read_text(encoding="utf-8").strip())
    except (OSError, ValueError):
        try:
            sidecar.write_text(agora.isoformat(), encoding="utf-8")
        except OSError:
            pass
        return False

    if inicio.tzinfo is None:
        inicio = inicio.replace(tzinfo=timezone.utc)
    return (agora - inicio).total_seconds() >= ESPERA_CANCELAMENTO_SEM_NOTA_SEGUNDOS


def _tratar_falha_cancelamento(
    xml_path: Path, pasta_path: Path, erro: BaseException
) -> None:
    """404: retenta até esgotar a espera; depois tira do inbox + aviso no painel.

    Sidecar só some depois do XML sair da varredura. Se a pasta falhar,
    `_tirar_do_inbox` renomeia (padrão #569); se os dois falharem, o timestamp
    permanece e o aviso já foi enviado.

    Demais erros: só log (permanentes no cancelamento ficam para issue futura —
    mesma classe do #569 no ramo de lançamento).
    """
    nome = xml_path.name
    if isinstance(erro, ApiError) and erro.status_code == 404:
        if not _espera_cancelamento_esgotada(xml_path):
            print(
                f"[processar_nfe] falha no cancelamento ({nome}): {erro} "
                f"— aguardando nota no ledger"
            )
            return

        # Sem chave de acesso: embute CNPJ; vai a log/evento/notificação (NFE-1).
        motivo = f"cancelamento sem nota no ledger após espera ({nome})"
        _tirar_do_inbox(
            xml_path,
            pasta_path,
            PASTA_EVENTOS_PENDENTES,
            "evento pendente",
            motivo,
        )
        reportar_evento(
            f"[NF-e] Evento de cancelamento sem nota correspondente: {motivo}",
            False,
        )
        if not xml_path.is_file():
            _limpar_espera_cancelamento(xml_path)
        return

    print(f"[processar_nfe] falha no cancelamento ({nome}): {erro}")


def _copiar_criados(origem: Path, resultados: list[str], caminhos: list[Path]) -> None:
    """Copia o XML para cada empresa cujo POST criou o lançamento. Não remove a origem."""
    for resultado, destino in zip(resultados, caminhos):
        if resultado != "criado":
            continue
        try:
            copiado = _copiar_xml(origem, destino)
            print(f"[processar_nfe] arquivado -> {copiado}")
        except Exception as e:
            print(f"[processar_nfe] POST criado, mas falha ao copiar {origem.name}: {e}")


def _tirar_do_inbox(
    xml_path: Path, pasta_path: Path, subpasta: str, rotulo: str, motivo: str
) -> None:
    """Tira o XML da varredura. Se a subpasta falhar, renomeia para não ser .xml."""
    try:
        _mover_para_subpasta(xml_path, pasta_path, subpasta, rotulo, motivo)
        return
    except Exception:
        pass
    if not xml_path.is_file():
        return
    reserva = xml_path.with_name(f"{xml_path.name}.{subpasta}-pendente")
    try:
        xml_path.rename(reserva)
        print(
            f"[processar_nfe] {xml_path.name} não entrou em {subpasta}/; "
            f"renomeado para {reserva.name} para não reenviar o POST"
        )
    except Exception as e:
        print(
            f"[processar_nfe] falha ao tirar {xml_path.name} da varredura "
            f"depois do POST {rotulo}: {e}"
        )


def processar_pasta_nfe(pasta: str) -> None:
    """Processa cada .xml na pasta (não recursivo): parse -> empresas -> POST -> mover."""
    pasta_base = obter_pasta_base()
    if not pasta_base:
        print("[processar_nfe] PASTA_BASE ausente — pulando varredura")
        return

    pasta_path = Path(pasta)
    if not pasta_path.is_dir():
        try:
            pasta_path.mkdir(parents=True, exist_ok=True)
            print(f"[processar_nfe] pasta criada: {pasta_path}")
        except OSError as e:
            print(f"[processar_nfe] pasta_nfe inexistente e não criável ({pasta}): {e}")
            return

    for xml_path in _listar_xmls(pasta_path):
        nome = xml_path.name
        try:
            root = _ler_xml(str(xml_path))
            evento = _parsear_evento_cancelamento_root(root)
        except ValueError as e:
            try:
                _mover_nao_identificado(xml_path, pasta_path, str(e))
            except Exception:
                pass
            continue

        if evento is not None:
            try:
                _postar_cancelamento(evento)
                _limpar_espera_cancelamento(xml_path)
                destino = pasta_path / PASTA_EVENTOS_CANCELAMENTO / nome
                movido = _mover_xml(xml_path, destino)
                print(
                    f"[processar_nfe] cancelada {evento['chave_nfe']} "
                    f"e evento arquivado -> {movido}"
                )
            except Exception as e:
                # 404: evento pode ter chegado antes da nota — espera limitada (NFE-4).
                _tratar_falha_cancelamento(xml_path, pasta_path, e)
            continue

        try:
            dados = _parsear_nfe_root(root, str(xml_path))
        except ValueError as e:
            try:
                _mover_nao_identificado(xml_path, pasta_path, str(e))
            except Exception:
                pass
            continue

        # BUG-APUR-08 / QA-E: NF-e com data futura não entra no ledger.
        if dados["data_emissao"] > date.today():
            try:
                _mover_nao_identificado(
                    xml_path,
                    pasta_path,
                    f"data de emissão futura ({dados['data_emissao'].isoformat()})",
                )
            except Exception:
                pass
            continue

        try:
            empresas = resolver_empresas_nfe(
                dados["cnpj_emitente"],
                dados["cnpj_destinatario"],
            )
        except EmpresaLookupIndisponivel:
            print(f"[processar_nfe] lookup indisponível ({nome}); nova tentativa no próximo ciclo")
            continue
        except ValueError as e:
            try:
                _mover_nao_identificado(xml_path, pasta_path, str(e))
            except Exception:
                pass
            continue

        empresas = _empresas_no_escopo_licenca(empresas)
        if not empresas:
            _mover_nao_identificado(
                xml_path,
                pasta_path,
                "nenhuma empresa no escopo da licença do agente",
            )
            continue

        alvos: list[tuple[dict, Path]] = []
        nomes_invalidos = []
        for empresa in empresas:
            try:
                destino = _destino_nfe(
                    pasta_base, empresa["nome"], dados["data_emissao"], nome
                )
            except ValueError as e:
                nomes_invalidos.append(f"{empresa['nome']!r}: {e}")
                continue
            alvos.append((empresa, destino))

        if not alvos:
            try:
                _mover_nao_identificado(
                    xml_path,
                    pasta_path,
                    "nome de empresa inválido (" + "; ".join(nomes_invalidos) + ")",
                )
            except Exception:
                pass
            continue

        # Resolve os caminhos finais antes do POST para garantir que arquivo_xml
        # no banco aponta para onde o arquivo vai parar de fato.
        caminhos_reais = [_caminho_livre(d) for _, d in alvos]

        # criado | duplicata | permanente | transitorio
        resultados: list[str] = []
        pasta_base_path = Path(pasta_base)
        for (empresa, _destino), caminho_real in zip(alvos, caminhos_reais):
            relativo = _caminho_xml_relativo(Path(caminho_real), pasta_base_path)
            try:
                payload = _payload_lancamento(
                    dados,
                    empresa["tipo"],
                    relativo,
                    empresa["cliente_id"],
                )
                resultado = _postar_lancamento(payload)
                print(
                    f"[processar_nfe] {resultado} {empresa['tipo']} "
                    f"{empresa['nome']} {dados['chave_nfe']}"
                )
                resultados.append(resultado)
            except Exception as e:
                print(f"[processar_nfe] falha no POST ({nome}, {empresa['nome']}): {e}")
                resultados.append("permanente" if _erro_post_permanente(e) else "transitorio")

        # Por empresa: criado arquiva o próprio caminho; duplicata não gera cópia.
        # O XML do inbox só sai quando ninguém precisa de reenvio.
        if "transitorio" in resultados:
            _copiar_criados(xml_path, resultados, caminhos_reais)
            continue

        if "permanente" in resultados:
            _copiar_criados(xml_path, resultados, caminhos_reais)
            _tirar_do_inbox(
                xml_path,
                pasta_path,
                PASTA_REJEITADOS,
                "rejeitado",
                "erro permanente do POST",
            )
            continue

        criados = [c for r, c in zip(resultados, caminhos_reais) if r == "criado"]
        if criados:
            try:
                arquivados = _arquivar_nas_empresas(xml_path, criados)
                for caminho in arquivados:
                    print(f"[processar_nfe] arquivado -> {caminho}")
            except Exception as e:
                print(f"[processar_nfe] POST ok, mas falha ao arquivar {nome}: {e}")
            continue

        if resultados and all(r == "duplicata" for r in resultados):
            _tirar_do_inbox(
                xml_path,
                pasta_path,
                PASTA_DUPLICADAS,
                "duplicata",
                dados["chave_nfe"],
            )


if __name__ == "__main__":
    from core.encoding_console import garantir_stdout_utf8

    garantir_stdout_utf8()
    if len(sys.argv) >= 2 and sys.argv[1] == "pasta":
        pasta_arg = sys.argv[2] if len(sys.argv) > 2 else (obter_pasta_nfe() or "")
        if not pasta_arg:
            print(
                "uso: python -m automacoes.processar_nfe pasta [caminho]\n"
                "(sem caminho: usa {PASTA_BASE}/NFe)",
                file=sys.stderr,
            )
            sys.exit(1)
        processar_pasta_nfe(pasta_arg)
        sys.exit(0)

    if len(sys.argv) < 3:
        print(
            "uso: python -m automacoes.processar_nfe <caminho.xml> <cnpj_cliente>\n"
            "     python -m automacoes.processar_nfe pasta [caminho_pasta]",
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
