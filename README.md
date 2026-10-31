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

### Helpers HTTP e cenários — #679

Os helpers em `backend/tests/helpers/` permitem preparar dados no banco
descartável e chamar as rotas reais com JWT do usuário criado. Use `npm test`
na raiz: o executor fornece o destino local e o segredo de teste.

Exemplo copiável para um arquivo `*.test.js` em `backend/tests/infra/`:

```js
import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { criarCenarioBanco, resetarBanco } from "../helpers/banco.js";
import { iniciarApiTeste } from "../helpers/http.js";

beforeEach(resetarBanco);
afterEach(resetarBanco);

test("funcionário de B só é visível ao cliente permitido", async t => {
  const cenario = criarCenarioBanco();
  let api;
  t.after(() => api?.fechar());
  const clienteA = await cenario.criarCliente({ nome: "Cliente A sintético" });
  const clienteB = await cenario.criarCliente({ nome: "Cliente B sintético" });
  const usuarioA = await cenario.criarUsuario({ clienteId: clienteA.id });
  const usuarioB = await cenario.criarUsuario({ clienteId: clienteB.id });
  const funcionarioB = await cenario.criarFuncionario({ clienteId: clienteB.id });
  api = await iniciarApiTeste();
  const caminho = `/funcionarios/${funcionarioB.id}`;
  assert.equal((await api.requisitar(caminho, { usuario: usuarioB })).status, 200);
  assert.equal((await api.requisitar(caminho, { usuario: usuarioA })).status, 404);
  assert.equal((await api.requisitar(caminho)).status, 401);
});
```

`criarUsuario` aceita `perfil` com os valores de `src/config/perfis.js`;
o padrão é `admin_cliente`. `criarCenarioBanco` guarda os IDs inseridos e
`limpar` remove somente esses registros, preservando os seeds das migrations.
`iniciarApiTeste` abre `app.js` em porta local livre e devolve `requisitar` e
`fechar`. Cada requisição recebe sua própria autenticação.

O cenário completo, incluindo conteúdo da resposta e confirmação da remoção,
está em [`helpers-http.test.js`](backend/tests/infra/helpers-http.test.js).
Para começar cada teste sem dados, use `beforeEach(resetarBanco)` e
`afterEach(resetarBanco)`. O reset limpa as tabelas da aplicação em `public`,
inclusive seeds e registros criados pelas rotas, e preserva a estrutura.
Depois do reset, crie um novo cenário e seus dados. Esse modo exige testes em
série, como já faz o executor da raiz.

O preparador acrescenta `backend/tests/helpers/resetar-banco.sql` somente ao
projeto Supabase temporário, após as migrations da aplicação. A função de reset
é restrita à chave administrativa local; o helper valida o destino antes da
chamada. O SQL de suporte não faz parte das migrations de desenvolvimento/produção.

As provas em `helpers-isolamento.test.js` conferem limpeza sem afetar outro
cenário, reset de registros criados por HTTP, autenticação nova, os três perfis,
recusa de destino indevido e negação do reset com chave anon.

### Modo seguro de serviços externos — #679

`backend/tests/setup-env.js` instala a proteção antes de carregar os testes:
intercepta `fetch`, HTTP/HTTPS e conexões TCP. Bloqueia destinos externos e SMTP,
incluindo os transportes SOAP usados pelo eSocial. Caminhos `/storage/v1` são
barrados também no Supabase local; HTTP local e o REST do banco descartável
continuam disponíveis. O bloqueio não depende de resolver o domínio externo.

Cada tentativa gera um registro com serviço, transporte, método e destino,
sem query string, credenciais, corpo ou cabeçalhos. Exemplo copiável de teste
que verifica intencionalmente uma tentativa bloqueada:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { consumirTentativas } from "../helpers/servicos-externos.js";

test("não transmite ao eSocial", async () => {
  await assert.rejects(
    fetch("https://esocial.example.invalid/enviar"),
    /Serviço externo bloqueado: eSocial/,
  );
  const tentativas = consumirTentativas();
  assert.equal(tentativas.length, 1);
  assert.equal(tentativas[0].servico, "eSocial");
});
```

`lerTentativas()` devolve uma cópia do registro; `consumirTentativas()` devolve
e remove as tentativas verificadas pelo teste. Uma tentativa não consumida faz
o `afterEach` falhar, mesmo que o código tenha capturado o erro ou o SDK retorne
`{ error }`. O registro é limpo também nesse caso para o cenário seguinte.

As provas em `servicos-externos.test.js` usam destinos fictícios, DNS externo
indisponível e um servidor local que confirma não receber acesso ao storage.
A proteção descrita atua nos processos Node que carregam `setup-env.js`; os
processos Python e a CLI têm execução separada. Para executar sem internet,
instale dependências e baixe imagens Docker previamente.

A exceção de rede para a integração governamental manual exige tanto
`ESOCIAL_GOV_INTEGRATION=1` quanto o arquivo manual específico. A flag isolada
não libera rede nos demais testes. Esse arquivo segue fora do executor automático;
seu funcionamento completo não foi validado nesta etapa.

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

