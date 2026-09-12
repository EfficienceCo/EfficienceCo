import { test, expect } from '@playwright/test';

// QA-H — Calendário Fiscal (rodízio de estabilização, issue #399).
// Camada 1 (Claude, automatizada): roda contra backend local + Supabase de dev
// (sem mock de rota — dados reais criados via API antes do teste, mesmo padrão
// de QA-C/QA-E). Login real com credencial de dev (joao@teste.com / senha123,
// admin_cliente do "Cliente Teste").

async function login(page) {
  await page.goto('/');
  await page.locator('#email').fill('joao@teste.com');
  await page.locator('#password').fill('senha123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/dashboard**');
}

test.describe('QA-H — Calendário Fiscal', () => {
  test('lista de prazos vem ordenada por data de vencimento crescente', async ({ page }) => {
    await login(page);
    await page.goto('/dashboard/obrigacoes');
    await page.waitForSelector('table');

    const linhas = page.locator('table tbody tr');
    const total = await linhas.count();
    expect(total).toBeGreaterThan(0);

    const datas: string[] = [];
    for (let i = 0; i < total; i++) {
      const texto = await linhas.nth(i).locator('td').nth(2).innerText();
      datas.push(texto.trim());
    }

    const paraTimestamp = (dataBr: string) => {
      const [d, m, a] = dataBr.split('/').map(Number);
      return new Date(a, m - 1, d).getTime();
    };

    const timestamps = datas.filter((d) => d !== '-').map(paraTimestamp);
    const ordenado = [...timestamps].sort((a, b) => a - b);
    expect(timestamps).toEqual(ordenado);
  });

  test('badge de status distingue atrasada/pendente/concluida, mas não distingue urgência (7 vs 30 vs 60 dias)', async ({ page }) => {
    await login(page);
    await page.goto('/dashboard/obrigacoes');
    await page.waitForSelector('table');

    // "vence em 2d" e "vence em 7d" caem no mesmo mês (visíveis sem trocar o
    // filtro) — ambas pendentes, ambas deveriam ter urgência bem diferente.
    const linha2d = page.locator('tr', { hasText: 'QA-H vence em 2d' });
    const linha7d = page.locator('tr', { hasText: 'QA-H vence em 7d' });

    const badge2d = linha2d.locator('span').first();
    const badge7d = linha7d.locator('span').first();

    await expect(badge2d).toHaveText('Pendente');
    await expect(badge7d).toHaveText('Pendente');

    // Mesma classe de cor (amber) para quem vence em 2 dias e em 7 dias — não
    // há diferenciação visual de urgência dentro do status "pendente".
    const classe2d = await badge2d.getAttribute('class');
    const classe7d = await badge7d.getAttribute('class');
    expect(classe2d).toBe(classe7d);
  });

  test('filtro Status=Atrasada não retorna as obrigações vencidas (bug de status persistido)', async ({ page }) => {
    await login(page);
    await page.goto('/dashboard/obrigacoes?');
    await page.waitForSelector('table');

    await expect(page.locator('tr', { hasText: 'QA-H vencida 10d' })).toBeVisible();

    await page.locator('label', { hasText: 'Status' }).locator('select').selectOption('atrasada');
    await page.waitForTimeout(500);

    const semPrazos = page.getByText('Nenhum prazo encontrado para os filtros ativos.');
    await expect(semPrazos).toBeVisible();
    await expect(page.locator('tr', { hasText: 'QA-H vencida 10d' })).toHaveCount(0);
  });

  test('widget "Próximas obrigações" no dashboard não colore por urgência', async ({ page }) => {
    await login(page);
    await page.goto('/dashboard');

    const card = page
      .locator('section.rounded-xl.border.border-slate-200')
      .filter({ has: page.getByRole('heading', { name: 'Próximas obrigações' }) });
    await expect(card).toBeVisible();
    await expect(card.getByText('QA-H vence em 2d')).toBeVisible();

    const badge = card.locator('li', { hasText: 'QA-H vence em 2d' }).locator('span').first();
    await expect(badge).toHaveClass(/bg-zinc-200/);
  });

  test('admin_efficience (staff) não consegue abrir o Calendário Fiscal — sem seletor de cliente na tela', async ({ page }) => {
    await page.goto('/');
    await page.locator('#email').fill('admin@teste.com');
    await page.locator('#password').fill('123456');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.waitForURL('**/dashboard**');

    await page.goto('/dashboard/obrigacoes');
    // A tela não mostra fallback amigável: vaza o erro crú do backend
    // ("cliente_id é obrigatório") direto pro contador/staff, sem nenhum
    // seletor de cliente pra contornar (diferente da tela de eSocial).
    await page.waitForSelector('text=cliente_id é obrigatório');

    await expect(page.getByText('cliente_id é obrigatório')).toBeVisible();
    await expect(page.locator('select, [role="combobox"]').filter({ hasText: /cliente/i })).toHaveCount(0);
  });
});
