"""Executa o worker real por HTTP local; configuração só pelo ambiente/stdin."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "agente" / "worker"))
from automacoes.verificar_folha_fator_r import _processar_item, processar_folha_fator_r

item = json.load(sys.stdin)
if item is None:
    processar_folha_fator_r()
else:
    _processar_item(item)
