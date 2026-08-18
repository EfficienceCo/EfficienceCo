'use client';

import AutomacaoCard from '../../../components/dashboard/AutomacaoCard';

const AUTOMACOES = [
  {
    icone: '🏢',
    nome: 'Abertura de empresa',
    descricao: 'Geração automática da documentação e estrutura de pastas de abertura.',
    status: 'em_desenvolvimento',
    observacao: 'QA pendente',
  },
  {
    icone: '📝',
    nome: 'Alteração contratual',
    descricao: 'Preenchimento automático de alterações no contrato social.',
    status: 'planejado',
  },
  {
    icone: '🚫',
    nome: 'Baixa de empresa',
    descricao: 'Automatiza a documentação necessária para encerramento de empresa.',
    status: 'planejado',
  },
  {
    icone: '📜',
    nome: 'Alvarás e licenças',
    descricao: 'Acompanhamento e emissão automática de alvarás e licenças.',
    status: 'planejado',
  },
  {
    icone: '🔐',
    nome: 'Certificado digital',
    descricao: 'Alerta e automação do fluxo de renovação de certificado digital.',
    status: 'planejado',
  },
  {
    icone: '🏛️',
    nome: 'Registro em órgãos',
    descricao: 'Automação do registro de atos societários nos órgãos competentes.',
    status: 'planejado',
  },
  {
    icone: '✍️',
    nome: 'Procurações (e-CAC, Gov.br)',
    descricao: 'Geração automática de procurações eletrônicas para os clientes.',
    status: 'planejado',
  },
  {
    icone: '🔄',
    nome: 'Regularização cadastral',
    descricao: 'Identificação e correção automática de pendências cadastrais.',
    status: 'planejado',
  },
];

export default function SocietarioAreaPage() {
  return (
    <main className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-900">Societário</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Automações de constituição, alteração e regularização de empresas.
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
