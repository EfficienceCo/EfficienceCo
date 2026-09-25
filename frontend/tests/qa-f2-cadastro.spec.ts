import { test, expect, Page } from '@playwright/test';
import { login } from './helpers/auth';

// QA-F (#397) 2ª passagem — camada 1 — fase 1: cadastro do regime pela UI (F1/#496).
//
// Bateria de QA contra o backend + Supabase de DEV reais (não usa page.route):
// cria os 7 clientes "QA-F2 *" pela tela /admin/clientes, que depois recebem
// NF-e/folha de backend/scripts/qa/qa-f2-seed.mjs e são usados por
// qa-f2-apuracao.spec.ts. Idempotente: cliente que já existe não é recriado.
// Resultado da passagem: efficience-vault/problemas/apuracao-simples-qa-f-2026-09-25.md
//
// Ordem: qa-f2-cadastro.spec.ts → node scripts/qa/qa-f2-seed.mjs --reset → qa-f2-apuracao.spec.ts

const ADMIN = { email: process.env.QA_ADMIN_EMAIL || 'admin@teste.com', senha: process.env.QA_ADMIN_SENHA || '123456' };
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type ClienteSeed = {
  nome: string;
  regime: string;
  anexo?: string;
  historico?: { mes: number; ano: number; receita: string }[];
};

const MESES_HIST_F = Array.from({ length: 12 }, (_, i) => {
  const idx = 2025 * 12 + 7 + i; // 2025-08 .. 2026-07
  return { mes: (idx % 12) + 1, ano: Math.floor(idx / 12), receita: '15000' };
});

const CLIENTES: ClienteSeed[] = [
  {
    nome: 'QA-F2 Comercio Anexo I',
    regime: 'simples_nacional',
    anexo: 'I',
    historico: [
      { mes: 8, ano: 2025, receita: '20000' }, // mês SEM nota → entra na RBT12
      { mes: 9, ano: 2025, receita: '99999' }, // mês COM nota → deve ser ignorado
    ],
  },
  { nome: 'QA-F2 Servicos V FatorR 40', regime: 'simples_nacional', anexo: 'V' },
  { nome: 'QA-F2 Servicos V FatorR 16', regime: 'simples_nacional', anexo: 'V' },
  { nome: 'QA-F2 Servicos V FatorR 28', regime: 'simples_nacional', anexo: 'V' },
  { nome: 'QA-F2 Inicio Atividade', regime: 'simples_nacional', anexo: 'I' },
  { nome: 'QA-F2 Anexo III So Historico', regime: 'simples_nacional', anexo: 'III', historico: MESES_HIST_F },
  { nome: 'QA-F2 Lucro Presumido', regime: 'lucro_presumido' },
];

function monitorar(page: Page) {
  const problemas: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') problemas.push(`console: ${m.text()}`); });
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().startsWith(API)) problemas.push(`network ${r.status()} ${r.request().method()} ${r.url()}`);
  });
  return problemas;
}

async function abrirClientes(page: Page) {
  await login(page, ADMIN.email, ADMIN.senha);
  await page.goto('/admin/clientes');
  await expect(page.getByRole('heading', { name: 'Novo cliente' })).toBeVisible();
  await expect(page.getByText('Carregando clientes...')).toHaveCount(0, { timeout: 15000 });
}

test.describe.configure({ mode: 'serial' });

test('C1 — validação: Simples sem anexo é barrado na tela', async ({ page }) => {
  const problemas = monitorar(page);
  await abrirClientes(page);
  await page.locator('#nome').fill('QA-F2 NAO DEVE SER CRIADO');
  await page.locator('#regime_tributario').selectOption('simples_nacional');
  await page.getByRole('button', { name: 'Cadastrar cliente' }).click();
  await expect(page.getByText(/Escolha o anexo do Simples/)).toBeVisible();
  // Trocar pra outro regime zera e desabilita o anexo
  await page.locator('#anexo_simples').selectOption('II');
  await page.locator('#regime_tributario').selectOption('lucro_real');
  await expect(page.locator('#anexo_simples')).toBeDisabled();
  await expect(page.locator('#anexo_simples')).toHaveValue('');
  await page.screenshot({ path: 'test-results/qa-f2/C1-validacao.png', fullPage: true });
  console.log('C1 problemas:', JSON.stringify(problemas));
});

