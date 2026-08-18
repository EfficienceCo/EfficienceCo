'use client';

import AutomacaoCard from '../../../components/dashboard/AutomacaoCard';

const AUTOMACOES = [
  {
    icone: '🏦',
    nome: 'Conciliação Bancária',
    descricao: 'Importa o extrato OFX e concilia automaticamente com os lançamentos internos.',
    status: 'disponivel',
    href: '/dashboard/contabil/conciliacao',
  },
  {
    icone: '📒',
    nome: 'Conciliação de contas contábeis',
    descricao: 'Cruzamento automático de saldos entre contas contábeis relacionadas.',
    status: 'planejado',
  },
  {
    icone: '📉',
    nome: 'Depreciação e amortização',
    descricao: 'Cálculo automático de depreciação e amortização de ativos do cliente.',
    status: 'planejado',
  },
  {
    icone: '📊',
    nome: 'Relatórios gerenciais',
    descricao: 'Geração automática de relatórios gerenciais periódicos para o cliente.',
    status: 'planejado',
  },
  {
    icone: '📅',
    nome: 'Balancete mensal',
    descricao: 'Fechamento e geração automática do balancete mensal.',
    status: 'planejado',
  },
  {
    icone: '📁',
    nome: 'Encerramento de exercício',
    descricao: 'Rotina automática de apuração e encerramento do exercício contábil.',
    status: 'planejado',
  },
];

export default function ContabilAreaPage() {
  return (
    <main className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-900">Contábil</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Automações de conciliação e fechamento contábil.
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
