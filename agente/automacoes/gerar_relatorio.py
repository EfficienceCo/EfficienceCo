import csv
import os
from datetime import datetime
from pathlib import Path
import comunicacao.api_client as client
from comunicacao.reportar_evento import reportar_evento

def gerar_relatorio():
    hoje = datetime.now().strftime("%Y-%m-%d")
    pasta = os.getenv("PASTA_RELATORIO", str(Path.home() / "relatorios_efficience"))
    os.makedirs(pasta, exist_ok=True)

    nome_arquivo = f"relatorio_{hoje}.csv"
    caminho = os.path.join(pasta, nome_arquivo)

    try:
        response = client.get(
            f"/eventos/agente",
            addToHeaders={"x-licenca-token": client.LICENSE_TOKEN}
        )
        eventos = response.json()
    except RuntimeError as e:
        print(f"[relatorio] Falha ao buscar eventos: {e}")
        return

    eventos_hoje = [
        e for e in eventos
        if e.get("data_vinculo", "").startswith(hoje)
    ]

    with open(caminho, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["data_vinculo", "descricao", "sucesso"])
        writer.writeheader()
        writer.writerows(eventos_hoje)

    print(f"[relatorio] Relatório gerado: {nome_arquivo} ({len(eventos_hoje)} evento(s))")
    reportar_evento(f"Relatório diário gerado: {nome_arquivo}", True)
