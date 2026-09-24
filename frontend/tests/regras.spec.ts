import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('Regras de automação — normalizarCondicao só JSONB (issue #271)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/dashboard/regras');
  });

  test('tela carrega e exibe a lista de regras sem quebrar', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Regras de automação' })).toBeVisible();
  });

  test('condicao em JSONB é exibida formatada, sem JSON cru nem "Sem filtros" indevido', async ({ page }) => {
    // Regra real do cliente do usuário de teste, com condicao já em JSONB
    // ({ in_name: "NF", extensao: "pdf" }) — se normalizarCondicao quebrasse ao remover
    // o suporte a string, a linha da tabela ficaria sem essa formatação (ou "[object Object]").
    await expect(page.getByRole('cell', { name: /Nome contém "NF"; Extensão \.pdf/i })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText('[object Object]')).not.toBeVisible();
  });

  test('editar regra pré-popula o formulário a partir da condicao JSONB (regraParaFormulario)', async ({ page }) => {
    await page.getByRole('row', { name: /Nome contém "NF"/i }).getByRole('button', { name: 'Editar' }).click();

    await expect(page.locator('#condicao_in_name')).toHaveValue('NF');
    await expect(page.locator('#condicao_extensao')).toHaveValue('pdf');
  });
});

test.describe('Regras de automação — pasta_origem validada (issue #484)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/dashboard/regras');
    await page.getByRole('button', { name: 'Nova regra' }).click();
  });

  test('rejeita caminho malformado (C;\\Souza) com mensagem clara e sem chamar a API', async ({ page }) => {
    let postsEnviados = 0;
    await page.route('**/regras', (route) => {
      if (route.request().method() === 'POST') postsEnviados += 1;
      return route.continue();
    });

    await page.locator('#pasta_origem').fill('C;\\Souza');
    await page.locator('#pasta_destino').fill('C:\\Souza\\SAIDA');
    await page.getByRole('button', { name: 'Criar regra' }).click();

    await expect(page.getByText(/Pasta origem inválida: informe um caminho absoluto do Windows/)).toBeVisible();
    expect(postsEnviados).toBe(0);
  });

  test('aceita caminho absoluto válido e envia a regra', async ({ page }) => {
    let corpo: Record<string, unknown> | null = null;
    await page.route('**/regras', (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      corpo = route.request().postDataJSON();
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'mock-484', ...corpo }),
      });
    });

    await page.locator('#pasta_origem').fill('C:\\Souza\\ENTRADA');
    await page.locator('#pasta_destino').fill('C:\\Souza\\SAIDA');
    await page.getByRole('button', { name: 'Criar regra' }).click();

    await expect(page.getByText(/Pasta origem inválida/)).toHaveCount(0);
    await expect.poll(() => corpo?.pasta_origem).toBe('C:\\Souza\\ENTRADA');
  });
});

test.describe('Regras de automação — edição de regra legada (issue #484)', () => {
  const regraLegada = {
    id: 'legada-484',
    cliente_id: 'c1',
    acao: 'mover',
    pasta_origem: 'ENTRADA',
    pasta_destino: 'C:\\Souza\\SAIDA',
    condicao: {},
    ativa: true,
  };

  test.beforeEach(async ({ page }) => {
    await login(page);
    // só a API (pathname exato): não intercepta a página /dashboard/regras nem os fetches RSC dela
    await page.route((url) => url.pathname === '/regras', (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([regraLegada]) })
        : route.continue(),
    );
    await page.goto('/dashboard/regras');
    await page.getByRole('row', { name: /ENTRADA/ }).getByRole('button', { name: 'Editar' }).click();
  });

  test('editar só o destino não revalida nem reenvia a origem legada', async ({ page }) => {
    let corpo: Record<string, unknown> | null = null;
    await page.route('**/regras/legada-484**', (route) => {
      corpo = route.request().postDataJSON();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...regraLegada, ...corpo }),
      });
    });

    await page.locator('#pasta_destino').fill('C:\\Souza\\NOVO');
    await page.getByRole('button', { name: 'Salvar alterações' }).click();

    await expect(page.getByText(/Pasta origem inválida/)).toHaveCount(0);
    await expect.poll(() => corpo?.pasta_destino).toBe('C:\\Souza\\NOVO');
    expect(corpo).not.toHaveProperty('pasta_origem');
  });

  test('alterar a origem para valor malformado continua sendo barrado', async ({ page }) => {
    await page.locator('#pasta_origem').fill('C;\\Souza');
    await page.getByRole('button', { name: 'Salvar alterações' }).click();

    await expect(page.getByText(/Pasta origem inválida/)).toBeVisible();
  });
});
