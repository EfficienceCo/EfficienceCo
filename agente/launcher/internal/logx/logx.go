package logx

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"sync"
)

var (
	mu     sync.Mutex
	logger *log.Logger
	file   *os.File
)

// Init writes to %APPDATA%\Efficience\launcher.log and stdout (if available).
func Init(appDataDir string) error {
	mu.Lock()
	defer mu.Unlock()

	if err := os.MkdirAll(appDataDir, 0o755); err != nil {
		return err
	}
	path := filepath.Join(appDataDir, "launcher.log")
	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return fmt.Errorf("abrir log: %w", err)
	}
	if file != nil {
		_ = file.Close()
	}
	file = f

	writers := []io.Writer{f}
	// When built with -H windowsgui, stdout may be nil — still log to file.
	if os.Stdout != nil {
		writers = append(writers, os.Stdout)
	}
	logger = log.New(io.MultiWriter(writers...), "", log.LstdFlags|log.Lmsgprefix)
	logger.SetPrefix("[launcher] ")
	logger.Printf("log iniciado: %s", path)
	return nil
}

func Info(format string, args ...any) {
	mu.Lock()
	defer mu.Unlock()
	if logger == nil {
		log.Printf("[launcher] "+format, args...)
		return
	}
	logger.Printf(format, args...)
}

func Error(format string, args ...any) {
	Info("ERRO: "+format, args...)
}

func Close() {
	mu.Lock()
	defer mu.Unlock()
	if file != nil {
		_ = file.Close()
		file = nil
	}
}
