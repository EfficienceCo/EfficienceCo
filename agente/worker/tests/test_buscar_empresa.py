"""Testes do helper de lookup CNPJ."""

from unittest.mock import MagicMock, patch

import comunicacao.api_client as client
from comunicacao.buscar_empresa import buscar_empresa_por_cnpj


def test_buscar_empresa_por_cnpj_sucesso():
    response = MagicMock()
    response.json.return_value = {"nome": "Padaria do João"}

    with patch("comunicacao.buscar_empresa.client") as mock_client:
        mock_client.LICENSE_TOKEN = "tok"
        mock_client.get.return_value = response
        mock_client.ApiError = client.ApiError
        assert buscar_empresa_por_cnpj("12.345.678/0001-90") == "Padaria do João"
        assert "12345678000190" in mock_client.get.call_args.args[0]


def test_buscar_empresa_por_cnpj_404():
    with patch("comunicacao.buscar_empresa.client") as mock_client:
        mock_client.LICENSE_TOKEN = "tok"
        mock_client.ApiError = client.ApiError
        mock_client.get.side_effect = client.ApiError(404, "não encontrado", {"erro": "não encontrado"})
        assert buscar_empresa_por_cnpj("12345678000190") is None


def test_buscar_empresa_por_cnpj_invalido():
    assert buscar_empresa_por_cnpj("123") is None
