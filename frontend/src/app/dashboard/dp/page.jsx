'use client';

import AutomacaoCard from '../../../components/dashboard/AutomacaoCard';

const AUTOMACOES = [
  {
    icone: '💵',
    nome: 'Folha de pagamento mensal',
    descricao: 'Processa a planilha de folha enviada e gera os cálculos mensais.',
    status: 'disponivel',
    href: '/dashboard/dp/folha',
  },
  {
    icone: '📡',
    nome: 'eSocial (todos os eventos)',
    descricao: 'Transmissão automática dos eventos obrigatórios do eSocial.',
    status: 'planejado',
  },
  {
    icone: '🏖️',
    nome: 'Férias',
    descricao: 'Cálculo e agendamento automático das férias dos funcionários.',
    status: 'planejado',
  },
  {
    icone: '🎁',
    nome: '13º salário',
    descricao: 'Cálculo automático da primeira e segunda parcela do 13º salário.',
    status: 'planejado',
  },
  {
    icone: '🏛️',
    nome: 'FGTS e guias (GRF, GRRF)',
    descricao: 'Geração automática das guias de FGTS do período.',
    status: 'planejado',
  },
  {
    icone: '📋',
    nome: 'INSS (GPS)',
    descricao: 'Cálculo e emissão automática da guia de recolhimento do INSS.',
    status: 'planejado',
  },
  {
    icone: '🧑‍💼',
    nome: 'Admissão de funcionário',
    descricao: 'Preenchimento automático da documentação de admissão.',
    status: 'planejado',
  },
  {
    icone: '🩺',
    nome: 'Atestados médicos',
    descricao: 'Registro e cálculo automático de afastamentos por atestado.',
    status: 'planejado',
  },
  {
    icone: '⏱️',
    nome: 'Horas extras e adicionais',
    descricao: 'Cálculo automático de horas extras e adicionais legais.',
    status: 'planejado',
  },
  {
    icone: '🚌',
    nome: 'Vale-transporte e vale-refeição',
    descricao: 'Cálculo automático dos benefícios de VT e VR por funcionário.',
    status: 'planejado',
  },
];

export default function DpAreaPage() {
  return (
    <main className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-900">DP</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Automações de departamento pessoal e folha de pagamento.
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
