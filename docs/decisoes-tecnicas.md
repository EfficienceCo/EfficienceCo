# EfficienceCo — Decisões Técnicas

> Atualizado em 2026-05-08.

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

## 2 perfis de acesso

**Decisão:** `admin` (Roberto/Patrícia — gerenciam o escritório) e `funcionario` (Fernanda, Carlos, etc.).

**Por quê:** escritório contábil tem hierarquia simples. Perfil `admin_efficience` foi removido — este é um software dedicado ao escritório, não uma plataforma multi-tenant.

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

## Python + PyInstaller para o agente

**Decisão:** agente em Python, distribuído como `.exe` via PyInstaller.

**Por quê:** Python tem bibliotecas maduras para manipulação de arquivos (`watchdog`, `shutil`, `os`). PyInstaller gera executável sem dependência de Python instalado no PC do cliente. Instalação simples — roda e esquece.
