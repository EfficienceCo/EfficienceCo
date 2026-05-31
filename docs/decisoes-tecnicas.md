# EfficienceCo — Decisões Técnicas

> Atualizado em 2026-05-31.

---

## Arquitetura híbrida (nuvem + local)

**Decisão:** sistema dividido em frontend/backend na nuvem + agente Python rodando no PC do escritório.

**Por quê:** web puro não acessa sistema de arquivos do cliente. Local puro vira pesadelo de manutenção. Híbrido combina automações locais com gestão centralizada na nuvem.

---

## Node.js + Express no backend

**Decisão:** ESM (import/export), sem CommonJS.

**Por quê:** stack já conhecido pelo time. ESM é o padrão moderno — migração feita em 2026-04-22. Express é direto e sem overhead desnecessário para o porte do projeto.

---

## Supabase como banco

**Decisão:** PostgreSQL gerenciado via Supabase.

**Por quê:** provisioning gratuito para dev, RLS nativo, dashboard visual para Vinícius, migrations via SQL puro (sem ORM). `service_role` key usada no backend para bypass de RLS server-side — nunca exposta no frontend.

---

## JWT para autenticação

**Decisão:** token JWT com payload `{ id, email, perfil, cliente_id }` — sem refresh token por enquanto.

**Por quê:** stateless, não precisa de sessão no servidor, funciona bem para o agente também.

---

## 3 perfis de acesso

**Decisão:** `admin_efficience` (time EfficienceCo — acesso a todos os clientes), `admin_cliente` (Roberto/Patrícia — gerenciam o próprio escritório), `funcionario` (Fernanda, Carlos, etc.).

**Por quê:** escritório contábil tem hierarquia simples. `admin_efficience` existe para que a equipe EfficienceCo consiga suportar e gerenciar qualquer escritório sem precisar de credenciais do cliente. `admin_cliente` é o admin do escritório contratante — só vê os dados do próprio `cliente_id`. `funcionario` tem acesso restrito a operações do dia a dia.

---

## Agente com cache + polling de versão

**Decisão:** agente armazena regras em cache local. Antes de baixar as regras completas, verifica versão no endpoint `/regras/:clienteId/versao`. Só baixa se mudou. Intervalo de sync via `INTERVALO_SYNC_HORAS`.

**Por quê:** escritórios têm internet instável. Cache garante funcionamento offline. Polling de versão evita download desnecessário a cada ciclo.

---

## Software dedicado por cliente (por enquanto)

**Decisão:** cada cliente recebe um repositório e deploy independentes.

**Por quê:** estamos na fase de captação do primeiro cliente. Infra compartilhada faz sentido a partir do 3º cliente (ponto de virada financeiro). Fork + adaptações é viável com poucos clientes.

**Quando mudar:** ao fechar o 3º cliente, migrar para infraestrutura compartilhada com subdomínios e RLS por cliente.

---

## Sem Stripe neste repositório

**Decisão:** Stripe e sistema de licença não existem neste codebase.

**Por quê:** este é o software de exemplo para captação de clientes. A cobrança de licença recorrente será gerenciada externamente até que haja clientes reais pagando e a infraestrutura compartilhada esteja montada.

---

## Perfis centralizados em config/perfis.js

**Decisão:** strings de perfil (`admin_efficience`, `admin_cliente`, `funcionario`) vivem apenas em `src/config/perfis.js` como constantes `PERFIS.*`. Controllers e routes importam daqui — zero string hardcoded em outros arquivos.

**Por quê:** com 3 perfis usados em 8+ arquivos, string hardcoded espalhada = refactor doloroso e bugs silenciosos de typo. Arquivo central = one source of truth, renomear perfil = 1 linha mudada.

---

## Fila offline no agente

**Decisão:** agente mantém fila local de eventos quando backend está indisponível. Reenvio automático quando conexão volta.

**Por quê:** escritórios têm internet instável. Sem fila, eventos de automação se perdem silenciosamente durante queda de conexão. Com fila, nenhum log é perdido.

---

## Python + PyInstaller para o agente

**Decisão:** agente em Python, distribuído como `.exe` via PyInstaller.

**Por quê:** Python tem bibliotecas maduras para manipulação de arquivos (`watchdog`, `shutil`, `os`). PyInstaller gera executável sem dependência de Python instalado no PC do cliente. Instalação simples — roda e esquece.
