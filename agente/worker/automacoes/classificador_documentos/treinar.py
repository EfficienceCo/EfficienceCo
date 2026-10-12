"""Treino único do classificador de documentos (TF-IDF + MLP) — #649.

Treina-se uma vez, fora do cliente, com documentos reais/anonimizados
(decisão 2026-09-29). Saída: os 3 artefatos + relatorio_treino.json com a
acurácia por tipo. Com --publicar, preenche os SHA-256 no manifest.json
versionado e marca publicado=true.

Uso (a partir de agente/worker, em ambiente com scikit-learn + joblib):

  py -3 -m automacoes.classificador_documentos.treinar --dataset C:\\dataset --saida C:\\artefatos
  py -3 -m automacoes.classificador_documentos.treinar --dataset C:\\dataset --saida C:\\artefatos --publicar 1.0.0

Layout do dataset: uma subpasta por classe (nome da pasta = rótulo), com
PDF/DOCX/XLSX dentro. Ver dataset.py.
"""

from __future__ import annotations

import argparse
import json
import random
import shutil
import sys
from collections import Counter
from pathlib import Path

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset

from automacoes.classificador_documentos import artefatos as art
from automacoes.classificador_documentos.classificador import (
    TAMANHO_OCULTO,
    ClassificadorDocumentos,
    normalizar_numeros,
)

STOPWORDS_PT = [
    "de", "da", "do", "das", "dos", "em", "e", "a", "o", "as", "os",
    "para", "com", "por", "que", "um", "uma", "ao", "no", "na",
]

MINIMO_POR_CLASSE_PADRAO = 10
LIMIAR_PADRAO = 0.75  # mesmo default de classificar_documento
RELATORIO_NOME = "relatorio_treino.json"


def validar_dataset(rotulos: list[str], minimo_por_classe: int) -> Counter:
    """Garante >= 2 classes e o mínimo de documentos em cada uma."""
    contagem = Counter(rotulos)
    if len(contagem) < 2:
        raise ValueError(
            f"Dataset precisa de pelo menos 2 classes; encontrado: {sorted(contagem) or 'nenhuma'}."
        )
    abaixo = {c: n for c, n in sorted(contagem.items()) if n < minimo_por_classe}
    if abaixo:
        detalhe = ", ".join(f"{c}={n}" for c, n in abaixo.items())
        raise ValueError(
            f"Classes abaixo do mínimo de {minimo_por_classe} documentos: {detalhe}."
        )
    return contagem


def _novo_vetorizador():
    from sklearn.feature_extraction.text import TfidfVectorizer

    return TfidfVectorizer(
        token_pattern=r"(?u)\b[a-zA-ZÀ-ÿ]{2,}\b",  # só letras (com acentos), ignora números
        stop_words=STOPWORDS_PT,
    )


def _avaliar(modelo, X, y, indice_para_rotulo, limiar) -> dict:
    """Acurácia geral e por classe, por argmax e com o limiar de produção.

    Em produção, confiança < limiar vira `nao_identificado` — então o número
    que importa pro re-QA-J é `acuracia_com_limiar`.
    """
    modelo.eval()
    with torch.no_grad():
        probs = torch.softmax(modelo(X), dim=1)
        confianca, pred = torch.max(probs, dim=1)

    por_classe = {}
    for indice, rotulo in sorted(indice_para_rotulo.items()):
        mascara = y == indice
        total = int(mascara.sum().item())
        acertos = int((pred[mascara] == indice).sum().item())
        acertos_limiar = int(
            ((pred[mascara] == indice) & (confianca[mascara] >= limiar)).sum().item()
        )
        por_classe[rotulo] = {
            "total": total,
            "acertos": acertos,
            "acuracia": round(acertos / total, 4) if total else None,
            "acertos_com_limiar": acertos_limiar,
            "acuracia_com_limiar": round(acertos_limiar / total, 4) if total else None,
        }

    total = int(y.numel())
    acertos = int((pred == y).sum().item())
    acertos_limiar = int(((pred == y) & (confianca >= limiar)).sum().item())
    return {
        "limiar": limiar,
        "total": total,
        "acuracia": round(acertos / total, 4) if total else None,
        "acuracia_com_limiar": round(acertos_limiar / total, 4) if total else None,
        "por_classe": por_classe,
    }


