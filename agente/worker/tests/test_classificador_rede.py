"""
Testa excel_para_imagem_pil e classificar_documento do classificador de rede.

- excel_para_imagem_pil: gera uma imagem PIL a partir de um arquivo Excel real
  criado em memória via openpyxl.
- classificar_documento: testa o ramo de decisão por extensão e a resposta
  correta quando o modelo de ML não existe (cenário padrão em CI/dev).
"""

import io
import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

REDE_DIR = Path(__file__).resolve().parent.parent / "automacoes" / "rede"

try:
    import torch  # noqa: F401
    import torchvision  # noqa: F401
    TORCH_OK = True
except ImportError:
    TORCH_OK = False

try:
    import pandas as pd
    import matplotlib
    matplotlib.use("Agg")
    from PIL import Image
    PANDAS_OK = True
except ImportError:
    PANDAS_OK = False

try:
    import openpyxl
    OPENPYXL_OK = True
except ImportError:
    OPENPYXL_OK = False


def criar_excel_em_memoria(linhas=5, colunas=3):
    """Cria um arquivo .xlsx em memória com dados fictícios e retorna o path."""
    import tempfile
    import openpyxl

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append([f"Col{i+1}" for i in range(colunas)])
    for r in range(linhas):
        ws.append([f"Dado {r}-{c}" for c in range(colunas)])

    tmp = tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False)
    wb.save(tmp.name)
    tmp.close()
    return tmp.name


@pytest.mark.skipif(not (PANDAS_OK and OPENPYXL_OK), reason="pandas/openpyxl/matplotlib não instalados")
class TestExcelParaImagemPil:
    def setup_method(self):
        sys.path.insert(0, str(REDE_DIR.parent.parent))
        from automacoes.rede.classificador import excel_para_imagem_pil
        self.excel_para_imagem_pil = excel_para_imagem_pil

    def test_retorna_imagem_pil_rgb(self, tmp_path):
        from PIL import Image as PILImage
        excel_path = criar_excel_em_memoria()
        try:
            img = self.excel_para_imagem_pil(excel_path)
            assert isinstance(img, PILImage.Image)
            assert img.mode == "RGB"
        finally:
            os.unlink(excel_path)

    def test_imagem_tem_dimensoes_razoaveis(self, tmp_path):
        excel_path = criar_excel_em_memoria(linhas=10, colunas=4)
        try:
            img = self.excel_para_imagem_pil(excel_path)
            largura, altura = img.size
            assert largura > 100, f"imagem muito estreita: {largura}px"
            assert altura > 100, f"imagem muito baixa: {altura}px"
        finally:
            os.unlink(excel_path)

    def test_excel_com_uma_linha_nao_crasha(self, tmp_path):
        """Excel mínimo (cabeçalho + 1 linha de dados) não deve levantar exceção."""
        from PIL import Image as PILImage
        excel_path = criar_excel_em_memoria(linhas=1, colunas=2)
        try:
            img = self.excel_para_imagem_pil(excel_path)
            assert isinstance(img, PILImage.Image)
        finally:
            os.unlink(excel_path)

    def test_excel_com_muitas_colunas_nao_crasha(self, tmp_path):
        """Excel com muitas colunas (mais que 20) ainda gera imagem."""
        from PIL import Image as PILImage
        excel_path = criar_excel_em_memoria(linhas=5, colunas=15)
        try:
            img = self.excel_para_imagem_pil(excel_path)
            assert isinstance(img, PILImage.Image)
        finally:
            os.unlink(excel_path)

    def test_buffer_fechado_antes_de_retornar_imagem(self, tmp_path):
        """A imagem PIL deve ser legível após fig.savefig — BytesIO ainda válido."""
        from PIL import Image as PILImage
        excel_path = criar_excel_em_memoria()
        try:
            img = self.excel_para_imagem_pil(excel_path)
            pixel = img.getpixel((0, 0))
            assert isinstance(pixel, tuple)
        finally:
            os.unlink(excel_path)


