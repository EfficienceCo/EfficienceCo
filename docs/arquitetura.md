# Efficience Co — Estrutura do Repositório

```
efficience-co/
│
├── README.md                          # Visão geral do projeto
├── .gitignore                         # Arquivos ignorados pelo Git
├── .env.example                       # Variáveis de ambiente (modelo)
│
├── docs/                              # Documentação geral
│   ├── arquitetura.md                 # Diagrama e explicação da arquitetura
│   ├── divisao-time.md                # Responsabilidades de cada membro
│   ├── especificacao-funcional.md     # O que cada área deve fazer
│   └── decisoes-tecnicas.md           # Por que escolhemos cada tecnologia
│
│
├── backend/                           # João — API + Pagamento
│   ├── package.json
│   ├── .env.example
│   ├── src/
│   │   ├── server.js                  # Ponto de entrada da aplicação
│   │   ├── app.js                     # Configuração do Express
│   │   │
│   │   ├── routes/                    # Definição das rotas
│   │   │   ├── auth.routes.js
│   │   │   ├── clientes.routes.js
│   │   │   ├── usuarios.routes.js
│   │   │   ├── licenca.routes.js
│   │   │   ├── regras.routes.js
│   │   │   ├── eventos.routes.js
│   │   │   └── webhook.routes.js
│   │   │
│   │   ├── controllers/               # Lógica de cada rota
│   │   │   ├── auth.controller.js
│   │   │   ├── clientes.controller.js
│   │   │   ├── usuarios.controller.js
│   │   │   ├── licenca.controller.js
│   │   │   ├── regras.controller.js
│   │   │   ├── eventos.controller.js
│   │   │   └── webhook.controller.js
│   │   │
│   │   ├── middlewares/               # Funções intermediárias
│   │   │   ├── auth.middleware.js     # Valida JWT em rotas protegidas
│   │   │   └── permissao.middleware.js # Controla acesso por perfil
│   │   │
│   │   ├── services/                  # Regras de negócio
│   │   │   ├── auth.service.js
│   │   │   ├── licenca.service.js
│   │   │   └── stripe.service.js
│   │   │
│   │   └── config/                    # Configurações gerais
│   │       ├── database.js            # Conexão com Supabase
│   │       └── stripe.js              # Configuração do Stripe
│   │
│   └── tests/                         # Testes do backend
│       └── auth.test.js
│
│
├── frontend/                          # Victor — Interface do usuário
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.js
│   ├── .env.example
│   │
│   ├── public/                        # Arquivos estáticos
│   │   └── logo.svg
│   │
│   └── src/
│       ├── app/                       # Páginas (Next.js App Router)
│       │   ├── page.jsx               # Página inicial / login
│       │   ├── layout.jsx             # Layout global
│       │   │
│       │   ├── dashboard/             # Painel do cliente
│       │   │   ├── page.jsx           # Dashboard principal
│       │   │   ├── regras/
│       │   │   │   └── page.jsx       # Configurar automações
│       │   │   ├── logs/
│       │   │   │   └── page.jsx       # Ver logs do agente
│       │   │   └── usuarios/
│       │   │       └── page.jsx       # Gerenciar usuários
│       │   │
│       │   └── admin/                 # Painel da Efficience (João)
│       │       ├── page.jsx           # Visão geral de todos os clientes
│       │       ├── clientes/
│       │       │   └── page.jsx       # Gerenciar clientes
│       │       └── licencas/
│       │           └── page.jsx       # Gerenciar licenças
│       │
│       ├── components/                # Componentes reutilizáveis
│       │   ├── ui/
│       │   │   ├── Button.jsx
│       │   │   ├── Input.jsx
│       │   │   ├── Modal.jsx
│       │   │   └── Table.jsx
│       │   ├── layout/
│       │   │   ├── Sidebar.jsx
│       │   │   └── Header.jsx
│       │   └── dashboard/
│       │       ├── LogCard.jsx
│       │       └── StatusLicenca.jsx
│       │
│       ├── hooks/                     # Hooks customizados
│       │   ├── useAuth.js
│       │   └── useApi.js
│       │
│       ├── services/                  # Comunicação com a API
│       │   ├── api.js                 # Configuração base do Axios
│       │   ├── auth.service.js
│       │   ├── clientes.service.js
│       │   └── regras.service.js
│       │
│       └── context/                   # Estado global
│           └── AuthContext.jsx
│
│
├── agente/                            # Gabriel — Agente local (Python)
│   ├── requirements.txt               # Dependências Python
│   ├── .env.example
│   ├── main.py                        # Ponto de entrada do agente
│   │
│   ├── core/                          # Núcleo do agente
│   │   ├── licenca.py                 # Validação de token com a API
│   │   ├── configuracao.py            # Busca e cache das regras
│   │   └── agendador.py               # Controle de tarefas periódicas
│   │
│   ├── automacoes/                    # Ações executadas pelo agente
│   │   ├── monitorar_pasta.py         # Watchdog — detecta mudanças
│   │   ├── mover_arquivo.py           # Move/copia arquivos por regra
│   │   ├── renomear_arquivo.py        # Renomeia seguindo padrões
│   │   └── gerar_relatorio.py         # Gera relatório de atividade
│   │
│   ├── comunicacao/                   # Fala com o backend
│   │   ├── api_client.py              # Requisições HTTP pra API do João
│   │   └── reportar_evento.py         # Envia logs de execução
│   │
│   └── build/                         # Geração do executável
│       └── build.sh                   # Script pra gerar o .exe com PyInstaller
│
│
└── database/                          # Vinícius — Banco de dados
    ├── README.md                      # Como rodar as migrations
    │
    ├── migrations/                    # Versionamento do banco
    │   ├── 001_criar_clientes.sql
    │   ├── 002_criar_usuarios.sql
    │   ├── 003_criar_licencas.sql
    │   ├── 004_criar_regras.sql
    │   └── 005_criar_eventos.sql
    │
    ├── seeds/                         # Dados iniciais pra desenvolvimento
    │   ├── clientes.sql
    │   └── usuarios.sql
    │
    └── schema.sql                     # Schema completo do banco (gerado)
```

---

## Como clonar e começar

```bash
git clone https://github.com/seu-usuario/efficience-co.git
cd efficience-co

# Backend
cd backend && cp .env.example .env && npm install

# Frontend
cd ../frontend && cp .env.example .env && npm install

# Agente
cd ../agente && cp .env.example .env && pip install -r requirements.txt
```

---

## Regras de Git para o time

- Nunca commitar direto na branch `main`
- Cada membro trabalha na própria branch: `joao/backend`, `gabriel/agente`, `vinicius/database`, `victor/frontend`
- Abrir Pull Request pra `main` quando uma funcionalidade estiver pronta
- João revisa todos os PRs antes de aprovar