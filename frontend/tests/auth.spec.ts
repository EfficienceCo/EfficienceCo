import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test('login com credenciais válidas vai pro dashboard', async ({ page }) => {
  await login(page);
  await expect(page).toHaveURL(/\/dashboard/);
});

test('login sem preencher campos não submete', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrar' }).click();
  // required no input — browser bloqueia antes de chegar no servidor
  await expect(page).toHaveURL('/');
});

test('login com senha errada mostra erro', async ({ page }) => {
  await page.goto('/');
  await page.locator('#email').fill(process.env.TEST_EMAIL ?? '');
  await page.locator('#password').fill('senha_errada_xpto_999');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible({ timeout: 8000 });
  await expect(page.locator('p.text-rose-200')).toBeVisible();
});

test('não autenticado é redirecionado pra raiz', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL('/');
});
