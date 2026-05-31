# EfficienceCo — Especificação Funcional por Área

> Atualizado em 2026-05-31.

---

## João — Backend + API
**Stack:** Node.js + Express

### O que essa camada faz
Centro do sistema. Toda comunicação entre frontend, banco de dados e agente local passa aqui. Nenhuma outra parte fala diretamente com outra sem passar pelo backend.

### Funcionalidades

#### Autenticação
- Login (email + senha) → retorna JWT
- Validar token em toda requisição protegida
- Controlar permissões por perfil: `admin` e `funcionario`

#### Gestão de clientes
- CRUD de clientes (escritórios contratantes da EfficienceCo)
- Listar, editar, ativar, desativar

#### Gestão de usuários
- CRUD de usuários do escritório
- Definir perfil de acesso
- Redefinição de senha

#### Regras de automação
- CRUD de regras por cliente contábil (pasta_origem, pasta_destino, condição, ação)
- Rota para o agente buscar as regras configuradas
- Rota de versão para o agente verificar se houve mudança sem baixar tudo

#### Logs e eventos
- Receber relatórios do agente (o que foi executado, quando, sucesso ou erro)
- Expor eventos para o frontend exibir
- Suporte a paginação (limit + offset)

#### Obrigações fiscais
- CRUD de obrigações por cliente contábil (tipo, data_vencimento, recorrência, status)
- Endpoint de obrigações dos próximos N dias (para dashboard e alertas)
- Atualização de status (pendente → concluída)

#### Processos e checklists
- CRUD de processos por cliente (folha_pagamento, abertura_empresa)
- Etapas por processo com status individual
- Endpoint para o agente marcar etapas via token
- Geração automática de processos mensais de folha para clientes ativos

#### Notificações
- Geração automática de notificações (obrigação vencendo, processo atrasado, arquivo recebido)
- Endpoint para frontend listar notificações não-lidas
- Marcar como lida

### Rotas principais

| Método | Rota | O que faz |
|---|---|---|
| POST | /auth/login | Autentica usuário |
| GET | /clientes | Lista clientes contábeis |
| POST | /clientes | Cadastra cliente contábil |
| PATCH | /clientes/:id | Edita cliente contábil |
| GET | /regras | Lista regras do escritório |
| POST | /regras | Cria regra |
| PATCH | /regras/:id | Edita regra |
| DELETE | /regras/:id | Remove regra |
| GET | /regras/:clienteId | Agente busca regras (auth por token) |
| GET | /regras/:clienteId/versao | Agente verifica versão |
| POST | /eventos | Agente reporta execução |
| GET | /eventos | Frontend lista eventos |
| GET | /eventos/agente | Agente lista eventos próprios (auth por `x-licenca-token`) |
| GET | /obrigacoes | Lista obrigações |
| POST | /obrigacoes | Cria obrigação |
| PATCH | /obrigacoes/:id | Atualiza status |
| GET | /processos | Lista processos |
| POST | /processos | Cria processo |
| PATCH | /processos/:id/etapas/:etapaId | Marca etapa como concluída |
| GET | /notificacoes | Lista notificações não-lidas |
| PATCH | /notificacoes/:id/lida | Marca como lida |

---

## Gabriel — Agente Local
**Stack:** Python

### O que essa camada faz
Programa instalado no PC do escritório, roda em segundo plano, sem interface. Busca regras configuradas e executa automações nos arquivos locais.

### Funcionalidades

#### Busca e cache de configurações
- Busca regras na API após inicialização
- Cache local com TTL de 24h
- Antes de baixar as regras completas, verifica versão — só baixa se mudou
- Funciona com internet instável por curto período (usa cache)

#### Monitoramento de pastas
- Observa pastas definidas nas regras em tempo real (watchdog)
- Detecta criação de arquivos
- Dispara ação correspondente

