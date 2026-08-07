package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoad_BesideExe(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")
	content := []byte("backend_url: https://example.test\nlicenca_token: secret\nagente_exe: ./agente.exe\n")
	if err := os.WriteFile(cfgPath, content, 0o644); err != nil {
		t.Fatal(err)
	}
	fakeExe := filepath.Join(dir, "EfficienceLauncher.exe")
	if err := os.WriteFile(fakeExe, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}

	cfg, err := Load(fakeExe)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.BackendURL != "https://example.test" {
		t.Fatalf("url %q", cfg.BackendURL)
	}
	if cfg.LicencaToken != "secret" {
		t.Fatalf("token %q", cfg.LicencaToken)
	}
	if !cfg.AutoStart() {
		t.Fatal("auto start should default true")
	}
	wantExe := filepath.Join(dir, "agente.exe")
	if cfg.AgenteExeAbs != wantExe {
		t.Fatalf("agente abs %q want %q", cfg.AgenteExeAbs, wantExe)
	}
}

func TestLoad_MissingRequired(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")
	if err := os.WriteFile(cfgPath, []byte("backend_url: https://x\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	fakeExe := filepath.Join(dir, "launcher.exe")
	_ = os.WriteFile(fakeExe, []byte("x"), 0o644)

	_, err := Load(fakeExe)
	if err == nil {
		t.Fatal("expected error for missing token")
	}
}
