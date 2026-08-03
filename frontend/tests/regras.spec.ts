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
