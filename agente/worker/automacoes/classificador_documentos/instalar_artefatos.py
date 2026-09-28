"""CLI: instala artefatos do classificador no destino canônico (uso QA / sem launcher).

Exemplos:
  python -m automacoes.classificador_documentos.instalar_artefatos --fonte ./release-artefatos
  python -m automacoes.classificador_documentos.instalar_artefatos --fonte ./out --destino ./modelos/classificador_documentos
  python -m automacoes.classificador_documentos.instalar_artefatos --status
"""

from __future__ import annotations

import argparse
import json
import sys

from automacoes.classificador_documentos.artefatos import (
    instalar_artefatos,
    status_artefatos,
)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Instala ou inspeciona artefatos do classificador de documentos (TF-IDF)."
    )
    parser.add_argument(
        "--fonte",
        help="Pasta com modelo.pt, vetorizador.joblib e indice_para_rotulo.joblib",
    )
    parser.add_argument(
        "--destino",
        help="Destino (default: CLASSIFICADOR_ARTEFATOS_DIR, pacote do launcher, ou este módulo)",
    )
    parser.add_argument(
        "--status",
        action="store_true",
        help="Só imprime o inventário dos artefatos no destino",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Valida a fonte sem copiar",
    )
    parser.add_argument(
        "--sem-hash",
        action="store_true",
        help="Não calcula/confere SHA-256",
    )
    args = parser.parse_args(argv)
    conferir_hash = not args.sem_hash

    if args.status or not args.fonte:
        st = status_artefatos(args.destino, conferir_hash=conferir_hash)
        print(json.dumps(st, ensure_ascii=False, indent=2))
        return 0 if st["completo"] else 2

    try:
        resultado = instalar_artefatos(
            args.fonte,
            args.destino,
            conferir_hash=conferir_hash,
            dry_run=args.dry_run,
        )
    except (FileNotFoundError, RuntimeError) as e:
        print(f"erro: {e}", file=sys.stderr)
        return 1

    print(json.dumps(resultado, ensure_ascii=False, indent=2))
    return 0 if resultado["status"]["completo"] or args.dry_run else 2


if __name__ == "__main__":
    raise SystemExit(main())
