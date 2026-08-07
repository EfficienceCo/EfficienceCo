package licenca

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Status is the license check outcome for the tray menu.
type Status int

const (
	Desconhecido Status = iota
	Ativa
	Inativa
	ErroRede
)

func (s Status) String() string {
	switch s {
	case Ativa:
		return "Ativa"
	case Inativa:
		return "Inativa"
	case ErroRede:
		return "Sem conexão"
	default:
		return "Desconhecido"
	}
}

// Result holds the parsed API response plus classification.
type Result struct {
	Status    Status
	Ativa     bool
	Validade  string
	ClienteID string
	APIStatus string
	Message   string
}

type responseBody struct {
	Ativa     bool   `json:"ativa"`
	Validade  string `json:"validade"`
	ClienteID string `json:"clienteId"`
	Status    string `json:"status"`
	Message   string `json:"message"`
	Erro      string `json:"erro"`
}

// Client calls GET /licenca/validar.
type Client struct {
	HTTP    *http.Client
	BaseURL string
	Token   string
}

func NewClient(baseURL, token string) *Client {
	return &Client{
		HTTP: &http.Client{
			Timeout: 5 * time.Second,
		},
		BaseURL: strings.TrimRight(baseURL, "/"),
		Token:   token,
	}
}

// Validar contacts the backend. Network/5xx → ErroRede; ativa:false/404 → Inativa.
func (c *Client) Validar(ctx context.Context) (Result, error) {
	url := c.BaseURL + "/licenca/validar"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return Result{Status: ErroRede, Message: err.Error()}, err
	}
	req.Header.Set("x-licenca-token", c.Token)
	req.Header.Set("Accept", "application/json")

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return Result{
			Status:  ErroRede,
			Message: "Falha de conexão — não foi possível validar a licença",
		}, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return Result{Status: ErroRede, Message: "Falha ao ler resposta da licença"}, err
	}

	if resp.StatusCode >= 500 {
		return Result{
			Status:  ErroRede,
			Message: fmt.Sprintf("Servidor indisponível (HTTP %d)", resp.StatusCode),
		}, fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	var parsed responseBody
	_ = json.Unmarshal(body, &parsed)
	msg := parsed.Message
	if msg == "" {
		msg = parsed.Erro
	}

	if resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusBadRequest {
		return Result{
			Status:    Inativa,
			Ativa:     false,
			Message:   firstNonEmpty(msg, "Licença não encontrada ou token inválido"),
			APIStatus: parsed.Status,
		}, nil
	}

	if resp.StatusCode != http.StatusOK {
		// Other 4xx treated as inactive license/auth problem.
		if resp.StatusCode >= 400 && resp.StatusCode < 500 {
			return Result{
				Status:  Inativa,
				Ativa:   false,
				Message: firstNonEmpty(msg, fmt.Sprintf("Licença rejeitada (HTTP %d)", resp.StatusCode)),
			}, nil
		}
		return Result{
			Status:  ErroRede,
			Message: fmt.Sprintf("Resposta inesperada (HTTP %d)", resp.StatusCode),
		}, fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	if !parsed.Ativa {
		return Result{
			Status:    Inativa,
			Ativa:     false,
			Validade:  parsed.Validade,
			ClienteID: parsed.ClienteID,
			APIStatus: parsed.Status,
			Message:   firstNonEmpty(msg, "Licença inativa ou expirada"),
		}, nil
	}

	return Result{
		Status:    Ativa,
		Ativa:     true,
		Validade:  parsed.Validade,
		ClienteID: parsed.ClienteID,
		APIStatus: parsed.Status,
		Message:   "Licença ativa",
	}, nil
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}
