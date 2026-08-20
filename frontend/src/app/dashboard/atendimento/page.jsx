'use client';

import AutomacaoCard from '../../../components/dashboard/AutomacaoCard';
import {
  DocumentoIcon,
  EntradaIcon,
  EnvelopeIcon,
  GraficoIcon,
} from '../../../components/icons/AutomacaoIcons';

const AUTOMACOES = [
  {
    icon: EnvelopeIcon,
    nome: 'Cobrança de documentação pendente',
    descricao: 'Lembra clientes com documentos pendentes de envio.',
    status: 'planejado',
  },
  {
    icon: GraficoIcon,
    nome: 'Envio de relatórios periódicos',
    descricao: 'Envia relatórios e resultados para o cliente.',
    status: 'planejado',
  },
  {
    icon: DocumentoIcon,
    nome: 'Renovação de contratos',
    descricao: 'Alerta sobre vencimento e renovação de contratos com clientes.',
    status: 'planejado',
  },
  {
    icon: EntradaIcon,
    nome: 'Onboarding de novo cliente',
    descricao: 'Conduz parte da coleta de dados e documentos na entrada de um novo cliente.',
    status: 'planejado',
    observacao: 'Parcial',
  },
];

export default function AtendimentoAreaPage() {
  return (
    <main className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-900">Atendimento</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Automações de relacionamento e comunicação com o cliente.
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
