import { Page } from '@playwright/test';

const TEST_EMAIL = process.env.TEST_EMAIL ?? '';
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? '';

export async function login(page: Page, email = TEST_EMAIL, password = TEST_PASSWORD) {
  await page.goto('/');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/dashboard**');
}

export async function logout(page: Page) {
  await page.evaluate(() => {
    localStorage.removeItem('token');
    window.dispatchEvent(new Event('auth-token-changed'));
  });
  await page.waitForURL('/');
}
