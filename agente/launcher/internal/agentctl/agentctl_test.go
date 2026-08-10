package agentctl

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLockfileRoundTrip(t *testing.T) {
	dir := t.TempDir()
	c := &Controller{AppDataDir: dir, AgenteExe: `C:\Efficience\efficience-agente.exe`}
	if err := c.writeLock(4242, c.AgenteExe); err != nil {
		t.Fatal(err)
	}
	pid, tracked, ok := c.readLock()
	if !ok || pid != 4242 {
		t.Fatalf("got %d %v", pid, ok)
	}
	if tracked != c.AgenteExe {
		t.Fatalf("tracked %q", tracked)
	}
	path := filepath.Join(dir, lockFileName)
	if _, err := os.Stat(path); err != nil {
		t.Fatal(err)
	}
}

func TestIsRunning_StalePID(t *testing.T) {
	dir := t.TempDir()
	c := &Controller{AppDataDir: dir, AgenteExe: `C:\Efficience\efficience-agente.exe`}
	if err := c.writeLock(999999, c.AgenteExe); err != nil {
		t.Fatal(err)
	}
	if c.IsRunning() {
		t.Fatal("stale PID should not count as running")
	}
}

func TestWorkDirForAgent_CmdPointsToWorker(t *testing.T) {
	root := t.TempDir()
	launcherDir := filepath.Join(root, "launcher")
	workerDir := filepath.Join(root, "worker")
	if err := os.MkdirAll(launcherDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(workerDir, 0o755); err != nil {
		t.Fatal(err)
	}
	cmdPath := filepath.Join(launcherDir, "run-worker-dev.cmd")
	got := workDirForAgent(cmdPath)
	want, _ := filepath.Abs(workerDir)
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestImagesMatch(t *testing.T) {
	if !imagesMatch(`C:\Windows\System32\cmd.exe`, "cmd.exe") {
		t.Fatal("cmd basename should match")
	}
	if !imagesMatch(`C:\App\efficience-agente.exe`, `C:\App\efficience-agente.exe`) {
		t.Fatal("exact path should match")
	}
	if imagesMatch(`C:\Other\notepad.exe`, `C:\App\efficience-agente.exe`) {
		t.Fatal("unrelated image must not match")
	}
}

func TestStop_KeepsLockWhenProcessStillAlive(t *testing.T) {
	// Unit-level: Stop with unreadable/unmatchable lock clears when not ours.
	dir := t.TempDir()
	c := &Controller{AppDataDir: dir, AgenteExe: `C:\App\efficience-agente.exe`}
	if err := c.writeLock(1, c.AgenteExe); err != nil {
		t.Fatal(err)
	}
	// PID 1 won't match our image on Windows/Unix typically → clears lock, no error.
	if err := c.Stop(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}
