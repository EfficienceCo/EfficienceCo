"""Ação composta: classificar → renomear → resolver empresa/subpasta → mover."""

import os
import shutil
from datetime import datetime

from automacoes.renomear_arquivo import renomear_arquivo
from core.estrutura_pastas import (
    PASTA_NAO_CLASSIFICADO,
    criar_estrutura_empresa_em,
    resolver_destino,
    subpasta_para_tipo,
)
from core.identificar_empresa import identificar_empresa
from core.identificar_tipo import obter_tipo
from core.utils import validar_caminho


def _extrair_empresa_propria(condicao):
    if isinstance(condicao, dict):
        valor = condicao.get("empresa_propria")
        return str(valor).strip() if valor else None
    return None


def _mover_para(origem, pasta_destino):
    nome = os.path.basename(origem)
    validar_caminho(origem)
    os.makedirs(pasta_destino, exist_ok=True)
    destino = os.path.join(pasta_destino, nome)

    if os.path.exists(destino):
        nome_sem_ext, ext = os.path.splitext(nome)
        timestamp = datetime.now().strftime("%Y-%m-%dT%H-%M-%S")
        destino = os.path.join(pasta_destino, f"{nome_sem_ext}_{timestamp}{ext}")

    try:
        shutil.move(origem, destino)
        return destino
    except PermissionError:
        raise RuntimeError(f"Sem permissão para mover {nome}")
    except Exception as e:
        raise RuntimeError(f"Erro ao mover {nome}: {e}")


def _destino_nao_classificado(caminho_atual, regra):
    pasta_origem = regra.get("pasta_origem") or os.path.dirname(caminho_atual)
    return os.path.join(pasta_origem, PASTA_NAO_CLASSIFICADO)


def organizar_arquivo(caminho, regra):
    """
    Classifica o documento, renomeia com o tipo, resolve a empresa pelo nome
    e move para a subpasta correspondente sob pasta_destino (base CLIENTES/ATIVO).

    Sem empresa ou tipo nao_identificado → pasta_origem/NAO_CLASSIFICADO.
    """
    validar_caminho(caminho)

    pasta_base = regra.get("pasta_destino")
    if not pasta_base:
        raise RuntimeError(
            "pasta_destino é obrigatória para organizar_arquivo (base CLIENTES/ATIVO)"
        )

    tipo, _precisa_renomear = obter_tipo(caminho)
    nome_apos_rename = renomear_arquivo(caminho)
    caminho_atual = os.path.join(os.path.dirname(caminho), nome_apos_rename)

    # renomear_arquivo pode devolver só o basename sem mover de pasta
    if not os.path.exists(caminho_atual):
        # se já tinha tipo no nome, caminho original permanece
        if os.path.exists(caminho):
            caminho_atual = caminho
        else:
            raise RuntimeError(f"Arquivo não encontrado após renomear: {nome_apos_rename}")

    if tipo == "nao_identificado" or not subpasta_para_tipo(tipo):
        destino_dir = _destino_nao_classificado(caminho_atual, regra)
        print(
            f"[organizar_arquivo] Tipo '{tipo}' sem destino mapeado — "
            f"enviando para {PASTA_NAO_CLASSIFICADO}"
        )
        return _mover_para(caminho_atual, destino_dir)

    condicao = regra.get("condicao") or {}
    empresa_propria = _extrair_empresa_propria(condicao)
    nome_empresa = identificar_empresa(
        caminho_atual,
        pasta_base,
        empresa_propria=empresa_propria,
    )

    if not nome_empresa:
        destino_dir = _destino_nao_classificado(caminho_atual, regra)
        print(
            f"[organizar_arquivo] Empresa não identificada em "
            f"'{os.path.basename(caminho_atual)}' — enviando para {PASTA_NAO_CLASSIFICADO}"
        )
        return _mover_para(caminho_atual, destino_dir)

    pasta_empresa = os.path.join(pasta_base, nome_empresa)
    if not os.path.isdir(pasta_empresa):
        criadas = criar_estrutura_empresa_em(pasta_empresa)
        print(
            f"[organizar_arquivo] Pasta criada para {nome_empresa}"
            + (f" (subpastas: {', '.join(criadas)})" if criadas else "")
        )
    else:
        # garante subpastas canônicas mesmo em pastas antigas
        criar_estrutura_empresa_em(pasta_empresa)

    destino_dir = resolver_destino(tipo, nome_empresa, pasta_base)
    if not destino_dir:
        destino_dir = _destino_nao_classificado(caminho_atual, regra)
        return _mover_para(caminho_atual, destino_dir)

    os.makedirs(destino_dir, exist_ok=True)
    print(
        f"[organizar_arquivo] {os.path.basename(caminho_atual)} -> "
        f"{nome_empresa}/{os.path.relpath(destino_dir, pasta_empresa)}"
    )
    return _mover_para(caminho_atual, destino_dir)
