package licenca

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestValidar_Ativa(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/licenca/validar" {
			t.Fatalf("path %s", r.URL.Path)
		}
		if r.Header.Get("x-licenca-token") != "tok-ok" {
			t.Fatalf("token header missing")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ativa":true,"validade":null,"clienteId":"c1","status":"active"}`))
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "tok-ok")
	res, err := c.Validar(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if res.Status != Ativa {
		t.Fatalf("got %v want Ativa", res.Status)
	}
}

func TestValidar_Inativa(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ativa":false,"status":"expired"}`))
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "tok")
	res, err := c.Validar(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if res.Status != Inativa {
		t.Fatalf("got %v want Inativa", res.Status)
	}
}

func TestValidar_NotFound(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"ativa":false,"message":"Licenca nao encontrada"}`))
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "bad")
	res, err := c.Validar(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if res.Status != Inativa {
		t.Fatalf("got %v want Inativa", res.Status)
	}
}

func TestValidar_ErroRede_Timeout(t *testing.T) {
	c := NewClient("http://127.0.0.1:1", "tok")
	res, err := c.Validar(context.Background())
	if err == nil {
		t.Fatal("expected error")
	}
	if res.Status != ErroRede {
		t.Fatalf("got %v want ErroRede", res.Status)
	}
}

func TestValidar_ErroRede_5xx(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "tok")
	res, _ := c.Validar(context.Background())
	if res.Status != ErroRede {
		t.Fatalf("got %v want ErroRede", res.Status)
	}
}
