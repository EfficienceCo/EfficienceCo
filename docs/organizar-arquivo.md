# Organizar arquivo — documentação das alterações

**Data:** 2026-07-29  
**Escopo:** ação composta `organizar_arquivo` no agente + formulário de regras por ação no frontend + validação alinhada no backend.

> AG-ML-CLASSIFIER (expansão de classes / leitura de `.xlsx`) permanece fora deste escopo. O organizador usa `obter_tipo` como caixa-preta já existente.

---

## Objetivo

Unir as ações já existentes (`renomear`, `mover`, estrutura de pastas de `abertura_empresa`) numa única regra que:

1. Classifica o tipo do documento  
2. Renomeia com o prefixo do tipo  
3. Identifica a empresa pelo nome do arquivo  
4. Move para a subpasta correta sob `CLIENTES\ATIVO\{Empresa}\...`  
5. Envia para `NAO_CLASSIFICADO` quando tipo ou empresa não forem resolvidos  
6. Cria pastas/subpastas ausentes quando necessário  

No painel, o formulário de criar/editar regra passa a mostrar só os campos que fazem sentido para cada ação (ex.: `renomear` sem `pasta_destino`).

---

## Fluxo da ação `organizar_arquivo`

```
Arquivo em pasta_origem
        │
        ▼
   obter_tipo (nome → ML)
        │
        ▼
   renomear_arquivo
        │
        ▼
   identificar_empresa (nome do arquivo × pastas em pasta_destino)
        │
        ├─ tipo nao_identificado OU empresa não encontrada
        │         │
        │         ▼
        │   pasta_origem\NAO_CLASSIFICADO\
        │
        └─ match
                  │
                  ▼
          {pasta_destino}\{Empresa}\{Subpasta}[\YYYY-MM]\
          (cria pasta/subpasta se faltar)
```

### Contrato da regra

| Campo | Uso |
|---|---|
| `pasta_origem` | Pasta de entrada (ex.: `...\ENTRADA`) |
| `pasta_destino` | Base de clientes (ex.: `...\CLIENTES\ATIVO`) |
| `acao` | `"organizar_arquivo"` |
| `condicao` | Filtros opcionais (`extensao`, `in_name`, …) + `empresa_propria` (opcional) |
| `condicao.empresa_propria` | Nome da pasta do escritório (ex.: `"Souza Contabilidade"`). Se aparecer no nome do arquivo, o destino é essa empresa |

Não é obrigatório informar `condicao.tipo`: o tipo vem do classificador / nome do arquivo.

### Exemplo de destino

Arquivo: `holerite_290726_103015_padaria_do_joao.pdf`  
Base: `C:\Souza_Contabilidade\CLIENTES\ATIVO`  
Empresa encontrada: `Padaria do João`  

