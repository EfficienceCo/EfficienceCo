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