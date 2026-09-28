"""Classificador ML de documentos (TF-IDF + MLP) — artefatos e inferência.

A inferência completa vive na branch do stack novo (#525 / issues #511–#513).
Este pacote, na correção do #509, garante onde os pesos moram e como chegam
em cada máquina (pacote do launcher ou instalação manual de QA).
"""

from automacoes.classificador_documentos.artefatos import (
    ARQUIVOS_OBRIGATORIOS,
    destino_artefatos,
    instalar_artefatos,
    status_artefatos,
    verificar_artefatos,
)

__all__ = [
    "ARQUIVOS_OBRIGATORIOS",
    "destino_artefatos",
    "instalar_artefatos",
    "status_artefatos",
    "verificar_artefatos",
]
