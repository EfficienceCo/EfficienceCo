"""Extrai texto de PDF (nativo ou OCR) e de imagens (OCR)."""

import os

MIN_CHARS_TEXTO_NATIVO = 80
MAX_PAGINAS = 2
EXTENSOES_IMAGEM = {".jpg", ".jpeg", ".png"}


def _ocr_imagem_pil(imagem):
    import pytesseract

    return pytesseract.image_to_string(imagem, lang="por") or ""


def _texto_pdf_nativo(caminho, max_paginas=MAX_PAGINAS):
    import pdfplumber

    partes = []
    with pdfplumber.open(caminho) as pdf:
        for pagina in pdf.pages[:max_paginas]:
            trecho = pagina.extract_text() or ""
            if trecho.strip():
                partes.append(trecho)
    return "\n".join(partes).strip()


def _texto_pdf_ocr(caminho, max_paginas=MAX_PAGINAS):
    import pypdfium2 as pdfium

    partes = []
    pdf = pdfium.PdfDocument(caminho)
    try:
        n = min(len(pdf), max_paginas)
        for i in range(n):
            pagina = pdf[i]
            imagem = pagina.render(scale=2).to_pil().convert("RGB")
            partes.append(_ocr_imagem_pil(imagem))
    finally:
        pdf.close()
    return "\n".join(partes).strip()


def _texto_imagem(caminho):
    from PIL import Image

    with Image.open(caminho) as img:
        return _ocr_imagem_pil(img.convert("RGB")).strip()


def extrair_texto(caminho):
    """
    Retorna texto do documento. PDF: tenta texto nativo; se escasso, OCR.
    JPG/PNG: OCR direto. Outros tipos ou falha: string vazia.
    """
    if not caminho or not os.path.isfile(caminho):
        return ""

    ext = os.path.splitext(caminho)[1].lower()
    try:
        if ext == ".pdf":
            texto = _texto_pdf_nativo(caminho)
            if len(texto) >= MIN_CHARS_TEXTO_NATIVO:
                return texto
            ocr = _texto_pdf_ocr(caminho)
            return ocr if ocr else texto

        if ext in EXTENSOES_IMAGEM:
            return _texto_imagem(caminho)
    except Exception as e:
        print(f"[extrair_texto] Falha ao extrair texto de {caminho}: {e}")
        return ""

    return ""
