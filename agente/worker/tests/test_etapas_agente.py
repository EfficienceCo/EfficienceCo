"""Testes do cliente HTTP de etapas (#266)."""

from unittest.mock import MagicMock, patch

from comunicacao.etapas_agente import concluir_execucao, listar_etapas_prontas


def test_listar_etapas_prontas_devolve_data():
    response = MagicMock()
    response.content = b'{"data":[{"id":"1"}]}'
    response.json.return_value = {"data": [{"id": "1"}]}

    with patch("comunicacao.etapas_agente.client") as mock_client:
        mock_client.LICENSE_TOKEN = "tok"
        mock_client.get.return_value = response
        etapas = listar_etapas_prontas()

    assert etapas == [{"id": "1"}]
    mock_client.get.assert_called_once()
    assert mock_client.get.call_args.args[0] == "/processos/etapas/agente"


def test_concluir_execucao_sucesso():
    response = MagicMock()
    response.content = b"{}"
    response.json.return_value = {"status": "concluida"}

    with patch("comunicacao.etapas_agente.client") as mock_client:
        mock_client.LICENSE_TOKEN = "tok"
        mock_client.post.return_value = response
        concluir_execucao(
            "etapa-1",
            sucesso=True,
            execucao_token="11111111-1111-4111-8111-111111111111",
            arquivo_gerado="C:/x/contrato.docx",
        )

    payload = mock_client.post.call_args.args[1]
    assert payload["sucesso"] is True
    assert payload["arquivo_gerado"] == "C:/x/contrato.docx"
    assert "erro" not in payload


def test_concluir_execucao_erro():
    response = MagicMock()
    response.content = b"{}"
    response.json.return_value = {}

    with patch("comunicacao.etapas_agente.client") as mock_client:
        mock_client.LICENSE_TOKEN = "tok"
        mock_client.post.return_value = response
        concluir_execucao(
            "etapa-1",
            sucesso=False,
            execucao_token="11111111-1111-4111-8111-111111111111",
            erro="template ausente",
        )

    payload = mock_client.post.call_args.args[1]
    assert payload["sucesso"] is False
    assert payload["erro"] == "template ausente"
    assert "arquivo_gerado" not in payload
