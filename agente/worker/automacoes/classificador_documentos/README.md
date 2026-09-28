# Artefatos do classificador de documentos (TF-IDF + MLP)

Issue: [#509](https://github.com/EfficienceCo/EfficienceCo/issues/509) (BUG-ML-01).

## O que é isto

O classificador **não treina no cliente**. Treina-se uma vez; distribuem-se só:

| Arquivo | Função |
|---------|--------|
| `modelo.pt` | pesos da MLP |
| `vetorizador.joblib` | TF-IDF fitado no treino |
| `indice_para_rotulo.joblib` | mapa índice → rótulo |

`manifest.json` (versionado no git) descreve a versão esperada e, após publicação, os SHA-256.

## Onde os arquivos moram

| Ambiente | Destino |
|----------|---------|
| Pacote do launcher (produção) | `Efficience/modelos/classificador_documentos/` (ao lado dos `.exe`) |
| Override | env `CLASSIFICADOR_ARTEFATOS_DIR` |
| Dev / QA sem instalador | pasta deste módulo **ou** destino passado ao script de instalação |

Ordem de resolução: ver `artefatos.destino_artefatos`.

## Produção (quem instala pelo launcher)

O empacote copia a pasta `modelos/classificador_documentos/` para a pasta do escritório. Ver `agente/launcher/README.md` › Empacote e `agente/worker/scripts/empacotar.ps1`.

Enquanto `manifest.json` tiver `"publicado": false`, o pacote pode ir **sem** os binários — a inferência continua em fallback (`nao_identificado`) até existir treino publicado.

## QA / worker sem launcher (download na mão)

1. Obter a pasta publicada dos artefatos (quando houver release; hoje ainda não existe — ver task de treino no vault).
2. Na raiz do worker (`agente/worker`):

```powershell
py -3 -m automacoes.classificador_documentos.instalar_artefatos --fonte C:\caminho\para\pasta-com-os-3-arquivos
py -3 -m automacoes.classificador_documentos.instalar_artefatos --status
```

`--status` deve listar os 3 arquivos em `presentes` e `"completo": true` (hashes só são exigidos quando o manifest estiver `publicado: true` com sha256 preenchidos).

## Conferir gestão (sem exigir rede neural ativa)

```powershell
cd agente\worker
py -3 -m pytest tests/test_artefatos_classificador.py -q
py -3 -m automacoes.classificador_documentos.instalar_artefatos --status
```

## Treino (fora do escopo do #509)

Script de treino na stack TF-IDF: `treinar.py` (branch `#525` / pasta histórica `teste_rede_neural/`). Após treinar, copiar os 3 arquivos + atualizar `manifest.json` (`modelo_version`, `sha256`, `publicado: true`) e incluir no pacote do launcher.
