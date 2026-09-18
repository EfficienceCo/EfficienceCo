from pathlib import Path
from extrator import extrair_texto  # ajuste pro nome real da sua função no extrator.py

EXTENSOES_SUPORTADAS = {".pdf", ".docx", ".xlsx", ".xls"}

def carregar_dataset(pasta_raiz: str) -> list[tuple[str, str]]:
    pasta_raiz = Path(pasta_raiz)
    dataset = []

    for pasta_categoria in sorted(pasta_raiz.iterdir()):
        if not pasta_categoria.is_dir():
            continue  # ignora arquivos soltos na raiz, só entra em pastas

        categoria = pasta_categoria.name  # nome da pasta = rótulo

        for arquivo in sorted(pasta_categoria.iterdir()):
            if arquivo.suffix.lower() not in EXTENSOES_SUPORTADAS:
                continue  # ignora .DS_Store, Thumbs.db, etc.

            try:
                texto = extrair_texto(str(arquivo))
            except Exception as erro:
                print(f"Erro ao processar {arquivo}: {erro}")
                continue

            if len(texto.strip()) < 10:
                print(f"Aviso: pouco texto extraído de {arquivo} (PDF escaneado?)")
                continue

            dataset.append((texto, categoria))

    return dataset