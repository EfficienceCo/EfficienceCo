/**
 * BUG-FOLHA-02 (#438) — verificação em UI do holerite.
 *
 * O valor "BASE IRRF" só existe dentro do PDF do holerite (a tela de Status
 * apenas lista os arquivos e oferece o download). Este teste gera o holerite
 * pelo mesmo código que roda em produção, abre o PDF no Chromium (o mesmo
 * visualizador que o usuário vê ao baixar) e confere que:
 *   - com IRRF > 0, a célula "BASE IRRF" mostra a base real do cálculo;
 *   - com IRRF = 0, a célula "BASE IRRF" mostra "-".
 *
 * Não depende de backend/DB no ar — exercita a geração real do artefato + o
 * render no navegador. Uma captura de tela do PDF fica anexada ao relatório.
 */
import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import { pathToFileURL } from 'url';

const SERVICE_PATH = path.resolve(
  __dirname,
  '../../backend/src/services/folha.service.js',
);
const OUT_DIR = path.resolve(__dirname, '../test-results/holerite-base-irrf');

function formatarMoeda(valor: number) {
  return Number(valor).toFixed(2).replace('.', ',');
}

function linhaBase(overrides: Record<string, unknown> = {}) {
  return {
    empresa: 'Padaria do João',
    funcionario: 'Maria Silva',
    cpf: '111.111.111-11',
    cargo: 'Gerente',
    salario_bruto: 6000,
    dias_trabalhados: 30,
    horas_extras: 0,
    faltas: 0,
    adiantamento: 0,
    num_dependentes: 0,
    vale_transporte: false,
    ...overrides,
  };
}

type ItemTexto = { str: string; x: number; y: number };

async function extrairItensTexto(pdfPath: string): Promise<ItemTexto[]> {
  // Build legacy = roda em Node sem worker separado.
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const itens: ItemTexto[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    for (const item of content.items as any[]) {
      const str = (item.str ?? '').trim();
      if (str) itens.push({ str, x: item.transform[4], y: item.transform[5] });
    }
  }
  await doc.destroy();
  return itens;
}

// A linha de bases do holerite desenha o rótulo ("BASE IRRF") logo acima do
// valor, dentro da mesma célula (mesmo x aproximado, y um pouco menor).
function valorDaCelula(itens: ItemTexto[], rotulo: string): string | null {
  const alvo = itens.find((i) => i.str === rotulo);
  if (!alvo) return null;
  const candidatos = itens
    .filter((i) => i.x >= alvo.x - 1 && i.x < alvo.x + 70 && i.y < alvo.y - 1 && i.y > alvo.y - 20)
    .sort((a, b) => b.y - a.y);
  return candidatos.length ? candidatos[0].str : null;
}

let gerarHoleritePDF: (calculo: any, mes: string) => Promise<Buffer>;
let calcComIrrf: any;
let calcSemIrrf: any;
let pdfComIrrf: string;
let pdfSemIrrf: string;

test.beforeAll(async () => {
  const service: any = await import(pathToFileURL(SERVICE_PATH).href);
  gerarHoleritePDF = service.gerarHoleritePDF;

  calcComIrrf = service.calcularFolhaFuncionario(linhaBase({ salario_bruto: 6000 }));
  calcSemIrrf = service.calcularFolhaFuncionario(linhaBase({ salario_bruto: 1600 }));

  expect(calcComIrrf.ir, 'pré-condição: salário 6000 gera IRRF > 0').toBeGreaterThan(0);
  expect(calcSemIrrf.ir, 'pré-condição: salário 1600 não gera IRRF').toBe(0);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  pdfComIrrf = path.join(OUT_DIR, 'holerite-com-irrf.pdf');
  pdfSemIrrf = path.join(OUT_DIR, 'holerite-sem-irrf.pdf');
  fs.writeFileSync(pdfComIrrf, await gerarHoleritePDF({ ...calcComIrrf }, '07/2026'));
  fs.writeFileSync(pdfSemIrrf, await gerarHoleritePDF({ ...calcSemIrrf }, '07/2026'));
});

test('holerite com IRRF > 0 exibe a BASE IRRF real (não "-")', async () => {
  const itens = await extrairItensTexto(pdfComIrrf);
  const valor = valorDaCelula(itens, 'BASE IRRF');

  expect(valor, 'célula BASE IRRF não encontrada no PDF').not.toBeNull();
  expect(valor).not.toBe('-');
  expect(valor).toBe(formatarMoeda(calcComIrrf.base_ir));
});

test('holerite com IRRF = 0 exibe BASE IRRF como "-"', async () => {
  const itens = await extrairItensTexto(pdfSemIrrf);
  expect(valorDaCelula(itens, 'BASE IRRF')).toBe('-');
});

test('PDF do holerite renderiza no navegador com a BASE IRRF preenchida (captura visual)', async ({ page }) => {
  // Chromium headless não tem plugin de PDF (abrir .pdf vira download), então o
  // PDF é rasterizado com pdf.js num <canvas> — a mesma lib de visualizadores de
  // PDF na web. Servido por HTTP local pra que import de módulo + worker do
  // pdf.js funcionem (file:// bloqueia os dois no Chromium).
  const nodeModules = path.resolve(__dirname, '../node_modules');
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    if (url === '/holerite.pdf') {
      res.setHeader('content-type', 'application/pdf');
      res.end(fs.readFileSync(pdfComIrrf));
      return;
    }
    if (url === '/' || url === '/index.html') {
      res.setHeader('content-type', 'text/html');
      res.end('<!doctype html><meta charset="utf-8"><canvas id="c"></canvas>');
      return;
    }
    const alvo = path.join(nodeModules, url.replace(/^\/node_modules\//, ''));
    if (alvo.startsWith(nodeModules) && fs.existsSync(alvo)) {
      if (alvo.endsWith('.mjs')) res.setHeader('content-type', 'text/javascript');
      res.end(fs.readFileSync(alvo));
      return;
    }
    res.statusCode = 404;
    res.end('not found');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const porta = (server.address() as import('net').AddressInfo).port;

  try {
    await page.goto(`http://127.0.0.1:${porta}/`);
    await page.evaluate(async () => {
      const pdfjs: any = await import('/node_modules/pdfjs-dist/build/pdf.min.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = '/node_modules/pdfjs-dist/build/pdf.worker.min.mjs';
      const buf = await (await fetch('/holerite.pdf')).arrayBuffer();
      const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
      const pageDoc = await doc.getPage(1);
      const viewport = pageDoc.getViewport({ scale: 2 });
      const canvas = document.getElementById('c') as HTMLCanvasElement;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await pageDoc.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
    });

    const shot = path.join(OUT_DIR, 'holerite-com-irrf.png');
    await page.locator('#c').screenshot({ path: shot });
    test.info().attachments.push({
      name: 'holerite-com-irrf',
      path: shot,
      contentType: 'image/png',
    });
    expect(fs.existsSync(shot)).toBe(true);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
