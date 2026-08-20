'use client';

import AutomacaoCard from '../../../components/dashboard/AutomacaoCard';
import {
  AssinaturaIcon,
  CicloIcon,
  DocumentoIcon,
  EscudoIcon,
  PredioIcon,
  SeloIcon,
} from '../../../components/icons/AutomacaoIcons';

const AUTOMACOES = [
  {
    icon: PredioIcon,
    nome: 'Abertura de empresa',
    descricao: 'Gera a documentação e a estrutura de pastas de abertura.',
    status: 'em_desenvolvimento',
    observacao: 'QA pendente',
  },
  {
    icon: DocumentoIcon,
    nome: 'Alteração contratual',
    descricao: 'Preenche as alterações no contrato social.',
    status: 'planejado',
  },
  {
    icon: PredioIcon,
    nome: 'Baixa de empresa',
    descricao: 'Monta a documentação necessária para o encerramento da empresa.',
    status: 'planejado',
  },
  {
    icon: SeloIcon,
    nome: 'Alvarás e licenças',
    descricao: 'Acompanha vencimentos e emite alvarás e licenças.',
    status: 'planejado',
  },
  {
    icon: EscudoIcon,
    nome: 'Certificado digital',
    descricao: 'Alerta e conduz a renovação do certificado digital.',
    status: 'planejado',
  },
  {
    icon: PredioIcon,
    nome: 'Registro em órgãos',
    descricao: 'Registra os atos societários nos órgãos competentes.',
    status: 'planejado',
  },
  {
    icon: AssinaturaIcon,
    nome: 'Procurações (e-CAC, Gov.br)',
    descricao: 'Gera as procurações eletrônicas para os clientes.',
    status: 'planejado',
  },
  {
    icon: CicloIcon,
    nome: 'Regularização cadastral',
    descricao: 'Identifica e corrige pendências cadastrais.',
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
