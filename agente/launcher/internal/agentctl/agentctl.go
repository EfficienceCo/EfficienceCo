package agentctl

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"efficience.co/launcher/internal/config"
)

const lockFileName = "agent.pid"

// Controller starts/stops the Python worker and tracks it via PID lockfile.
type Controller struct {
	mu sync.Mutex

	AppDataDir string
	AgenteExe  string
	BackendURL string
	Token      string
	ClienteID  string
	PastaBase  string
}

func New(cfg *config.Config) *Controller {
	return &Controller{
		AppDataDir: cfg.AppDataDir,
		AgenteExe:  cfg.AgenteExeAbs,
		BackendURL: cfg.BackendURL,
		Token:      cfg.LicencaToken,
		ClienteID:  cfg.ClienteID,
		PastaBase:  cfg.PastaBase,
	}
}

func (c *Controller) lockPath() string {
	return filepath.Join(c.AppDataDir, lockFileName)
}

// IsRunning reports whether the locked PID is alive and matches our worker image.
func (c *Controller) IsRunning() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.isRunningLocked()
}

// PID returns the locked PID if the process is our agent and alive.
func (c *Controller) PID() (int, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	pid, tracked, ok := c.readLock()
	if !ok || !c.isOurProcess(pid, tracked) {
		return 0, false
	}
	return pid, true
}

func (c *Controller) isRunningLocked() bool {
	pid, tracked, ok := c.readLock()
	if !ok {
		return false
	}
	if !c.isOurProcess(pid, tracked) {
		// Stale or PID-reuse: clear lock so Start can proceed.
		_ = os.Remove(c.lockPath())
		return false
	}
	return true
}

// Start launches the agent if not already running.
// Injects API_URL, LICENSE_TOKEN, CLIENTE_ID and PASTA_BASE.
func (c *Controller) Start() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.isRunningLocked() {
		return nil
	}
	_ = os.Remove(c.lockPath())

	if _, err := os.Stat(c.AgenteExe); err != nil {
		return fmt.Errorf("agente.exe não encontrado em %s — verifique agente_exe na config", c.AgenteExe)
	}

	cmd := commandForAgent(c.AgenteExe)
	cmd.Dir = workDirForAgent(c.AgenteExe)
	cmd.Env = append(os.Environ(),
		"API_URL="+c.BackendURL,
		"LICENSE_TOKEN="+c.Token,
		"CLIENTE_ID="+c.ClienteID,
		"PASTA_BASE="+c.PastaBase,
	)
	hideWindow(cmd)

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("falha ao iniciar agente: %w", err)
	}

	tracked := trackedImageFor(c.AgenteExe)
	if err := c.writeLock(cmd.Process.Pid, tracked); err != nil {
		_ = cmd.Process.Kill()
		return fmt.Errorf("gravar lockfile: %w", err)
	}

	startedPID := cmd.Process.Pid
	go func() {
		_ = cmd.Wait()
		c.mu.Lock()
		defer c.mu.Unlock()
		if pid, _, ok := c.readLock(); ok && pid == startedPID {
			_ = os.Remove(c.lockPath())
		}
	}()

	return nil
}

// Stop tries a soft terminate, waits for exit, then force-kills if needed.
// Lockfile is removed only after the process is confirmed dead.
func (c *Controller) Stop() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	pid, tracked, ok := c.readLock()
	if !ok {
		return nil
	}
	if !c.isOurProcess(pid, tracked) {
		_ = os.Remove(c.lockPath())
		return nil
	}

	// Soft signal may fail for CREATE_NO_WINDOW workers on Windows; still wait
	// so in-flight work can flush before force-kill.
	_ = terminateGraceful(pid)
	if waitUntilDead(pid, 5*time.Second) {
		_ = os.Remove(c.lockPath())
		return nil
	}

	_ = forceKill(pid)
	if waitUntilDead(pid, 3*time.Second) {
		_ = os.Remove(c.lockPath())
		return nil
	}

	// Keep lockfile so IsRunning stays true and Start won't spawn a duplicate.
	return fmt.Errorf("não foi possível encerrar o agente (PID %d)", pid)
}

func waitUntilDead(pid int, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if !processAlive(pid) {
			return true
		}
		time.Sleep(200 * time.Millisecond)
	}
	return !processAlive(pid)
}

func (c *Controller) isOurProcess(pid int, tracked string) bool {
	if !processAlive(pid) {
		return false
	}
	img, err := processImagePath(pid)
	if err != nil || img == "" {
		// Cannot verify identity → treat as not ours (avoids PID-reuse false positive).
		return false
	}
	return imagesMatch(img, tracked)
}

func imagesMatch(actualImage, tracked string) bool {
	actualBase := strings.ToLower(filepath.Base(actualImage))
	trackedBase := strings.ToLower(filepath.Base(tracked))
	if trackedBase == "cmd.exe" {
		return actualBase == "cmd.exe"
	}
	return strings.EqualFold(filepath.Clean(actualImage), filepath.Clean(tracked)) ||
		actualBase == trackedBase
}

func trackedImageFor(agentPath string) string {
	ext := strings.ToLower(filepath.Ext(agentPath))
	if ext == ".cmd" || ext == ".bat" {
		// commandForAgent launches via cmd.exe — that is the PID we own.
		return "cmd.exe"
	}
	return agentPath
}

func workDirForAgent(agentPath string) string {
	ext := strings.ToLower(filepath.Ext(agentPath))
	dir := filepath.Dir(agentPath)
	if ext == ".cmd" || ext == ".bat" {
		// Dev wrapper lives in launcher/; worker sources are ../worker.
		workerDir := filepath.Join(dir, "..", "worker")
		if abs, err := filepath.Abs(workerDir); err == nil {
			if st, err := os.Stat(abs); err == nil && st.IsDir() {
				return abs
			}
		}
	}
	return dir
}

func (c *Controller) readLock() (pid int, tracked string, ok bool) {
	data, err := os.ReadFile(c.lockPath())
	if err != nil {
		return 0, "", false
	}
	lines := strings.Split(strings.TrimSpace(string(data)), "\n")
	if len(lines) == 0 {
		return 0, "", false
	}
	pid, err = strconv.Atoi(strings.TrimSpace(lines[0]))
	if err != nil || pid <= 0 {
		return 0, "", false
	}
	if len(lines) >= 2 {
		tracked = strings.TrimSpace(lines[1])
	}
	if tracked == "" {
		// Legacy lockfile (pid only): treat as untrusted for identity checks.
		tracked = filepath.Base(c.AgenteExe)
	}
	return pid, tracked, true
}

func (c *Controller) writeLock(pid int, tracked string) error {
	if err := os.MkdirAll(c.AppDataDir, 0o755); err != nil {
		return err
	}
	content := fmt.Sprintf("%d\n%s\n", pid, tracked)
	return os.WriteFile(c.lockPath(), []byte(content), 0o644)
}

// commandForAgent runs .cmd/.bat via cmd.exe (CreateProcess cannot launch them directly).
func commandForAgent(agentPath string) *exec.Cmd {
	ext := strings.ToLower(filepath.Ext(agentPath))
	if ext == ".cmd" || ext == ".bat" {
		return exec.Command("cmd.exe", "/C", agentPath)
	}
	return exec.Command(agentPath)
}
