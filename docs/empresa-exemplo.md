# Contabilidade Souza & Associados — Empresa Exemplo

> Empresa fictícia criada para servir de base ao MVP da Efficience Co.

---

## 🏢 Sobre a Empresa

**Razão Social:** Souza & Associados Contabilidade Ltda
**Nome fantasia:** Contabilidade Souza
**Porte:** Pequena empresa
**Funcionários:** 6 pessoas
**Clientes atendidos:** ~40 empresas de pequeno porte
**Localização:** Taubaté, SP
**Segmentos atendidos:** Comércio local, prestadores de serviço, MEIs

---

## 👥 Equipe

| Nome | Cargo | O que faz |
|---|---|---|
| Roberto Souza | Contador / Sócio | Supervisiona tudo, assina documentos, atende clientes maiores |
| Fernanda Lima | Auxiliar Contábil | Lançamentos fiscais, apuração de impostos |
| Carlos Mendes | Auxiliar Contábil | Folha de pagamento, admissão e demissão |
| Patrícia Rocha | Auxiliar Societária | Abertura e alteração de empresas, contratos |
| Juliana Pires | Atendimento / Administrativo | Recebe documentos, responde clientes, organiza pastas |
| Marcos Teixeira | Estagiário | Digitalização, organização de arquivos, suporte geral |

---

## 🗂️ Estrutura de Pastas (hoje — na mão, no computador)

```
C:\Souza_Contabilidade\
│
├── CLIENTES\
│   ├── ATIVO\
│   │   ├── Padaria do João\
│   │   │   ├── Documentos\
│   │   │   ├── Notas Fiscais\
│   │   │   ├── Folha\
│   │   │   └── Declarações\
│   │   ├── Salão da Maria\
│   │   └── ... (38 pastas de clientes)
│   └── INATIVO\
│
├── MODELOS\
│   ├── Contratos\
│   ├── Procurações\
│   └── Declarações\
│
├── IMPOSTOS\
│   ├── 2024\
│   └── 2025\
│
└── DIVERSOS\
```

> **Problema real:** pastas criadas sem padrão, cada funcionário organiza do seu jeito, arquivos duplicados, clientes inativos misturados com ativos.

---

## 🔄 Processos Mapeados

---

### 1. Recebimento de Documentos do Cliente

**Como funciona hoje:**
1. Cliente envia documentos por WhatsApp, e-mail ou entrega físico
2. Juliana recebe e imprime ou salva onde achar melhor
3. Marcos digitaliza os físicos (scanner)
4. Documento vai parar em pasta aleatória ou na área de trabalho
5. Fernanda ou Carlos precisam caçar o documento quando for trabalhar nele

**Problemas:**
- Documentos perdidos ou duplicados
- Não há confirmação de recebimento pro cliente
- Sem data de entrada registrada
- Sem rastreio de quem recebeu o quê

**Como a Efficience resolve:**
- Cliente envia documento → agente detecta na pasta de entrada → move automaticamente pra pasta correta do cliente com data e tipo no nome
- Gera log: "NF recebida da Padaria do João em 14/07/2025 às 10:32"
- Notifica Fernanda que tem documento novo aguardando

---

### 2. Lançamento Fiscal (Entradas e Saídas)

**Como funciona hoje:**
1. Fernanda pega as notas fiscais do cliente (físicas ou PDF)
2. Abre o sistema contábil (geralmente um ERP legado tipo Domínio ou Alterdata)
3. Lança manualmente cada nota — CNPJ, valor, data, natureza da operação
4. Ao final do mês, apura o imposto (Simples Nacional, ICMS, ISS, PIS/COFINS)
5. Gera o boleto ou DARF
6. Manda pro cliente pagar

**Problemas:**
- Lançamento manual é lento e sujeito a erro
- Se o cliente atrasa o envio das notas, atrasa tudo
- Sem alerta quando prazo de apuração está chegando

