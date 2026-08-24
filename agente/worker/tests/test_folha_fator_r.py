"""Testes do canal Fator R / folha (AP-3)."""

from unittest.mock import MagicMock, patch

from comunicacao.apuracao_folha_agente import (
    buscar_folha_pendente,
    enviar_arquivos_folha,
    enviar_planilha_apuracao,
    reportar_resultado_folha,
)
from automacoes.verificar_folha_fator_r import (
    _subtrair_meses,
    processar_folha_fator_r,
    resolver_nome_cliente,
    verificar_pastas_folha,
)


def test_subtrair_meses_virada_de_ano():
    assert _subtrair_meses(2026, 3, 0) == (2026, 3)
    assert _subtrair_meses(2026, 3, 2) == (2026, 1)
    assert _subtrair_meses(2026, 3, 3) == (2025, 12)
    assert _subtrair_meses(2026, 3, 11) == (2025, 4)


def test_resolver_nome_cliente_aceita_nome_no_payload():
    assert resolver_nome_cliente({"nome": " Padaria do João "}) == "Padaria do João"
    assert resolver_nome_cliente({"nomeEmpresa": "X"}) == "X"
    assert resolver_nome_cliente({"clienteId": "uuid-sem-nome"}) is None


def test_buscar_folha_pendente_lista_direta():
    response = MagicMock()
    response.content = b'[{"id":"1"}]'
    response.json.return_value = [{"id": "1", "clienteId": "c", "mes": 3, "ano": 2026}]

    with patch("comunicacao.apuracao_folha_agente.client") as mock_client:
        mock_client.LICENSE_TOKEN = "tok"
        mock_client.get.return_value = response
        itens = buscar_folha_pendente()

    assert len(itens) == 1
    assert itens[0]["id"] == "1"
    mock_client.get.assert_called_once()
    assert mock_client.get.call_args.args[0] == "/apuracoes/folha-pendente"


def test_reportar_resultado_folha_payload():
    response = MagicMock()
    response.content = b"{}"
    response.json.return_value = {}

    payload = {
        "temDozeMeses": False,
        "mesesEncontrados": [{"mes": 3, "ano": 2026}],
        "totalMesesEncontrados": 1,
    }

    with patch("comunicacao.apuracao_folha_agente.client") as mock_client:
        mock_client.LICENSE_TOKEN = "tok"
        mock_client.post.return_value = response
        reportar_resultado_folha("apuracao-1", payload)

    assert mock_client.post.call_args.args[0] == "/apuracoes/apuracao-1/resultado-folha"
    assert mock_client.post.call_args.args[1] == payload


def test_enviar_planilha_apuracao_usa_upload_agente(tmp_path):
    pasta = tmp_path / "Empresa" / "Folha" / "2026-03"
    pasta.mkdir(parents=True)
    arquivo = pasta / "folha.xlsx"
    arquivo.write_bytes(b"xlsx")

    with patch("comunicacao.apuracao_folha_agente.client") as mock_client:
        mock_client.LICENSE_TOKEN = "tok"
        mock_client.postFile.return_value = MagicMock()
        mes = enviar_planilha_apuracao(str(arquivo))

    assert mes == "2026-03"
    mock_client.postFile.assert_called_once()
    args, kwargs = mock_client.postFile.call_args
    assert args[0] == "/folha/upload/agente"
    assert kwargs["campos"]["mes_referencia"] == "2026-03"


def test_enviar_arquivos_folha_continua_apos_falha(tmp_path):
    pasta = tmp_path / "E" / "Folha" / "2026-01"
    pasta.mkdir(parents=True)
    a = pasta / "a.xlsx"
    b = pasta / "b.xlsx"
    a.write_bytes(b"1")
    b.write_bytes(b"2")

    with patch(
        "comunicacao.apuracao_folha_agente.enviar_planilha_apuracao",
        side_effect=[RuntimeError("falha"), "2026-01"],
    ):
        enviados = enviar_arquivos_folha([str(a), str(b)])

    assert enviados == [str(b)]


def test_verificar_pastas_folha_doze_meses(tmp_path):
    nome = "Padaria"
    for i in range(12):
        ano, mes = _subtrair_meses(2026, 3, i)
        pasta = tmp_path / nome / "Folha" / f"{ano}-{mes:02d}"
        pasta.mkdir(parents=True)
        (pasta / "folha.xlsx").write_bytes(b"x")

    # Lixo que não deve contar: pdf, enviados, temp
    extra = tmp_path / nome / "Folha" / "2026-03"
    (extra / "outro.pdf").write_bytes(b"p")
    enviados = extra / "enviados"
    enviados.mkdir()
    (enviados / "velho.xlsx").write_bytes(b"v")
    (extra / "~$temp.xlsx").write_bytes(b"t")

    resultado = verificar_pastas_folha(nome, 3, 2026, pasta_base=str(tmp_path))

    assert resultado["temDozeMeses"] is True
    assert resultado["totalMesesEncontrados"] == 12
    assert len(resultado["arquivosEncontrados"]) == 12


def test_verificar_pastas_folha_parcial(tmp_path):
    nome = "Empresa"
    for mes in (1, 2, 3):
        pasta = tmp_path / nome / "Folha" / f"2026-{mes:02d}"
        pasta.mkdir(parents=True)
        (pasta / "folha.xlsx").write_bytes(b"x")

    resultado = verificar_pastas_folha(nome, 3, 2026, pasta_base=str(tmp_path))

    assert resultado["temDozeMeses"] is False
    assert resultado["totalMesesEncontrados"] == 3
    assert {m["mes"] for m in resultado["mesesEncontrados"]} == {1, 2, 3}


def test_processar_folha_fator_r_sem_nome_nao_reporta():
    with patch(
        "automacoes.verificar_folha_fator_r.buscar_folha_pendente",
        return_value=[{"id": "a1", "clienteId": "uuid", "mes": 3, "ano": 2026}],
    ), patch(
        "automacoes.verificar_folha_fator_r.reportar_resultado_folha"
    ) as mock_report, patch(
        "automacoes.verificar_folha_fator_r.enviar_arquivos_folha"
    ) as mock_upload:
        processar_folha_fator_r()

    mock_report.assert_not_called()
    mock_upload.assert_not_called()


def test_processar_folha_fator_r_fluxo_completo(tmp_path):
    nome = "Padaria"
    pasta = tmp_path / nome / "Folha" / "2026-03"
    pasta.mkdir(parents=True)
    arquivo = pasta / "folha.xlsx"
    arquivo.write_bytes(b"x")

    item = {
        "id": "apuracao-1",
        "clienteId": "uuid",
        "nome": nome,
        "mes": 3,
        "ano": 2026,
    }

    with patch(
        "automacoes.verificar_folha_fator_r.buscar_folha_pendente",
        return_value=[item],
    ), patch(
        "automacoes.verificar_folha_fator_r.obter_pasta_base",
        return_value=str(tmp_path),
    ), patch(
        "automacoes.verificar_folha_fator_r.enviar_arquivos_folha",
        return_value=[str(arquivo)],
    ) as mock_upload, patch(
        "automacoes.verificar_folha_fator_r.reportar_resultado_folha"
    ) as mock_report:
        processar_folha_fator_r()

    mock_upload.assert_called_once()
    assert str(arquivo) in mock_upload.call_args.args[0]
    payload = mock_report.call_args.args[1]
    assert payload["temDozeMeses"] is False
    assert payload["totalMesesEncontrados"] == 1
    assert mock_report.call_args.args[0] == "apuracao-1"
