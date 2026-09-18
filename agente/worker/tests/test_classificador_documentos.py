"""Testa o classificador ML de tipo de documento (PDF/DOCX/XLSX).

Escopo combinado com o time: a rede só processa arquivos editáveis
(PDF, DOCX, XLSX/XLS) — imagem (JPG/PNG) fica de fora por decisão de
produto, não por regressão. Os testes abaixo travam esse contrato e
garantem que o módulo é seguro de importar mesmo sem o artefato de
treino (modelo.pt / vetorizador.joblib / indice_para_rotulo.joblib)
distribuído — cenário padrão em CI/dev.
"""

from unittest.mock import MagicMock, patch

import pytest
import torch

from automacoes.classificador_documentos.classificador import classificar_documento


# ---------------------------------------------------------------------------
# Extensão fora de escopo (imagem) — decisão de produto, não regressão
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("nome", ["foto.jpg", "scan.png", "nota.jpeg", "notas.txt"])
def test_extensao_fora_de_escopo_retorna_erro_explicito(tmp_path, nome):
    f = tmp_path / nome
    f.write_bytes(b"conteudo qualquer")

    resultado = classificar_documento(str(f))

    assert "erro" in resultado
    assert "suportad" in resultado["erro"].lower()


# ---------------------------------------------------------------------------
# Extensões em escopo, mas sem artefato de treino distribuído
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("nome", ["doc.pdf", "doc.docx", "doc.xlsx", "doc.xls"])
def test_extensao_em_escopo_sem_artefato_retorna_erro_de_artefato(tmp_path, nome):
    """PDF/DOCX/XLSX passam pela checagem de extensão — o erro aqui é de
    artefato ausente, não de extensão não suportada (é a diferença que
    prova que o path Excel/PDF/DOCX está de volta)."""
    f = tmp_path / nome
    f.write_bytes(b"conteudo qualquer")
    inexistente = str(tmp_path / "nao_existe")

    resultado = classificar_documento(
        str(f),
        model_path=inexistente + ".pt",
        vetorizador_path=inexistente + "_vet.joblib",
        indice_path=inexistente + "_idx.joblib",
    )

    assert "erro" in resultado
    assert "suportad" not in resultado["erro"].lower()
    assert "não existe" in resultado["erro"].lower()


def test_import_nao_falha_sem_artefatos_no_disco():
    """Importar o módulo não pode explodir só porque o treino ainda não
    rodou — é exatamente o bug que derrubava toda a classificação em
    produção (identificar_tipo importava um módulo que não existia mais;
    aqui garantimos que o substituto não tem o mesmo tipo de fragilidade)."""
    import automacoes.classificador_documentos.classificador  # noqa: F401


# ---------------------------------------------------------------------------
# Caminho feliz (artefatos mockados) — formato do dict de retorno
# ---------------------------------------------------------------------------


def _mock_artefatos(logits, classes=("cartao_cnpj", "contrato_social", "extrato_bancario", "holerite")):
    indice_para_rotulo = dict(enumerate(classes))

    vetorizador = MagicMock()
    vetorizador.transform.return_value.toarray.return_value = [[0.0] * 3]

    modelo = MagicMock()
    modelo.return_value = torch.tensor([logits])

    return vetorizador, indice_para_rotulo, modelo


def test_classificacao_com_alta_confianca_retorna_classe(tmp_path):
    f = tmp_path / "holerite.pdf"
    f.write_bytes(b"%PDF-1.4")

    artefatos = _mock_artefatos(logits=[0.0, 0.0, 0.0, 10.0])

    with (
        patch(
            "automacoes.classificador_documentos.classificador._carregar_artefatos",
            return_value=artefatos,
        ),
        patch(
            "automacoes.classificador_documentos.classificador.extrair_texto",
            return_value="texto extraido do holerite",
        ),
    ):
        resultado = classificar_documento(str(f), threshold=0.75)

    assert "erro" not in resultado
    assert resultado["classe"] == "holerite"
    assert resultado["confianca"] > 90


def test_baixa_confianca_retorna_nao_identificado(tmp_path):
    f = tmp_path / "duvidoso.xlsx"
    f.write_bytes(b"conteudo qualquer")

    artefatos = _mock_artefatos(logits=[1.0, 1.0, 1.0, 1.0])

    with (
        patch(
            "automacoes.classificador_documentos.classificador._carregar_artefatos",
            return_value=artefatos,
        ),
        patch(
            "automacoes.classificador_documentos.classificador.extrair_texto",
            return_value="texto ambiguo",
        ),
    ):
        resultado = classificar_documento(str(f), threshold=0.75)

    assert "erro" not in resultado
    assert resultado["classe"] == "nao_identificado"
    assert resultado["confianca"] < 50


def test_falha_na_extracao_retorna_erro_sem_lancar_excecao(tmp_path):
    f = tmp_path / "corrompido.docx"
    f.write_bytes(b"nao e um docx valido")

    artefatos = _mock_artefatos(logits=[0.0, 0.0, 0.0, 1.0])

    with (
        patch(
            "automacoes.classificador_documentos.classificador._carregar_artefatos",
            return_value=artefatos,
        ),
        patch(
            "automacoes.classificador_documentos.classificador.extrair_texto",
            side_effect=Exception("arquivo corrompido"),
        ),
    ):
        resultado = classificar_documento(str(f))

    assert "erro" in resultado
    assert "corrompido" in resultado["erro"].lower()
