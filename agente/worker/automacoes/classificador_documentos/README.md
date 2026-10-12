# Artefatos do classificador de documentos (TF-IDF + MLP)

Issue: [#509](https://github.com/EfficienceCo/EfficienceCo/issues/509) (BUG-ML-01).
Residual deps: [#639](https://github.com/EfficienceCo/EfficienceCo/issues/639) (não instalar sklearn no worker ainda).

## Path oficial vs este módulo

| Peça | Situação |
|------|----------|
| `automacoes.rede.classificador` (ResNet) | **Produção hoje** — `identificar_tipo` importa daqui. Deps = `requirements.txt` / `deps-runtime.txt`. |
| Este pacote (`classificador_documentos`, TF-IDF + joblib) | **Scaffolding / alvo futuro (RN-1b).** **Não** está no runtime. `scikit-learn` / `joblib` **não** vão no `requirements.txt` do worker até ligar a produção. |

`import sklearn` / `import joblib` falhando no Python do worker **é esperado** hoje — não é regredir #515. Ver decisão de rede adiada no vault.

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

## Treino e publicação (#649)

Treina-se **uma vez**, com documentos **reais e anonimizados** de cliente (decisão 2026-09-29 — nada de dataset sintético pro artefato publicado). Escopo: PDF, DOCX e XLSX (`.xls` e imagem ficam fora).

1. Montar o dataset: uma subpasta por classe (nome da pasta = rótulo), mínimo **10 documentos por classe** (`--minimo-por-classe`). PDF escaneado sem texto é pulado com aviso.
2. Em um ambiente com `scikit-learn` + `joblib` (instalados **à parte**, não via `requirements.txt` do worker), na raiz do worker:

```powershell
py -3 -m automacoes.classificador_documentos.treinar --dataset C:\dataset --saida C:\artefatos-1.0.0
```

   Gera `modelo.pt`, `vetorizador.joblib`, `indice_para_rotulo.joblib` e `relatorio_treino.json`, com a acurácia de teste **por tipo** — por argmax e com o limiar de produção (0.75; abaixo dele vira `nao_identificado`). O TF-IDF é fitado só no split de treino, então o número de teste não vaza vocabulário. Seed fixa (`--seed`), resultado reprodutível.
3. Se o relatório estiver bom, publicar (mesmo comando + `--publicar`):

```powershell
py -3 -m automacoes.classificador_documentos.treinar --dataset C:\dataset --saida C:\artefatos-1.0.0 --publicar 1.0.0
```

   Preenche os SHA-256 no `manifest.json` versionado, marca `publicado: true`, grava o baseline (`baseline.acuracia_teste_por_classe`) e copia o manifest pra pasta de saída (o `instalar_artefatos --fonte` confere os hashes por ela). Commitar o `manifest.json` — os binários **não** vão pro git.
4. Empacotar com `-ArtefatosFonte C:\artefatos-1.0.0`. Com o manifest publicado, o `empacotar.ps1` **falha** se faltar artefato ou se o hash não bater.

A inferência (`classificar_documento`) lê os artefatos do destino canônico (`artefatos.destino_artefatos`), então o que o pacote do launcher instala é o que ela usa.

Ligar a produção (trocar o import em `core/identificar_tipo.py`, `scikit-learn`/`joblib` no `requirements.txt` e no `deps-runtime.txt`) é o RN-1b, fora deste passo.