**Como a Efficience resolve:**
- Painel mostra quais clientes já enviaram documentos e quais estão pendentes
- Alerta automático X dias antes do vencimento de cada obrigação fiscal
- Log de tudo que foi lançado e quando

---

### 3. Folha de Pagamento

**Como funciona hoje:**
1. No início do mês, Carlos lista todos os funcionários de cada cliente
2. Coleta informações de horas, faltas, afastamentos (por WhatsApp ou planilha)
3. Calcula manualmente em planilha Excel
4. Gera o holerite em Word ou PDF
5. Envia por e-mail pro cliente
6. Gera FGTS (SEFIP/GFIP) e INSS (GPS)
7. Gera eSocial

**Problemas:**
- Planilha de cálculo é manual, erros são comuns
- Holerites são salvos sem padrão de nome
- Falta controle de quais clientes já foram processados no mês

**Como a Efficience resolve:**
- Checklist mensal por cliente: "Folha processada? Holerite enviado? FGTS gerado?"
- Painel de status: verde = concluído, amarelo = em andamento, vermelho = atrasado
- Holerites salvos automaticamente na pasta correta com nome padronizado

---

### 4. Abertura de Empresa (Societário)

**Como funciona hoje:**
1. Cliente entra em contato querendo abrir empresa
2. Patrícia coleta dados por WhatsApp ou formulário impresso
3. Monta o contrato social no Word (copia de um modelo, substitui os dados na mão)
4. Protocola na Junta Comercial (sistema REDESIM)
5. Solicita CNPJ na Receita Federal
6. Solicita inscrição estadual/municipal
7. Abre conta bancária PJ
8. Cadastra o cliente no sistema contábil
9. Cria pasta do cliente no servidor

**Problemas:**
- Checklist de etapas no papel ou na cabeça
- Sem controle de em qual etapa cada abertura está
- Modelos de contrato atualizados manualmente

**Como a Efficience resolve:**
- Fluxo de abertura com etapas definidas: cada etapa tem responsável e status
- Ao concluir a abertura, agente cria automaticamente a pasta do cliente no servidor com estrutura padrão
- Modelo de contrato social preenchido automaticamente com os dados coletados

---

### 5. Obrigações Acessórias (Declarações)

**Como funciona hoje:**
1. Fernanda mantém uma planilha Excel com vencimentos de cada obrigação por cliente
2. Consulta a planilha todo dia de manhã
3. Gera a declaração no sistema
4. Transmite pelo e-CAC ou sistema da Receita
5. Salva o recibo na pasta do cliente

**Obrigações mensais típicas:**
- DAS (Simples Nacional)
- DCTF
- SPED Fiscal
- eSocial
- FGTS (GRF)
- ISS municipal

**Problemas:**
- Planilha desatualizada frequentemente
- Se Fernanda falta, ninguém sabe o que vence
- Recibos de transmissão salvos sem padrão

**Como a Efficience resolve:**
- Calendário fiscal automático por cliente
- Alerta para todos da equipe quando vencimento está próximo
- Recibos salvos automaticamente na pasta correta após transmissão

---

### 6. Comunicação com Clientes

**Como funciona hoje:**
1. Tudo por WhatsApp pessoal de cada funcionário
2. Cobranças de documentos faltantes por mensagem informal
3. Envio de boletos e declarações por e-mail sem padrão
4. Cliente não sabe o status do que foi pedido

**Problemas:**
- Informações importantes ficam no WhatsApp pessoal
- Se funcionário sai, histórico some
- Sem rastreio de o que foi enviado e quando

**Como a Efficience resolve:**
- Painel do cliente: ele acessa e vê o status de tudo
- Notificações automáticas quando documento está pronto ou vencimento se aproxima
- Histórico de comunicação centralizado

---

## 🚨 Resumo dos Problemas Automatizáveis

