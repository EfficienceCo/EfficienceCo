# Efficience Co — Especificação Funcional por Área

---

## João — Backend + API + Pagamento
**Stack:** Node.js + Express + Stripe

### O que essa camada faz
É o centro do sistema. Toda comunicação entre frontend, banco de dados, agente local e pagamento passa por aqui. Nenhuma outra parte do sistema fala diretamente com outra sem passar pelo backend.

### Funcionalidades

#### Autenticação
- Receber login (email + senha) e retornar um token JWT
- Validar o token em toda requisição protegida
- Controlar permissões por perfil (admin da Efficience, admin do cliente, funcionário)

#### Gestão de clientes
- Cadastrar um novo cliente (escritório)
- Listar, editar e desativar clientes
- Associar usuários a um cliente específico

#### Gestão de usuários
- Cadastrar usuários dentro de um cliente
- Definir nível de acesso de cada usuário
- Redefinição de senha

#### Licença
- Gerar um token de licença único por cliente
- Ativar e desativar licença manualmente
- Expor uma rota pública que o agente local bate pra validar se a licença está ativa
- Registrar data de validade da licença

#### Pagamento (Stripe)
- Criar assinatura mensal por cliente
- Receber webhook do Stripe confirmando pagamento
- Ao confirmar pagamento, renovar automaticamente a licença do cliente
- Ao falhar pagamento, desativar licença automaticamente

#### Regras e configurações por cliente
- Salvar as configurações de automação de cada cliente (quais pastas monitorar, quais regras aplicar)
- Expor essas configurações pra o agente local buscar

#### Logs e eventos
- Receber relatórios do agente local (o que foi executado, quando, com sucesso ou erro)
- Salvar esses eventos no banco
- Expor esses eventos pro frontend exibir

### Rotas principais da API
| Método | Rota | O que faz |
|---|---|---|
| POST | /auth/login | Autentica usuário |
| GET | /licenca/validar | Agente local valida token |
| GET | /regras/:clienteId | Agente busca configurações |
| POST | /eventos | Agente reporta execução |
| POST | /webhook/stripe | Stripe confirma pagamento |
| GET | /clientes | Lista clientes (admin) |
| POST | /clientes | Cadastra novo cliente |

---

## Gabriel — Agente Local
**Stack:** Python

### O que essa camada faz
Um programa instalado na máquina do cliente que roda em segundo plano, invisível. Ele não tem interface. Ele valida a licença, busca as regras configuradas e executa as automações no computador do cliente.

### Funcionalidades

#### Validação de licença
- Ao iniciar, bater na API do João pra verificar se o token de licença está ativo
- Se inativo, parar de funcionar e registrar o motivo
- Repetir essa validação periodicamente (ex: a cada 24h)

#### Busca de configurações
- Após validar licença, buscar na API as regras configuradas pra aquele cliente
- Armazenar localmente em cache pra funcionar mesmo com instabilidade de internet por curto período

#### Monitoramento de pastas
- Observar pastas definidas nas configurações em tempo real
- Detectar quando um arquivo novo é criado, modificado ou deletado
- Disparar a ação correspondente quando um evento ocorre

#### Execução de automações
- Mover ou copiar arquivos seguindo regras (ex: "PDF com nome X vai pra pasta Y")
- Renomear arquivos seguindo padrões definidos
- Organizar arquivos por data, tipo ou nome automaticamente

#### Agendamento de tarefas
- Rodar tarefas em horários definidos (ex: "todo dia às 18h, compactar os arquivos da pasta Z")
- Gerar relatórios simples de atividade em texto ou CSV

#### Comunicação com o backend
- Após executar qualquer automação, reportar pra API o que foi feito
- Reportar erros e falhas também
- Nunca travar o sistema local se a API estiver fora do ar

#### Instalação
- Ser empacotado como um executável (.exe no Windows) que o cliente instala uma vez
- Iniciar automaticamente junto com o sistema operacional
- Se atualizar automaticamente quando houver nova versão disponível no servidor

