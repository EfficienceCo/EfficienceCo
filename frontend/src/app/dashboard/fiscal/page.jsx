'use client';

import AutomacaoCard from '../../../components/dashboard/AutomacaoCard';
import {
  CalculadoraIcon,
  CifraoIcon,
  DocumentoIcon,
  EtiquetaIcon,
  GuiaIcon,
  LupaIcon,
  PastaIcon,
  SinoIcon,
  TransmissaoIcon,
} from '../../../components/icons/AutomacaoIcons';

const AUTOMACOES = [
  {
    icon: DocumentoIcon,
    nome: 'Escrituração fiscal (NF-e XML)',
    descricao: 'Lê os XMLs de NF-e recebidos e gera o lançamento fiscal correspondente.',
    status: 'disponivel',
    href: '/dashboard/fiscal/escrituracao',
  },
  {
    icon: CalculadoraIcon,
    nome: 'Apuração de impostos — Simples Nacional',
    descricao: 'Calcula o DAS a partir dos lançamentos fiscais do período.',
    status: 'em_desenvolvimento',
    observacao: 'Sprint atual',
  },
  {
    icon: CalculadoraIcon,
    nome: 'Apuração — Lucro Presumido',
    descricao: 'Calcula IRPJ, CSLL, PIS e COFINS pelo regime de lucro presumido.',
    status: 'planejado',
  },
  {
    icon: GuiaIcon,
    nome: 'Emissão de guias (DAS, DARF, ISS)',
    descricao: 'Gera as guias de recolhimento dos tributos apurados no período.',
    status: 'planejado',
  },
  {
    icon: PastaIcon,
    nome: 'SPED Fiscal',
    descricao: 'Monta o arquivo SPED Fiscal a partir da escrituração do período.',
    status: 'planejado',
  },
  {
    icon: PastaIcon,
    nome: 'SPED Contribuições',
    descricao: 'Monta o arquivo SPED Contribuições (PIS/COFINS) do período.',
    status: 'planejado',
  },
  {
    icon: TransmissaoIcon,
    nome: 'EFD-Reinf',
    descricao: 'Transmite os eventos de retenção apurados na EFD-Reinf.',
    status: 'planejado',
  },
  {
    icon: TransmissaoIcon,
    nome: 'DCTF/DCTFWeb',
    descricao: 'Preenche e transmite a DCTF e a DCTFWeb do período.',
    status: 'planejado',
  },
  {
    icon: EtiquetaIcon,
    nome: 'Classificação NCM/CFOP',
    descricao: 'Sugere NCM e CFOP para itens novos identificados nas NF-e.',
    status: 'planejado',
  },
  {
    icon: CifraoIcon,
    nome: 'Retenções na fonte',
    descricao: 'Identifica e calcula os tributos retidos na fonte.',
    status: 'planejado',
  },
  {
    icon: LupaIcon,
    nome: 'Revisão de NF-e emitidas',
    descricao: 'Checa inconsistências nas notas emitidas pelo cliente.',
    status: 'planejado',
  },
  {
    icon: SinoIcon,
    nome: 'Alerta de mudança de alíquota',
    descricao: 'Avisa quando a legislação altera uma alíquota relevante.',
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