| Processo | Problema principal | Solução Efficience |
|---|---|---|
| Recebimento de docs | Desorganização, sem rastreio | Organização automática de arquivos + log |
| Lançamento fiscal | Sem alerta de prazo | Calendário fiscal + alertas |
| Folha de pagamento | Sem controle de status | Checklist mensal por cliente |
| Abertura de empresa | Sem controle de etapas | Fluxo com etapas e status |
| Obrigações acessórias | Planilha manual de vencimentos | Calendário automático + alertas |
| Comunicação | WhatsApp pessoal, sem histórico | Painel do cliente + notificações |

---

## 🎯 MVP Sugerido (primeiras funcionalidades a implementar)

Com base nesses processos, o MVP da Efficience deve focar em:

1. **Organização automática de arquivos** — agente monitora pasta de entrada e move pro lugar certo
2. **Calendário fiscal por cliente** — painel mostrando o que vence e quando
3. **Checklist mensal** — controle de quais processos já foram concluídos pra cada cliente
4. **Log de atividades** — tudo que o agente fez fica registrado e visível no painel

Essas quatro funcionalidades já resolvem os maiores gargalos do dia a dia de um escritório como a Souza & Associados — e são o suficiente pra demonstrar valor pro primeiro cliente real.

---

## 🛠️ Soluções de Automação — Especificação Técnica

Esta seção descreve, processo a processo, o que deve ser implementado, como funciona internamente, quais são as entradas e saídas esperadas e quais etapas o sistema executa.

> **Nota de leitura:** esta documentação é escrita para desenvolvedores de software, não para contadores. Sempre que um termo de domínio contábil aparecer pela primeira vez, ele vem explicado em linguagem simples.

---

### Automação 1 — Organização Automática de Arquivos Recebidos

**Problema:** documentos chegam em pasta genérica sem padrão, sem rastreio, sem notificação.

**Responsável:** Agente local (Python) + Backend API

#### Entradas
- Arquivo novo detectado em `C:\Souza_Contabilidade\ENTRADA\` (qualquer formato: PDF, XML, JPG, DOCX)
- Regras de automação configuradas no painel web (pasta origem, pasta destino, condição de match, ação)

#### Saídas
- Arquivo movido para `C:\Souza_Contabilidade\CLIENTES\ATIVO\{nome_cliente}\{tipo_doc}\{YYYY-MM}\{data}_{tipo}_{nome_original}.pdf`
- Evento registrado via `POST /eventos`: `{ descricao, sucesso, cliente_id, timestamp }`
- Notificação criada via `POST /notificacoes` (tipo: `documento_recebido`)

#### Etapas

```
1. Watchdog monitora ENTRADA\ continuamente (evento: FileCreatedEvent)
2. Ao detectar arquivo novo:
   a. Lê nome do arquivo e extensão
   b. Consulta regras via GET /regras (cache local de 5 min)
   c. Percorre regras em ordem de prioridade:
      - Verifica se pasta_origem bate com diretório do arquivo
      - Verifica condição: nome contém padrão? extensão bate? tamanho mínimo?
   d. Aplica primeira regra que casa:
      - Ação MOVER: renomeia com padrão e move para pasta_destino
      - Ação COPIAR: idem mas mantém original
      - Ação RENOMEAR: só renomeia no lugar
   e. Se nenhuma regra casa: move para ENTRADA\NAO_CLASSIFICADO\
