"""Consome o canal de etapas automatizadas (#266 / #262)."""

from __future__ import annotations

import os

from comunicacao.etapas_agente import concluir_execucao, listar_etapas_prontas
from comunicacao.reportar_evento import reportar_evento
from automacoes.gerar_contrato_social import gerar_contrato_social
from core.estrutura_pastas import criar_estrutura_empresa_em
from core.utils import validar_nome


def _nome_empresa_evento(etapa):
    nome = etapa.get("nome_empresa")
    if isinstance(nome, str) and nome.strip():
        return nome.strip()
    return "empresa"


def _mensagem_evento(etapa, resultado):
    acao = etapa.get("acao") or "desconhecida"
    nome_empresa = _nome_empresa_evento(etapa)
    sucesso = bool(resultado.get("sucesso"))

    if not sucesso:
        erro = resultado.get("erro") or "erro desconhecido"
        return f"Falha ao processar etapa {acao} ({nome_empresa}): {erro}"

    if acao == "criar_pastas":
        return f"Estrutura de pastas criada para {nome_empresa}"
    if acao == "gerar_contrato_social":
        return f"Contrato social gerado para {nome_empresa}"
    return f"Etapa {acao} concluída para {nome_empresa}"


def _criar_pastas(etapa):
    pasta_base = etapa.get("pasta_base")
    nome_empresa = etapa.get("nome_empresa")

    if not isinstance(pasta_base, str) or not pasta_base.strip():
        return {"sucesso": False, "erro": "pasta_base é obrigatória", "arquivo_gerado": None}
    pasta_base = pasta_base.strip()
    if not os.path.isabs(pasta_base):
        return {
            "sucesso": False,
            "erro": "pasta_base deve ser um caminho absoluto",
            "arquivo_gerado": None,
        }

    if not isinstance(nome_empresa, str) or not nome_empresa.strip():
        return {"sucesso": False, "erro": "nome_empresa é obrigatório", "arquivo_gerado": None}
    nome_empresa = nome_empresa.strip()
    try:
        validar_nome(nome_empresa)
    except ValueError as e:
        return {"sucesso": False, "erro": str(e), "arquivo_gerado": None}

    pasta_empresa = os.path.join(pasta_base, nome_empresa)
    try:
        criar_estrutura_empresa_em(pasta_empresa)
    except PermissionError:
        return {
            "sucesso": False,
            "erro": f"Sem permissão para criar estrutura de {nome_empresa}",
            "arquivo_gerado": None,
        }
    except OSError as e:
        return {
            "sucesso": False,
            "erro": f"Erro ao criar estrutura de {nome_empresa}: {e}",
            "arquivo_gerado": None,
        }

    return {"sucesso": True, "erro": None, "arquivo_gerado": pasta_empresa}


def _executar_acao(etapa):
    acao = etapa.get("acao")
    if acao == "gerar_contrato_social":
        dados = {
            "nome_empresa": etapa.get("nome_empresa"),
            "pasta_base": etapa.get("pasta_base"),
            "payload": etapa.get("payload") if isinstance(etapa.get("payload"), dict) else {},
        }
        return gerar_contrato_social(dados)

    if acao == "criar_pastas":
        return _criar_pastas(etapa)

    return {
        "sucesso": False,
        "erro": f"acao desconhecida: {acao}",
        "arquivo_gerado": None,
    }


def _reportar(etapa, resultado):
    etapa_id = etapa.get("id")
    token = etapa.get("execucao_token")
    if not etapa_id or not token:
        print("[executar_etapas] Etapa sem id/execucao_token — não foi possível reportar")
        return

    sucesso = bool(resultado.get("sucesso"))
    try:
        concluir_execucao(
            etapa_id,
            sucesso=sucesso,
            execucao_token=token,
            arquivo_gerado=resultado.get("arquivo_gerado") if sucesso else None,
            erro=resultado.get("erro") if not sucesso else None,
        )
    except Exception as e:
        print(f"[executar_etapas] Falha ao reportar conclusao da etapa {etapa_id}: {e}")


def processar_etapa(etapa):
    """Executa uma etapa claimada e sempre tenta reportar o resultado."""
    try:
        resultado = _executar_acao(etapa)
    except Exception as e:
        resultado = {
            "sucesso": False,
            "erro": f"Erro inesperado na execucao: {e}",
            "arquivo_gerado": None,
        }
    _reportar(etapa, resultado)

    try:
        reportar_evento(
            _mensagem_evento(etapa, resultado),
            bool(resultado.get("sucesso")),
        )
    except Exception as e:
        print(f"[executar_etapas] Falha ao reportar evento: {e}")

    return resultado


def processar_etapas_pendentes():
    """
    Um ciclo de polling: lista etapas claimadas e processa cada uma.
    Nunca propaga excecao para o agendador.
    """
    try:
        etapas = listar_etapas_prontas()
    except Exception as e:
        print(f"[executar_etapas] Falha no polling de etapas: {e}")
        return []

    resultados = []
    for etapa in etapas:
        if not isinstance(etapa, dict):
            continue
        try:
            resultados.append(processar_etapa(etapa))
        except Exception as e:
            print(f"[executar_etapas] Falha ao processar etapa: {e}")
    return resultados
