import path from 'path';
import { test, expect, Page, Locator } from '@playwright/test';
import { login } from './helpers/auth';

const MES = 2;
const ANO = 2022;
const OFX_FIXTURE = path.join(__dirname, 'fixtures', 'conciliacao-332.ofx');
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const TEST_EMAIL = process.env.TEST_EMAIL ?? '';
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? '';

// Sufixo único por execução: o motor de matching casa por data/valor/tipo
// (ver backend/src/utils/conciliacao-matching.util.js), não por descrição,
// então a descrição do lançamento pode variar livremente sem afetar o
// resultado. Isso evita colidir com lançamentos "AUTOMATICO LANC 332" etc.
// de execuções anteriores — o que importa pro matching é reproduzir a
// mesma data/valor/tipo do fixture OFX, já fixos nas chamadas abaixo.
//
// Necessário porque um lançamento que chega a ser conciliado não pode mais
// ser excluído (o backend responde 409 "Lançamento já conciliado não pode
// ser removido" — regra de negócio correta, não é algo a contornar). Sem
// descrição única, um lançamento conciliado deixado por uma execução
// anterior fica preso pra sempre nesse período/cliente e quebra qualquer
// execução futura (2 linhas batendo no mesmo locator de texto).
const RUN_TAG = Date.now().toString(36);
const DESCRICOES_CRIADAS_PELO_TESTE = [
  `AUTOMATICO LANC ${RUN_TAG}`,
  `PROVAVEL LANC A ${RUN_TAG}`,
  `PROVAVEL LANC B ${RUN_TAG}`,
  `SEM PAR LANC ${RUN_TAG}`,
];

async function limparLancamentosDoTeste() {
  const loginRes = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, senha: TEST_PASSWORD }),
  });
  if (!loginRes.ok) return;
  const { token } = await loginRes.json();

  const listRes = await fetch(`${API_URL}/lancamentos-contabeis?mes=${MES}&ano=${ANO}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!listRes.ok) return;
  const lancamentos: Array<{ id: string; descricao: string }> = await listRes.json();

  await Promise.all(
    lancamentos
      .filter((l) => DESCRICOES_CRIADAS_PELO_TESTE.includes(l.descricao))
      .map((l) =>
        fetch(`${API_URL}/lancamentos-contabeis/${l.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }),
      ),
  );
}

type NovoLancamento = {
  data: string;
  descricao: string;
  tipo: 'credito' | 'debito';
  valor: string;
};

