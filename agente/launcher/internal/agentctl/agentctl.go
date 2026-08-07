package agentctl

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"efficience.co/launcher/internal/config"
)

const lockFileName = "agent.pid"

// Controller starts/stops the Python worker and tracks it via PID lockfile.
type Controller struct {
	AppDataDir string
	AgenteExe  string
	BackendURL string
	Token      string
}

func New(cfg *config.Config) *Controller {
	return &Controller{
		AppDataDir: cfg.AppDataDir,
		AgenteExe:  cfg.AgenteExeAbs,
		BackendURL: cfg.BackendURL,
		Token:      cfg.LicencaToken,
	}
}

func (c *Controller) lockPath() string {
	return filepath.Join(c.AppDataDir, lockFileName)
}

// IsRunning reports whether the agent process from the lockfile is alive.
func (c *Controller) IsRunning() bool {
	pid, ok := c.readPID()
	if !ok {
		return false
	}
	return processAlive(pid)
}

// PID returns the locked PID if the process is alive.
func (c *Controller) PID() (int, bool) {
	pid, ok := c.readPID()
	if !ok || !processAlive(pid) {
		return 0, false
	}
	return pid, true
}

// Start launches the agent if not already running. Injects API_URL and LICENSE_TOKEN.
func (c *Controller) Start() error {
	if c.IsRunning() {
		return nil
	}
	// Clear stale lock
	_ = os.Remove(c.lockPath())

	if _, err := os.Stat(c.AgenteExe); err != nil {
		return fmt.Errorf("agente.exe não encontrado em %s — verifique agente_exe na config", c.AgenteExe)
	}

	cmd := commandForAgent(c.AgenteExe)
	cmd.Dir = filepath.Dir(c.AgenteExe)
	// Prefer worker directory when launching the dev wrapper next to the launcher.
	if strings.EqualFold(filepath.Ext(c.AgenteExe), ".cmd") || strings.EqualFold(filepath.Ext(c.AgenteExe), ".bat") {
		// run-worker-dev.cmd cds itself; keep launcher dir as starting point.
		cmd.Dir = filepath.Dir(c.AgenteExe)
	}
	cmd.Env = append(os.Environ(),
		"API_URL="+c.BackendURL,
		"LICENSE_TOKEN="+c.Token,
	)
	hideWindow(cmd)

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("falha ao iniciar agente: %w", err)
	}

	if err := c.writePID(cmd.Process.Pid); err != nil {
		_ = cmd.Process.Kill()
		return fmt.Errorf("gravar lockfile: %w", err)
	}

	// Detach: don't wait; release so launcher exit doesn't reap unexpectedly on some OSes.
	go func() {
		_ = cmd.Wait()
		// If our PID still matches, clear lock when process exits.
		if pid, ok := c.readPID(); ok && pid == cmd.Process.Pid {
			_ = os.Remove(c.lockPath())
		}
	}()

	return nil
}

// Stop tries a graceful kill, then force-kills after timeout.
func (c *Controller) Stop() error {
	pid, ok := c.readPID()
	if !ok {
		return nil
	}
	if !processAlive(pid) {
		_ = os.Remove(c.lockPath())
		return nil
	}

	if err := terminateGraceful(pid); err != nil {
		// fall through to force
		_ = forceKill(pid)
	} else {
		deadline := time.Now().Add(5 * time.Second)
		for time.Now().Before(deadline) {
			if !processAlive(pid) {
				_ = os.Remove(c.lockPath())
				return nil
			}
			time.Sleep(200 * time.Millisecond)
		}
		_ = forceKill(pid)
	}

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if !processAlive(pid) {
			break
		}
		time.Sleep(200 * time.Millisecond)
	}
	_ = os.Remove(c.lockPath())
	if processAlive(pid) {
		return fmt.Errorf("não foi possível encerrar o agente (PID %d)", pid)
	}
	return nil
}

func (c *Controller) readPID() (int, bool) {
	data, err := os.ReadFile(c.lockPath())
	if err != nil {
		return 0, false
	}
	s := strings.TrimSpace(string(data))
	pid, err := strconv.Atoi(s)
	if err != nil || pid <= 0 {
		return 0, false
	}
	return pid, true
}

func (c *Controller) writePID(pid int) error {
	if err := os.MkdirAll(c.AppDataDir, 0o755); err != nil {
		return err
	}
	return os.WriteFile(c.lockPath(), []byte(strconv.Itoa(pid)), 0o644)
}

// commandForAgent runs .cmd/.bat via cmd.exe (CreateProcess cannot launch them directly).
func commandForAgent(agentPath string) *exec.Cmd {
	ext := strings.ToLower(filepath.Ext(agentPath))
	if ext == ".cmd" || ext == ".bat" {
		return exec.Command("cmd.exe", "/C", agentPath)
	}
	return exec.Command(agentPath)
}