@pytest.mark.skipif(not TORCH_OK, reason="torch/torchvision não instalados")
class TestClassificarDocumentoExtensao:
    def setup_method(self):
        sys.path.insert(0, str(REDE_DIR.parent.parent))
        from automacoes.rede.classificador import classificar_documento
        self.classificar_documento = classificar_documento

    def test_modelo_ausente_retorna_erro(self, tmp_path):
        """Quando o arquivo .pth não existe, retorna dict com 'erro'."""
        f = tmp_path / "doc.pdf"
        f.write_bytes(b"%PDF-1.4")

        resultado = self.classificar_documento(
            str(f), model_path=str(tmp_path / "inexistente.pth")
        )

        assert "erro" in resultado
        assert "não existe" in resultado["erro"].lower() or "model" in resultado["erro"].lower()

    def test_extensao_nao_suportada_retorna_erro(self, tmp_path):
        """Extensões não suportadas (.txt) devem retornar erro de extensão."""
        f = tmp_path / "notas.txt"
        f.write_text("conteúdo qualquer", encoding="utf-8")
        # Cria .pth fake para ultrapassar a guarda de modelo-ausente
        modelo_path = tmp_path / "modelo.pth"
        modelo_path.write_bytes(b"fake")

        resultado = self.classificar_documento(
            str(f), model_path=str(modelo_path)
        )

        assert "erro" in resultado
        assert "extensão" in resultado["erro"].lower() or "suportad" in resultado["erro"].lower()

    @pytest.mark.skipif(not (PANDAS_OK and OPENPYXL_OK), reason="pandas/openpyxl necessários para o ramo Excel")
    def test_excel_sem_modelo_retorna_erro_de_modelo(self, tmp_path):
        """O ramo .xlsx é alcançado (sem erro de extensão) mas falha por modelo ausente."""
        excel_path = criar_excel_em_memoria()
        try:
            resultado = self.classificar_documento(
                excel_path, model_path=str(tmp_path / "inexistente.pth")
            )
        finally:
            os.unlink(excel_path)

        assert "erro" in resultado
        assert "extensão" not in resultado["erro"].lower()

    def test_imagem_png_sem_modelo_retorna_erro_de_modelo(self, tmp_path):
        """O ramo PNG é alcançado mas falha por modelo ausente."""
        f = tmp_path / "scan.png"
        import struct
        import zlib
        def mini_png():
            sig = b'\x89PNG\r\n\x1a\n'
            ihdr_data = struct.pack('>IIBBBBB', 1, 1, 8, 2, 0, 0, 0)
            ihdr_crc = zlib.crc32(b'IHDR' + ihdr_data)
            ihdr = struct.pack('>I', 13) + b'IHDR' + ihdr_data + struct.pack('>I', ihdr_crc)
            idat_raw = zlib.compress(b'\x00\xff\xff\xff')
            idat_crc = zlib.crc32(b'IDAT' + idat_raw)
            idat = struct.pack('>I', len(idat_raw)) + b'IDAT' + idat_raw + struct.pack('>I', idat_crc)
            iend_crc = zlib.crc32(b'IEND')
            iend = struct.pack('>I', 0) + b'IEND' + struct.pack('>I', iend_crc)
            return sig + ihdr + idat + iend
        f.write_bytes(mini_png())

        resultado = self.classificar_documento(
            str(f), model_path=str(tmp_path / "inexistente.pth")
        )

        assert "erro" in resultado
        assert "extensão" not in resultado["erro"].lower()

    def test_pdf_vazio_retorna_erro_especifico(self, tmp_path):
        """PDF de 0 páginas deve retornar erro de PDF vazio (não erro de modelo)."""
        f = tmp_path / "vazio.pdf"
        f.write_bytes(b"%PDF-1.4")
        modelo_path = tmp_path / "modelo.pth"
        modelo_path.write_bytes(b"fake")

        mock_doc = MagicMock()
        mock_doc.__len__ = lambda s: 0

        with patch("pypdfium2.PdfDocument", return_value=mock_doc):
            resultado = self.classificar_documento(
                str(f), model_path=str(modelo_path)
            )

        assert "erro" in resultado
        assert "vazio" in resultado["erro"].lower()


@pytest.mark.skipif(not TORCH_OK, reason="torch/torchvision não instalados")
class TestClassificarDocumentoInferencia:
    """Verifica a lógica pós-carregamento do modelo (threshold, confiança, label)."""

    def setup_method(self):
        sys.path.insert(0, str(REDE_DIR.parent.parent))

    def _mock_model(self, logits):
        import torch
        model = MagicMock()
        model.eval = MagicMock(return_value=None)
        model.to = MagicMock(return_value=model)
        model.return_value = torch.tensor([logits])
        return model

    def test_classificacao_com_alta_confianca(self, tmp_path):
        """Modelo mock retorna holerite com 99% de confiança."""
        from automacoes.rede.classificador import classificar_documento, CLASS_NAMES
        import torch

        f = tmp_path / "holerite.pdf"
        f.write_bytes(b"%PDF-1.4")
        modelo_path = tmp_path / "modelo.pth"
        modelo_path.write_bytes(b"fake")

        logits = [0.0, 0.0, 0.0, 10.0]

        mock_imagem = MagicMock()
        mock_imagem.convert.return_value = mock_imagem

        mock_pdf = MagicMock()
        mock_pdf.__len__ = lambda s: 1
        mock_pdf.__getitem__ = lambda s, i: MagicMock(
            render=lambda scale: MagicMock(to_pil=lambda: mock_imagem)
        )

        model = self._mock_model(logits)

        with (
            patch("pypdfium2.PdfDocument", return_value=mock_pdf),
            patch("torchvision.models.resnet18", return_value=model),
            patch("torch.load", return_value={}),
            patch.object(model, "load_state_dict"),
            patch("torchvision.transforms.Compose", return_value=lambda img: torch.zeros(1, 3, 224, 224)),
        ):
            resultado = classificar_documento(str(f), model_path=str(modelo_path))

        assert "erro" not in resultado
        assert resultado["classe"] == "holerite"
        assert resultado["confianca"] > 90

    def test_baixa_confianca_retorna_nao_classificado(self, tmp_path):
        """Quando a confiança fica abaixo do threshold, classe é 'nao_identificado'."""
        from automacoes.rede.classificador import classificar_documento
        import torch

        f = tmp_path / "duvidoso.pdf"
        f.write_bytes(b"%PDF-1.4")
        modelo_path = tmp_path / "modelo.pth"
        modelo_path.write_bytes(b"fake")

        logits = [1.0, 1.0, 1.0, 1.0]

        mock_imagem = MagicMock()
        mock_imagem.convert.return_value = mock_imagem

        mock_pdf = MagicMock()
        mock_pdf.__len__ = lambda s: 1
        mock_pdf.__getitem__ = lambda s, i: MagicMock(
            render=lambda scale: MagicMock(to_pil=lambda: mock_imagem)
        )

        model = self._mock_model(logits)

        with (
            patch("pypdfium2.PdfDocument", return_value=mock_pdf),
            patch("torchvision.models.resnet18", return_value=model),
            patch("torch.load", return_value={}),
            patch.object(model, "load_state_dict"),
            patch("torchvision.transforms.Compose", return_value=lambda img: torch.zeros(1, 3, 224, 224)),
        ):
            resultado = classificar_documento(str(f), model_path=str(modelo_path), threshold=0.75)

        assert "erro" not in resultado
        assert resultado["classe"] == "nao_identificado"
        assert resultado["confianca"] < 50