3. Registra evento no backend (sucesso ou erro)
4. Se sucesso e tipo = NF|BOLETO|DECLARACAO: cria notificação para o responsável
```

#### Padrão de nome do arquivo
```
{YYYY-MM-DD}_{tipo_documento}_{nome_cliente_slug}_{hash4}.{ext}
Exemplo: 2025-07-14_NF_padaria-do-joao_a3f2.pdf
```

#### Regra de classificação (estrutura no banco)
```json
{
  "pasta_origem": "C:\\Souza_Contabilidade\\ENTRADA",
  "pasta_destino": "C:\\Souza_Contabilidade\\CLIENTES\\ATIVO\\Padaria do João\\Notas Fiscais",
  "condicao": "nome_contem:NF | extensao:xml,pdf",
  "acao": "mover",
  "cliente_id": "uuid-do-cliente"
}
```

#### Tratamento de erros
- Arquivo em uso (locked): retentar em 30s, máx 3 tentativas
- Pasta destino não existe: criar automaticamente + logar aviso
- Falha na API: salvar evento em fila offline local (SQLite), reenviar quando conectar

---

### Automação 2 — Calendário Fiscal e Alertas de Vencimento

> **Contexto para quem não é contador:** o governo exige que o escritório entregue uma série de declarações e pague impostos todo mês, cada um com data limite diferente. Se passar do prazo, o cliente leva multa. Hoje, a Fernanda controla esses prazos numa planilha Excel que ela consulta toda manhã. O risco: se ela falta, ninguém sabe o que vence.

**Problema:** controle de vencimentos em planilha manual; sem alertas automáticos; depende de uma pessoa.

**Responsável:** Backend API (job agendado) + Frontend (painel)

#### Entradas
- Tabela `obrigacoes` no banco: `{ cliente_id, nome, tipo, data_vencimento, status, recorrente }`
- Configuração de antecedência de alerta (padrão: 7 dias antes e 3 dias antes)
- Perfil fiscal do cliente (Simples Nacional, Lucro Presumido, MEI) — campo em `clientes`

#### Saídas
- Notificações criadas em `notificacoes` (tipo: `obrigacao_vencendo`)
- Painel frontend exibindo calendário com status por cor: verde (concluída), amarelo (pendente), vermelho (vencida/≤3 dias)
- Obrigações recorrentes auto-geradas para o próximo período ao serem concluídas

#### Etapas

```
JOB DIÁRIO — executado às 08:00 (agendador no backend ou cron Supabase):

1. Busca todas as obrigações com status != 'concluida' e data_vencimento <= hoje + 7 dias
2. Para cada obrigação iminente:
   a. Calcula dias_restantes = data_vencimento - hoje
   b. Verifica se notificação do tipo obrigacao_vencendo já foi criada HOJE
      (evita duplicata: filtra por cliente_id + obrigacao_id + criado_em >= início do dia)
   c. Se não existe: cria notificação com mensagem:
      "Obrigação '{nome}' vence em {dias_restantes} dia(s) — {data_vencimento}"
3. Obrigações com data_vencimento < hoje e status != 'concluida':
   a. Atualiza status para 'vencida'
   b. Cria notificação tipo obrigacao_vencida
4. Obrigações recorrentes concluídas:
   a. Ao marcar como concluída via PATCH /obrigacoes/:id
   b. Se recorrente = true: gera nova obrigação com data_vencimento = próximo mês/período
```

#### Geração de calendário por regime fiscal
```
Simples Nacional → gera DAS no dia 20 de cada mês
MEI             → gera DAS-MEI no dia 20 de cada mês
Todos           → DCTF no dia 15 do mês seguinte
eSocial         → dia 7 do mês seguinte (folha)
FGTS (GRF)      → dia 7 do mês seguinte
ISS municipal   → varia por município (cadastro manual)
```

#### Endpoints principais
```
GET /obrigacoes?status=pendente&mes=7&ano=2025
GET /obrigacoes/proximas?dias=7   → lista vencendo nos próximos N dias
PATCH /obrigacoes/:id             → { status: 'concluida' } → dispara geração recorrente
```

---

### Automação 3 — Checklist Mensal de Folha de Pagamento

> **Contexto para quem não é contador:** todo mês, o escritório precisa calcular o salário de cada funcionário de cada cliente, gerar o holerite (o comprovante de pagamento que o funcionário recebe), e enviar para o governo alguns arquivos obrigatórios (FGTS e eSocial). Com 40 clientes, são 40 folhas de pagamento pra processar todo mês — e hoje não existe nenhum controle de quais já foram feitas.

**Problema:** sem visibilidade de quais clientes já tiveram a folha processada no mês; holerites salvos com nomes aleatórios.

**Responsável:** Backend API + Agente local + Frontend

#### Entradas
- Lista de clientes ativos com folha de pagamento habilitada (campo `tem_folha` em `clientes`)
- Mês/ano de referência
- Arquivo de holerite gerado externamente (PDF, qualquer nome)
- Pasta de saída configurada por cliente

#### Saídas
- Processo mensal criado automaticamente no início de cada mês para cada cliente com folha
- Status de cada etapa atualizado conforme progresso
- Holerite renomeado e movido para `{pasta_cliente}\Folha\{YYYY-MM}\holerite_{nome_funcionario}_{YYYY-MM}.pdf`
- Notificação quando todos os clientes do mês tiverem folha concluída

#### Etapas

```
INÍCIO DO MÊS (dia 1, job backend):
1. Busca todos os clientes com tem_folha = true e status = ativo
2. Para cada cliente: cria processo em processos com:
   {
     tipo: 'folha_pagamento',
     cliente_id,
     mes_referencia: YYYY-MM,
     etapas: [
       { nome: 'Coleta de informações',  status: 'pendente' },
       { nome: 'Cálculo da folha',       status: 'pendente' },
       { nome: 'Geração de holerites',   status: 'pendente' },
       { nome: 'Envio ao cliente',       status: 'pendente' },
       { nome: 'FGTS gerado',            status: 'pendente' },
       { nome: 'eSocial transmitido',    status: 'pendente' }
     ]
   }

