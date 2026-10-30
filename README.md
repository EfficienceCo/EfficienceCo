# Efficience Co

> 🇬🇧 English version: [README.en.md](README.en.md)

> Software sob medida para escritórios. Menos retrabalho, mais resultado.

---

## 📌 Sobre o Projeto

A **Efficience Co** desenvolve sistemas personalizados para escritórios de contabilidade, administração e gestão — automatizando processos manuais, eliminando retrabalho e aumentando a eficiência operacional de ponta a ponta.

O modelo é simples: entramos no escritório, mapeamos como tudo funciona, e entregamos um software que resolve os gargalos reais do dia a dia. Cobramos uma mensalidade pela licença e manutenção contínua.

---

## 🗂️ Estrutura do Repositório

```
efficience-co/
│
├── README.md
├── .gitignore
├── .env.example
├── setup.py                        # Gera toda a estrutura do projeto automaticamente
│
├── docs/                           # Documentação geral
│   ├── arquitetura.md
│   ├── divisao-time.md
│   ├── especificacao-funcional.md
│   └── decisoes-tecnicas.md
│
├── backend/                        # João — API + Pagamento (Node.js + Express)
│   ├── src/
│   │   ├── routes/
│   │   ├── controllers/
│   │   ├── middlewares/
│   │   ├── services/
│   │   └── config/
│   └── tests/
│
├── frontend/                       # Victor — Interface (React + Next.js)
│   └── src/
│       ├── app/
│       ├── components/
│       ├── hooks/
│       ├── services/
│       └── context/
│
├── agente/                         # Gabriel — Agente local (Python)
│   ├── core/
│   ├── automacoes/
│   ├── comunicacao/
│   └── build/
│
└── database/                       # Vinícius — Banco de dados (PostgreSQL + Supabase)
    ├── migrations/
    └── seeds/
```

---

## 🛠️ Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Frontend | React + Next.js |
| Backend / API | Node.js + Express |
| Banco de dados | PostgreSQL via Supabase |
| Agente local | Python |
| Pagamento / Licença | Stripe |
| Deploy frontend | Vercel |
| Deploy backend | Railway |

---

## 👥 Time

| Quem | Área | Tecnologia |
|---|---|---|
| João | Backend + Licença + Pagamento | Node.js + Express + Stripe |
| Gabriel | Agente local | Python |
| Vinícius | Banco de dados | PostgreSQL + Supabase |
| Victor | Frontend | React + Next.js |

---

## 🏗️ Arquitetura

O sistema é híbrido: parte roda na nuvem, parte roda na máquina do cliente.

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

- **Frontend + Backend** — hospedados na nuvem (Vercel + Railway)
- **Agente local** — instalado na máquina do cliente, roda em segundo plano, sem interface
- **Licença** — o agente valida o token na API a cada 24h. Se o pagamento falhar, a licença é desativada automaticamente e o agente para de funcionar

---

## 🚀 Como Rodar Localmente

```bash
# 1. Clone o repositório
git clone https://github.com/seu-usuario/efficience-co.git
cd efficience-co

# 2. Gere a estrutura de arquivos (apenas na primeira vez)
python setup.py

# 3. Backend
cd backend
cp .env.example .env
npm install
npm run dev

# 4. Frontend
cd ../frontend
cp .env.example .env
npm install
npm run dev

# 5. Agente local
cd ../agente
cp .env.example .env
pip install -r requirements.txt
python main.py
```

---

## Testes automatizados

Execute os comandos a partir da raiz do repositório. O executor cria um Supabase
local descartável com as migrations de `database/migrations`, roda os testes e
remove o projeto temporário ao terminar, falhar ou receber Ctrl+C.

### Preparar o ambiente

Tenha Node.js 24, Python 3 e Docker com o servidor em execução. No Windows, abra
o Docker Desktop e confira se `docker version` mostra **Client** e **Server**.
A validação local de 30/10/2026 usou Node 24.20.0, Python 3.14.7, Docker 29.9.2
e Supabase CLI 2.122.0. A CLI é instalada pelo lockfile da raiz.

No PowerShell:

```powershell
npm ci
npm --prefix backend ci
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r agente\worker\requirements.txt
```

Em Linux, crie o ambiente Python com `python3 -m venv .venv` e instale as
dependências com `.venv/bin/python -m pip install -r agente/worker/requirements.txt`.
Os dois comandos npm de instalação são os mesmos. A execução em Linux/CI ainda
precisa de validação; o workflow será tratado na issue #681.

### Executar

```powershell
# Confere o banco real: migrations, inserção, leitura e remoção de um cliente sintético
npm run test:smoke

# Roda todos os testes automáticos do backend e do agente Python
npm test

# Confira imediatamente o código de saída no PowerShell
$LASTEXITCODE
```

