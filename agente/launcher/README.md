# Efficience Launcher (Go / system tray)

Launcher local do agente Efficience: ícone na bandeja do Windows, start/stop do worker Python empacotado (`efficience-agente.exe`), status de licença e registro no Startup do usuário.

Issue: #284  
Protocolo launcher↔agente: **A** (PID + path configurável + lockfile em `%APPDATA%\Efficience\agent.pid`).

## Decisões (piloto)

| Tema | Escolha |
|------|---------|
| Licença inativa/expirada | Bloqueia start; menu mostra **Inativa** |
| Falha de rede em `/licenca/validar` | Bloqueia start; menu mostra **Sem conexão** |
| Startup | Só o launcher; ao subir, **auto-inicia o agente** se a licença estiver ativa |
| Sair do tray | Fecha o launcher; o agente **continua** se já estiver online |

Token e URL do backend **nunca** vão no binário — só em `config.yaml`.

## Pré-requisitos

- Go 1.22+ (testado com Go 1.26)
- Windows (alvo de produção). Build cross a partir de Linux/macOS é possível.
- Tray: [`fyne.io/systray`](https://fyne.io/systray) (sem CGO no Windows)
- Worker PyInstaller: veja [`../worker/build/build.sh`](../worker/build/build.sh)

## Configuração

`config.yaml` **não vai pro git** (contém token). O template versionado é `config.example.yaml`.

| Ambiente | Arquivo | Notas |
|----------|---------|-------|
| Dev | `config.yaml` (local, gitignored) | `http://localhost:3001` + `agente_exe: ./run-worker-dev.cmd` |
| Prod | copiar de `config.example.yaml` | preencher URL, token, `cliente_id`, `pasta_base` + `./efficience-agente.exe` |

```powershell
copy config.example.yaml config.yaml
# edite backend_url, licenca_token, cliente_id, pasta_base
```

Coloque `config.yaml` **ao lado** do `EfficienceLauncher.exe`, ou em `%APPDATA%\Efficience\config.yaml`.

Ordem de load: (1) ao lado do exe, (2) AppData.

Ao iniciar o worker, o launcher injeta no processo filho (a partir do YAML):

| Env | Campo YAML | Uso no worker |
|-----|------------|---------------|
| `API_URL` | `backend_url` | HTTP client |
| `LICENSE_TOKEN` | `licenca_token` | auth agente |
| `CLIENTE_ID` | `cliente_id` | `GET /regras/{id}` — **obrigatório** |
| `PASTA_BASE` | `pasta_base` | base de pastas (opcional) |

Não dependa de um `.env` separado no pacote de produção: esses valores vêm do `config.yaml` do launcher.

Logs legíveis: `%APPDATA%\Efficience\launcher.log`

## Build (Windows nativo)

```powershell
cd agente\launcher
go mod tidy
go build -ldflags="-H windowsgui" -o EfficienceLauncher.exe ./cmd/launcher
```

## Cross-compile (de outro SO)

```bash
cd agente/launcher
GOOS=windows GOARCH=amd64 go build -ldflags="-H windowsgui" -o EfficienceLauncher.exe ./cmd/launcher
```

> Em macOS/Linux o flag `-H windowsgui` ainda é passado via `-ldflags` para o linker Windows.

## Empacote sugerido (pasta do escritório)

```
Efficience/
  EfficienceLauncher.exe
  efficience-agente.exe      # saída do PyInstaller do worker
  config.yaml                # backend_url, licenca_token, cliente_id, pasta_base, agente_exe
```

1. Build do worker: `cd agente/worker && bash build/build.sh` (ou PyInstaller equivalente no Windows).
2. Build do launcher (acima).
3. Copie os dois `.exe` + `config.yaml` preenchido para a pasta do cliente.
4. Execute `EfficienceLauncher.exe` uma vez (instala atalho no Startup automaticamente).

### Startup manual

```powershell
.\EfficienceLauncher.exe -install-startup
```

Atalho criado em:

`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\EfficienceLauncher.lnk`

Após reboot: o launcher sobe, valida a licença e, se ativa, inicia o agente.

## Menu do tray

- Licença: Ativa / Inativa / Sem conexão
- Agente: Ativado / Desativado (processo vivo local — não usa heartbeat HTTP)
- Inicializar agente (bloqueado se licença ≠ Ativa ou já online)
- Encerrar agente
- Buscar atualizações (stub)
- Sair

## Testes

```powershell
cd agente\launcher
go test ./...
```

## Fora de escopo (follow-ups)

- Auto-update real (download + replace)
- Named pipe / stop gracioso rico (evoluir protocolo B)
- Heartbeat agente → API (dashboard)
- MSI/NSIS