AGENTE LOCAL (monitoramento de pasta):
3. Monitora pasta SAIDA\FOLHA\ de cada cliente
4. Detecta novo PDF:
   a. Extrai nome do funcionário do nome do arquivo (regex ou posição fixa)
   b. Renomeia para padrão: holerite_{slug_funcionario}_{YYYY-MM}.pdf
   c. Move para pasta correta do cliente
   d. Chama PATCH /processos/:id/etapas/geracao_holerites { status: 'concluida' }

FRONTEND:
5. Painel exibe grid: linhas = clientes, colunas = etapas do mês
6. Cor por status: cinza (pendente), azul (em andamento), verde (concluída), vermelho (atrasada)
7. Carlos clica em cada célula pra marcar etapa como concluída
```

#### Estrutura do processo no banco
```json
{
  "tipo": "folha_pagamento",
  "cliente_id": "uuid",
  "mes_referencia": "2025-07",
  "status": "em_andamento",
  "etapas": [
    { "nome": "Coleta de informações", "status": "concluida", "concluida_em": "2025-07-03" },
    { "nome": "Cálculo da folha",      "status": "em_andamento" }
  ]
}
```

---

### Automação 4 — Fluxo de Abertura de Empresa

> **Contexto para quem não é contador:** quando alguém quer abrir um negócio, precisa passar por uma série de etapas burocráticas: registrar a empresa na Junta Comercial, obter CNPJ na Receita Federal, pegar inscrição estadual e municipal, etc. O escritório faz isso pelo cliente. São ~9 etapas sequenciais que hoje ficam na cabeça da Patrícia ou num papel — sem nenhum controle digital de onde cada abertura está.

**Problema:** sem controle de etapas; contrato social montado na mão copiando modelo; pasta do cliente criada manualmente no final.

**Responsável:** Backend API + Agente local + Frontend

#### Entradas
- Formulário de abertura preenchido no painel: nome, sócios, endereço, atividade (CNAE), regime tributário
- Modelo de contrato social em DOCX com variáveis `{{nome_empresa}}`, `{{socio_1}}`, etc.
- Caminho base de pastas configurado por cliente (`pasta_base` em `processos`)

#### Saídas
- Processo criado com 9 etapas pré-definidas, cada uma com responsável e status
- Contrato social em DOCX gerado com dados preenchidos automaticamente
- Pasta do cliente criada em `C:\Souza_Contabilidade\CLIENTES\ATIVO\{nome_empresa}\` com subpastas padrão
- Notificação a cada etapa concluída

#### Etapas do fluxo

```
ETAPAS DO PROCESSO (criadas automaticamente ao abrir processo tipo abertura_empresa):