#### Execução de automações
- **Mover arquivo:** move para pasta destino com deduplicação de nome
- **Renomear arquivo:** padrão `YYYYMMDD_HHMMSS_[nome_original]`
- **Criar estrutura de pastas:** para abertura de empresa (`CLIENTES/ATIVO/[nome]/Documentos`, `/NFs`, `/Folha`, `/Declarações`)

#### Agendamento de tarefas
- Loop de sync de regras com intervalo via `INTERVALO_SYNC_HORAS` (padrão: 1h)
- Atualiza regras em memória sem reiniciar o processo
- Relatório diário em CSV às 18h

#### Comunicação com o backend
- Reporta toda execução (incluindo erros) para a API
- Nunca trava o sistema local se API estiver fora do ar
- Metadados do evento: caminho final, tipo, tamanho do arquivo

#### Instalação
- Empacotado como `.exe` (PyInstaller)
- Inicia automaticamente com o OS

---

## Vinícius — Banco de Dados
**Stack:** PostgreSQL + Supabase

### Tabelas

| Tabela | Finalidade |
|---|---|
| `usuarios` | Funcionários do escritório com perfil e senha hash |
| `clientes` | **Escritórios contábeis** que contratam a EfficienceCo (ex: Souza & Associados) — NÃO as empresas do escritório |
| `regras` | Configurações de automação do agente (pasta_origem, pasta_destino, condição, ação) |
| `eventos` | Log de tudo que o agente executou |
| `obrigacoes` | Obrigações fiscais por cliente contábil (DAS, DCTF, SPED...) com vencimento e status |
| `processos` | Checklists de folha de pagamento, abertura de empresa — referenciados por `nome_empresa` |
| `etapas` | Etapas individuais de cada processo com status |
| `notificacoes` | Alertas internos para os funcionários do escritório |

### Responsabilidades
- Migrations versionadas — banco recriável do zero
- Seeds de desenvolvimento completos (usuários BCrypt, clientes de exemplo, regras realistas)
- Índices nas colunas mais consultadas
- RLS configurado: cada usuário vê apenas os dados do próprio escritório
- `service_role` key usada no backend (bypass de RLS server-side)

---

## Victor — Frontend
**Stack:** React + Next.js + Tailwind CSS

### Páginas

#### Dashboard principal (`/dashboard`)
- Resumo do dia: obrigações vencendo nos próximos 7 dias
- Status do processo de folha do mês atual
- Últimos 5 eventos do agente
- Contador de notificações não-lidas

#### Logs do agente (`/dashboard/logs`)
- Histórico de execuções do agente
- Filtro por sucesso/erro
- Paginação

#### Regras de automação (`/dashboard/regras`)
- CRUD completo de regras
- Ativar/desativar regra por toggle
- Formulário com origem, destino, condição e ação

#### Obrigações fiscais (`/dashboard/obrigacoes`)
- Lista com vencimento + badge de status (verde/amarelo/vermelho)
- Filtro por mês
- Marcar como concluída

#### Processos e checklists (`/dashboard/processos`)
- Processos mensais de folha com progresso de etapas
- Processos de abertura de empresa com responsável
- Marcar etapas como concluídas

#### Comunicação e notificações (`/dashboard/comunicacao`)
- Histórico de notificações do escritório
- Marcar como lida individual ou em massa
- Indicador de não-lidas no header

#### Usuários (`/dashboard/usuarios`)
- Gerenciar funcionários do escritório
- Criar, editar, remover

#### Admin (`/admin`)
- Visão geral do escritório
- Gerenciar clientes contábeis
- Logs globais

### UX
- Interface sem jargão técnico — usuário final é contador
- Responsivo
- Feedback visual em toda ação (loading, salvo, erro)
- Erros da API tratados com mensagem clara

---

## Como as áreas se conectam

```
[Victor — Frontend]
        ↓ requisições HTTP (JWT)
[João — Backend + API]
        ↓ queries SQL
[Vinícius — Banco de dados]

[Gabriel — Agente local]
        ↓ busca regras + reporta eventos (auth por service token)
[João — Backend + API]
        ↓ lê/salva
[Vinícius — Banco de dados]
```