test('C2 — cadastra os clientes QA-F2 pela UI (regime + anexo + histórico)', async ({ page }) => {
  test.setTimeout(180000);
  const problemas = monitorar(page);
  await abrirClientes(page);

  for (const c of CLIENTES) {
    const linha = page.locator('tr', { has: page.getByText(c.nome, { exact: true }) });
    if (await linha.count() === 0) {
      await page.locator('#nome').fill(c.nome);
      await page.locator('#regime_tributario').selectOption(c.regime);
      if (c.anexo) await page.locator('#anexo_simples').selectOption(c.anexo);
      await page.getByRole('button', { name: 'Cadastrar cliente' }).click();
      await expect(page.locator('tr', { has: page.getByText(c.nome, { exact: true }) })).toHaveCount(1, { timeout: 15000 });
    }

    if (c.historico) {
      await page.getByRole('button', { name: `Editar regime tributário de ${c.nome}` }).click();
      const modal = page.locator('form', { has: page.locator('#regime-editor') });
      await expect(modal).toBeVisible();
      // Zera linhas existentes (idempotência)
      while (await modal.getByRole('button', { name: /Remover a linha/ }).count() > 0) {
        await modal.getByRole('button', { name: /Remover a linha/ }).first().click();
      }
      for (const [i, h] of c.historico.entries()) {
        await modal.getByRole('button', { name: 'Adicionar mês' }).click();
        await modal.getByLabel(`Mês da linha ${i + 1}`).selectOption(String(h.mes));
        await modal.getByLabel(`Ano da linha ${i + 1}`).fill(String(h.ano));
        await modal.getByLabel(`Receita da linha ${i + 1}`).fill(h.receita);
      }
      await modal.getByRole('button', { name: 'Salvar regime' }).click();
      await expect(page.locator('#regime-editor')).toHaveCount(0, { timeout: 15000 });
    }

    const linhaFinal = page.locator('tr', { has: page.getByText(c.nome, { exact: true }) });
    const texto = await linhaFinal.innerText();
    console.log(`C2 linha "${c.nome}": ${texto.replace(/\s+/g, ' ')}`);
  }

  await page.screenshot({ path: 'test-results/qa-f2/C2-lista.png', fullPage: true });
  console.log('C2 problemas:', JSON.stringify(problemas));
});

test('C3 — histórico inválido (competência repetida / receita negativa) é barrado', async ({ page }) => {
  const problemas = monitorar(page);
  await abrirClientes(page);
  const nome = 'QA-F2 Inicio Atividade';
  await page.getByRole('button', { name: `Editar regime tributário de ${nome}` }).click();
  const modal = page.locator('form', { has: page.locator('#regime-editor') });

  await modal.getByRole('button', { name: 'Adicionar mês' }).click();
  await modal.getByLabel('Mês da linha 1').selectOption('3');
  await modal.getByLabel('Ano da linha 1').fill('2026');
  await modal.getByLabel('Receita da linha 1').fill('1000');
  await modal.getByRole('button', { name: 'Adicionar mês' }).click();
  await modal.getByLabel('Mês da linha 2').selectOption('3');
  await modal.getByLabel('Ano da linha 2').fill('2026');
  await modal.getByLabel('Receita da linha 2').fill('2000');
  await modal.getByRole('button', { name: 'Salvar regime' }).click();
  const erroDup = await modal.locator('p.bg-rose-50').innerText().catch(() => '(sem mensagem)');
  console.log('C3 duplicado ->', erroDup);

  await modal.getByRole('button', { name: 'Remover a linha 2 do histórico' }).click();
  await modal.getByLabel('Receita da linha 1').fill('-5');
  await modal.getByRole('button', { name: 'Salvar regime' }).click();
  const erroNeg = await modal.locator('p.bg-rose-50').innerText().catch(() => '(sem mensagem)');
  // Achado G9: o min=0 nativo do input barra o submit sem mensagem da tela e o erro anterior fica preso.
  console.log('C3 negativo ->', erroNeg);

  // Competência futura no histórico (mês ainda não fechado)
  await modal.getByLabel('Receita da linha 1').fill('1000');
  await modal.getByLabel('Mês da linha 1').selectOption('12');
  await modal.getByLabel('Ano da linha 1').fill('2026');
  await page.screenshot({ path: 'test-results/qa-f2/C3-historico-invalido.png', fullPage: true });

  await modal.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.locator('#regime-editor')).toHaveCount(0);
  console.log('C3 problemas:', JSON.stringify(problemas));
});
