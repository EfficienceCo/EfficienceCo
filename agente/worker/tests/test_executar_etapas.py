"""Testes do consumer do canal de etapas (#262 / #266)."""

from unittest.mock import patch

from automacoes.executar_etapas import processar_etapa, processar_etapas_pendentes
from core.estrutura_pastas import SUBPASTAS


TOKEN = "11111111-1111-4111-8111-111111111111"
ETAPA_ID = "22222222-2222-4222-8222-222222222222"


def _etapa_contrato(pasta_base, **overrides):
    etapa = {
        "id": ETAPA_ID,
        "processo_id": "proc-1",
        "acao": "gerar_contrato_social",
        "payload": {
            "socios": [{"nome": "Fulano", "cpf": "111", "participacao": 100}],
            "capital_social": 1000,
            "objeto_social": "Comercio",
            "endereco": "Rua 1",
        },
        "execucao_token": TOKEN,
        "nome_empresa": "Padaria do Joao",
        "pasta_base": str(pasta_base),
    }
    etapa.update(overrides)
    return etapa


def test_polling_dispatch_sucesso(tmp_path):
    etapa = _etapa_contrato(tmp_path)
    with (
        patch("automacoes.executar_etapas.listar_etapas_prontas", return_value=[etapa]),
        patch("automacoes.executar_etapas.concluir_execucao") as mock_concluir,
    ):
        resultados = processar_etapas_pendentes()

    assert len(resultados) == 1
    assert resultados[0]["sucesso"] is True
    mock_concluir.assert_called_once()
    kwargs = mock_concluir.call_args.kwargs
    assert kwargs["sucesso"] is True
    assert kwargs["execucao_token"] == TOKEN
    assert kwargs["arquivo_gerado"]
    assert "Contratos" in kwargs["arquivo_gerado"]
    assert mock_concluir.call_args.args[0] == ETAPA_ID


def test_falha_template_reportada(tmp_path, monkeypatch):
    monkeypatch.setenv("TEMPLATE_CONTRATO_SOCIAL", str(tmp_path / "missing.docx"))
    etapa = _etapa_contrato(tmp_path)

    with patch("automacoes.executar_etapas.concluir_execucao") as mock_concluir:
        resultado = processar_etapa(etapa)

    assert resultado["sucesso"] is False
    mock_concluir.assert_called_once()
    kwargs = mock_concluir.call_args.kwargs
    assert kwargs["sucesso"] is False
    assert isinstance(kwargs["erro"], str) and kwargs["erro"]
    assert kwargs["execucao_token"] == TOKEN


def test_criar_pastas_no_loop(tmp_path):
    etapa = {
        "id": ETAPA_ID,
        "processo_id": "proc-1",
        "acao": "criar_pastas",
        "payload": {},
        "execucao_token": TOKEN,
        "nome_empresa": "Empresa Pastas",
        "pasta_base": str(tmp_path),
    }

    with patch("automacoes.executar_etapas.concluir_execucao") as mock_concluir:
        resultado = processar_etapa(etapa)

    assert resultado["sucesso"] is True
    pasta_empresa = tmp_path / "Empresa Pastas"
    for sub in SUBPASTAS:
        assert (pasta_empresa / sub).is_dir()
    kwargs = mock_concluir.call_args.kwargs
    assert kwargs["sucesso"] is True
    assert kwargs["execucao_token"] == TOKEN


def test_criar_pastas_pasta_base_relativa_ainda_falha(tmp_path, monkeypatch):
    """pasta_base relativa e explícita (bug #311, ex.: nome sanitizado da empresa)
    continua sendo rejeitada — só cai pra raiz local quando pasta_base está ausente."""
    monkeypatch.setenv("PASTA_BASE", str(tmp_path))
    etapa = {
        "id": ETAPA_ID,
        "processo_id": "proc-1",
        "acao": "criar_pastas",
        "payload": {},
        "execucao_token": TOKEN,
        "nome_empresa": "Empresa Pastas",
        "pasta_base": "Empresa Pastas",  # valor não-absoluto vindo do backend (bug #311)
    }

    with patch("automacoes.executar_etapas.concluir_execucao") as mock_concluir:
        resultado = processar_etapa(etapa)

    assert resultado["sucesso"] is False
    assert mock_concluir.call_args.kwargs["sucesso"] is False


def test_criar_pastas_pasta_base_ausente_usa_raiz_local(tmp_path, monkeypatch):
    monkeypatch.setenv("PASTA_BASE", str(tmp_path))
    etapa = {
        "id": ETAPA_ID,
        "processo_id": "proc-1",
        "acao": "criar_pastas",
        "payload": {},
        "execucao_token": TOKEN,
        "nome_empresa": "Empresa Pastas",
        "pasta_base": None,
    }

    with patch("automacoes.executar_etapas.concluir_execucao") as mock_concluir:
        resultado = processar_etapa(etapa)

    assert resultado["sucesso"] is True
    pasta_empresa = tmp_path / "Empresa Pastas"
    for sub in SUBPASTAS:
        assert (pasta_empresa / sub).is_dir()
    assert mock_concluir.call_args.kwargs["sucesso"] is True


def test_acao_desconhecida_reporta_erro(tmp_path):
    etapa = _etapa_contrato(tmp_path, acao="acao_inventada")
    with patch("automacoes.executar_etapas.concluir_execucao") as mock_concluir:
        resultado = processar_etapa(etapa)

    assert resultado["sucesso"] is False
    assert "desconhecida" in resultado["erro"]
    assert mock_concluir.call_args.kwargs["sucesso"] is False


def test_falha_rede_no_report_nao_derruba(tmp_path):
    etapa = _etapa_contrato(tmp_path)
    with patch(
        "automacoes.executar_etapas.concluir_execucao",
        side_effect=RuntimeError("Falha de conexao"),
    ):
        # nao deve propagar
        resultado = processar_etapa(etapa)

    assert resultado["sucesso"] is True


def test_falha_polling_nao_derruba():
    with patch(
        "automacoes.executar_etapas.listar_etapas_prontas",
        side_effect=RuntimeError("timeout"),
    ):
        assert processar_etapas_pendentes() == []