def treinar(
    textos: list[str],
    rotulos: list[str],
    *,
    epocas: int = 30,
    test_size: float = 0.2,
    seed: int = 42,
    limiar: float = LIMIAR_PADRAO,
):
    """Treina e avalia. Devolve (vetorizador, rotulo_para_indice, modelo, metricas).

    O TF-IDF é fitado só no split de treino, pra que a acurácia de teste não
    vaze vocabulário do teste. O artefato publicado é exatamente o avaliado.
    """
    from sklearn.model_selection import train_test_split

    random.seed(seed)
    torch.manual_seed(seed)

    categorias = sorted(set(rotulos))
    rotulo_para_indice = {categoria: i for i, categoria in enumerate(categorias)}
    indice_para_rotulo = {i: c for c, i in rotulo_para_indice.items()}
    y = [rotulo_para_indice[r] for r in rotulos]
    normalizados = [normalizar_numeros(t) for t in textos]

    txt_treino, txt_teste, y_treino, y_teste = train_test_split(
        normalizados, y, test_size=test_size, stratify=y, random_state=seed
    )

    vetorizador = _novo_vetorizador()
    X_treino = torch.tensor(vetorizador.fit_transform(txt_treino).toarray(), dtype=torch.float32)
    X_teste = torch.tensor(vetorizador.transform(txt_teste).toarray(), dtype=torch.float32)
    y_treino_t = torch.tensor(y_treino, dtype=torch.long)
    y_teste_t = torch.tensor(y_teste, dtype=torch.long)

    modelo = ClassificadorDocumentos(
        tamanho_entrada=X_treino.shape[1],
        tamanho_oculto=TAMANHO_OCULTO,
        numero_classes=len(categorias),
    )
    gerador = torch.Generator().manual_seed(seed)
    loader = DataLoader(
        TensorDataset(X_treino, y_treino_t), batch_size=4, shuffle=True, generator=gerador
    )
    funcao_perda = nn.CrossEntropyLoss()
    otimizador = optim.Adam(modelo.parameters(), lr=0.001)

    for epoca in range(epocas):
        modelo.train()
        perda_total = 0.0
        for batch_X, batch_y in loader:
            otimizador.zero_grad()
            perda = funcao_perda(modelo(batch_X), batch_y)
            perda.backward()
            otimizador.step()
            perda_total += perda.item()
        print(f"Época {epoca + 1}/{epocas} — perda: {perda_total:.4f}")

    metricas = {
        "treino": _avaliar(modelo, X_treino, y_treino_t, indice_para_rotulo, limiar),
        "teste": _avaliar(modelo, X_teste, y_teste_t, indice_para_rotulo, limiar),
        "vocabulario": int(X_treino.shape[1]),
        "epocas": epocas,
        "test_size": test_size,
        "seed": seed,
    }
    return vetorizador, rotulo_para_indice, modelo, metricas


def salvar_artefatos(saida: Path, vetorizador, rotulo_para_indice, modelo) -> None:
    import joblib

    saida.mkdir(parents=True, exist_ok=True)
    torch.save(modelo.state_dict(), saida / "modelo.pt")
    joblib.dump(vetorizador, saida / "vetorizador.joblib")
    # Nome histórico: o arquivo guarda rótulo → índice; classificador.py inverte.
    joblib.dump(rotulo_para_indice, saida / "indice_para_rotulo.joblib")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Treina o classificador TF-IDF uma vez e gera os 3 artefatos + relatório."
    )
    parser.add_argument("--dataset", required=True, help="Pasta com uma subpasta por classe")
    parser.add_argument("--saida", required=True, help="Pasta onde gravar os artefatos")
    parser.add_argument("--minimo-por-classe", type=int, default=MINIMO_POR_CLASSE_PADRAO)
    parser.add_argument("--epocas", type=int, default=30)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--limiar", type=float, default=LIMIAR_PADRAO)
    parser.add_argument(
        "--publicar",
        metavar="VERSAO",
        help="Atualiza o manifest.json versionado (sha256, publicado=true) com esta versão",
    )
    args = parser.parse_args(argv)

    from automacoes.classificador_documentos.dataset import carregar_dataset

    if not Path(args.dataset).is_dir():
        print(f"erro: pasta do dataset não existe: {args.dataset}", file=sys.stderr)
        return 1
    dataset = carregar_dataset(args.dataset)
    textos = [t for t, _ in dataset]
    rotulos = [r for _, r in dataset]
    try:
        contagem = validar_dataset(rotulos, args.minimo_por_classe)
    except ValueError as e:
        print(f"erro: {e}", file=sys.stderr)
        return 1

    vetorizador, rotulo_para_indice, modelo, metricas = treinar(
        textos, rotulos, epocas=args.epocas, seed=args.seed, limiar=args.limiar
    )

    saida = Path(args.saida).expanduser().resolve()
    salvar_artefatos(saida, vetorizador, rotulo_para_indice, modelo)

    relatorio = {
        "documentos_por_classe": dict(sorted(contagem.items())),
        "metricas": metricas,
    }
    (saida / RELATORIO_NOME).write_text(
        json.dumps(relatorio, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    teste = metricas["teste"]
    print(f"Acurácia no teste: {teste['acuracia']:.2%} "
          f"(com limiar {teste['limiar']}: {teste['acuracia_com_limiar']:.2%})")
    for rotulo, m in teste["por_classe"].items():
        print(f"  {rotulo}: {m['acertos']}/{m['total']} "
              f"(com limiar: {m['acertos_com_limiar']}/{m['total']})")

    if args.publicar:
        manifest = art.publicar_manifest(saida, args.publicar, relatorio=relatorio)
        # Cópia junto dos artefatos: instalar_artefatos --fonte confere hashes por ela.
        shutil.copy2(art.MANIFEST_PATH, saida / "manifest.json")
        print(f"manifest.json publicado: versão {manifest['modelo_version']}")

    print(f"Artefatos em: {saida}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
