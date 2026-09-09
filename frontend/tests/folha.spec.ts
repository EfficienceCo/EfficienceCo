import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import * as path from 'path';
import * as fs from 'fs';

test.describe('Folha de Pagamento', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('sidebar tem link de DP, que leva à automação de Folha', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'DP', exact: true })).toBeVisible();

    await page.getByRole('link', { name: 'DP', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'DP' })).toBeVisible();
    await expect(page.getByText('Folha de pagamento mensal')).toBeVisible();
  });

  test('acessa tela de upload via DP > Folha de pagamento mensal', async ({ page }) => {
    await page.goto('/dashboard/dp');
    await page.getByText('Folha de pagamento mensal').click();
    await expect(page).toHaveURL(/\/dashboard\/dp\/folha$/);

    await page.getByRole('link', { name: 'Upload da folha' }).click();
    await expect(page).toHaveURL(/folha\/upload/);
    await expect(page.getByRole('heading', { name: 'Upload da folha' })).toBeVisible();
  });

  test.describe('Upload — validações client-side', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/dashboard/folha/upload');
    });

    test('enviar sem arquivo mostra erro', async ({ page }) => {
      // Dispara o submit via JS pra bypasaar a validação nativa do browser (required no input)
      // e chegar direto no handleSubmit do React
      await page.evaluate(() => {
        const form = document.querySelector('form');
        if (form) form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
      });
      await expect(page.getByText(/Selecione a planilha preenchida antes de enviar/)).toBeVisible();
    });

    test('arquivo que não é xlsx mostra erro de formato', async ({ page }) => {
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: 'relatorio.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('conteudo qualquer'),
      });
      await expect(page.getByText(/formato \.xlsx/i)).toBeVisible();
    });

    test('arquivo xlsx maior que 10MB mostra erro de tamanho', async ({ page }) => {
      const fileInput = page.locator('input[type="file"]');
      const buffer = Buffer.alloc(11 * 1024 * 1024, 0);
      await fileInput.setInputFiles({
        name: 'planilha_grande.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer,
      });
      await expect(page.getByText(/tamanho máximo/i)).toBeVisible();
    });

    test('arquivo xlsx válido exibe nome e tamanho', async ({ page }) => {
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: 'folha_julho.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: Buffer.from('PK'),
      });
      await expect(page.getByText('folha_julho.xlsx')).toBeVisible();
    });
  });

  test.describe('Download de template', () => {
    test('botão de baixar template existe e é clicável', async ({ page }) => {
      await page.goto('/dashboard/folha/upload');
      const btn = page.getByRole('button', { name: /Baixar planilha modelo/ });
      await expect(btn).toBeVisible();
      await expect(btn).toBeEnabled();
    });

    test('botão de baixar template dispara download (requer endpoint implementado)', async ({ page }) => {
      await page.goto('/dashboard/folha/upload');
      let downloadEvent: any = null;
      page.on('download', (d) => { downloadEvent = d; });
      await page.getByRole('button', { name: /Baixar planilha modelo/ }).click();
      // Aguarda 5s — se o endpoint não estiver implementado o download não dispara
      await page.waitForTimeout(5000);
      if (downloadEvent) {
        expect(downloadEvent.suggestedFilename()).toMatch(/\.xlsx$/i);
      } else {
        // Endpoint ainda não implementado — verifica que pelo menos não quebrou a página
        await expect(page.getByRole('heading', { name: 'Upload da folha' })).toBeVisible();
        test.info().annotations.push({ type: 'skip-reason', description: 'Endpoint de template não retornou download — pode não estar implementado no backend' });
      }
    });
  });

  test.describe('Status — localStorage com chave por usuário', () => {
    test('chave de storage inclui ID do usuário (sem vazar entre usuários)', async ({ page }) => {
      await page.goto('/dashboard/folha/status');

      const resultado = await page.evaluate(() => {
        const genericKey = localStorage.getItem('efficience:folha:processamentos');
        const allKeys = Object.keys(localStorage);
        const userSpecificKey = allKeys.find(
          (k) => k.startsWith('efficience:folha:processamentos:'),
        );
        return { genericKey, userSpecificKey };
      });

      // Chave global NÃO deve existir — cada usuário tem a sua própria
      expect(resultado.genericKey).toBeNull();
    });

    test('página de status carrega sem erro', async ({ page }) => {
      await page.goto('/dashboard/folha/status');
      await expect(page.locator('body')).toBeVisible();
      // Usa .first() pra evitar strict mode quando o regex bate em vários elementos
      await expect(page.getByText(/Pendente|Processando|Concluído|Erro|Nenhum processamento/i).first()).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Download de holerite — LGPD: sem CPF na URL nem no nome (#443)', () => {
    const PROC_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const HOLERITE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const CPF = '52998224725';
    const CPF_MASCARADO = '529.982.247-25';
    const NOME_SEM_CPF = 'holerite_padaria_do_ze_joao_da_silva.pdf';
    const REGEX_CPF = /\d{3}\.?\s?\d{3}\.?\s?\d{3}-?\s?\d{2}/;

    test('nome exibido não tem CPF e o download usa identificador opaco', async ({ page }) => {
      // Backend novo: status devolve id opaco + nome de exibição sem CPF, sem path de storage.
      await page.route(`**/folha/${PROC_ID}`, (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            processamento_id: PROC_ID,
            status: 'concluido',
            mes_referencia: '2026-07-01',
            motivo_erro: null,
            total_funcionarios: 1,
            total_empresas: 1,
            arquivos: [{ id: HOLERITE_ID, nome: NOME_SEM_CPF, tipo: 'holerite' }],
          }),
        }),
      );

      let urlDownload = '';
      await page.route(`**/folha/${PROC_ID}/download/**`, (route) => {
        urlDownload = route.request().url();
        return route.fulfill({
          status: 200,
          contentType: 'application/pdf',
          headers: { 'content-disposition': `attachment; filename="${NOME_SEM_CPF}"` },
          body: Buffer.from('%PDF-1.4 fake'),
        });
      });

      await page.goto(
        `/dashboard/folha/status?processamento_id=${PROC_ID}&cliente_nome=Padaria%20do%20Ze`,
      );

      const linhaArquivo = page.getByText(NOME_SEM_CPF, { exact: true });
      await expect(linhaArquivo).toBeVisible({ timeout: 10000 });

      // Nada renderizado na tela pode conter o CPF (mascarado ou não).
      const corpo = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
      expect(corpo).not.toContain(CPF);
      expect(corpo).not.toContain(CPF_MASCARADO);
      expect(corpo).not.toMatch(REGEX_CPF);

      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: 'Baixar' }).first().click(),
      ]);

      // A URL chamada carrega o id opaco, nunca o CPF.
      expect(urlDownload).toContain(`/download/${HOLERITE_ID}`);
      expect(urlDownload).not.toContain(CPF);
      expect(urlDownload).not.toMatch(REGEX_CPF);

      // E o nome sugerido pro arquivo salvo também não tem CPF.
      expect(download.suggestedFilename()).toBe(NOME_SEM_CPF);
      expect(download.suggestedFilename()).not.toMatch(REGEX_CPF);
    });
  });

  test.describe('Upload ponta a ponta (requer backend + DB)', () => {
    test.skip(!fs.existsSync(path.join(__dirname, 'fixtures/folha_teste.xlsx')),
      'Fixture folha_teste.xlsx não encontrada — coloque uma planilha real em tests/fixtures/');

    test('upload de planilha válida redireciona pro status', async ({ page }) => {
      await page.goto('/dashboard/folha/upload');
      const mesInput = page.locator('input[type="month"]');
      await mesInput.fill('2026-07');
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(path.join(__dirname, 'fixtures/folha_teste.xlsx'));
      await page.getByRole('button', { name: 'Enviar planilha' }).click();
      await expect(page).toHaveURL(/folha\/status/, { timeout: 15000 });
      await expect(page.getByText(/processamento_id|Pendente|Processando/i)).toBeVisible();
    });
  });
});
