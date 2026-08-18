'use client';

import AutomacaoCard from '../../../components/dashboard/AutomacaoCard';

const AUTOMACOES = [
  {
    icone: '🧾',
    nome: 'Emissão de honorários e boletos',
    descricao: 'Geração automática de boletos de honorários mensais dos clientes.',
    status: 'planejado',
  },
  {
    icone: '📞',
    nome: 'Cobrança de inadimplentes',
    descricao: 'Régua automática de cobrança para honorários em atraso.',
    status: 'planejado',
  },
  {
    icone: '📈',
    nome: 'Reajuste de honorários',
    descricao: 'Cálculo e aplicação automática de reajuste anual de honorários.',
    status: 'planejado',
  },
  {
    icone: '📄',
    nome: 'Renovação de contratos',
    descricao: 'Alerta e geração automática de renovação de contratos de prestação de serviço.',
    status: 'planejado',
  },
  {
    icone: '👥',
    nome: 'Folha dos funcionários do escritório',
    descricao: 'Processamento automático da folha interna do próprio escritório.',
    status: 'planejado',
  },
];

export default function FinanceiroAreaPage() {
  return (
    <main className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-900">Financeiro</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Automações financeiras do próprio escritório de contabilidade.
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
