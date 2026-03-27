import os

BASE = os.path.dirname(os.path.abspath(__file__))

estrutura = {
    "README.md": "# Efficience Co\n\n> Software sob medida para escritórios. Menos retrabalho, mais resultado.\n",
    ".gitignore": "node_modules/\n.env\n__pycache__/\n*.pyc\n.DS_Store\ndist/\nbuild/\n.next/\n",
    ".env.example": "# Copie este arquivo para .env e preencha os valores\n",

    "docs/arquitetura.md": "# Arquitetura do Sistema\n\n> A definir\n",
    "docs/divisao-time.md": "# Divisão do Time\n\n> A definir\n",
    "docs/especificacao-funcional.md": "# Especificação Funcional\n\n> A definir\n",
    "docs/decisoes-tecnicas.md": "# Decisões Técnicas\n\n> A definir\n",

    # BACKEND — João
    "backend/package.json": '{\n  "name": "efficience-backend",\n  "version": "1.0.0",\n  "main": "src/server.js",\n  "scripts": {\n    "start": "node src/server.js",\n    "dev": "nodemon src/server.js"\n  },\n  "dependencies": {\n    "express": "^4.18.2",\n    "jsonwebtoken": "^9.0.0",\n    "dotenv": "^16.0.3",\n    "stripe": "^12.0.0",\n    "@supabase/supabase-js": "^2.0.0"\n  },\n  "devDependencies": {\n    "nodemon": "^2.0.22"\n  }\n}\n',
    "backend/.env.example": "PORT=3001\nJWT_SECRET=\nSUPABASE_URL=\nSUPABASE_KEY=\nSTRIPE_SECRET_KEY=\nSTRIPE_WEBHOOK_SECRET=\n",
    "backend/src/server.js": "const app = require('./app');\nconst PORT = process.env.PORT || 3001;\n\napp.listen(PORT, () => {\n  console.log(`Servidor rodando na porta ${PORT}`);\n});\n",
    "backend/src/app.js": "require('dotenv').config();\nconst express = require('express');\nconst app = express();\n\napp.use(express.json());\n\n// Rotas\n// app.use('/auth', require('./routes/auth.routes'));\n// app.use('/clientes', require('./routes/clientes.routes'));\n// app.use('/licenca', require('./routes/licenca.routes'));\n// app.use('/regras', require('./routes/regras.routes'));\n// app.use('/eventos', require('./routes/eventos.routes'));\n// app.use('/webhook', require('./routes/webhook.routes'));\n\nmodule.exports = app;\n",

    "backend/src/routes/auth.routes.js": "const express = require('express');\nconst router = express.Router();\n\n// POST /auth/login\nrouter.post('/login', (req, res) => {\n  res.json({ message: 'rota de login — a implementar' });\n});\n\nmodule.exports = router;\n",
    "backend/src/routes/clientes.routes.js": "const express = require('express');\nconst router = express.Router();\n\nrouter.get('/', (req, res) => res.json({ message: 'listar clientes — a implementar' }));\nrouter.post('/', (req, res) => res.json({ message: 'criar cliente — a implementar' }));\n\nmodule.exports = router;\n",
    "backend/src/routes/usuarios.routes.js": "const express = require('express');\nconst router = express.Router();\n\nrouter.get('/', (req, res) => res.json({ message: 'listar usuários — a implementar' }));\n\nmodule.exports = router;\n",
    "backend/src/routes/licenca.routes.js": "const express = require('express');\nconst router = express.Router();\n\n// GET /licenca/validar — chamado pelo agente local\nrouter.get('/validar', (req, res) => {\n  res.json({ ativa: false, message: 'validação de licença — a implementar' });\n});\n\nmodule.exports = router;\n",
    "backend/src/routes/regras.routes.js": "const express = require('express');\nconst router = express.Router();\n\nrouter.get('/:clienteId', (req, res) => res.json({ message: 'buscar regras — a implementar' }));\n\nmodule.exports = router;\n",
    "backend/src/routes/eventos.routes.js": "const express = require('express');\nconst router = express.Router();\n\nrouter.post('/', (req, res) => res.json({ message: 'registrar evento — a implementar' }));\n\nmodule.exports = router;\n",
    "backend/src/routes/webhook.routes.js": "const express = require('express');\nconst router = express.Router();\n\n// POST /webhook/stripe\nrouter.post('/stripe', (req, res) => {\n  res.json({ message: 'webhook stripe — a implementar' });\n});\n\nmodule.exports = router;\n",

    "backend/src/controllers/auth.controller.js": "// Lógica de autenticação\n",
    "backend/src/controllers/clientes.controller.js": "// Lógica de clientes\n",
    "backend/src/controllers/usuarios.controller.js": "// Lógica de usuários\n",
    "backend/src/controllers/licenca.controller.js": "// Lógica de licença\n",
    "backend/src/controllers/regras.controller.js": "// Lógica de regras\n",
    "backend/src/controllers/eventos.controller.js": "// Lógica de eventos\n",
    "backend/src/controllers/webhook.controller.js": "// Lógica de webhook Stripe\n",

    "backend/src/middlewares/auth.middleware.js": "// Valida JWT em rotas protegidas\n",
    "backend/src/middlewares/permissao.middleware.js": "// Controla acesso por perfil de usuário\n",

    "backend/src/services/auth.service.js": "// Regras de negócio de autenticação\n",
    "backend/src/services/licenca.service.js": "// Regras de negócio de licença\n",
    "backend/src/services/stripe.service.js": "// Integração com Stripe\n",

    "backend/src/config/database.js": "// Conexão com Supabase\n",
    "backend/src/config/stripe.js": "// Configuração do Stripe\n",

    "backend/tests/auth.test.js": "// Testes de autenticação\n",

    # FRONTEND — Victor
    "frontend/package.json": '{\n  "name": "efficience-frontend",\n  "version": "1.0.0",\n  "scripts": {\n    "dev": "next dev",\n    "build": "next build",\n    "start": "next start"\n  },\n  "dependencies": {\n    "next": "^14.0.0",\n    "react": "^18.0.0",\n    "react-dom": "^18.0.0",\n    "axios": "^1.4.0"\n  },\n  "devDependencies": {\n    "tailwindcss": "^3.3.0",\n    "autoprefixer": "^10.4.14",\n    "postcss": "^8.4.24"\n  }\n}\n',
    "frontend/next.config.js": "/** @type {import('next').NextConfig} */\nconst nextConfig = {};\nmodule.exports = nextConfig;\n",
    "frontend/tailwind.config.js": "/** @type {import('tailwindcss').Config} */\nmodule.exports = {\n  content: ['./src/**/*.{js,jsx,ts,tsx}'],\n  theme: { extend: {} },\n  plugins: [],\n};\n",
    "frontend/.env.example": "NEXT_PUBLIC_API_URL=http://localhost:3001\n",
    "frontend/public/logo.svg": "<!-- Logo da Efficience Co -->\n",

    "frontend/src/app/page.jsx": "export default function Home() {\n  return (\n    <main>\n      <h1>Efficience Co</h1>\n      <p>Página de login — a implementar</p>\n    </main>\n  );\n}\n",
    "frontend/src/app/layout.jsx": "export const metadata = { title: 'Efficience Co' };\n\nexport default function RootLayout({ children }) {\n  return (\n    <html lang=\"pt-BR\">\n      <body>{children}</body>\n    </html>\n  );\n}\n",

    "frontend/src/app/dashboard/page.jsx": "export default function Dashboard() {\n  return <h1>Dashboard — a implementar</h1>;\n}\n",
    "frontend/src/app/dashboard/regras/page.jsx": "export default function Regras() {\n  return <h1>Configurar Automações — a implementar</h1>;\n}\n",
    "frontend/src/app/dashboard/logs/page.jsx": "export default function Logs() {\n  return <h1>Logs do Agente — a implementar</h1>;\n}\n",
    "frontend/src/app/dashboard/usuarios/page.jsx": "export default function Usuarios() {\n  return <h1>Gerenciar Usuários — a implementar</h1>;\n}\n",

    "frontend/src/app/admin/page.jsx": "export default function Admin() {\n  return <h1>Painel Admin — a implementar</h1>;\n}\n",
    "frontend/src/app/admin/clientes/page.jsx": "export default function Clientes() {\n  return <h1>Gerenciar Clientes — a implementar</h1>;\n}\n",
    "frontend/src/app/admin/licencas/page.jsx": "export default function Licencas() {\n  return <h1>Gerenciar Licenças — a implementar</h1>;\n}\n",

    "frontend/src/components/ui/Button.jsx": "export default function Button({ children, ...props }) {\n  return <button {...props}>{children}</button>;\n}\n",
    "frontend/src/components/ui/Input.jsx": "export default function Input(props) {\n  return <input {...props} />;\n}\n",
    "frontend/src/components/ui/Modal.jsx": "export default function Modal({ children }) {\n  return <div>{children}</div>;\n}\n",
    "frontend/src/components/ui/Table.jsx": "export default function Table({ children }) {\n  return <table>{children}</table>;\n}\n",
    "frontend/src/components/layout/Sidebar.jsx": "export default function Sidebar() {\n  return <aside>Sidebar — a implementar</aside>;\n}\n",
    "frontend/src/components/layout/Header.jsx": "export default function Header() {\n  return <header>Header — a implementar</header>;\n}\n",
    "frontend/src/components/dashboard/LogCard.jsx": "export default function LogCard({ log }) {\n  return <div>{JSON.stringify(log)}</div>;\n}\n",
    "frontend/src/components/dashboard/StatusLicenca.jsx": "export default function StatusLicenca({ status }) {\n  return <div>Status: {status}</div>;\n}\n",

    "frontend/src/hooks/useAuth.js": "// Hook de autenticação\n",
    "frontend/src/hooks/useApi.js": "// Hook para chamadas à API\n",

    "frontend/src/services/api.js": "import axios from 'axios';\n\nconst api = axios.create({\n  baseURL: process.env.NEXT_PUBLIC_API_URL,\n});\n\nexport default api;\n",
    "frontend/src/services/auth.service.js": "// Serviço de autenticação\n",
    "frontend/src/services/clientes.service.js": "// Serviço de clientes\n",
    "frontend/src/services/regras.service.js": "// Serviço de regras\n",

    "frontend/src/context/AuthContext.jsx": "// Contexto global de autenticação\n",

    # AGENTE — Gabriel
    "agente/requirements.txt": "requests==2.31.0\nwatchdog==3.0.0\nschedule==1.2.0\npython-dotenv==1.0.0\npyinstaller==5.13.0\n",
    "agente/.env.example": "API_URL=http://localhost:3001\nLICENSE_TOKEN=\nCLIENTE_ID=\n",
    "agente/main.py": "from dotenv import load_dotenv\nload_dotenv()\n\nfrom core.licenca import validar_licenca\nfrom core.configuracao import buscar_configuracoes\nfrom core.agendador import iniciar_agendador\n\nif __name__ == '__main__':\n    print('Iniciando agente Efficience...')\n\n    if not validar_licenca():\n        print('Licença inativa. Agente encerrado.')\n        exit(1)\n\n    configuracoes = buscar_configuracoes()\n    iniciar_agendador(configuracoes)\n",

    "agente/core/licenca.py": "import os\nimport requests\n\ndef validar_licenca():\n    # A implementar: bater na API e verificar se o token está ativo\n    return False\n",
    "agente/core/configuracao.py": "import os\nimport requests\n\ndef buscar_configuracoes():\n    # A implementar: buscar regras do cliente na API\n    return []\n",
    "agente/core/agendador.py": "import schedule\nimport time\n\ndef iniciar_agendador(configuracoes):\n    # A implementar: agendar tarefas com base nas configurações\n    while True:\n        schedule.run_pending()\n        time.sleep(1)\n",

    "agente/automacoes/monitorar_pasta.py": "# A implementar: monitorar pasta com watchdog\n",
    "agente/automacoes/mover_arquivo.py": "# A implementar: mover arquivos por regra\n",
    "agente/automacoes/renomear_arquivo.py": "# A implementar: renomear arquivos por padrão\n",
    "agente/automacoes/gerar_relatorio.py": "# A implementar: gerar relatório de atividade em CSV\n",

    "agente/comunicacao/api_client.py": "import os\nimport requests\n\nAPI_URL = os.getenv('API_URL', 'http://localhost:3001')\nTOKEN = os.getenv('LICENSE_TOKEN', '')\n\ndef get(endpoint):\n    # A implementar\n    pass\n\ndef post(endpoint, dados):\n    # A implementar\n    pass\n",
    "agente/comunicacao/reportar_evento.py": "# A implementar: enviar log de execução para a API\n",

    "agente/build/build.sh": "#!/bin/bash\n# Gera o executável do agente com PyInstaller\npyinstaller --onefile --noconsole main.py --name efficience-agente\n",

    # DATABASE — Vinícius
    "database/README.md": "# Banco de Dados — Efficience Co\n\n## Como rodar as migrations\n\nExecute os arquivos SQL na pasta `migrations/` em ordem numérica no Supabase.\n",
    "database/schema.sql": "-- Schema completo (gerado automaticamente após todas as migrations)\n",

    "database/migrations/001_criar_clientes.sql": "-- Migration 001: Criar tabela de clientes\nCREATE TABLE IF NOT EXISTS clientes (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  nome VARCHAR(255) NOT NULL,\n  cnpj VARCHAR(18) UNIQUE,\n  status VARCHAR(20) DEFAULT 'ativo',\n  criado_em TIMESTAMP DEFAULT NOW()\n);\n",
    "database/migrations/002_criar_usuarios.sql": "-- Migration 002: Criar tabela de usuários\nCREATE TABLE IF NOT EXISTS usuarios (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  cliente_id UUID REFERENCES clientes(id),\n  nome VARCHAR(255) NOT NULL,\n  email VARCHAR(255) UNIQUE NOT NULL,\n  senha_hash TEXT NOT NULL,\n  perfil VARCHAR(20) DEFAULT 'funcionario',\n  criado_em TIMESTAMP DEFAULT NOW()\n);\n",
    "database/migrations/003_criar_licencas.sql": "-- Migration 003: Criar tabela de licenças\nCREATE TABLE IF NOT EXISTS licencas (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  cliente_id UUID REFERENCES clientes(id),\n  token TEXT UNIQUE NOT NULL,\n  ativa BOOLEAN DEFAULT FALSE,\n  validade TIMESTAMP,\n  criado_em TIMESTAMP DEFAULT NOW()\n);\n",
    "database/migrations/004_criar_regras.sql": "-- Migration 004: Criar tabela de regras de automação\nCREATE TABLE IF NOT EXISTS regras (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  cliente_id UUID REFERENCES clientes(id),\n  pasta_origem TEXT,\n  pasta_destino TEXT,\n  condicao TEXT,\n  acao VARCHAR(50),\n  ativa BOOLEAN DEFAULT TRUE,\n  criado_em TIMESTAMP DEFAULT NOW()\n);\n",
    "database/migrations/005_criar_eventos.sql": "-- Migration 005: Criar tabela de logs de eventos\nCREATE TABLE IF NOT EXISTS eventos (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  cliente_id UUID REFERENCES clientes(id),\n  descricao TEXT,\n  sucesso BOOLEAN DEFAULT TRUE,\n  criado_em TIMESTAMP DEFAULT NOW()\n);\n",

    "database/seeds/clientes.sql": "-- Dados iniciais de clientes para desenvolvimento\nINSERT INTO clientes (nome, cnpj) VALUES\n  ('Escritório Exemplo Ltda', '00.000.000/0001-00');\n",
    "database/seeds/usuarios.sql": "-- Dados iniciais de usuários para desenvolvimento\n-- Lembre de usar hash real para a senha em produção\n",
}

def criar_estrutura(base, arquivos):
    for caminho, conteudo in arquivos.items():
        caminho_completo = os.path.join(base, caminho)
        os.makedirs(os.path.dirname(caminho_completo), exist_ok=True)
        with open(caminho_completo, "w", encoding="utf-8") as f:
            f.write(conteudo)
        print(f"  criado: {caminho}")

if __name__ == "__main__":
    print(f"\nCriando estrutura do projeto em: {BASE}\n")
    criar_estrutura(BASE, estrutura)
    print(f"\nPronto! {len(estrutura)} arquivos criados.\n")
    print("Próximos passos:")
    print("  1. Entre na pasta backend/  → npm install")
    print("  2. Entre na pasta frontend/ → npm install")
    print("  3. Entre na pasta agente/   → pip install -r requirements.txt")
    print("  4. Copie os .env.example para .env e preencha as variáveis\n")