→ `C:\Souza_Contabilidade\CLIENTES\ATIVO\Padaria do João\Folha\2026-07\`

---

## Mapa tipo → subpasta

Definido em `agente/core/estrutura_pastas.py` e compartilhado com `abertura_empresa`.

| Tipo | Subpasta | Subpasta de mês (`YYYY-MM`)? |
|---|---|---|
| `cartao_cnpj` | `Documentos` | Não |
| `contrato_social` | `Contratos` | Não |
| `extrato_bancario` | `Comprovantes` | Não |
| `holerite` | `Folha` | Sim |
| `folha_pagamento` | `Folha` | Sim |
| `nota_fiscal` / `nf` | `Notas Fiscais` | Não |
| `declaracao` / `recibo` | `Declaracoes` | Sim |
| `nao_identificado` / tipo sem mapa / empresa ausente | `NAO_CLASSIFICADO` (sob `pasta_origem`) | — |

### Subpastas canônicas da empresa

Criadas por `abertura_empresa` e garantidas pelo organizador:

`Documentos`, `Contratos`, `Requerimentos`, `Comprovantes`, `Correspondencias`, `Folha`, `Notas Fiscais`, `Declaracoes`

---

## Resolução de empresa

Módulo: `agente/core/identificar_empresa.py`

1. Lista pastas filhas imediatas de `pasta_destino`  
2. Normaliza nomes (minúsculas, sem acento, sem pontuação/`_`/`-`/espaços)  
3. Procura substring no basename do arquivo; preferência pelo match mais longo  
4. Se `empresa_propria` estiver na condição e casar no nome → usa essa empresa (cria a pasta se ainda não existir)  
5. Sem match → `None` → fluxo `NAO_CLASSIFICADO`  

---

## Arquivos alterados / criados

### Agente (novos)

| Arquivo | Função |
|---|---|
| `agente/core/estrutura_pastas.py` | `SUBPASTAS`, `TIPO_PARA_SUBPASTA`, `resolver_destino`, `criar_estrutura_empresa_em` |
| `agente/core/identificar_empresa.py` | Match de empresa pelo nome do arquivo |
| `agente/automacoes/organizar_arquivo.py` | Orquestração da ação composta |

### Agente (alterados)

| Arquivo | Mudança |
|---|---|
| `agente/automacoes/abertura_empresa.py` | Usa `estrutura_pastas`; aceita `condicao.nome_empresa` (JSONB) além de `nome_empresa=...` (legado) |
| `agente/automacoes/monitorar_pasta.py` | Branch `organizar_arquivo`; ignora arquivos já em `NAO_CLASSIFICADO` (evita loop do watchdog) |
| `agente/core/configuracao.py` | Normaliza `pasta_destino` só quando preenchido (suporta `renomear` sem destino) |
| `agente/core/identificar_tipo.py` | Import corrigido para `automacoes.rede.classificador` |
| `agente/core/tipos_documentos.json` | Inclusão de `folha_pagamento` |

### Frontend

| Arquivo | Mudança |
|---|---|
| `frontend/src/app/dashboard/regras/page.jsx` | `SCHEMA_ACAO` por ação; opção `organizar_arquivo`; remoção de `copiar`; campos `empresa_propria` / `nome_empresa`; labels e obrigatoriedade dinâmicos |

### Backend

| Arquivo | Mudança |
|---|---|
| `backend/src/controllers/regras.controller.js` | Allowlist de ações; `pasta_destino` / `pasta_origem` / `nome_empresa` validados conforme a ação |
| `backend/tests/regras.test.js` | Casos para `renomear` sem destino, `mover`/`organizar_arquivo` exigindo destino |

---

## Formulário de regras (UI) por ação

| Ação | `pasta_origem` | `pasta_destino` | Extras |
|---|---|---|---|
| `mover` | Obrigatória | Obrigatória (destino final) | — |
| `renomear` | Obrigatória | Oculta (envia `""`) | — |
| `organizar_arquivo` | Obrigatória (entrada) | Obrigatória (base `CLIENTES\ATIVO`) | `empresa_propria` (opcional) |
| `upload_folha` | Obrigatória | Opcional (arquivar após sucesso; default agente = `enviados/`) | — |
| `abertura_empresa` | Oculta (no submit espelha a base se vazia) | Obrigatória (pasta base) | `nome_empresa` obrigatório |
| `copiar` | Removida da UI até existir no agente | — | — |

---

## Fora deste escopo

- Treino / novas classes do classificador ML e leitura de Excel pela rede  
- Notificações `documento_recebido` e hash no padrão de nome  
- Implementação da ação `copiar`  

---

## Como validar manualmente

1. Criar no painel uma regra `organizar_arquivo` com origem `ENTRADA` e destino `CLIENTES\ATIVO`, opcionalmente com `empresa_propria`.  
2. Garantir pastas de empresa sob ATIVO (via `abertura_empresa` ou criação automática).  
3. Colocar na entrada um PDF cujo nome contenha o nome da empresa e um tipo conhecido (`holerite_..._padaria_do_joao.pdf`) → deve ir para `...\Empresa\Folha\YYYY-MM\`.  
4. Arquivo sem empresa no nome → `ENTRADA\NAO_CLASSIFICADO\`.  
5. Remover uma subpasta (ex.: `Folha`) e reprocessar → a subpasta deve ser recriada.  
6. Conferir no formulário: ao selecionar `renomear`, `pasta_destino` some; ao selecionar `organizar_arquivo`, aparecem labels de entrada/base e o campo de empresa do escritório.
