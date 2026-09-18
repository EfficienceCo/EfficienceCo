import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import * as path from 'path';
import * as fs from 'fs';
import { PDFParse } from 'pdf-parse';

// Verificação ponta a ponta do #437: o motor precisa selecionar a tabela
// INSS/IRRF pela competência do processamento. Lote do QA-B §1: 5 salários
// cruzando faixas, competência 2026-09. Antes da correção o líquido do lote
// somava R$ 18.986,69 (tabelas de 2024); o correto para 2026 é R$ 19.558,70.
//
// Requer: backend em :3001, next dev em :3000, Supabase de dev, e o usuário de
// teste (.env.test) com cliente vinculado.

const FIXTURE = path.join(__dirname, 'fixtures/folha-437.xlsx');
const DEBUG_DIR = path.join(__dirname, '..', 'test-results', 'folha-437');

async function textoDoPdf(download: import('@playwright/test').Download, apelido: string): Promise<string> {
  const origem = await download.path();
  if (!origem) throw new Error(`download sem path: ${apelido}`);
  fs.mkdirSync(DEBUG_DIR, { recursive: true });
  const destino = path.join(DEBUG_DIR, `${apelido}.pdf`);
  fs.copyFileSync(origem, destino);
  const parser = new PDFParse({ data: fs.readFileSync(origem) });
  try {
    const { text } = await parser.getText();
    return text;
  } finally {
    await parser.destroy();
  }
}

// pdfkit insere kerning entre glifos — remover TODO espaço deixa a busca por
// valores monetários ("19558,70", "988,09") estável.
const semEspacos = (s: string) => s.replace(/\s+/g, '');

test.describe('#437 — folha usa a tabela fiscal da competência', () => {
  test.skip(!fs.existsSync(FIXTURE), 'fixture tests/fixtures/folha-437.xlsx ausente');

  test('lote de 5 salários em 2026-09 fecha com as tabelas de 2026', async ({ page }) => {
    test.setTimeout(300_000);

    await login(page);

    // --- upload da planilha com competência 2026-09 ---
    await page.goto('/dashboard/folha/upload');
    await expect(page.getByRole('heading', { name: 'Upload da folha' })).toBeVisible();
    await page.locator('input[type="month"]').fill('2026-09');
    await page.locator('input[type="file"]').setInputFiles(FIXTURE);
    await page.getByRole('button', { name: 'Enviar planilha' }).click();

    await expect(page).toHaveURL(/folha\/status/, { timeout: 20_000 });

    const linhaProc = page.locator('table tbody tr').first();
    const itensArquivo = linhaProc.locator('td ul li');

    // Aguarda o pipeline automático (cálculo + geração dos 6 PDFs). O status vira
    // "Concluído" já no fim do cálculo, e a geração dos arquivos termina alguns
    // segundos depois — como o polling da tela para quando não há processamento
    // "em andamento", recarrega a página até os 6 arquivos aparecerem.
    // 5 funcionários da mesma empresa => 5 holerites + 1 relatório de fechamento.
    await expect(async () => {
      await page.reload();
      await expect(linhaProc.getByText('Concluído', { exact: true })).toBeVisible({ timeout: 10_000 });
      await expect(itensArquivo).toHaveCount(6, { timeout: 5_000 });
    }).toPass({ timeout: 150_000, intervals: [2_000, 3_000, 5_000] });

    // --- relatório de fechamento: TOTAL LÍQUIDO do lote ---
    const itemRelatorio = itensArquivo.filter({ hasText: /relatorio_fechamento/i });
    const [dlRelatorio] = await Promise.all([
      page.waitForEvent('download'),
      itemRelatorio.getByRole('button', { name: /Baixar/ }).click(),
    ]);
    const txtRelatorio = semEspacos(await textoDoPdf(dlRelatorio, 'relatorio-fechamento'));

    expect(txtRelatorio).toContain('19558,70'); // líquido do lote com as tabelas de 2026
    expect(txtRelatorio).not.toContain('18986,69'); // valor com as tabelas de 2024 (bug)

    // --- holerite do salário de R$ 9.000: INSS no teto + IRRF sem redução mensal ---
    const itemHoleriteAlto = itensArquivo.filter({ hasText: /elisa_cinco/i });
    const [dlHoleriteAlto] = await Promise.all([
      page.waitForEvent('download'),
      itemHoleriteAlto.getByRole('button', { name: /Baixar/ }).click(),
    ]);
    const txtHoleriteAlto = semEspacos(await textoDoPdf(dlHoleriteAlto, 'holerite-9000'));

    expect(txtHoleriteAlto).toContain('988,09'); // INSS teto 2026 (era 908,85)
    expect(txtHoleriteAlto).toContain('1190,27'); // IRRF 2026 (era 1224,79)
    expect(txtHoleriteAlto).toContain('6821,64'); // líquido 2026 (era 6866,36)

    // --- holerite do salário de R$ 6.000 c/ variáveis: faixa de saída da redução mensal ---
    const itemHoleriteMedio = itensArquivo.filter({ hasText: /diego_quatro/i });
    const [dlHoleriteMedio] = await Promise.all([
      page.waitForEvent('download'),
      itemHoleriteMedio.getByRole('button', { name: /Baixar/ }).click(),
    ]);
    const txtHoleriteMedio = semEspacos(await textoDoPdf(dlHoleriteMedio, 'holerite-6000'));

    expect(txtHoleriteMedio).toContain('642,15'); // INSS 2026
    expect(txtHoleriteMedio).toContain('334,65'); // IRRF 2026 com redução mensal (Lei 15.270/2025)
    expect(txtHoleriteMedio).toContain('4167,75'); // líquido 2026
  });
});
