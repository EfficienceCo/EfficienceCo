import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('Processos — executarAcaoEtapa (issue #269)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('tela de processos carrega normalmente (sem regressão do service atualizado)', async ({ page }) => {
    await page.goto('/dashboard/processos');
    await expect(page.getByRole('heading', { name: 'Processos' })).toBeVisible();
  });

  test('POST .../executar-acao chega no endpoint do #266 com auth real (requer #266 mergeado no backend)', async ({ page }) => {
    await page.goto('/dashboard/processos');

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const resultado = await page.evaluate(async (apiUrl) => {
      const token = window.localStorage.getItem('token');
      const url = `${apiUrl}/processos/00000000-0000-0000-0000-000000000000/etapas/00000000-0000-0000-0000-000000000000/executar-acao`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ capital_social: 1000 }),
      });
      const contentType = response.headers.get('content-type') || '';
      const corpo = contentType.includes('json') ? await response.json() : await response.text();
      return { status: response.status, contentType, corpo };
    }, apiUrl);

    // Rota do #266 ainda não mergeada no backend que está rodando: recebe o 404 HTML
    // padrão do Express (rota inexistente), não o erro JSON do controller. Sem isso o
    // teste não teria como distinguir "rota não existe" de "processo não existe" —
    // os dois retornam status 404 e o texto do 404 padrão ecoa "/processos/" na URL.
    test.skip(
      !resultado.contentType.includes('json'),
      'Endpoint /executar-acao (#266) ainda não está no backend rodando — mergear #266 antes de validar esta integração.',
    );

    expect(resultado.status).toBe(404);
    expect(resultado.corpo.erro).toMatch(/[Pp]rocesso/);
  });
});