---

## Vinícius — Banco de Dados
**Stack:** PostgreSQL + Supabase

### O que essa camada faz
Armazena todos os dados do sistema de forma organizada e segura. Nenhum dado some, nenhum dado vaza pra quem não deveria ver.

### Funcionalidades

#### Modelagem das tabelas principais
- **clientes** — cada escritório cadastrado (nome, CNPJ, plano, status)
- **usuarios** — funcionários de cada cliente + admins da Efficience
- **licencas** — token, validade, status ativo/inativo, vinculado ao cliente
- **regras** — configurações de automação por cliente (pasta origem, pasta destino, condição)
- **eventos** — log de tudo que o agente local executou (o quê, quando, sucesso ou erro)
- **pagamentos** — histórico de cobranças por cliente

#### Relacionamentos
- Um cliente tem muitos usuários
- Um cliente tem uma licença ativa
- Um cliente tem muitas regras
- Um cliente tem muitos eventos
- Um cliente tem muitos pagamentos

#### Segurança dos dados (RLS no Supabase)
- Garantir que um cliente nunca veja dados de outro cliente
- Apenas admins da Efficience têm visão global de todos os clientes
- Cada usuário só acessa o que o seu perfil permite

#### Migrations
- Versionar toda mudança no banco (nunca alterar tabela na mão)
- Garantir que qualquer membro do time consiga recriar o banco do zero com um comando

#### Performance
- Criar índices nas colunas mais consultadas (ex: token de licença, id do cliente)
- Garantir que queries de log não travem o sistema quando a tabela de eventos crescer

#### Backup
- Configurar backup automático pelo Supabase
- Definir política de retenção de dados (quanto tempo guardar logs antigos)

---

## Victor — Frontend
**Stack:** React + Next.js + Tailwind CSS

### O que essa camada faz
É tudo que o usuário vê e toca. Tem duas faces: o painel do cliente (funcionários do escritório) e o painel admin (João gerenciando todos os clientes).

### Funcionalidades

#### Autenticação
- Tela de login com email e senha
- Guardar token JWT após login
- Redirecionar pra área correta conforme o perfil do usuário
- Tela de esqueci minha senha

#### Painel do cliente (funcionários do escritório)
- Dashboard inicial com resumo de atividades recentes
- Visualizar logs do agente local (o que foi executado, quando)
- Configurar regras de automação (quais pastas monitorar, quais ações executar)
- Gerenciar usuários da própria empresa (cadastrar, editar, remover)
- Ver status da licença (ativa, vencendo, inativa)

#### Painel admin (João — visão global)
- Listar todos os clientes cadastrados
- Ativar, desativar ou editar qualquer cliente
- Ver status de pagamento de cada cliente
- Gerar ou revogar token de licença manualmente
- Ver logs globais de todos os agentes

#### UX e usabilidade
- Interface simples, sem jargão técnico — o usuário final é um contador, não um dev
- Responsivo (funcionar bem em telas menores)
- Mensagens de erro claras quando algo dá errado
- Feedback visual em toda ação (carregando, salvo, erro)

#### Comunicação com o backend
- Toda requisição usa o token JWT no header
- Tratar erros da API (token expirado, sem permissão, servidor fora do ar)
- Nunca expor dados sensíveis no frontend

---

## Como as áreas se conectam

```
[Victor — Frontend]
        ↓ requisições HTTP (JWT)
[João — Backend + API]
        ↓ queries SQL
[Vinícius — Banco de dados]

[Gabriel — Agente local]
        ↓ valida licença + busca regras + reporta eventos
[João — Backend + API]
        ↓ lê/salva
[Vinícius — Banco de dados]
```

> **Primeira tarefa do time:** João e Vinícius sentam juntos e definem as tabelas principais antes de qualquer um começar a codar. Sem isso, ninguém consegue avançar com segurança.