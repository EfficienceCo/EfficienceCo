//go:build !windows

package agentctl

import (
	"os"
	"os/exec"
	"syscall"
)

func hideWindow(cmd *exec.Cmd) {
	// no-op on non-Windows
}

func processAlive(pid int) bool {
	p, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	// Signal 0 checks existence on Unix.
	err = p.Signal(syscall.Signal(0))
	return err == nil
}

func terminateGraceful(pid int) error {
	p, err := os.FindProcess(pid)
	if err != nil {
		return err
	}
	return p.Signal(syscall.SIGTERM)
}

func forceKill(pid int) error {
	p, err := os.FindProcess(pid)
	if err != nil {
		return err
	}
	return p.Kill()
}
