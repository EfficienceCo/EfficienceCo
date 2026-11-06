"""O bloqueio de rede do conftest (autouse): host de fora é recusado, loopback passa."""

import os
import socket
import tempfile

import pytest


def test_o_bloqueio_de_rede_recusa_host_de_fora_e_deixa_passar_o_loopback():
    servidor = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    servidor.bind(("127.0.0.1", 0))
    servidor.listen(1)
    cliente = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        cliente.connect(servidor.getsockname())
        outro = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            with pytest.raises(AssertionError, match="chamada de rede fora do computador"):
                outro.connect(("www.nfe.fazenda.gov.br", 443))
        finally:
            outro.close()
    finally:
        cliente.close()
        servidor.close()


def test_sem_af_unix_endereco_que_nao_e_tupla_nao_quebra_a_guarda(monkeypatch):
    """Regressão: no Windows socket.AF_UNIX não existe; a guarda não pode levantar AttributeError.

    Sem socket local a liberar, endereço não-tupla (str) não tem host de loopback: é bloqueado.
    """
    import conftest  # o mesmo módulo que o pytest carrega (tests/ está no sys.path)

    monkeypatch.setattr(conftest, "AF_UNIX", None)
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        with pytest.raises(AssertionError, match="chamada de rede fora do computador"):
            sock.connect("/tmp/qualquer.sock")
    finally:
        sock.close()


@pytest.mark.skipif(not hasattr(socket, "AF_UNIX"), reason="socket.AF_UNIX não existe neste sistema")
def test_socket_local_af_unix_passa_pela_guarda():
    # Pasta curta do sistema (não tmp_path): o caminho de um socket AF_UNIX tem limite (~108 bytes).
    with tempfile.TemporaryDirectory() as pasta:
        caminho = os.path.join(pasta, "s.sock")
        servidor = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        servidor.bind(caminho)
        servidor.listen(1)
        cliente = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        try:
            cliente.connect(caminho)  # AssertionError da guarda falharia o teste
        finally:
            cliente.close()
            servidor.close()
