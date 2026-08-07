"""Testa extrair_texto com arquivos temporários e mocks dos parsers externos."""

import os
from unittest.mock import MagicMock, patch

import pytest

from core.extrair_texto import MIN_CHARS_TEXTO_NATIVO, extrair_texto


# ---------------------------------------------------------------------------
# Arquivo inexistente / extensão não suportada
# ---------------------------------------------------------------------------


def test_arquivo_inexistente_retorna_vazio():
    assert extrair_texto("/nao/existe/arquivo.pdf") == ""


def test_caminho_none_retorna_vazio():
    assert extrair_texto(None) == ""


def test_caminho_vazio_retorna_vazio():
    assert extrair_texto("") == ""


def test_extensao_nao_suportada_retorna_vazio(tmp_path):
    f = tmp_path / "doc.docx"
    f.write_bytes(b"conteudo qualquer")
    assert extrair_texto(str(f)) == ""


def test_extensao_txt_nao_suportada_retorna_vazio(tmp_path):
    f = tmp_path / "notas.txt"
    f.write_text("algum texto", encoding="utf-8")
    assert extrair_texto(str(f)) == ""


# ---------------------------------------------------------------------------
# PDF com texto nativo suficiente
# ---------------------------------------------------------------------------


def test_pdf_texto_nativo_suficiente_retorna_texto_sem_ocr(tmp_path):
    f = tmp_path / "doc.pdf"
    f.write_bytes(b"%PDF-1.4")

    texto_esperado = "A" * (MIN_CHARS_TEXTO_NATIVO + 10)

    mock_pdf = MagicMock()
    mock_page = MagicMock()
    mock_page.extract_text.return_value = texto_esperado
    mock_pdf.pages = [mock_page]
    mock_pdf.__enter__ = lambda s: s
    mock_pdf.__exit__ = MagicMock(return_value=False)

    with (
        patch("pdfplumber.open", return_value=mock_pdf),
        patch("core.extrair_texto._ocr_imagem_pil") as mock_ocr,
    ):
        resultado = extrair_texto(str(f))

    assert resultado == texto_esperado
    mock_ocr.assert_not_called()  # OCR não deve ser acionado


def test_pdf_texto_nativo_escasso_aciona_ocr(tmp_path):
    f = tmp_path / "scan.pdf"
    f.write_bytes(b"%PDF-1.4")

    texto_curto = "A" * (MIN_CHARS_TEXTO_NATIVO - 1)
    texto_ocr = "B" * (MIN_CHARS_TEXTO_NATIVO + 20)

    mock_pdf_plumber = MagicMock()
    mock_page = MagicMock()
    mock_page.extract_text.return_value = texto_curto
    mock_pdf_plumber.pages = [mock_page]
    mock_pdf_plumber.__enter__ = lambda s: s
    mock_pdf_plumber.__exit__ = MagicMock(return_value=False)

    mock_doc = MagicMock()
    mock_pagina_pdfium = MagicMock()
    mock_render = MagicMock()
    mock_imagem = MagicMock()
    mock_render.to_pil.return_value = mock_imagem
    mock_imagem.convert.return_value = mock_imagem
    mock_pagina_pdfium.render.return_value = mock_render
    mock_doc.__len__ = lambda s: 1
    mock_doc.__getitem__ = lambda s, i: mock_pagina_pdfium
    mock_doc.close = MagicMock()

    with (
        patch("pdfplumber.open", return_value=mock_pdf_plumber),
        patch("pypdfium2.PdfDocument", return_value=mock_doc),
        patch("core.extrair_texto._ocr_imagem_pil", return_value=texto_ocr) as mock_ocr,
    ):
        resultado = extrair_texto(str(f))

    assert resultado == texto_ocr
    mock_ocr.assert_called_once()


def test_pdf_texto_nativo_escasso_e_ocr_vazio_retorna_texto_nativo(tmp_path):
    f = tmp_path / "scan2.pdf"
    f.write_bytes(b"%PDF-1.4")

    texto_curto = "X" * 10

    mock_pdf_plumber = MagicMock()
    mock_page = MagicMock()
    mock_page.extract_text.return_value = texto_curto
    mock_pdf_plumber.pages = [mock_page]
    mock_pdf_plumber.__enter__ = lambda s: s
    mock_pdf_plumber.__exit__ = MagicMock(return_value=False)

    mock_doc = MagicMock()
    mock_pagina_pdfium = MagicMock()
    mock_render = MagicMock()
    mock_imagem = MagicMock()
    mock_render.to_pil.return_value = mock_imagem
    mock_imagem.convert.return_value = mock_imagem
    mock_pagina_pdfium.render.return_value = mock_render
    mock_doc.__len__ = lambda s: 1
    mock_doc.__getitem__ = lambda s, i: mock_pagina_pdfium
    mock_doc.close = MagicMock()

    with (
        patch("pdfplumber.open", return_value=mock_pdf_plumber),
        patch("pypdfium2.PdfDocument", return_value=mock_doc),
        patch("core.extrair_texto._ocr_imagem_pil", return_value=""),
    ):
        resultado = extrair_texto(str(f))

    # OCR vazio → cai de volta para o texto nativo (curto mas existente)
    assert resultado == texto_curto