async function adicionarLancamento(page: Page, lancamento: NovoLancamento) {
  await page.getByRole('button', { name: '+ Adicionar lançamento' }).click();
  await expect(page.getByRole('heading', { name: 'Novo lançamento' })).toBeVisible();

  await page.locator('#data_lancamento').fill(lancamento.data);
  await page.locator('#descricao').fill(lancamento.descricao);
  await page.locator('#tipo').selectOption(lancamento.tipo);
  await page.locator('#valor').fill(lancamento.valor);
  await page.getByRole('button', { name: 'Adicionar lançamento', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Novo lançamento' })).not.toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(lancamento.descricao) })).toBeVisible();
}

function secaoPorTitulo(page: Page, titulo: string): Locator {
  return page.locator('section', { hasText: titulo }).first();
}

test.describe('Conciliação bancária — tela de revisão (/dashboard/conciliacao/[id]) (issue #332)', () => {
  // Limpa antes (cobre resíduo de uma execução anterior que tenha morrido
  // sem rodar o afterEach) e depois (deixa o ambiente limpo pra próxima).
  test.beforeEach(limparLancamentosDoTeste);
  test.afterEach(limparLancamentosDoTeste);

  test('automático, confirmar/rejeitar prováveis, sem par, concluir e baixar relatório', async ({ page }) => {
    test.setTimeout(90000);

    await login(page);
    await page.goto('/dashboard/conciliacao');

    await page.getByLabel('Mês').selectOption(String(MES));
    await page.getByLabel('Ano').selectOption(String(ANO));
    await expect(page.getByRole('heading', { name: 'Lançamentos Internos' })).toBeVisible();

    // Espera o carregarDados() do período assentar antes de criar qualquer
    // lançamento. Criar durante o carregamento é uma corrida real: a resposta
    // desse fetch (disparado pela troca de mês/ano) pode resolver depois do
    // POST de criação e sobrescrever a lista, fazendo o lançamento recém-criado
    // sumir da tela mesmo já salvo no backend.
    await expect(page.getByText('Carregando lançamentos...')).not.toBeVisible();

    // 4 lançamentos: 1 casa automaticamente (mesma data/valor/tipo), 2 ficam
    // prováveis (diferença de data <=3 dias) — um para confirmar, outro para
    // rejeitar — e 1 fica sem transação correspondente.
    await adicionarLancamento(page, {
      data: '2022-02-05',
      descricao: `AUTOMATICO LANC ${RUN_TAG}`,
      tipo: 'credito',
      valor: '1111.11',
    });
    await adicionarLancamento(page, {
      data: '2022-02-10',
      descricao: `PROVAVEL LANC A ${RUN_TAG}`,
      tipo: 'debito',
      valor: '2222.22',
    });
    await adicionarLancamento(page, {
      data: '2022-02-15',
      descricao: `PROVAVEL LANC B ${RUN_TAG}`,
      tipo: 'debito',
      valor: '3333.33',
    });
    await adicionarLancamento(page, {
      data: '2022-02-20',
      descricao: `SEM PAR LANC ${RUN_TAG}`,
      tipo: 'credito',
      valor: '4444.44',
    });

    await page.locator('input[type="file"]').setInputFiles(OFX_FIXTURE);
    await expect(page.getByText('4 transações importadas')).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: 'Nova conciliação' }).click();
    await page.waitForURL(/\/dashboard\/conciliacao\/[^/?]+\?clienteId=/);

    await expect(page.getByRole('heading', { name: 'Revisão da conciliação' })).toBeVisible();
    await expect(page.getByText('Em andamento')).toBeVisible();

    const secaoAutomatico = secaoPorTitulo(page, 'Automático');
    const secaoProvavel = secaoPorTitulo(page, 'Provável');
    const secaoSemPar = secaoPorTitulo(page, 'Sem par');

    // Seção automática: colapsada por padrão, expande para conferir o match real.
    await secaoAutomatico.getByRole('button', { name: 'Ver matches' }).click();
    await expect(
      secaoAutomatico.getByRole('row', { name: /AUTOMATICO TRANSACAO 332.*R\$\s?1\.111,11/ }),
    ).toBeVisible();

    const progressoAntes = await page.getByText(/de \d+ transações conciliadas/).textContent();
    const conciliadasAntes = Number(progressoAntes?.match(/^(\d+)/)?.[1] ?? '0');

    // Concluir deve estar bloqueado enquanto houver prováveis sem decisão.
    await expect(page.getByRole('button', { name: 'Concluir conciliação' })).toBeDisabled();

    const linhaProvavelA = secaoProvavel.getByRole('row', { name: /PROVAVEL TRANSACAO A 332/ });
    await expect(linhaProvavelA).toBeVisible();
    await linhaProvavelA.getByRole('button', { name: 'Confirmar' }).click();
    await expect(linhaProvavelA).not.toBeVisible();
    await expect(
      secaoAutomatico.getByRole('row', { name: /PROVAVEL TRANSACAO A 332/ }),
    ).toBeVisible();

    // Barra de progresso atualiza a cada decisão.
    await expect(page.getByText(new RegExp(`^${conciliadasAntes + 1} de \\d+ transações conciliadas`))).toBeVisible();

    const linhaProvavelB = secaoProvavel.getByRole('row', { name: /PROVAVEL TRANSACAO B 332/ });
    await expect(linhaProvavelB).toBeVisible();
    await linhaProvavelB.getByRole('button', { name: 'Rejeitar' }).click();
    await expect(linhaProvavelB).not.toBeVisible();

    // Rejeitar move a transação para "Sem par" (transações sem lançamento),
    // sem contar como conciliada.
    await expect(
      secaoSemPar.getByRole('row', { name: /PROVAVEL TRANSACAO B 332/ }),
    ).toBeVisible();

    // Sem par: transação e lançamento que nunca tiveram correspondência.
    await expect(secaoSemPar.getByRole('row', { name: /SEM PAR TRANSACAO 332/ })).toBeVisible();
    await expect(secaoSemPar.getByRole('row', { name: new RegExp(`SEM PAR LANC ${RUN_TAG}`) })).toBeVisible();

    // Todos os prováveis decididos — "Concluir" libera.
    const botaoConcluir = page.getByRole('button', { name: 'Concluir conciliação' });
    await expect(botaoConcluir).toBeEnabled();
    await botaoConcluir.click();

    await expect(page.getByRole('heading', { name: 'Concluir conciliação' })).toBeVisible();
    await page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Concluir conciliação' }) })
      .getByRole('button', { name: 'Concluir conciliação' })
      .click();

    await expect(page.getByRole('heading', { name: 'Concluir conciliação' })).not.toBeVisible();
    await expect(page.getByText('Concluída')).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download Relatório' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  });
});
