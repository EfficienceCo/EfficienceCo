import { test, expect } from '@playwright/test';
import { randomUUID } from 'crypto';
import { login } from './helpers/auth';

/**
 * #441 — Folha respondia 403 (não 404) para processamento de outro tenant, o que
 * confirmava a existência do UUID (enumeração). Contrato pós-correção: 404
 * "Processamento não encontrado", indistinguível de um recurso inexistente.
 *
 * Um processamento de outro tenant e um UUID inexistente são, depois da correção,
 * indistinguíveis pela API e pela tela — é exatamente esse o objetivo. O caso
 * cross-tenant com linha real chegando ao handler está coberto na camada HTTP do
 * backend (tests/folha-tenant-isolation-http.test.js). Aqui o foco é a tela: o
 * front mostra "não encontrado" e não vaza nenhuma mensagem estilo 403.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const MENSAGENS_403 = /Acesso negado|não pertence a este cliente|nao pertence a este cliente/i;

test.describe('Folha — isolamento multi-tenant (#441)', () => {
  test('tela de status: processamento não visível aparece como "não encontrado", sem vazar 403', async ({ page }) => {
    await login(page);

    const idAlheio = randomUUID();
    const statusRecebidos: number[] = [];
    page.on('response', (resposta) => {
      if (resposta.url().includes(`/folha/${idAlheio}`)) {
        statusRecebidos.push(resposta.status());
      }
    });

    await page.goto(`/dashboard/folha/status?processamento_id=${idAlheio}`);

    await expect(page.getByText('Processamento não encontrado').first()).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText(MENSAGENS_403)).toHaveCount(0);

    expect(statusRecebidos.length, 'a tela deve ter consultado o endpoint de status').toBeGreaterThan(0);
    expect(statusRecebidos, 'nenhuma resposta pode ser 403').not.toContain(403);
    expect(statusRecebidos.every((s) => s === 404), `esperado só 404, veio ${statusRecebidos}`).toBe(true);
  });

  test('os 4 endpoints de folha respondem 404 (nunca 403) para processamento de outro tenant', async ({ page }) => {
    await login(page);

    const token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token, 'login deve ter guardado o token').toBeTruthy();

    const idAlheio = randomUUID();
    const headers = { Authorization: `Bearer ${token}` };

    const casos = [
      { nome: 'status', metodo: 'GET', url: `${API_BASE}/folha/${idAlheio}` },
      { nome: 'calcular', metodo: 'POST', url: `${API_BASE}/folha/${idAlheio}/calcular` },
      { nome: 'gerar-saida', metodo: 'POST', url: `${API_BASE}/folha/${idAlheio}/gerar-saida` },
      { nome: 'download', metodo: 'GET', url: `${API_BASE}/folha/${idAlheio}/download/holerite_x.pdf` },
    ];

    for (const caso of casos) {
      const resposta =
        caso.metodo === 'GET'
          ? await page.request.get(caso.url, { headers })
          : await page.request.post(caso.url, { headers });

      expect(resposta.status(), `${caso.nome}: esperado 404`).toBe(404);
      expect(resposta.status(), `${caso.nome}: nunca 403`).not.toBe(403);

      const corpo = await resposta.json();
      expect(corpo.erro, `${caso.nome}: mensagem genérica de inexistente`).toMatch(/não encontrado/i);
    }
  });
});
