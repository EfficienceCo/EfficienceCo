'use client';

import AutomacaoCard from '../../../components/dashboard/AutomacaoCard';

const AUTOMACOES = [
  {
    icone: '🧾',
    nome: 'Escrituração fiscal (NF-e XML)',
    descricao: 'Leitura automática dos XMLs de NF-e recebidos e lançamento fiscal correspondente.',
    status: 'disponivel',
    href: '/dashboard/fiscal/escrituracao',
  },
  {
    icone: '📊',
    nome: 'Apuração de impostos — Simples Nacional',
    descricao: 'Cálculo automático do DAS a partir dos lançamentos fiscais do período.',
    status: 'em_desenvolvimento',
    observacao: 'Sprint atual',
  },
  {
    icone: '📈',
    nome: 'Apuração — Lucro Presumido',
    descricao: 'Cálculo de IRPJ, CSLL, PIS e COFINS pelo regime de lucro presumido.',
    status: 'planejado',
  },
  {
    icone: '📄',
    nome: 'Emissão de guias (DAS, DARF, ISS)',
    descricao: 'Geração automática das guias de recolhimento dos tributos apurados.',
    status: 'planejado',
  },
  {
    icone: '🗂️',
    nome: 'SPED Fiscal',
    descricao: 'Geração do arquivo SPED Fiscal a partir da escrituração do período.',
    status: 'planejado',
  },
  {
    icone: '🗂️',
    nome: 'SPED Contribuições',
    descricao: 'Geração do arquivo SPED Contribuições (PIS/COFINS) do período.',
    status: 'planejado',
  },
  {
    icone: '📑',
    nome: 'EFD-Reinf',
    descricao: 'Transmissão automática dos eventos de retenção na EFD-Reinf.',
    status: 'planejado',
  },
  {
    icone: '📑',
    nome: 'DCTF/DCTFWeb',
    descricao: 'Preenchimento e transmissão automática da DCTF e DCTFWeb.',
    status: 'planejado',
  },
  {
    icone: '🏷️',
    nome: 'Classificação NCM/CFOP',
    descricao: 'Sugestão automática de NCM e CFOP para itens novos nas NF-e.',
    status: 'planejado',
  },
  {
    icone: '💰',
    nome: 'Retenções na fonte',
    descricao: 'Identificação e cálculo automático de tributos retidos na fonte.',
    status: 'planejado',
  },
  {
    icone: '🔍',
    nome: 'Revisão de NF-e emitidas',
    descricao: 'Checagem automática de inconsistências nas notas emitidas pelo cliente.',
    status: 'planejado',
  },
  {
    icone: '🔔',
    nome: 'Alerta de mudança de alíquota',
    descricao: 'Aviso automático quando a legislação altera uma alíquota relevante.',
    status: 'planejado',
  },
];

export default function FiscalAreaPage() {
  return (
    <main className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-900">Fiscal</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Automações tributárias e de escrituração.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {AUTOMACOES.map((automacao) => (
          <AutomacaoCard key={automacao.nome} {...automacao} />
        ))}
      </section>
    </main>
  );
}
