"""Testes de gerar_contrato_social (#262 / #263)."""

from pathlib import Path
from unittest.mock import patch

import pytest
from docx import Document

from automacoes.gerar_contrato_social import (
    CNPJ_FALLBACK,
    NOME_ARQUIVO_SAIDA,
    TEMPLATE_RELATIVO,
    _caminho_template,
    gerar_contrato_social,
)


def _payload_base(**overrides):
    dados = {
        "nome_empresa": "Padaria do Joao",
        "pasta_base": None,  # preenchido no teste com tmp_path
        "payload": {
            "socios": [{"nome": "Fulano", "cpf": "11144477735", "participacao": 100}],
            "capital_social": 10000,
            "objeto_social": "Comercio varejista de alimentos",
            "endereco": "Rua das Flores, 123",
        },
    }
    dados.update(overrides)
    return dados


def _texto_docx(caminho):
    doc = Document(str(caminho))
    return "\n".join(p.text for p in doc.paragraphs)


def test_caminho_template_padrao_em_templates():
    caminho = _caminho_template()
    assert caminho.name == "contrato_social_modelo.docx"
    assert caminho.parent.name == "templates"
    assert TEMPLATE_RELATIVO.as_posix() == "templates/contrato_social_modelo.docx"
    assert caminho.is_file()


def test_happy_path_cria_docx(tmp_path):
    dados = _payload_base(pasta_base=str(tmp_path))
    resultado = gerar_contrato_social(dados)

    assert resultado["sucesso"] is True
    assert resultado["erro"] is None
    esperado = tmp_path / "Padaria do Joao" / "Contratos" / NOME_ARQUIVO_SAIDA
    assert Path(resultado["arquivo_gerado"]) == esperado
    assert esperado.is_file()

    texto = _texto_docx(esperado)
    assert "Padaria do Joao" in texto
    assert "Fulano" in texto
    assert "11144477735" in texto
    assert "Comercio varejista de alimentos" in texto
    assert "CLÁUSULA" in texto
    assert CNPJ_FALLBACK in texto
    assert "{{" not in texto
    assert "{%" not in texto


def test_cnpj_ausente_usa_fallback(tmp_path):
    dados = _payload_base(pasta_base=str(tmp_path))
    resultado = gerar_contrato_social(dados)
    assert resultado["sucesso"] is True
    texto = _texto_docx(resultado["arquivo_gerado"])
    assert CNPJ_FALLBACK in texto


def test_cnpj_informado_no_payload(tmp_path):
    dados = _payload_base(pasta_base=str(tmp_path))
    dados["payload"]["cnpj"] = "12.345.678/0001-99"
    resultado = gerar_contrato_social(dados)
    assert resultado["sucesso"] is True
    texto = _texto_docx(resultado["arquivo_gerado"])
    assert "12.345.678/0001-99" in texto
    assert CNPJ_FALLBACK not in texto


def test_cnpj_vazio_usa_fallback(tmp_path):
    dados = _payload_base(pasta_base=str(tmp_path))
    dados["payload"]["cnpj"] = "   "
    resultado = gerar_contrato_social(dados)
    assert resultado["sucesso"] is True
    assert CNPJ_FALLBACK in _texto_docx(resultado["arquivo_gerado"])


def test_n_socios_dinamicos(tmp_path):
    dados = _payload_base(
        pasta_base=str(tmp_path),
        nome_empresa="Empresa Tres",
        payload={
            "socios": [
                {"nome": "Ana", "cpf": "111", "participacao": 40},
                {"nome": "Bruno", "cpf": "222", "participacao": 35},
                {"nome": "Carla", "cpf": "333", "participacao": 25},
            ],
            "capital_social": 5000,
            "objeto_social": "Servicos de TI",
            "endereco": "Av Central, 1",
        },
    )
    resultado = gerar_contrato_social(dados)
    assert resultado["sucesso"] is True
    texto = _texto_docx(resultado["arquivo_gerado"])
    assert "Ana" in texto and "Bruno" in texto and "Carla" in texto
    assert "40" in texto and "35" in texto and "25" in texto
    assert "{{" not in texto
    assert "{%" not in texto


