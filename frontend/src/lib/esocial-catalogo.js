// Espelho de frontend para o catálogo de eventos do eSocial.
// Fonte da verdade: backend/src/utils/esocial-catalogo.util.js (#ES-4).
// Aqui adicionamos só o que a tela do wizard (#ES-10) precisa: rótulo do grupo
// e a flag `geradorDisponivel` — hoje só o S-2200 tem gerador de XML (#ES-6);
// os outros 11 códigos existem no catálogo mas o backend responde 422
// (EVENTO_NAO_SUPORTADO) até cada gerador ser implementado.

export const GRUPOS_ESOCIAL = {
  2: 'Grupo 2 — Eventos não periódicos',
  3: 'Grupo 3 — Saúde e Segurança do Trabalho (SST)',
  4: 'Grupo 4 — Eventos periódicos',
};

// requerFuncionario: precisa referenciar um funcionário já cadastrado.
// O S-2200 é false de propósito — a admissão CRIA o vínculo. Os eventos do
// Grupo 4 fecham a competência inteira, também sem funcionário isolado.
export const CATALOGO_ESOCIAL = {
  'S-2200': { grupo: 2, nome: 'Admissão', requerFuncionario: false, geradorDisponivel: true },
  'S-2205': { grupo: 2, nome: 'Alteração de dados cadastrais', requerFuncionario: true, geradorDisponivel: false },
  'S-2206': { grupo: 2, nome: 'Alteração de contrato de trabalho', requerFuncionario: true, geradorDisponivel: false },
  'S-2230': { grupo: 2, nome: 'Afastamento temporário', requerFuncionario: true, geradorDisponivel: false },
  'S-2298': { grupo: 2, nome: 'Reintegração', requerFuncionario: true, geradorDisponivel: false },
  'S-2299': { grupo: 2, nome: 'Desligamento', requerFuncionario: true, geradorDisponivel: false },
  'S-2210': { grupo: 3, nome: 'Comunicação de Acidente de Trabalho (CAT)', requerFuncionario: true, geradorDisponivel: false },
  'S-2220': { grupo: 3, nome: 'Monitoramento da Saúde do Trabalhador (ASO)', requerFuncionario: true, geradorDisponivel: false },
  'S-2240': { grupo: 3, nome: 'Condições Ambientais do Trabalho', requerFuncionario: true, geradorDisponivel: false },
  'S-1200': { grupo: 4, nome: 'Remuneração mensal', requerFuncionario: false, geradorDisponivel: false },
  'S-1210': { grupo: 4, nome: 'Pagamentos', requerFuncionario: false, geradorDisponivel: false },
  'S-1299': { grupo: 4, nome: 'Fechamento dos eventos periódicos', requerFuncionario: false, geradorDisponivel: false },
};

// Lista agrupada e ordenada para renderizar o passo 1 (selecionar evento).
export const EVENTOS_POR_GRUPO = [2, 3, 4].map((grupo) => ({
  grupo,
  titulo: GRUPOS_ESOCIAL[grupo],
  eventos: Object.entries(CATALOGO_ESOCIAL)
    .filter(([, meta]) => meta.grupo === grupo)
    .map(([codigo, meta]) => ({ codigo, ...meta })),
}));

export const STATUS_EVENTO_META = {
  rascunho: { label: 'Rascunho', classes: 'bg-zinc-100 text-zinc-600 ring-zinc-200' },
  aprovado: { label: 'Aprovado', classes: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
  transmitido: { label: 'Transmitido', classes: 'bg-sky-100 text-sky-800 ring-sky-200' },
  aceito: { label: 'Aceito', classes: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
  rejeitado: { label: 'Rejeitado', classes: 'bg-rose-100 text-rose-800 ring-rose-200' },
};