def test_pdf_texto_nativo_none_aciona_ocr(tmp_path):
    """Página que retorna None no extract_text ainda aciona OCR."""
    f = tmp_path / "nulo.pdf"
    f.write_bytes(b"%PDF-1.4")

    texto_ocr = "C" * (MIN_CHARS_TEXTO_NATIVO + 5)

    mock_pdf_plumber = MagicMock()
    mock_page = MagicMock()
    mock_page.extract_text.return_value = None
    mock_pdf_plumber.pages = [mock_page]
    mock_pdf_plumber.__enter__ = lambda s: s
    mock_pdf_plumber.__exit__ = MagicMock(return_value=False)

    # Patcha a função de OCR de PDF diretamente para não depender do mock de pypdfium2
    with (
        patch("pdfplumber.open", return_value=mock_pdf_plumber),
        patch("core.extrair_texto._texto_pdf_ocr", return_value=texto_ocr) as mock_ocr_fn,
    ):
        resultado = extrair_texto(str(f))

    assert resultado == texto_ocr
    mock_ocr_fn.assert_called_once_with(str(f))


# ---------------------------------------------------------------------------
# Imagens
# ---------------------------------------------------------------------------


def test_imagem_jpg_aciona_ocr(tmp_path):
    f = tmp_path / "foto.jpg"
    f.write_bytes(b"\xff\xd8\xff")  # cabeçalho JPEG mínimo

    texto_ocr = "CNPJ 12.345.678/0001-90 Empresa Exemplo Ltda"

    mock_img = MagicMock()
    mock_img.convert.return_value = mock_img

    with (
        patch("PIL.Image.open", return_value=MagicMock(
            __enter__=lambda s: mock_img,
            __exit__=MagicMock(return_value=False),
        )),
        patch("core.extrair_texto._ocr_imagem_pil", return_value=texto_ocr),
    ):
        resultado = extrair_texto(str(f))

    assert resultado == texto_ocr


def test_imagem_png_aciona_ocr(tmp_path):
    f = tmp_path / "scan.png"
    f.write_bytes(b"\x89PNG\r\n\x1a\n")  # cabeçalho PNG mínimo

    texto_ocr = "Texto extraído via OCR"

    mock_img = MagicMock()
    mock_img.convert.return_value = mock_img

    with (
        patch("PIL.Image.open", return_value=MagicMock(
            __enter__=lambda s: mock_img,
            __exit__=MagicMock(return_value=False),
        )),
        patch("core.extrair_texto._ocr_imagem_pil", return_value=texto_ocr),
    ):
        resultado = extrair_texto(str(f))

    assert resultado == texto_ocr


def test_imagem_jpeg_alias_funciona(tmp_path):
    f = tmp_path / "nota.jpeg"
    f.write_bytes(b"\xff\xd8\xff")

    mock_img = MagicMock()
    mock_img.convert.return_value = mock_img

    with (
        patch("PIL.Image.open", return_value=MagicMock(
            __enter__=lambda s: mock_img,
            __exit__=MagicMock(return_value=False),
        )),
        patch("core.extrair_texto._ocr_imagem_pil", return_value="texto"),
    ):
        resultado = extrair_texto(str(f))

    assert resultado == "texto"


# ---------------------------------------------------------------------------
# Robustez: exceções não devem vazar
# ---------------------------------------------------------------------------


def test_excecao_em_pdfplumber_retorna_vazio(tmp_path):
    f = tmp_path / "corrompido.pdf"
    f.write_bytes(b"nao e um pdf")

    with patch("pdfplumber.open", side_effect=Exception("arquivo corrompido")):
        resultado = extrair_texto(str(f))

    assert resultado == ""


def test_excecao_em_ocr_retorna_vazio(tmp_path):
    f = tmp_path / "erro_ocr.jpg"
    f.write_bytes(b"\xff\xd8\xff")

    with patch("PIL.Image.open", side_effect=Exception("IO error")):
        resultado = extrair_texto(str(f))

    assert resultado == ""


def test_excecao_no_pytesseract_retorna_vazio(tmp_path):
    f = tmp_path / "sem_tesseract.png"
    f.write_bytes(b"\x89PNG\r\n\x1a\n")

    mock_img = MagicMock()
    mock_img.convert.return_value = mock_img

    with (
        patch("PIL.Image.open", return_value=MagicMock(
            __enter__=lambda s: mock_img,
            __exit__=MagicMock(return_value=False),
        )),
        patch("pytesseract.image_to_string", side_effect=Exception("tesseract not found")),
    ):
        resultado = extrair_texto(str(f))

    assert resultado == ""