1. Coleta de dados do cliente         → responsável: Patrícia
2. Elaboração do contrato social      → responsável: Patrícia  [agente preenche modelo]
3. Protocolo na Junta Comercial       → responsável: Patrícia
4. Solicitação de CNPJ                → responsável: Patrícia
5. Inscrição estadual                 → responsável: Patrícia
6. Inscrição municipal (alvará)       → responsável: Patrícia
7. Abertura de conta bancária PJ      → responsável: cliente
8. Cadastro no sistema contábil       → responsável: Fernanda
9. Criação da pasta no servidor       → responsável: agente  [automático]
```

#### Geração automática do contrato social
```
Gatilho: etapa 2 marcada como 'em_andamento' via PATCH /processos/:id/etapas

Agente executa:
1. Baixa modelo DOCX de MODELOS\Contratos\contrato_social_modelo.docx
2. Substitui variáveis:
   {{nome_empresa}}  → req.body.nome_empresa
   {{cnpj}}          → req.body.cnpj (se já disponível)
   {{socio_1_nome}}  → req.body.socios[0].nome
   {{socio_1_cpf}}   → req.body.socios[0].cpf
   {{socio_1_quota}} → req.body.socios[0].quota_percentual
   {{endereco}}      → req.body.endereco
   {{cnae}}          → req.body.cnae
   {{data_hoje}}     → date.today() formatado pt-BR
3. Salva em CLIENTES\ATIVO\{slug_empresa}\Contratos\contrato_social_v1.docx
4. Registra evento + notifica Patrícia
```

#### Criação automática de pasta (etapa 9)
```
Gatilho: todas as etapas 1-8 concluídas → backend emite evento pasta_criar

Agente executa:
1. Recebe pasta_base do processo (ex: C:\Souza_Contabilidade\CLIENTES\ATIVO\)
2. Cria estrutura:
   {pasta_base}\{nome_empresa_slug}\
     ├── Documentos\
     ├── Notas Fiscais\
     ├── Folha\
     ├── Declarações\
     ├── Contratos\
     └── Correspondências\
3. Registra evento: "Pasta criada para {nome_empresa}"
4. Atualiza processo: etapa 9 = concluida, processo = concluido
```

---

### Automação 5 — Obrigações Acessórias: Recibos e Rastreio de Transmissão

> **Contexto para quem não é contador:** todo mês, o escritório é obrigado por lei a enviar uma série de relatórios para o governo — Receita Federal, prefeitura, Ministério do Trabalho. Cada relatório tem um nome técnico e um prazo fixo. Quando o contador transmite um desses relatórios pelo portal do governo, o sistema gera um PDF de confirmação chamado **recibo de transmissão** — funciona como um protocolo que prova que o relatório foi entregue no prazo. Se esse recibo se perder, não tem como provar que a obrigação foi cumprida em caso de fiscalização.
>
> Tipos de relatório mensais típicos:
> - **DAS** — boleto de impostos para empresas do Simples Nacional (regime tributário simplificado para pequenas empresas)
> - **DCTF** — declaração de impostos federais (IR, PIS, COFINS, etc.)
> - **eSocial** — relatório de folha de pagamento enviado ao governo
> - **FGTS (GRF)** — guia de recolhimento do Fundo de Garantia dos funcionários
> - **SPED Fiscal** — arquivo eletrônico com todas as notas fiscais do mês
> - **ISS municipal** — imposto sobre serviços, recolhido na prefeitura

**Problema:** depois de transmitir, o portal do governo baixa o recibo com nome automático sem sentido (ex: `REC20250715123456.pdf`). Com 40 clientes e 6 relatórios por mês, são ~240 recibos/mês sem organização. Se a Fernanda falta, ninguém sabe o que foi ou não transmitido.

**Responsável:** Agente local + Backend API

#### Entradas
- PDF de recibo baixado automaticamente pelo portal do governo (e-CAC, eSocial, etc.) numa pasta local
- Pasta de saída configurada por regra no painel (onde cada portal salva os arquivos)
- Registro da obrigação no banco (`obrigacoes.id`) indicando qual relatório está pendente

#### Saídas
- Recibo renomeado de `REC20250715123456.pdf` para `recibo_dctf_2025-07_a3f2.pdf`
- Arquivo movido para `{pasta_cliente}\Declarações\2025-07\recibo_dctf_2025-07_a3f2.pdf`
- Obrigação marcada como `concluida` via `PATCH /obrigacoes/:id`
- Evento registrado: "DCTF de julho/2025 transmitida — recibo salvo"
- Notificação criada para a equipe

#### Etapas

```
AGENTE LOCAL:
1. Monitora pasta configurada (ex: C:\ReceitaFederal\Recibos\)
   → cada portal do governo tem uma pasta onde salva os downloads
   → o escritório configura essa pasta uma vez no painel

