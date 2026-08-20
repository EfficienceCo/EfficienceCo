'use client';

import AutomacaoCard from '../../../components/dashboard/AutomacaoCard';
import {
  CalendarioIcon,
  DocumentoIcon,
  GraficoIcon,
  PastaIcon,
  TransmissaoIcon,
} from '../../../components/icons/AutomacaoIcons';

const AUTOMACOES = [
  {
    icon: TransmissaoIcon,
    nome: 'Conciliação Bancária',
    descricao: 'Importa o extrato OFX e concilia com os lançamentos internos.',
    status: 'disponivel',
    href: '/dashboard/contabil/conciliacao',
  },
  {
    icon: DocumentoIcon,
    nome: 'Conciliação de contas contábeis',
    descricao: 'Cruza os saldos entre contas contábeis relacionadas.',
    status: 'planejado',
  },
  {
    icon: GraficoIcon,
    nome: 'Depreciação e amortização',
    descricao: 'Calcula a depreciação e amortização dos ativos do cliente.',
    status: 'planejado',
  },
  {
    icon: GraficoIcon,
    nome: 'Relatórios gerenciais',
    descricao: 'Gera os relatórios gerenciais periódicos do cliente.',
    status: 'planejado',
  },
  {
    icon: CalendarioIcon,
    nome: 'Balancete mensal',
    descricao: 'Fecha e gera o balancete do mês.',
    status: 'planejado',
  },
  {
    icon: PastaIcon,
    nome: 'Encerramento de exercício',
    descricao: 'Conduz a apuração e o encerramento do exercício contábil.',
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
