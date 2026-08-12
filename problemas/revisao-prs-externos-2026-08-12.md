# Revisão PRs Externos — 2026-08-12

Problemas encontrados nos PRs abertos por outros integrantes do time.
Status de cada item atualizado conforme correções são aplicadas.

---

## PR #335 — "modificações no front" (ViniciusCarvalhodeFaria)

**Branch:** `310-frontend-modal-novo-processo-não-permite-criar-processo-de-abertura-de-empresa`  
**Arquivo:** `frontend/src/app/dashboard/processos/page.jsx`

| # | Severidade | Problema | Status |
|---|-----------|---------|--------|
| 1 | 🔴 | EOF ausente no final do arquivo — `\ No newline at end of file` | ✅ corrigido |
| 2 | 🟡 | `cenario` usa lógica divergente entre render e payload | ✅ corrigido (normalizado para `?.trim() \|\| 'nova'`) |
| 3 | 🟡 | Sem confirmação de que backend aceita `abertura_empresa` | ✅ falso alarme — backend já implementado |
| 4 | 🔴 | **Regressão descoberta:** `nome_empresa` dentro de `FormularioContratoSocial` quebrava os testes de etapa (10 Playwright falhando) | ✅ corrigido — campos movidos para o modal; `validarFormularioContratoSocial` não verifica mais `nome_empresa` |

---

## PR #318 — "297 agente monitor pasta xmls de nfe" (garvieiraUni)

**Branch:** `297-agente-monitor-pasta-xmls-de-nfe-detectar-parsear-post-mover`  
**Arquivos:** `agente/worker/` (7 arquivos)

| # | Severidade | Problema | Status |
|---|-----------|---------|--------|
| 1 | 🔴 | `arquivo_xml` no POST usa `str(destino)` (path pretendido), mas `_caminho_livre` pode renomear para `_1.xml` se arquivo já existir — caminho no banco não vai bater com arquivo real | ✅ corrigido — pré-resolução de `_caminho_livre` antes do loop POST; `caminhos_reais` usados tanto no POST quanto em `_arquivar_nas_empresas` |
| 2 | 🟡 | `_monitorar_nfe` em `agendador.py` tem apenas 1 blank line antes — PEP 8 exige 2 entre funções top-level | ✅ corrigido — double blank lines adicionados |
| 3 | 🟡 | `_destino_nfe` cria estrutura de pastas via `criar_estrutura_empresa_em` antes do POST — se POST falhar, pastas ficam criadas (aceitável, mas sem comentário explicativo) | ✅ corrigido — comentário explicativo adicionado |

---

## PR #293 — "leitor de excel na rede" (ViniciusCarvalhodeFaria)

**Branch:** `rede-com-leitor-excel`  
**Arquivos:** `agente/automacoes/rede/classificador.py`, `agente/requirements.txt`, `agente/tests/`

| # | Severidade | Problema | Status |
|---|-----------|---------|--------|
| 1 | 🔴 | `ImportError` em produção: `core/identificar_tipo.py` ainda importa `classificar_documento_pdf` (nome antigo), mas o PR renomeou para `classificar_documento` | ✅ corrigido — import atualizado para `classificar_documento`; alias `classificar_documento_pdf` mantido para retrocompat |
| 2 | 🔴 | Conflito estrutural com PR #303: arquivos estão nos paths antigos (`agente/automacoes/`, `agente/tests/`), mas PR #303 moveu tudo para `agente/worker/` — precisa rebase | ✅ corrigido — migrados para `agente/worker/`; arquivos velhos removidos com `git rm`; rebase feito sobre main |
| 3 | 🟡 | `plt.subplots` usa estado global do pyplot — não é thread-safe; trocar para `matplotlib.figure.Figure` | ✅ corrigido — OO API com `Figure` + `fig.add_subplot` sem estado global |
| 4 | 🟡 | `test_extensao_nao_suportada_retorna_erro` e `test_pdf_vazio_retorna_erro` retornam "modelo não existe" antes de chegar ao branch que dizem testar | ✅ corrigido — testes criam `.pth` fake para ultrapassar a guarda; mock de `PdfDocument` com `len=0` para o branch de PDF vazio |

---

## Histórico de Correções

| Data | PR | Item | Ação |
|------|----|------|------|
| 2026-08-12 | #335 | 1,2,3,4 | Todos corrigidos, pushados, 10/10 Playwright passando — **mergeado** |
| 2026-08-12 | #318 | 1,2,3 | Todos corrigidos, pushados — **mergeado** |
| 2026-08-12 | #293 | 1,2,3,4 | Todos corrigidos, migração de paths, rebase sobre main — **mergeado** |
