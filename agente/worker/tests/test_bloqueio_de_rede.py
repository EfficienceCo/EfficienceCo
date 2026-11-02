"""O bloqueio de rede do conftest (autouse): host de fora é recusado, loopback passa."""

import socket

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
