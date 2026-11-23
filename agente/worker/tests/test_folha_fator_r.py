"""Testes do canal Fator R / folha (AP-3)."""

from unittest.mock import MagicMock, patch

from comunicacao.apuracao_folha_agente import (
    buscar_folha_pendente,
    enviar_arquivos_folha,
    enviar_planilha_apuracao,
    reportar_resultado_folha,
)
from automacoes.verificar_folha_fator_r import (
    _processar_item,
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


def test_resolver_nome_cliente_prioriza_nome_empresa():
    assert resolver_nome_cliente({"nomeEmpresa": " Padaria do João "}) == "Padaria do João"
    assert resolver_nome_cliente({"nome": "legado"}) == "legado"
    assert resolver_nome_cliente({"nomeEmpresa": "Oficial", "nome": "legado"}) == "Oficial"
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
        "nomeEmpresa": nome,
        "mes": 4,
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
    assert payload["falhaUpload"] is False
    assert payload["mesesComFalha"] == []
    assert mock_report.call_args.args[0] == "apuracao-1"


def test_verificar_pastas_folha_devolve_mes_de_cada_arquivo(tmp_path):
    nome = "Empresa"
    setembro = tmp_path / nome / "Folha" / "2026-09"
    setembro.mkdir(parents=True)
    (setembro / "folha.xlsx").write_bytes(b"x")
    (setembro / "pro-labore.xlsx").write_bytes(b"x")
    agosto = tmp_path / nome / "Folha" / "2026-08"
    agosto.mkdir(parents=True)
    (agosto / "folha.xlsx").write_bytes(b"x")

    resultado = verificar_pastas_folha(nome, 9, 2026, pasta_base=str(tmp_path))

    assert resultado["mesPorArquivo"] == {
        str(setembro / "folha.xlsx"): {"mes": 9, "ano": 2026},
        str(setembro / "pro-labore.xlsx"): {"mes": 9, "ano": 2026},
        str(agosto / "folha.xlsx"): {"mes": 8, "ano": 2026},
    }
    assert sorted(resultado["arquivosEncontrados"]) == sorted(resultado["mesPorArquivo"])


# DAS-3: Folha/2026-09 tem 2 planilhas e só a segunda falha no envio. O report
# diz que 09/2026 falhou (mesmo com a outra planilha do mês enviada) e que
# 08/2026, enviado inteiro, não falhou.
def test_processar_item_meses_com_falha_duas_planilhas_no_mes_so_uma_falha(tmp_path):
    nome = "Padaria"
    setembro = tmp_path / nome / "Folha" / "2026-09"
    setembro.mkdir(parents=True)
    folha_set = setembro / "folha.xlsx"
    pro_labore = setembro / "pro-labore.xlsx"
    folha_set.write_bytes(b"x")
    pro_labore.write_bytes(b"x")
    agosto = tmp_path / nome / "Folha" / "2026-08"
    agosto.mkdir(parents=True)
    folha_ago = agosto / "folha.xlsx"
    folha_ago.write_bytes(b"x")

    item = {
        "id": "apuracao-1",
        "nomeEmpresa": nome,
        "mes": 10,
        "ano": 2026,
        "mesesFolha": [{"ano": 2026, "mes": 8}, {"ano": 2026, "mes": 9}],
    }

    with patch(
        "automacoes.verificar_folha_fator_r.obter_pasta_base",
        return_value=str(tmp_path),
    ), patch(
        "automacoes.verificar_folha_fator_r.enviar_arquivos_folha",
        return_value=[str(folha_ago), str(folha_set)],
    ) as mock_upload, patch(
        "automacoes.verificar_folha_fator_r.reportar_resultado_folha"
    ) as mock_report:
        _processar_item(item)

    assert sorted(mock_upload.call_args.args[0]) == sorted([str(folha_ago), str(folha_set), str(pro_labore)])
    payload = mock_report.call_args.args[1]
    assert payload["falhaUpload"] is True
    assert payload["mesesComFalha"] == [{"mes": 9, "ano": 2026}]
    assert payload["mesesEncontrados"] == [{"mes": 8, "ano": 2026}, {"mes": 9, "ano": 2026}]
    assert payload["totalMesesEncontrados"] == 2


# DAS-3: Folha/2026-09 tem 2 planilhas e as duas são recusadas no envio. O
# mês entra uma vez só em mesesComFalha (o backend recusa mês repetido com
# 400, e o report inteiro se perderia).
def test_processar_item_mes_com_duas_planilhas_recusadas_aparece_uma_vez(tmp_path):
    nome = "Padaria"
    setembro = tmp_path / nome / "Folha" / "2026-09"
    setembro.mkdir(parents=True)
    (setembro / "folha.xlsx").write_bytes(b"x")
    (setembro / "pro-labore.xlsx").write_bytes(b"x")

    item = {
        "id": "apuracao-1",
        "nomeEmpresa": nome,
        "mes": 10,
        "ano": 2026,
        "mesesFolha": [{"ano": 2026, "mes": 9}],
    }

    with patch(
        "automacoes.verificar_folha_fator_r.obter_pasta_base",
        return_value=str(tmp_path),
    ), patch(
        "automacoes.verificar_folha_fator_r.enviar_arquivos_folha",
        return_value=[],
    ), patch(
        "automacoes.verificar_folha_fator_r.reportar_resultado_folha"
    ) as mock_report:
        _processar_item(item)

    payload = mock_report.call_args.args[1]
    assert payload["falhaUpload"] is True
    assert payload["mesesComFalha"] == [{"mes": 9, "ano": 2026}]


# DAS-3 (revisão do #752): o backend só tira um mês da falha de envio num
# report que o traga sem falha. O watcher upload_folha envia o arquivo
# recolocado em Folha/YYYY-MM e o arquiva em enviados/ só depois de o servidor
# aceitar. Esse mês conta como encontrado (sem reenvio), senão nunca seria
# confirmado. rejeitados/ não conta: o servidor recusou o arquivo.
def test_verificar_pastas_folha_conta_mes_so_com_planilha_em_enviados(tmp_path):
    nome = "Padaria"
    setembro = tmp_path / nome / "Folha" / "2026-09" / "enviados"
    setembro.mkdir(parents=True)
    (setembro / "folha.xlsx").write_bytes(b"x")
    agosto = tmp_path / nome / "Folha" / "2026-08" / "rejeitados"
    agosto.mkdir(parents=True)
    (agosto / "folha.xlsx").write_bytes(b"x")
    julho = tmp_path / nome / "Folha" / "2026-07" / "enviados"
    julho.mkdir(parents=True)
    (julho / "~$folha.xlsx").write_bytes(b"x")
    (julho / "folha.pdf").write_bytes(b"x")

    resultado = verificar_pastas_folha(nome, 9, 2026, pasta_base=str(tmp_path))

    assert resultado["mesesEncontrados"] == [{"mes": 9, "ano": 2026}]
    assert resultado["arquivosEncontrados"] == []
    assert resultado["mesPorArquivo"] == {}


def test_processar_item_mes_com_falha_arquivado_pelo_watcher_relata_sem_falha(tmp_path):
    nome = "Padaria"
    enviados = tmp_path / nome / "Folha" / "2026-09" / "enviados"
    enviados.mkdir(parents=True)
    (enviados / "folha.xlsx").write_bytes(b"x")

    item = {
        "id": "apuracao-1",
        "nomeEmpresa": nome,
        "mes": 10,
        "ano": 2026,
        "mesesFolha": [{"ano": 2026, "mes": 9}],
    }

    with patch(
        "automacoes.verificar_folha_fator_r.obter_pasta_base",
        return_value=str(tmp_path),
    ), patch(
        "automacoes.verificar_folha_fator_r.enviar_arquivos_folha",
        return_value=[],
    ) as mock_upload, patch(
        "automacoes.verificar_folha_fator_r.reportar_resultado_folha"
    ) as mock_report:
        _processar_item(item)

    assert mock_upload.call_args.args[0] == []
    payload = mock_report.call_args.args[1]
    assert payload["mesesEncontrados"] == [{"mes": 9, "ano": 2026}]
    assert payload["totalMesesEncontrados"] == 1
    assert payload["falhaUpload"] is False
    assert payload["mesesComFalha"] == []


# Arquivo ainda na raiz do mês, com uma cópia antiga em enviados/: o da raiz é
# enviado e, se falhar, o mês segue com falha (enviados/ não confirma o mês).
def test_processar_item_falha_na_raiz_prevalece_sobre_enviados(tmp_path):
    nome = "Padaria"
    setembro = tmp_path / nome / "Folha" / "2026-09"
    (setembro / "enviados").mkdir(parents=True)
    (setembro / "enviados" / "folha.xlsx").write_bytes(b"x")
    (setembro / "pro-labore.xlsx").write_bytes(b"x")

    item = {
        "id": "apuracao-1",
        "nomeEmpresa": nome,
        "mes": 10,
        "ano": 2026,
        "mesesFolha": [{"ano": 2026, "mes": 9}],
    }

    with patch(
        "automacoes.verificar_folha_fator_r.obter_pasta_base",
        return_value=str(tmp_path),
    ), patch(
        "automacoes.verificar_folha_fator_r.enviar_arquivos_folha",
        return_value=[],
    ) as mock_upload, patch(
        "automacoes.verificar_folha_fator_r.reportar_resultado_folha"
    ) as mock_report:
        _processar_item(item)

    assert mock_upload.call_args.args[0] == [str(setembro / "pro-labore.xlsx")]
    payload = mock_report.call_args.args[1]
    assert payload["falhaUpload"] is True
    assert payload["mesesComFalha"] == [{"mes": 9, "ano": 2026}]
