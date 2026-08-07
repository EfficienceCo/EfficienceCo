package main

import (
	"flag"
	"os"

	"efficience.co/launcher/internal/agentctl"
	"efficience.co/launcher/internal/config"
	"efficience.co/launcher/internal/licenca"
	"efficience.co/launcher/internal/logx"
	"efficience.co/launcher/internal/startup"
	"efficience.co/launcher/internal/tray"

	_ "embed"
)

//go:embed icon.ico
var iconData []byte

func main() {
	installStartup := flag.Bool("install-startup", false, "Instala/recria o atalho no Startup e sai")
	flag.Parse()

	exe, err := config.ExePath()
	if err != nil {
		// Fallback before log is ready
		exe, _ = os.Executable()
	}

	appData, err := config.AppDataPath()
	if err != nil {
		os.Stderr.WriteString("falha ao preparar AppData: " + err.Error() + "\n")
		os.Exit(1)
	}

	if err := logx.Init(appData); err != nil {
		os.Stderr.WriteString("falha ao iniciar log: " + err.Error() + "\n")
		os.Exit(1)
	}
	defer logx.Close()

	cfg, err := config.Load(exe)
	if err != nil {
		logx.Error("%v", err)
		// Still allow --install-startup with partial paths
		if !*installStartup {
			os.Exit(1)
		}
	}

	if *installStartup {
		target := exe
		dir := appData
		if cfg != nil {
			dir = cfg.AppDataDir
		}
		if err := startup.ForceInstall(target, dir); err != nil {
			logx.Error("install-startup: %v", err)
			os.Exit(1)
		}
		logx.Info("install-startup: OK")
		return
	}

	if err := startup.InstallIfNeeded(exe, cfg.AppDataDir); err != nil {
		logx.Error("startup: %v", err)
		// Non-fatal: launcher still runs
	}

	app := &tray.App{
		Cfg:      cfg,
		Licenca:  licenca.NewClient(cfg.BackendURL, cfg.LicencaToken),
		Agent:    agentctl.New(cfg),
		IconData: iconData,
	}
	logx.Info("iniciando tray (config: %s, agente: %s)", cfg.SourcePath, cfg.AgenteExeAbs)
	app.Run()
}
