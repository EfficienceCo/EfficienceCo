"""Aviso modal no Windows (MessageBox). Em outros SO, apenas imprime."""
import sys


def aviso_erro(titulo, mensagem):
    """Exibe aviso de erro que só fecha quando o usuário clica em OK."""
    if sys.platform == "win32":
        import ctypes

        # MB_OK | MB_ICONERROR | MB_SYSTEMMODAL
        ctypes.windll.user32.MessageBoxW(0, mensagem, titulo, 0x00000010 | 0x00001000)
    else:
        print(f"[{titulo}] {mensagem}")
