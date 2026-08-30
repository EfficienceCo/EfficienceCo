'use client';

import AutomacaoCard from '../../../components/dashboard/AutomacaoCard';
import {
  CalendarioIcon,
  CifraoIcon,
  ComprovanteIcon,
  CruzMedicaIcon,
  DocumentoIcon,
  GuiaIcon,
  OnibusIcon,
  PessoaIcon,
  RelogioIcon,
  TransmissaoIcon,
} from '../../../components/icons/AutomacaoIcons';

const AUTOMACOES = [
  {
    icon: ComprovanteIcon,
    nome: 'Folha de pagamento mensal',
    descricao: 'Processa a planilha de folha enviada e faz os cálculos do mês.',
    status: 'disponivel',
    href: '/dashboard/dp/folha',
  },
  {
    icon: TransmissaoIcon,
    nome: 'eSocial (todos os eventos)',
    descricao: 'Gera, revisa e aprova os eventos obrigatórios do eSocial.',
    status: 'disponivel',
    href: '/dashboard/dp/esocial',
  },
  {
    icon: CalendarioIcon,
    nome: 'Férias',
    descricao: 'Calcula e agenda as férias dos funcionários.',
    status: 'planejado',
  },
  {
    icon: CifraoIcon,
    nome: '13º salário',
    descricao: 'Calcula a primeira e a segunda parcela do 13º.',
    status: 'planejado',
  },
  {
    icon: GuiaIcon,
    nome: 'FGTS e guias (GRF, GRRF)',
    descricao: 'Gera as guias de FGTS do período.',
    status: 'planejado',
  },
  {
    icon: DocumentoIcon,
    nome: 'INSS (GPS)',
    descricao: 'Calcula e emite a guia de recolhimento do INSS.',
    status: 'planejado',
  },
  {
    icon: PessoaIcon,
    nome: 'Admissão de funcionário',
    descricao: 'Preenche a documentação de admissão.',
    status: 'planejado',
  },
  {
    icon: CruzMedicaIcon,
    nome: 'Atestados médicos',
    descricao: 'Registra e calcula os afastamentos por atestado.',
    status: 'planejado',
  },
  {
    icon: RelogioIcon,
    nome: 'Horas extras e adicionais',
    descricao: 'Calcula horas extras e adicionais legais do período.',
    status: 'planejado',
  },
  {
    icon: OnibusIcon,
    nome: 'Vale-transporte e vale-refeição',
    descricao: 'Calcula os benefícios de VT e VR por funcionário.',
    status: 'planejado',
  },
  {
  icon: TransmissaoIcon,
  nome: 'eSocial',
  descricao: 'Geração, revisão, aprovação e download de eventos do eSocial.',
  status: 'disponivel',
  href: '/dashboard/dp/esocial',
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
