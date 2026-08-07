package startup

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"efficience.co/launcher/internal/logx"
)

const (
	shortcutName = "EfficienceLauncher.lnk"
	markerName   = "startup_installed"
)

// InstallIfNeeded creates a Startup shortcut on first run (no admin).
func InstallIfNeeded(launcherExe, appDataDir string) error {
	if runtime.GOOS != "windows" {
		logx.Info("startup: registro automático só é suportado no Windows")
		return nil
	}

	marker := filepath.Join(appDataDir, markerName)
	if _, err := os.Stat(marker); err == nil {
		// Already installed once; still ensure shortcut exists (user may have deleted it).
		if shortcutExists() {
			return nil
		}
		logx.Info("startup: atalho ausente — reinstalando")
	}

	if err := createShortcut(launcherExe); err != nil {
		return err
	}
	if err := os.WriteFile(marker, []byte("1"), 0o644); err != nil {
		logx.Error("não foi possível gravar marker de startup: %v", err)
	}
	logx.Info("startup: atalho instalado em Startup do usuário")
	return nil
}

// ForceInstall always recreates the Startup shortcut (--install-startup).
func ForceInstall(launcherExe, appDataDir string) error {
	if runtime.GOOS != "windows" {
		return fmt.Errorf("startup só é suportado no Windows")
	}
	if err := createShortcut(launcherExe); err != nil {
		return err
	}
	marker := filepath.Join(appDataDir, markerName)
	_ = os.WriteFile(marker, []byte("1"), 0o644)
	return nil
}

func startupDir() (string, error) {
	appData := os.Getenv("APPDATA")
	if appData == "" {
		return "", fmt.Errorf("APPDATA não definido")
	}
	return filepath.Join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Startup"), nil
}

func shortcutPath() (string, error) {
	dir, err := startupDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, shortcutName), nil
}

func shortcutExists() bool {
	p, err := shortcutPath()
	if err != nil {
		return false
	}
	_, err = os.Stat(p)
	return err == nil
}

func createShortcut(launcherExe string) error {
	target, err := filepath.Abs(launcherExe)
	if err != nil {
		return err
	}
	workDir := filepath.Dir(target)
	lnk, err := shortcutPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(lnk), 0o755); err != nil {
		return err
	}

	// Escape for PowerShell single-quoted strings (double any ').
	psTarget := strings.ReplaceAll(target, "'", "''")
	psWork := strings.ReplaceAll(workDir, "'", "''")
	psLnk := strings.ReplaceAll(lnk, "'", "''")

	script := fmt.Sprintf(`
$ws = New-Object -ComObject WScript.Shell
$s = $ws.CreateShortcut('%s')
$s.TargetPath = '%s'
$s.WorkingDirectory = '%s'
$s.WindowStyle = 7
$s.Description = 'Efficience Launcher'
$s.Save()
`, psLnk, psTarget, psWork)

	cmd := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", script)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("criar atalho Startup: %w (%s)", err, strings.TrimSpace(string(out)))
	}
	return nil
}
