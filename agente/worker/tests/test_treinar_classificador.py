"""Testa o treino/publicação do classificador TF-IDF (#649).

Os documentos aqui são sintéticos e só exercitam o pipeline (dataset →
treino → artefatos → manifest → inferência). O artefato de verdade é
treinado com documentos reais (decisão 2026-09-29), nunca com estes.
"""

import json
import shutil
from unittest.mock import patch

import pytest

pytest.importorskip("sklearn")
pytest.importorskip("joblib")
docx = pytest.importorskip("docx")

from automacoes.classificador_documentos import artefatos as art  # noqa: E402
from automacoes.classificador_documentos import treinar as tr  # noqa: E402
from automacoes.classificador_documentos.classificador import (  # noqa: E402
    classificar_documento,
)

TEXTOS = {
    "holerite": "recibo de pagamento de salario holerite proventos descontos inss fgts liquido",
    "contrato_social": "contrato social sociedade limitada socios capital clausula quotas administracao",
    "extrato_bancario": "extrato bancario conta corrente saldo anterior credito debito agencia",
}


def _dataset(raiz, por_classe=10):
    for classe, base in TEXTOS.items():
        pasta = raiz / classe
        pasta.mkdir(parents=True)
        for i in range(por_classe):
            d = docx.Document()
            d.add_paragraph(f"{base} documento {i} referencia {i * 7}")
            d.save(pasta / f"{classe}_{i}.docx")
    return raiz


def test_validar_dataset_exige_minimo_por_classe():
    with pytest.raises(ValueError, match=r"holerite=3"):
        tr.validar_dataset(["holerite"] * 3 + ["contrato_social"] * 10, 10)


def test_validar_dataset_exige_duas_classes():
    with pytest.raises(ValueError, match="2 classes"):
        tr.validar_dataset(["holerite"] * 20, 10)


def test_main_recusa_dataset_pequeno_sem_gravar_nada(tmp_path):
    dataset = _dataset(tmp_path / "dataset", por_classe=3)
    saida = tmp_path / "saida"
    assert tr.main(["--dataset", str(dataset), "--saida", str(saida), "--epocas", "1"]) == 1
    assert not saida.exists()


def test_treino_ponta_a_ponta_publica_e_classifica(tmp_path, monkeypatch):
    manifest = tmp_path / "manifest.json"
    shutil.copy2(art.MANIFEST_PATH, manifest)
    monkeypatch.setattr(art, "MANIFEST_PATH", manifest)

    dataset = _dataset(tmp_path / "dataset")
    saida = tmp_path / "saida"
    codigo = tr.main([
        "--dataset", str(dataset),
        "--saida", str(saida),
        "--epocas", "40",
        "--publicar", "1.0.0-teste",
    ])
    assert codigo == 0

    # Relatório com acurácia por tipo.
    relatorio = json.loads((saida / tr.RELATORIO_NOME).read_text(encoding="utf-8"))
    assert relatorio["documentos_por_classe"] == {c: 10 for c in TEXTOS}
    teste = relatorio["metricas"]["teste"]
    assert set(teste["por_classe"]) == set(TEXTOS)
    assert teste["total"] == 6  # 20% de 30, estratificado
    assert teste["acuracia"] == 1.0

    # Manifest publicado bate com os artefatos gerados; cópia vai junto.
    man = art.carregar_manifest(manifest)
    assert man["publicado"] is True
    assert man["modelo_version"] == "1.0.0-teste"
    assert art.verificar_artefatos(saida, manifest=man)["completo"] is True
    assert art.carregar_manifest(saida / "manifest.json") == man

    # Inferência lê os artefatos pelo destino canônico (env), sem paths explícitos.
    monkeypatch.setenv(art.ENV_ARTEFATOS_DIR, str(saida))
    alvo = dataset / "contrato_social" / "contrato_social_0.docx"
    with patch(
        "automacoes.classificador_documentos.classificador.extrair_texto",
        return_value=TEXTOS["contrato_social"],
    ):
        resultado = classificar_documento(str(alvo), threshold=0.0)
    assert resultado.get("classe") == "contrato_social", resultado


def test_treino_e_reprodutivel_com_mesma_seed(tmp_path):
    textos = [t for t in TEXTOS.values() for _ in range(10)]
    rotulos = [c for c in TEXTOS for _ in range(10)]
    a = tr.treinar(textos, rotulos, epocas=3, seed=7)[3]
    b = tr.treinar(textos, rotulos, epocas=3, seed=7)[3]
    assert a == b
