"""Testes de cache/sync de regras e ciclo de vida do watchdog (#482)."""

import json
import os
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

import core.configuracao as configuracao
from core.configuracao import (
    INTERVALO_SYNC_FORCADO_SEGUNDOS,
    gerenciar_configuracoes,
    verificar_atualizacao,
)
from automacoes.monitorar_pasta import (
    MonitorController,
    _processar_arquivo,
    _varredura_inicial,
)
from core.estrutura_pastas import PASTA_NAO_CLASSIFICADO


@pytest.fixture
def cache_dir(tmp_path, monkeypatch):
    caminho = tmp_path / "regras.json"
    monkeypatch.setattr(configuracao, "CACHE_PATH", caminho)
    monkeypatch.setattr(configuracao, "_ultimo_sync_forcado_em", 0.0)
    return caminho


def _gravar_cache(caminho, regras, versao=1):
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text(
        json.dumps(
            {
                "timestamp": "2099-01-01T00:00:00",
                "versao": versao,
                "regras": regras,
            }
        ),
        encoding="utf-8",
    )


def test_gerenciar_usa_cache_sem_consultar_ttl(cache_dir):
    regras = [{"id": "1", "ativa": True, "pasta_origem": "C:/entrada", "acao": "mover"}]
    _gravar_cache(cache_dir, regras, versao=2)

    with patch.object(configuracao, "_buscar_configuracoes") as mock_fetch:
        result = gerenciar_configuracoes()

    mock_fetch.assert_not_called()
    assert result[0]["id"] == "1"


def test_verificar_atualizacao_baixa_quando_versao_muda(cache_dir):
    antigas = [{"id": "1", "ativa": True}]
    novas = [{"id": "2", "ativa": True, "acao": "organizar_arquivo"}]
    _gravar_cache(cache_dir, antigas, versao=1)

    with (
        patch.object(configuracao, "_buscar_versao", return_value=5),
        patch.object(configuracao, "_buscar_configuracoes", return_value=novas),
    ):
        result = verificar_atualizacao()

    assert result == novas
    cache = json.loads(cache_dir.read_text(encoding="utf-8"))
    assert cache["versao"] == 5
    assert cache["regras"] == novas


def test_verificar_atualizacao_noop_quando_versao_igual(cache_dir):
    regras = [{"id": "1"}]
    _gravar_cache(cache_dir, regras, versao=3)

    with (
        patch.object(configuracao, "_buscar_versao", return_value=3),
        patch.object(configuracao, "_buscar_configuracoes") as mock_fetch,
    ):
        result = verificar_atualizacao()

    assert result is None
    mock_fetch.assert_not_called()


def test_falha_versao_dispara_sync_forcado(cache_dir, monkeypatch):
    antigas = [{"id": "antiga"}]
    novas = [{"id": "nova", "acao": "organizar_arquivo"}]
    _gravar_cache(cache_dir, antigas, versao=1)
    monkeypatch.setattr(configuracao, "_ultimo_sync_forcado_em", 0.0)

    with (
        patch.object(
            configuracao,
            "_buscar_versao",
            side_effect=RuntimeError("column does not exist"),
        ),
        patch.object(configuracao, "_buscar_configuracoes", return_value=novas),
    ):
        result = verificar_atualizacao()

    assert result == novas
    cache = json.loads(cache_dir.read_text(encoding="utf-8"))
    assert cache["regras"] == novas


def test_sync_forcado_respeita_intervalo(cache_dir, monkeypatch):
    antigas = [{"id": "a"}]
    novas = [{"id": "b"}]
    _gravar_cache(cache_dir, antigas, versao=1)
    # Simula sync forçado recente
    monkeypatch.setattr(
        configuracao,
        "_ultimo_sync_forcado_em",
        __import__("time").monotonic(),
    )

    with (
        patch.object(
            configuracao,
            "_buscar_versao",
            side_effect=RuntimeError("fail"),
        ),
        patch.object(configuracao, "_buscar_configuracoes", return_value=novas) as mock_fetch,
    ):
        result = verificar_atualizacao()

    assert result is None
    mock_fetch.assert_not_called()
    # intervalo configurado deve ser o do plano (~5 min)
    assert INTERVALO_SYNC_FORCADO_SEGUNDOS == 300


def test_boot_salva_cache_com_versao(cache_dir):
    novas = [{"id": "1", "pasta_origem": "entrada"}]
    # sem cache
    assert not cache_dir.exists()

    with (
        patch.object(configuracao, "_buscar_configuracoes", return_value=novas),
        patch.object(configuracao, "_buscar_versao", return_value=7),
    ):
        result = gerenciar_configuracoes()

    assert result[0]["id"] == "1"
    cache = json.loads(cache_dir.read_text(encoding="utf-8"))
    assert cache["versao"] == 7


def test_varredura_pula_nao_classificado(tmp_path):
    entrada = tmp_path / "entrada"
    quarentena = entrada / PASTA_NAO_CLASSIFICADO
    quarentena.mkdir(parents=True)
    (entrada / "ok.pdf").write_bytes(b"ok")
    (quarentena / "lixo.pdf").write_bytes(b"lixo")

    regras = [
        {
            "ativa": True,
            "pasta_origem": str(entrada),
            "acao": "renomear",
            "condicao": {},
        }
    ]

    processados = []

    def fake_processar(caminho, _regras):
        processados.append(Path(caminho).name)

    with patch("automacoes.monitorar_pasta._processar_arquivo", side_effect=fake_processar):
        _varredura_inicial(regras, str(entrada))

    assert processados == ["ok.pdf"]


def test_processar_loga_quando_nenhuma_regra_casa(tmp_path, capsys):
    arquivo = tmp_path / "solto.pdf"
    arquivo.write_bytes(b"x")
    regras = [
        {
            "ativa": True,
            "pasta_origem": str(tmp_path / "outra"),
            "acao": "mover",
            "condicao": {},
        }
    ]
    _processar_arquivo(str(arquivo), regras)
    out = capsys.readouterr().out
    assert "Nenhuma regra casou" in out


def test_aplicar_regras_atualiza_fallback_e_revarre(tmp_path, monkeypatch):
    monkeypatch.setattr("comunicacao.api_client.PASTA_BASE", "")
    monkeypatch.delenv("PASTA_PADRAO", raising=False)

    entrada = tmp_path / "entrada"
    entrada.mkdir()
    (entrada / "doc.pdf").write_bytes(b"x")

    regras_iniciais = []
    ctrl = MonitorController(regras_iniciais, set())

    novas = [
        {
            "ativa": True,
            "pasta_origem": str(entrada),
            "pasta_destino": str(tmp_path / "destino"),
            "acao": "renomear",
            "condicao": {},
        }
    ]

    processados = []

    def fake_processar(caminho, regras):
        processados.append((Path(caminho).name, regras[0]["acao"] if regras else None))

    with (
        patch("automacoes.monitorar_pasta.Observer") as MockObserver,
        patch("automacoes.monitorar_pasta._processar_arquivo", side_effect=fake_processar),
    ):
        mock_obs = MagicMock()
        MockObserver.return_value = mock_obs
        ctrl.aplicar_regras(novas)

    assert ctrl.regras[0]["acao"] == "renomear"
    assert any(nome == "doc.pdf" for nome, _ in processados)
    mock_obs.start.assert_called_once()


def test_idle_sem_pastas_nao_encerra_controlador():
    ctrl = MonitorController([], set())
    with patch("automacoes.monitorar_pasta.Observer") as MockObserver:
        ctrl._reagendar(set())
    MockObserver.assert_not_called()
    assert ctrl.observer is None
