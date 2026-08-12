"""Parser de XML de NF-e SEFAZ + classificação entrada/saída + monitor de pasta.

CNPJ da empresa atendida: resolvido via GET /clientes/por-cnpj (cadastro no backend),
não via env. Inbox: {PASTA_BASE}/NFe.
"""

from __future__ import annotations

import shutil
import sys
import xml.etree.ElementTree as ET
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path

import comunicacao.api_client as client
from comunicacao.api_client import ApiError
from comunicacao.buscar_empresa import buscar_empresa_por_cnpj
from core.configuracao import obter_pasta_base, obter_pasta_nfe
from core.estrutura_pastas import criar_estrutura_empresa_em, resolver_destino
from core.utils import validar_caminho, validar_nome

NS = {"nfe": "http://www.portalfiscal.inf.br/nfe"}
_ASCII_DIGITS = "0123456789"
PASTA_NAO_IDENTIFICADO = "nao_identificado"
ENDPOINT_LANCAMENTOS = "/lancamentos-fiscais"


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


def resolver_empresas_nfe(cnpj_emitente: str, cnpj_destinatario: str) -> list[dict]:
    """Empresas do escritório presentes na nota (GET /clientes/por-cnpj).

    Destinatário cadastrado → entrada; emitente cadastrado → saida.
    Se os dois forem clientes (e CNPJs distintos), retorna os dois lançamentos.
    Se emitente == destinatário, só entrada (mesma regra de identificar_tipo_operacao).
    """
    emit = _somente_digitos(cnpj_emitente)
    dest = _somente_digitos(cnpj_destinatario)

    empresas: list[dict] = []

    nome_dest = buscar_empresa_por_cnpj(dest)
    if nome_dest:
        empresas.append({"cnpj": dest, "nome": nome_dest.strip(), "tipo": "entrada"})

    if emit != dest:
        nome_emit = buscar_empresa_por_cnpj(emit)
        if nome_emit:
            empresas.append({"cnpj": emit, "nome": nome_emit.strip(), "tipo": "saida"})
    elif not empresas:
        nome_emit = buscar_empresa_por_cnpj(emit)
        if nome_emit:
            empresas.append({"cnpj": emit, "nome": nome_emit.strip(), "tipo": "entrada"})

    if not empresas:
        raise ValueError(
            f"nenhuma empresa cadastrada é emitente nem destinatário "
            f"(emit={emit}, dest={dest})"
        )
    return empresas


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


def _payload_lancamento(dados: dict, tipo: str, caminho_destino: str) -> dict:
    cliente_id = (client.CLIENTE_ID or "").strip()
    if not cliente_id:
        raise ValueError("CLIENTE_ID não configurado — necessário para POST /lancamentos-fiscais")

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
        "cliente_id": cliente_id,
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


def _mover_nao_identificado(xml_path: Path, pasta_path: Path, motivo: str) -> None:
    nome = xml_path.name
    destino_nao = pasta_path / PASTA_NAO_IDENTIFICADO / nome
    try:
        movido = _mover_xml(xml_path, destino_nao)
        print(f"[processar_nfe] não identificado ({nome}): {motivo} → {movido}")
    except Exception as move_err:
        print(f"[processar_nfe] falha ao mover {nome} para nao_identificado/: {move_err}")


def processar_pasta_nfe(pasta: str) -> None:
    """Processa cada .xml na pasta (não recursivo): parse → empresas → POST → mover."""
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
            dados = parsear_nfe(str(xml_path))
        except ValueError as e:
            print(f"[processar_nfe] XML inválido ({nome}): {e}")
            continue

        try:
            empresas = resolver_empresas_nfe(
                dados["cnpj_emitente"],
                dados["cnpj_destinatario"],
            )
        except ValueError as e:
            _mover_nao_identificado(xml_path, pasta_path, str(e))
            continue

        destinos: list[Path] = []
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
            destinos.append(destino)
            alvos.append((empresa, destino))

        if not alvos:
            _mover_nao_identificado(
                xml_path,
                pasta_path,
                "nome de empresa inválido (" + "; ".join(nomes_invalidos) + ")",
            )
            continue

        falhou_post = False
        for empresa, destino in alvos:
            try:
                payload = _payload_lancamento(dados, empresa["tipo"], str(destino))
                resultado = _postar_lancamento(payload)
                print(
                    f"[processar_nfe] {resultado} {empresa['tipo']} "
                    f"{empresa['nome']} {dados['chave_nfe']}"
                )
            except Exception as e:
                print(f"[processar_nfe] falha no POST ({nome}, {empresa['nome']}): {e}")
                falhou_post = True

        if falhou_post:
            continue

        try:
            arquivados = _arquivar_nas_empresas(xml_path, destinos)
            for caminho in arquivados:
                print(f"[processar_nfe] arquivado → {caminho}")
        except Exception as e:
            print(f"[processar_nfe] POST ok, mas falha ao arquivar {nome}: {e}")


if __name__ == "__main__":
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
