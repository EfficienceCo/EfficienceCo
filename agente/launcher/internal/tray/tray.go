package tray

import (
	"context"
	"sync"
	"time"

	"fyne.io/systray"

	"efficience.co/launcher/internal/agentctl"
	"efficience.co/launcher/internal/config"
	"efficience.co/launcher/internal/licenca"
	"efficience.co/launcher/internal/logx"
)

// App wires tray UI to license + agent control.
type App struct {
	Cfg      *config.Config
	Licenca  *licenca.Client
	Agent    *agentctl.Controller
	IconData []byte

	mu           sync.Mutex
	licStatus    licenca.Status
	licMessage   string
	agentOnline  bool
	mLicenca     *systray.MenuItem
	mAgente      *systray.MenuItem
	mIniciar     *systray.MenuItem
	mEncerrar    *systray.MenuItem
	mAtualizar   *systray.MenuItem
	mSair        *systray.MenuItem
	stopRefresh  chan struct{}
}

// Run blocks on the systray event loop.
func (a *App) Run() {
	systray.Run(a.onReady, a.onExit)
}

func (a *App) onReady() {
	if len(a.IconData) > 0 {
		systray.SetIcon(a.IconData)
	}
	systray.SetTitle("Efficience")
	systray.SetTooltip("Efficience — agente local")

	// Status lines: kept enabled so Windows paints them as normal text (not gray
	// "disabled action"). Clicks are ignored / only refresh info.
	a.mLicenca = systray.AddMenuItem("• Licença — …", "Somente informativo")
	a.mAgente = systray.AddMenuItem("• Agente — …", "Somente informativo")
	systray.AddSeparator()
	a.mIniciar = systray.AddMenuItem("Inicializar agente", "Inicia o worker local")
	a.mEncerrar = systray.AddMenuItem("Encerrar agente", "Encerra o worker local")
	systray.AddSeparator()
	a.mAtualizar = systray.AddMenuItem("Buscar atualizações (em breve)", "Auto-update ainda não disponível")
	systray.AddSeparator()
	a.mSair = systray.AddMenuItem("Sair", "Fecha o launcher (o agente continua rodando se estiver online)")

	a.stopRefresh = make(chan struct{})
	go a.handleClicks()
	go a.refreshLoop()

	// Initial license check + optional auto-start
	a.refreshLicenca()
	a.refreshAgente()
	a.applyMenuState()

	if a.Cfg.AutoStart() {
		a.tryStart("auto-start")
	}
}

func (a *App) onExit() {
	if a.stopRefresh != nil {
		close(a.stopRefresh)
	}
	logx.Info("tray encerrado")
}

func (a *App) handleClicks() {
	for {
		select {
		case <-a.mLicenca.ClickedCh:
			// Info-only: refresh status, no action.
			a.refreshLicenca()
			a.applyMenuState()
		case <-a.mAgente.ClickedCh:
			a.refreshAgente()
			a.applyMenuState()
		case <-a.mIniciar.ClickedCh:
			a.tryStart("menu")
		case <-a.mEncerrar.ClickedCh:
			a.tryStop()
		case <-a.mAtualizar.ClickedCh:
			logx.Info("buscar atualizações: stub — download real em follow-up")
		case <-a.mSair.ClickedCh:
			systray.Quit()
			return
		case <-a.stopRefresh:
			return
		}
	}
}

func (a *App) refreshLoop() {
	licTick := time.NewTicker(60 * time.Second)
	agentTick := time.NewTicker(3 * time.Second)
	defer licTick.Stop()
	defer agentTick.Stop()

	for {
		select {
		case <-licTick.C:
			a.refreshLicenca()
			a.applyMenuState()
		case <-agentTick.C:
			a.refreshAgente()
			a.applyMenuState()
		case <-a.stopRefresh:
			return
		}
	}
}

func (a *App) refreshLicenca() {
	ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
	defer cancel()
	res, err := a.Licenca.Validar(ctx)
	a.mu.Lock()
	defer a.mu.Unlock()
	a.licStatus = res.Status
	a.licMessage = res.Message
	if err != nil && res.Status == licenca.ErroRede {
		logx.Error("validar licença: %v", err)
	} else {
		logx.Info("licença: %s (%s)", res.Status.String(), res.Message)
	}
}

func (a *App) refreshAgente() {
	online := a.Agent.IsRunning()
	a.mu.Lock()
	a.agentOnline = online
	a.mu.Unlock()
}

func (a *App) applyMenuState() {
	a.mu.Lock()
	lic := a.licStatus
	msg := a.licMessage
	online := a.agentOnline
	a.mu.Unlock()

	licLabel := "• Licença — " + lic.String()
	agenteLabel := "• Agente — Desativado"
	if online {
		agenteLabel = "• Agente — Ativado"
	}

	if a.mLicenca != nil {
		a.mLicenca.SetTitle(licLabel)
		if msg != "" {
			a.mLicenca.SetTooltip(msg)
		} else {
			a.mLicenca.SetTooltip("Somente informativo")
		}
	}
	if a.mAgente != nil {
		a.mAgente.SetTitle(agenteLabel)
		a.mAgente.SetTooltip("Somente informativo")
	}

	// Hover on the tray icon summarizes status (true “info” surface).
	tooltip := "Efficience\n" + licLabel + "\n" + agenteLabel
	if msg != "" && lic != licenca.Ativa {
		tooltip += "\n" + msg
	}
	systray.SetTooltip(tooltip)

	canStart := lic == licenca.Ativa && !online
	if a.mIniciar != nil {
		if canStart {
			a.mIniciar.Enable()
			a.mIniciar.SetTooltip("Inicia o worker local")
		} else {
			a.mIniciar.Disable()
			switch {
			case online:
				a.mIniciar.SetTooltip("Agente já está online")
			case lic == licenca.ErroRede:
				a.mIniciar.SetTooltip("Falha de conexão — não foi possível validar a licença")
			case lic == licenca.Inativa:
				a.mIniciar.SetTooltip("Licença inativa ou expirada — start bloqueado")
			default:
				a.mIniciar.SetTooltip("Aguarde validação da licença")
			}
		}
	}
	if a.mEncerrar != nil {
		if online {
			a.mEncerrar.Enable()
		} else {
			a.mEncerrar.Disable()
		}
	}
}

func (a *App) tryStart(reason string) {
	a.refreshLicenca()
	a.mu.Lock()
	lic := a.licStatus
	msg := a.licMessage
	a.mu.Unlock()

	if lic == licenca.ErroRede {
		logx.Error("start bloqueado (%s): falha de conexão — %s", reason, msg)
		a.applyMenuState()
		return
	}
	if lic != licenca.Ativa {
		logx.Error("start bloqueado (%s): licença %s — %s", reason, lic.String(), msg)
		a.applyMenuState()
		return
	}
	if a.Agent.IsRunning() {
		logx.Info("start (%s): agente já online", reason)
		a.refreshAgente()
		a.applyMenuState()
		return
	}
	if err := a.Agent.Start(); err != nil {
		logx.Error("start (%s): %v", reason, err)
	} else {
		logx.Info("start (%s): agente iniciado", reason)
	}
	// Give process a moment before status poll
	time.Sleep(400 * time.Millisecond)
	a.refreshAgente()
	a.applyMenuState()
}

func (a *App) tryStop() {
	if err := a.Agent.Stop(); err != nil {
		logx.Error("stop: %v", err)
	} else {
		logx.Info("agente encerrado")
	}
	a.refreshAgente()
	a.applyMenuState()
}
