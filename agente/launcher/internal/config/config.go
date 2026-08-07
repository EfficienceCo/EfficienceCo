package config

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

const AppDirName = "Efficience"

// Config is loaded from disk; never compile secrets into the binary.
type Config struct {
	BackendURL      string `yaml:"backend_url"`
	LicencaToken    string `yaml:"licenca_token"`
	AgenteExe       string `yaml:"agente_exe"`
	AutoStartAgente *bool  `yaml:"auto_start_agente"`

	// Resolved absolute path to the agent executable.
	AgenteExeAbs string `yaml:"-"`
	// Directory containing the launcher executable.
	LauncherDir string `yaml:"-"`
	// %APPDATA%\Efficience
	AppDataDir string `yaml:"-"`
	// Path of the config file that was loaded.
	SourcePath string `yaml:"-"`
}

func (c *Config) AutoStart() bool {
	if c.AutoStartAgente == nil {
		return true
	}
	return *c.AutoStartAgente
}

// AppDataPath returns %APPDATA%\Efficience (creates it if needed).
func AppDataPath() (string, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("obter AppData: %w", err)
	}
	dir := filepath.Join(base, AppDirName)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("criar %s: %w", dir, err)
	}
	return dir, nil
}

// Load finds and parses config.yaml.
// Order: (1) next to the launcher exe, (2) %APPDATA%\Efficience\config.yaml.
func Load(launcherExe string) (*Config, error) {
	launcherDir := filepath.Dir(launcherExe)
	appData, err := AppDataPath()
	if err != nil {
		return nil, err
	}

	candidates := []string{
		filepath.Join(launcherDir, "config.yaml"),
		filepath.Join(appData, "config.yaml"),
	}

	var lastErr error
	for _, path := range candidates {
		cfg, err := loadFile(path)
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			lastErr = err
			continue
		}
		cfg.LauncherDir = launcherDir
		cfg.AppDataDir = appData
		cfg.SourcePath = path
		if err := cfg.resolve(); err != nil {
			return nil, err
		}
		return cfg, nil
	}

	if lastErr != nil {
		return nil, lastErr
	}
	return nil, fmt.Errorf(
		"config.yaml não encontrado. Coloque ao lado do launcher ou em %s",
		filepath.Join(appData, "config.yaml"),
	)
}

func loadFile(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	return &cfg, nil
}

func (c *Config) resolve() error {
	if c.BackendURL == "" {
		return fmt.Errorf("backend_url é obrigatório em %s", c.SourcePath)
	}
	if c.LicencaToken == "" {
		return fmt.Errorf("licenca_token é obrigatório em %s", c.SourcePath)
	}
	if c.AgenteExe == "" {
		c.AgenteExe = "./efficience-agente.exe"
	}

	exe := c.AgenteExe
	if !filepath.IsAbs(exe) {
		exe = filepath.Join(c.LauncherDir, exe)
	}
	abs, err := filepath.Abs(exe)
	if err != nil {
		return fmt.Errorf("resolver agente_exe: %w", err)
	}
	c.AgenteExeAbs = abs
	return nil
}

// ExePath returns the path of the current executable.
func ExePath() (string, error) {
	p, err := os.Executable()
	if err != nil {
		return "", err
	}
	return filepath.EvalSymlinks(p)
}
