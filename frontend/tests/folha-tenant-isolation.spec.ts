import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
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
const EMAIL_OUTRO_ESCRITORIO = process.env.TEST_OTHER_OFFICE_EMAIL;
const SENHA_OUTRO_ESCRITORIO = process.env.TEST_OTHER_OFFICE_PASSWORD;

async function sessaoDoEscritorio(page: Page) {
  const token = await page.evaluate(() => localStorage.getItem('token'));
  if (!token) throw new Error('O login de teste não gravou o token da sessão.');
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  expect(claims.perfil).toBe('admin_cliente');
  expect(claims.cliente_id).toBeTruthy();
  return { clienteId: claims.cliente_id as string, headers: { Authorization: `Bearer ${token}` } };
}

test.describe('Folha — isolamento multi-tenant (#441)', () => {
  test('outro escritório não recebe os dados de uma folha existente (#781)', async ({ page, browser, baseURL }) => {
    test.skip(!EMAIL_OUTRO_ESCRITORIO || !SENHA_OUTRO_ESCRITORIO,
      'Configure TEST_OTHER_OFFICE_EMAIL e TEST_OTHER_OFFICE_PASSWORD com outro escritório sintético.');
    test.setTimeout(60_000);

    await login(page, EMAIL_OUTRO_ESCRITORIO, SENHA_OUTRO_ESCRITORIO);
    const proprietario = await sessaoDoEscritorio(page);
    const upload = await page.request.post(`${API_BASE}/folha/upload`, {
      headers: proprietario.headers,
      multipart: {
        mes_referencia: '2026-09',
        planilha: {
          name: 'folha-437.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          buffer: readFileSync(path.join(__dirname, 'fixtures/folha-437.xlsx')),
        },
      },
    });
    expect(upload.status()).toBe(201);
    const { processamento_id: id } = await upload.json();
    expect(id).toBeTruthy();
    const urlDetalhe = `${API_BASE}/folha/${id}`;
    const urlTela = `/dashboard/folha/status?processamento_id=${id}`;

    let holerite: { nome: string; funcionario: string } | undefined;
    await expect.poll(async () => {
      const resposta = await page.request.get(urlDetalhe, { headers: proprietario.headers });
      await expect(resposta).toBeOK();
      const detalhe = await resposta.json();
      expect(detalhe.processamento_id).toBe(id);
      holerite = detalhe.arquivos.find((arquivo: { tipo: string }) => arquivo.tipo === 'holerite');
      return detalhe.status === 'concluido' && Boolean(holerite?.funcionario);
    }, { timeout: 20_000 }).toBe(true);
    if (!holerite) throw new Error('A folha do escritório proprietário não retornou holerite.');

    const outroContexto = await browser.newContext({ baseURL });
    try {
      const outraPagina = await outroContexto.newPage();
      await login(outraPagina);
      const outroEscritorio = await sessaoDoEscritorio(outraPagina);
      expect(outroEscritorio.clienteId).not.toBe(proprietario.clienteId);

      const consulta = outraPagina.waitForResponse((resposta) =>
        resposta.request().method() === 'GET' && resposta.url() === urlDetalhe);
      await outraPagina.goto(urlTela);
      const resposta = await consulta;
      expect(resposta.status()).toBe(404);
      expect(await resposta.json()).toEqual({ erro: 'Processamento não encontrado' });
      await expect(outraPagina.getByText('Processamento não encontrado', { exact: true }).first()).toBeVisible();
      await expect(outraPagina.getByText(holerite.nome, { exact: true })).toHaveCount(0);
      await expect(outraPagina.getByText(holerite.funcionario)).toHaveCount(0);
      await expect(outraPagina.getByRole('button', { name: 'Baixar', exact: true })).toHaveCount(0);

      const listagem = await outraPagina.request.get(`${API_BASE}/folha`, { headers: outroEscritorio.headers });
      await expect(listagem).toBeOK();
      const { processamentos } = await listagem.json();
      expect(processamentos).not.toContainEqual(expect.objectContaining({ id }));
    } finally {
      await outroContexto.close();
    }
  });

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
