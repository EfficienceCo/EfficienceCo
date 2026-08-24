"""Varredura de pastas Folha (Fator R / AP-3) e orquestração poll → upload → report."""

import os

from comunicacao.apuracao_folha_agente import (
    buscar_folha_pendente,
    enviar_arquivos_folha,
    reportar_resultado_folha,
)
from comunicacao.api_client import ApiError
from core.configuracao import obter_pasta_base
from automacoes.upload_folha import _esta_em_pasta_arquivamento


def _subtrair_meses(ano, mes, n):
    """Retorna (ano, mes) de n meses antes de ano/mes (1-indexed)."""
    indice = ano * 12 + (mes - 1) - n
    return indice // 12, (indice % 12) + 1


def resolver_nome_cliente(item):
    """
    Nome da pasta em disco = clientes.nome, nunca o UUID de clienteId.

    Contrato do GET /apuracoes/folha-pendente (#365): campo nomeEmpresa.
    """
    for chave in ("nomeEmpresa", "nome", "pasta"):
        valor = item.get(chave)
        if isinstance(valor, str) and valor.strip():
            return valor.strip()
    return None


def _arquivos_folha_no_mes(pasta_cliente, mes, ano):
    """
    Lista planilhas .xlsx diretamente em Folha/{YYYY-MM}/.
    Ignora subpastas (enviados/rejeitados e quaisquer outras).
    """
    pasta_folha = os.path.join(pasta_cliente, "Folha", f"{ano}-{mes:02d}")
    if not os.path.isdir(pasta_folha):
        return []

    encontrados = []
    try:
        nomes = os.listdir(pasta_folha)
    except OSError as e:
        print(f"[folha_fator_r] Falha ao listar {pasta_folha}: {e}")
        return []

    for nome in nomes:
        caminho = os.path.join(pasta_folha, nome)
        if not os.path.isfile(caminho):
            continue
        if _esta_em_pasta_arquivamento(caminho):
            continue
        if not nome.lower().endswith(".xlsx"):
            continue
        if nome.startswith("~$"):
            continue
        encontrados.append(caminho)
    return encontrados


def verificar_pastas_folha(nome_empresa, mes_ref, ano_ref, pasta_base=None):
    """
    Varre Folha dos últimos 12 meses a partir de mes_ref/ano_ref (inclusive).
    Retorna flags do report + lista de caminhos absolutos para o envio.
    """
    if pasta_base is None:
        pasta_base = obter_pasta_base() or ""
    pasta_cliente = os.path.join(pasta_base, nome_empresa)

    meses_encontrados = []
    arquivos_encontrados = []

    for i in range(12):
        ano_check, mes_check = _subtrair_meses(ano_ref, mes_ref, i)
        arquivos_mes = _arquivos_folha_no_mes(pasta_cliente, mes_check, ano_check)
        if arquivos_mes:
            meses_encontrados.append({"mes": mes_check, "ano": ano_check})
            arquivos_encontrados.extend(arquivos_mes)

    return {
        "temDozeMeses": len(meses_encontrados) == 12,
        "mesesEncontrados": meses_encontrados,
        "totalMesesEncontrados": len(meses_encontrados),
        "arquivosEncontrados": arquivos_encontrados,
    }


def _processar_item(item):
    apuracao_id = item.get("id")
    mes_ref = item.get("mes")
    ano_ref = item.get("ano")

    if not apuracao_id or mes_ref is None or ano_ref is None:
        print(f"[folha_fator_r] Item inválido (faltam id/mes/ano): {item!r}")
        return

    nome = resolver_nome_cliente(item)
    if not nome:
        print(
            f"[folha_fator_r] Sem nomeEmpresa no item (apuracao={apuracao_id}, "
            f"clienteId={item.get('clienteId')}) — impossível resolver pasta local; pulando"
        )
        return

    pasta_base = obter_pasta_base()
    if not pasta_base:
        print("[folha_fator_r] PASTA_BASE ausente — pulando ciclo")
        return

    resultado = verificar_pastas_folha(nome, int(mes_ref), int(ano_ref), pasta_base=pasta_base)

    enviar_arquivos_folha(resultado["arquivosEncontrados"])

    reportar_resultado_folha(
        apuracao_id,
        {
            "temDozeMeses": resultado["temDozeMeses"],
            "mesesEncontrados": resultado["mesesEncontrados"],
            "totalMesesEncontrados": resultado["totalMesesEncontrados"],
        },
    )
    print(
        f"[folha_fator_r] Report apuracao={apuracao_id} "
        f"temDozeMeses={resultado['temDozeMeses']} "
        f"meses={resultado['totalMesesEncontrados']}"
    )


def processar_folha_fator_r():
    """Um ciclo: poll → para cada item, varre / upload / report."""
    try:
        pendentes = buscar_folha_pendente()
    except ApiError as e:
        print(f"[folha_fator_r] Erro no poll folha-pendente: {e}")
        return
    except Exception as e:
        print(f"[folha_fator_r] Falha no poll folha-pendente: {e}")
        return

    if not pendentes:
        return

    print(f"[folha_fator_r] {len(pendentes)} apuração(ões) com folha pendente")

    for item in pendentes:
        if not isinstance(item, dict):
            continue
        try:
            _processar_item(item)
        except ApiError as e:
            print(f"[folha_fator_r] Erro API no item {item.get('id')}: {e}")
        except Exception as e:
            print(f"[folha_fator_r] Falha no item {item.get('id')}: {e}")
