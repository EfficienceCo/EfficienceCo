"""Testes de gerar_relatorio — paginação de /eventos/agente (#316, achado
do Victor no review do PR: sem paginar, dias com mais de 20 eventos
(limit default do endpoint) saíam incompletos no CSV sem nenhum aviso)."""

import csv
from unittest.mock import MagicMock, patch

from automacoes.gerar_relatorio import gerar_relatorio


def _response(data, total):
    response = MagicMock()
    response.json.return_value = {"data": data, "total": total}
    return response


def _evento(indice):
    return {"criado_em": "2026-08-23T10:00:00", "descricao": f"evento-{indice}", "sucesso": True}


def test_pagina_ate_esgotar_o_total(tmp_path, monkeypatch):
    monkeypatch.setenv("PASTA_RELATORIO", str(tmp_path))

    pagina1 = [_evento(i) for i in range(100)]
    pagina2 = [_evento(i) for i in range(100, 125)]

    with patch("automacoes.gerar_relatorio.client") as mock_client, \
         patch("automacoes.gerar_relatorio.reportar_evento"):
        mock_client.LICENSE_TOKEN = "tok"
        mock_client.get.side_effect = [_response(pagina1, 125), _response(pagina2, 125)]
        gerar_relatorio()

    assert mock_client.get.call_count == 2
    assert "offset=0" in mock_client.get.call_args_list[0].args[0]
    assert "offset=100" in mock_client.get.call_args_list[1].args[0]

    arquivos = list(tmp_path.glob("relatorio_*.csv"))
    assert len(arquivos) == 1
    with open(arquivos[0], newline="", encoding="utf-8") as f:
        linhas = list(csv.DictReader(f))
    assert len(linhas) == 125


def test_filtra_por_data_no_servidor_em_vez_de_no_cliente(tmp_path, monkeypatch):
    monkeypatch.setenv("PASTA_RELATORIO", str(tmp_path))

    with patch("automacoes.gerar_relatorio.client") as mock_client, \
         patch("automacoes.gerar_relatorio.reportar_evento"):
        mock_client.LICENSE_TOKEN = "tok"
        mock_client.get.return_value = _response([], 0)
        gerar_relatorio()

    endpoint_chamado = mock_client.get.call_args.args[0]
    assert endpoint_chamado.startswith("/eventos/agente?data=")


def test_para_quando_pagina_vem_vazia_mesmo_sem_bater_o_total(tmp_path, monkeypatch):
    monkeypatch.setenv("PASTA_RELATORIO", str(tmp_path))

    with patch("automacoes.gerar_relatorio.client") as mock_client, \
         patch("automacoes.gerar_relatorio.reportar_evento"):
        mock_client.LICENSE_TOKEN = "tok"
        # total inconsistente (maior que o que o servidor de fato devolve) não
        # pode travar o agente num loop infinito.
        mock_client.get.return_value = _response([], 999)
        gerar_relatorio()

    assert mock_client.get.call_count == 1
