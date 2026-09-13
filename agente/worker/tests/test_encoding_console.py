"""Testes do boot UTF-8 do console (BUG-NFE-01 sistêmico)."""

import contextlib
import io
import sys

from core.encoding_console import garantir_stdout_utf8


def test_garantir_stdout_utf8_permite_seta_em_stream_cp1252():
    buf = io.BytesIO()
    stream = io.TextIOWrapper(
        buf, encoding="cp1252", errors="strict", write_through=True, newline="\n"
    )
    with contextlib.redirect_stdout(stream):
        garantir_stdout_utf8()
        print("arquivado → ok")
        stream.flush()

    texto = buf.getvalue().decode("utf-8")
    assert "arquivado → ok" in texto
    assert "\u2192" in texto


def test_garantir_stdout_utf8_noop_sem_reconfigure():
    class SemReconfigure:
        def write(self, s):
            return len(s)

        def flush(self):
            pass

    original = sys.stdout
    sys.stdout = SemReconfigure()
    try:
        garantir_stdout_utf8()  # não deve levantar
    finally:
        sys.stdout = original