2. Detecta novo PDF (nome contém "REC", "COMPROVANTE" ou padrão configurado)

3. Identifica o tipo de relatório pelo nome do arquivo:
   - contém "DCTF"    → declaração mensal de impostos federais
   - contém "DAS"     → boleto do Simples Nacional
   - contém "SPED"    → arquivo de notas fiscais
   - contém "ESOCIAL" → relatório de folha de pagamento
   - contém "GRF"     → guia do FGTS
   - não reconhecido  → move para RECIBOS\NAO_CLASSIFICADO\ e cria alerta

4. Identifica o cliente pela pasta de origem ou por regra configurada no painel

5. Renomeia para padrão legível:
   recibo_{tipo}_{YYYY-MM}_{hash4}.pdf

6. Move para pasta do cliente:
   {pasta_base}\{cliente}\Declarações\{YYYY-MM}\

7. Atualiza o banco:
   PATCH /obrigacoes/:id { status: 'concluida', recibo_path: '...' }

8. Registra evento + cria notificação para a equipe
```

---

### Automação 6 — Notificações e Histórico de Comunicação

> **Contexto para quem não é contador:** hoje toda comunicação do escritório com os clientes acontece por WhatsApp pessoal de cada funcionário. Se o funcionário sai da empresa, o histórico some junto com o celular dele. O cliente não tem como saber o status do que pediu sem mandar mensagem. Esta automação centraliza tudo num painel.

**Problema:** histórico de comunicação disperso em WhatsApp pessoal; cliente sem visibilidade de status.

**Responsável:** Backend API + Frontend

#### Entradas
- Eventos gerados pelas outras automações (documento recebido, obrigação vencendo, processo concluído)
- Ações manuais dos funcionários no painel (marcar etapa, enviar documento)

#### Saídas
- Notificação criada em `notificacoes` com `{ cliente_id, tipo, mensagem, lida: false, criado_em }`
- Badge de não-lidas atualizado em tempo real no frontend (polling a cada 30s)
- Histórico permanente de todas as comunicações acessível por cliente

#### Tipos de notificação e mensagens padrão

```
documento_recebido   → "Documento recebido: {nome_arquivo} ({data})"
obrigacao_vencendo   → "Obrigação '{nome}' vence em {N} dia(s)"
obrigacao_vencida    → "Obrigação '{nome}' VENCIDA em {data}"
etapa_concluida      → "Etapa '{nome_etapa}' concluída no processo {tipo_processo}"
processo_concluido   → "Processo '{tipo}' concluído para {nome_cliente}"
pasta_criada         → "Pasta do cliente '{nome}' criada no servidor"
```

#### Endpoints
```
GET  /notificacoes?todas=true   → lista todas (lidas + não lidas)
GET  /notificacoes              → só não lidas (padrão)
PATCH /notificacoes/:id/lida    → marca uma como lida
```

#### Regra anti-duplicata
Antes de criar qualquer notificação, o backend verifica:
```sql
SELECT id FROM notificacoes
WHERE cliente_id = $1
  AND tipo = $2
  AND mensagem ILIKE '%' || $3 || '%'
  AND criado_em >= NOW() - INTERVAL '24 hours'
LIMIT 1;
```
Se existir resultado: não cria nova notificação.