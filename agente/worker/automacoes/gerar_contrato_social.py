"""Gera contrato social .docx a partir do template e dos dados da etapa."""

from __future__ import annotations

from datetime import date
import os
from pathlib import Path

from core.estrutura_pastas import criar_estrutura_empresa_em
from core.utils import validar_nome

NOME_ARQUIVO_SAIDA = "contrato_social_v1.docx"
TEMPLATE_RELATIVO = Path("templates") / "contrato_social_modelo.docx"
CNPJ_FALLBACK = "a obter"


def _caminho_template():
    override = os.getenv("TEMPLATE_CONTRATO_SOCIAL", "").strip()
    if override:
        return Path(override)

    # agente/automacoes/este_arquivo.py -> agente/
    raiz_agente = Path(__file__).resolve().parent.parent
    return raiz_agente / TEMPLATE_RELATIVO


def _resolver_cnpj(dados, payload):
    """CNPJ opcional: payload ou raiz; ausente/vazio -> 'a obter'."""
    bruto = None
    if isinstance(payload, dict) and "cnpj" in payload:
        bruto = payload.get("cnpj")
    elif isinstance(dados, dict) and "cnpj" in dados:
        bruto = dados.get("cnpj")

    if bruto is None:
        return CNPJ_FALLBACK
    if not isinstance(bruto, str):
        return CNPJ_FALLBACK
    texto = bruto.strip()
    return texto or CNPJ_FALLBACK


def _resultado(sucesso, arquivo_gerado=None, erro=None, codigo=None):
    out = {
        "sucesso": bool(sucesso),
        "arquivo_gerado": arquivo_gerado,
        "erro": erro,
    }
    if codigo:
        out["codigo"] = codigo
    return out


def _validar_dados(dados):
    if not isinstance(dados, dict):
        return "dados deve ser um objeto", "dados_invalidos"

    pasta_base = dados.get("pasta_base")
    if not isinstance(pasta_base, str) or not pasta_base.strip():
        # pasta_base ausente -> cai pra raiz local (PASTA_BASE, injetada pelo launcher)
        pasta_base = os.getenv("PASTA_BASE", "")
    pasta_base = pasta_base.strip()
    if not pasta_base:
        return "pasta_base é obrigatória", "pasta_base_ausente"
    if not os.path.isabs(pasta_base):
        return "pasta_base deve ser um caminho absoluto", "pasta_base_invalida"

    nome_empresa = dados.get("nome_empresa")
    if not isinstance(nome_empresa, str) or not nome_empresa.strip():
        return "nome_empresa é obrigatório", "nome_empresa_ausente"
    nome_empresa = nome_empresa.strip()
    try:
        validar_nome(nome_empresa)
    except ValueError as e:
        return str(e), "nome_empresa_invalido"

    payload = dados.get("payload")
    if payload is None:
        # permite chamar com campos no nivel raiz (testes / merge previo)
        payload = {
            "socios": dados.get("socios"),
            "capital_social": dados.get("capital_social"),
            "objeto_social": dados.get("objeto_social"),
            "endereco": dados.get("endereco"),
            "cnpj": dados.get("cnpj"),
        }
    if not isinstance(payload, dict):
        return "payload deve ser um objeto", "payload_invalido"

    socios = payload.get("socios")
    if not isinstance(socios, list) or len(socios) == 0:
        return "Informe ao menos um sócio", "socios_ausentes"

    socios_normalizados = []
    for socio in socios:
        if not isinstance(socio, dict):
            return "Preencha nome, CPF e participação válida para todos os sócios", "socio_invalido"
        nome = socio.get("nome")
        cpf = socio.get("cpf")
        participacao = socio.get("participacao")
        if not isinstance(nome, str) or not nome.strip():
            return "Preencha nome, CPF e participação válida para todos os sócios", "socio_invalido"
        if not isinstance(cpf, str) or not cpf.strip():
            return "Preencha nome, CPF e participação válida para todos os sócios", "socio_invalido"
        try:
            participacao_num = float(participacao)
        except (TypeError, ValueError):
            return "Preencha nome, CPF e participação válida para todos os sócios", "socio_invalido"
        if participacao_num <= 0 or participacao_num > 100:
            return "Preencha nome, CPF e participação válida para todos os sócios", "socio_invalido"
        socios_normalizados.append(
            {
                "nome": nome.strip(),
                "cpf": cpf.strip(),
                "participacao": participacao_num,
            }
        )

    total = sum(s["participacao"] for s in socios_normalizados)
    if abs(total - 100) > 0.01:
        return "A soma das participações dos sócios deve ser 100%", "participacao_invalida"

    capital = payload.get("capital_social")
    try:
        capital_num = float(capital)
    except (TypeError, ValueError):
        return "capital_social deve ser maior que zero", "capital_invalido"
    if capital_num <= 0:
        return "capital_social deve ser maior que zero", "capital_invalido"

    objeto_social = payload.get("objeto_social")
    if not isinstance(objeto_social, str) or not objeto_social.strip():
        return "objeto_social é obrigatório", "objeto_social_ausente"

    endereco = payload.get("endereco")
    if not isinstance(endereco, str) or not endereco.strip():
        return "endereco é obrigatório", "endereco_ausente"

    return {
        "pasta_base": pasta_base,
        "nome_empresa": nome_empresa,
        "socios": socios_normalizados,
        "capital_social": capital_num,
        "objeto_social": objeto_social.strip(),
        "endereco": endereco.strip(),
        "cnpj": _resolver_cnpj(dados, payload),
    }, None