Se a política do PowerShell bloquear `npm.ps1`, use `npm.cmd` nos mesmos comandos.
O modo smoke não precisa do ambiente Python. Na primeira execução, o Docker
baixa as imagens do Supabase e pode demorar mais.

Não é necessário configurar credenciais do Supabase hospedado. O executor obtém
a URL e a chave do projeto local que acabou de criar. Ele recusa as variáveis
`SUPABASE_URL`, `DATABASE_URL`, `TEST_SUPABASE_URL` e `TEST_SUPABASE_SERVICE_KEY`
herdadas do terminal; remova essas configurações do terminal de testes antes
de executar. A API usa a porta 55321 e o PostgreSQL usa 55322 com a configuração
atual da CLI; o executor verifica todas as portas geradas antes de subir o banco.

O código de saída é `0` no sucesso, `1` em falha e `130` na interrupção por Ctrl+C
quando a limpeza termina corretamente. O executor remove os containers, volumes
e a pasta `.test-runtime/678-<UUID>` de sua própria execução. Se a limpeza falhar,
ele retorna erro e informa o projeto e a configuração preservados para diagnóstico.
Temporários e cache do pytest também ficam nessa pasta exclusiva.

### Adicionar testes e entender o escopo

- **Backend:** crie arquivos `*.test.js` em `backend/tests/`, inclusive em
  subpastas. O executor os descobre sem editar uma lista. Para testar o banco
  real, consulte [`banco-real.test.js`](backend/tests/infra/banco-real.test.js).
- **Agente:** coloque testes no padrão `test_*.py` em `agente/worker/tests/`.
  Eles são descobertos pelo pytest.
- **Exceção manual:** `backend/tests/integration/esocial-gov.producao-restrita.test.js`
  acessa um serviço governamental e não participa do comando automático.
- **Outros escopos:** os scripts SQL de `database/tests`, testes do launcher Go
  e testes do frontend ainda não são executados por este comando.

O teste de infraestrutura usa a chave administrativa local. Testes de perfil,
autenticação e isolamento entre escritórios precisam de cenários próprios;
as suítes antigas com mocks ainda serão reformadas nas respectivas issues.

Em 30/10/2026, o comando completo passou com 101 migrations, 998 testes do backend
e 271 testes do agente (1 skip), em 103,7 segundos, com imagens já disponíveis.
As migrations 50/75/76 desta branch corrigem dependências que impediam o replay
desde um banco vazio. O tempo da primeira execução com download ainda não foi medido.
Também foram conferidas falhas deliberadas de teste no backend e no agente,
falha de migration, recusa de URL externa e limpeza após Ctrl+C no Windows.
O usuário confirmou saída 1 na falha proposital do Python e saída 0 ao repetir
o comando completo após remover esse arquivo temporário.
Também foi verificada a recusa da porta 55321 ocupada: saída 1, antes de iniciar
o Supabase, sem deixar a pasta temporária. Em clone local separado dos commits
`caaeead` e `f596985`, o usuário informou sucesso seguindo a instalação do README.
Foram conferidos o status Git limpo, a existência do novo `.venv` e a ausência de
`.test-runtime`; o log e o tempo dessa rodada não foram apresentados.

Antes de concluir a #678, ainda faltam a execução no ambiente de CI e a recuperação ou
confirmação dos arquivos históricos `apuracoes-ids-invalidos-http.test.js` e
`apuracoes-fs12-prolabore.test.js`, ausentes neste checkout. O arquivo
`auth.test.js` existente é um placeholder e não comprova cobertura de autenticação.

---

## 📋 Fluxo de Trabalho

1. **Mapeamento** — Levantamento de processos com o cliente
2. **Documentação funcional** — O que o sistema deve fazer
3. **Prototipação** — Fluxos e telas no Figma
4. **Desenvolvimento** — Sprints iterativas com entregas parciais
5. **Homologação** — Validação com o cliente antes do deploy
6. **Deploy & Manutenção** — Entrega em produção + suporte contínuo

---

## 🌿 Regras de Git

- Nunca commitar direto na branch `main`
- Cada membro trabalha na própria branch:
  - `joao/backend`
  - `gabriel/agente`
  - `vinicius/database`
  - `victor/frontend`
- Abrir Pull Request pra `main` quando uma funcionalidade estiver pronta
- João revisa todos os PRs antes de aprovar

---

## 🔒 Segurança & Compliance

- Dados tratados conforme a **LGPD**
- Autenticação via JWT com controle de permissões por perfil
- Backups automáticos configurados via Supabase
- Variáveis sensíveis nunca versionadas (usar `.env`)
- Row Level Security (RLS) no banco — cada cliente só acessa os próprios dados

---

## 📄 Licença

Repositório privado. Todos os direitos reservados © Efficience Co.

