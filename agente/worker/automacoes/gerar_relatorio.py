import csv
import os
from datetime import datetime
from pathlib import Path
import comunicacao.api_client as client
from comunicacao.reportar_evento import reportar_evento

def gerar_relatorio():
    hoje = datetime.now().strftime("%Y-%m-%d")
    pasta = os.getenv("PASTA_RELATORIO", str(Path.home() / "relatorios_efficience"))
    
    try:
        os.makedirs(pasta, exist_ok=True)
    except PermissionError:
        print(f"[relatorio] Sem permissão para criar pasta: {pasta}")
        return
    except Exception as e:
        print(f"[relatorio] Erro ao criar pasta {pasta}: {e}")
        return

    nome_arquivo = f"relatorio_{hoje}.csv"
    caminho = os.path.join(pasta, nome_arquivo)

    # /eventos/agente pagina com limit/offset (máximo 100 por página) e nunca
    # devolve tudo de uma vez — busca ?data=hoje (filtro no servidor, evita
    # trazer eventos de outros dias) e itera até esgotar o total, senão dias
    # com mais de 20 eventos (limit default) saem incompletos no CSV sem aviso.
    eventos = []
    offset = 0
    limite_pagina = 100
    try:
        while True:
            response = client.get(
                f"/eventos/agente?data={hoje}&limit={limite_pagina}&offset={offset}",
                timeout=5,
                addToHeaders={"x-licenca-token": client.LICENSE_TOKEN}
            )
            corpo = response.json()
            pagina = corpo.get("data", [])
            eventos.extend(pagina)

            total = corpo.get("total", len(eventos))
            offset += limite_pagina
            if not pagina or offset >= total:
                break
    except RuntimeError as e:
        print(f"[relatorio] Falha ao buscar eventos: {e}")
        return

    try:
        with open(caminho, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(
                f, fieldnames=["criado_em", "descricao", "sucesso"], extrasaction="ignore"
            )
            writer.writeheader()
            writer.writerows(eventos)
        print(f"[relatorio] Relatório gerado: {nome_arquivo} ({len(eventos)} evento(s))")
    except PermissionError:
        print(f"[relatorio] Sem permissão para escrever: {caminho}")
        return
    except Exception as e:
        print(f"[relatorio] Erro ao escrever arquivo: {e}")
        return

    try:
        reportar_evento(f"Relatório diário gerado: {nome_arquivo}", True)
    except Exception as e:
        print(f"[relatorio] Falha ao reportar evento: {e}")
        