def gerar_contrato_social(dados):
    """
    Preenche o template DOCX e salva em {pasta_base}/{nome_empresa}/Contratos/.

    Retorna dict: {sucesso, arquivo_gerado, erro[, codigo]} — nunca levanta para o caller.
    """
    try:
        validado, codigo = _validar_dados(dados)
        if codigo:
            return _resultado(False, erro=validado, codigo=codigo)

        template_path = _caminho_template()
        if not template_path.is_file():
            return _resultado(
                False,
                erro=f"Template de contrato social ausente: {template_path}",
                codigo="template_ausente",
            )

        pasta_empresa = os.path.join(validado["pasta_base"], validado["nome_empresa"])
        try:
            criar_estrutura_empresa_em(pasta_empresa)
        except PermissionError:
            return _resultado(
                False,
                erro=f"Sem permissão para criar pastas em {pasta_empresa}",
                codigo="permissao",
            )
        except OSError as e:
            return _resultado(
                False,
                erro=f"Falha ao garantir estrutura de pastas: {e}",
                codigo="io",
            )

        destino_dir = os.path.join(pasta_empresa, "Contratos")
        arquivo_gerado = os.path.join(destino_dir, NOME_ARQUIVO_SAIDA)

        try:
            from docxtpl import DocxTemplate

            tpl = DocxTemplate(str(template_path))
            contexto = {
                "nome_empresa": validado["nome_empresa"],
                "cnpj": validado["cnpj"],
                "capital_social": validado["capital_social"],
                "objeto_social": validado["objeto_social"],
                "endereco": validado["endereco"],
                "data_hoje": date.today().strftime("%d/%m/%Y"),
                "socios": validado["socios"],
            }
            tpl.render(contexto)
            tpl.save(arquivo_gerado)
        except PermissionError:
            return _resultado(
                False,
                erro=f"Sem permissão para gravar {arquivo_gerado}",
                codigo="permissao",
            )
        except OSError as e:
            return _resultado(
                False,
                erro=f"Falha ao gravar contrato social: {e}",
                codigo="io",
            )
        except Exception as e:
            return _resultado(
                False,
                erro=f"Falha ao preencher template: {e}",
                codigo="template_render",
            )

        return _resultado(True, arquivo_gerado=arquivo_gerado)

    except Exception as e:
        return _resultado(False, erro=f"Erro inesperado em gerar_contrato_social: {e}", codigo="inesperado")