def test_template_ausente(tmp_path, monkeypatch):
    monkeypatch.setenv("TEMPLATE_CONTRATO_SOCIAL", str(tmp_path / "nao_existe.docx"))
    dados = _payload_base(pasta_base=str(tmp_path))
    resultado = gerar_contrato_social(dados)

    assert resultado["sucesso"] is False
    assert resultado["codigo"] == "template_ausente"
    assert "ausente" in resultado["erro"].lower()
    assert not (tmp_path / "Padaria do Joao" / "Contratos" / NOME_ARQUIVO_SAIDA).exists()


@pytest.mark.parametrize(
    "mutacao,codigo",
    [
        ({"payload": {"socios": [], "capital_social": 1, "objeto_social": "x", "endereco": "y"}}, "socios_ausentes"),
        (
            {
                "payload": {
                    "socios": [{"nome": "A", "cpf": "1", "participacao": 40}],
                    "capital_social": 1,
                    "objeto_social": "x",
                    "endereco": "y",
                }
            },
            "participacao_invalida",
        ),
        (
            {
                "payload": {
                    "socios": [{"nome": "A", "cpf": "1", "participacao": 100}],
                    "capital_social": 0,
                    "objeto_social": "x",
                    "endereco": "y",
                }
            },
            "capital_invalido",
        ),
        (
            {
                "payload": {
                    "socios": [{"nome": "A", "cpf": "1", "participacao": 100}],
                    "capital_social": 10,
                    "objeto_social": "  ",
                    "endereco": "y",
                }
            },
            "objeto_social_ausente",
        ),
        (
            {
                "payload": {
                    "socios": [{"nome": "A", "cpf": "1", "participacao": 100}],
                    "capital_social": 10,
                    "objeto_social": "x",
                    "endereco": "",
                }
            },
            "endereco_ausente",
        ),
        ({"nome_empresa": ""}, "nome_empresa_ausente"),
    ],
)
def test_dados_invalidos(tmp_path, mutacao, codigo):
    dados = _payload_base(pasta_base=str(tmp_path))
    dados.update(mutacao)
    resultado = gerar_contrato_social(dados)
    assert resultado["sucesso"] is False
    assert resultado["codigo"] == codigo
    assert resultado["arquivo_gerado"] is None


def test_pasta_base_slug_rejeitada():
    dados = _payload_base(pasta_base="Padaria_do_Joao")
    resultado = gerar_contrato_social(dados)
    assert resultado["sucesso"] is False
    assert resultado["codigo"] == "pasta_base_invalida"


def test_pasta_base_ausente_usa_raiz_local(tmp_path, monkeypatch):
    """Regressão #311: sem pasta_base do backend, cai pra raiz local (PASTA_BASE)."""
    monkeypatch.setenv("PASTA_BASE", str(tmp_path))
    dados = _payload_base(pasta_base=None)
    resultado = gerar_contrato_social(dados)

    assert resultado["sucesso"] is True
    esperado = tmp_path / "Padaria do Joao" / "Contratos" / NOME_ARQUIVO_SAIDA
    assert Path(resultado["arquivo_gerado"]) == esperado


def test_falha_io_gravacao(tmp_path):
    dados = _payload_base(pasta_base=str(tmp_path))
    with patch("docxtpl.DocxTemplate") as mock_cls:
        instancia = mock_cls.return_value
        instancia.save.side_effect = OSError("disco cheio")
        resultado = gerar_contrato_social(dados)

    assert resultado["sucesso"] is False
    assert resultado["codigo"] == "io"
    assert "disco cheio" in resultado["erro"]


def test_cria_contratos_se_ausente(tmp_path):
    dados = _payload_base(pasta_base=str(tmp_path), nome_empresa="Nova Empresa")
    pasta_contratos = tmp_path / "Nova Empresa" / "Contratos"
    assert not pasta_contratos.exists()

    resultado = gerar_contrato_social(dados)
    assert resultado["sucesso"] is True
    assert pasta_contratos.is_dir()

    # segunda chamada com estrutura ja existente nao falha
    resultado2 = gerar_contrato_social(dados)
    assert resultado2["sucesso"] is True
