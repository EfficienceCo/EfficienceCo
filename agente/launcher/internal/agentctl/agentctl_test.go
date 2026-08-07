package agentctl

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLockfileRoundTrip(t *testing.T) {
	dir := t.TempDir()
	c := &Controller{AppDataDir: dir}
	if err := c.writePID(4242); err != nil {
		t.Fatal(err)
	}
	pid, ok := c.readPID()
	if !ok || pid != 4242 {
		t.Fatalf("got %d %v", pid, ok)
	}
	path := filepath.Join(dir, lockFileName)
	if _, err := os.Stat(path); err != nil {
		t.Fatal(err)
	}
}

func TestIsRunning_StalePID(t *testing.T) {
	dir := t.TempDir()
	c := &Controller{AppDataDir: dir}
	// PID unlikely to exist
	if err := c.writePID(999999); err != nil {
		t.Fatal(err)
	}
	if c.IsRunning() {
		t.Fatal("stale PID should not count as running")
	}
}
