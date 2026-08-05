"""Testes de identificação de empresa (nome, CNPJ/API, razão social)."""

from unittest.mock import patch

from core.identificar_empresa import (
    extrair_cnpjs,
    identificar_empresa,
    normalizar_nome,
    normalizar_texto_livre,
)


def test_extrair_cnpjs_mascarado_e_limpo():
    texto = "Empresa CNPJ 12.345.678/0001-90 e também 98765432000110"
    assert extrair_cnpjs(texto) == ["12345678000190", "98765432000110"]


def test_extrair_cnpjs_deduplica():
    texto = "12.345.678/0001-90 ... 12345678000190"
    assert extrair_cnpjs(texto) == ["12345678000190"]


def test_normalizar_nome_remove_extensao_e_acentos():
    assert normalizar_nome("Padaria do João.pdf") == "padariadojoao"


def test_match_pelo_nome_do_arquivo(tmp_path):
    (tmp_path / "Padaria do João").mkdir()
    (tmp_path / "Outra").mkdir()

    nome = identificar_empresa(
        "holerite_padaria_do_joao.pdf",
        str(tmp_path),
    )
    assert nome == "Padaria do João"


def test_fallback_cnpj_via_api(tmp_path):
    (tmp_path / "Padaria do João").mkdir()
    arquivo = tmp_path / "documento_sem_empresa.pdf"
    arquivo.write_bytes(b"%PDF-1.4")

    with (
        patch("core.identificar_empresa.extrair_texto", return_value="CNPJ 12.345.678/0001-90"),
        patch(
            "core.identificar_empresa.buscar_empresa_por_cnpj",
            return_value="Padaria do João",
        ) as mock_api,
    ):
        nome = identificar_empresa(str(arquivo), str(tmp_path))

    assert nome == "Padaria do João"
    mock_api.assert_called_once_with("12345678000190")


def test_fallback_razao_social_quando_api_nao_acha(tmp_path):
    (tmp_path / "Padaria do João").mkdir()
    arquivo = tmp_path / "scan.pdf"
    arquivo.write_bytes(b"%PDF-1.4")

    with (
        patch(
            "core.identificar_empresa.extrair_texto",
            return_value="Documento da Padaria do João Ltda",
        ),
        patch("core.identificar_empresa.buscar_empresa_por_cnpj", return_value=None),
    ):
        # texto sem CNPJ → só razão social
        nome = identificar_empresa(str(arquivo), str(tmp_path))

    assert nome == "Padaria do João"


def test_fallback_cnpj_404_depois_razao_social(tmp_path):
    (tmp_path / "Mercado Central Ltda").mkdir()
    arquivo = tmp_path / "nota.pdf"
    arquivo.write_bytes(b"%PDF-1.4")

    with (
        patch(
            "core.identificar_empresa.extrair_texto",
            return_value="CNPJ 11.111.111/0001-11 Mercado Central Ltda",
        ),
        patch("core.identificar_empresa.buscar_empresa_por_cnpj", return_value=None),
    ):
        nome = identificar_empresa(str(arquivo), str(tmp_path))

    assert nome == "Mercado Central Ltda"


def test_sem_match_retorna_none(tmp_path):
    (tmp_path / "Padaria do João").mkdir()
    arquivo = tmp_path / "aleatorio.pdf"
    arquivo.write_bytes(b"%PDF-1.4")

    with patch("core.identificar_empresa.extrair_texto", return_value="sem empresa aqui"):
        assert identificar_empresa(str(arquivo), str(tmp_path)) is None


def test_normalizar_texto_livre_preserva_conteudo():
    assert "padaria" in normalizar_texto_livre("Padaria do João — ME")
