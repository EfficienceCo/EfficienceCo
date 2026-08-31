// Catálogo fixo de códigos de evento do eSocial (Grupos 2, 3 e 4).
// Índice de códigos — não inclui os campos do XML de cada evento (isso fica
// nos geradores, #ES-6). Tabelas fixas em norma — não mudam sem nova lei.
//
// requerFuncionario: false no S-2200 é proposital — a admissão cria o vínculo,
// não referencia um funcionario_id existente. Os eventos do Grupo 4 também não
// referenciam um funcionário isolado — fecham a competência inteira.
const CATALOGO_ESOCIAL = {
  'S-2200': { grupo: 2, nome: 'Admissão', requerFuncionario: false },
  'S-2205': { grupo: 2, nome: 'Alteração de dados cadastrais', requerFuncionario: true },
  'S-2206': { grupo: 2, nome: 'Alteração de contrato de trabalho', requerFuncionario: true },
  'S-2230': { grupo: 2, nome: 'Afastamento temporário', requerFuncionario: true },
  'S-2298': { grupo: 2, nome: 'Reintegração', requerFuncionario: true },
  'S-2299': { grupo: 2, nome: 'Desligamento', requerFuncionario: true },
  'S-2210': { grupo: 3, nome: 'Comunicação de Acidente de Trabalho (CAT)', requerFuncionario: true },
  'S-2220': { grupo: 3, nome: 'Monitoramento da Saúde do Trabalhador (ASO)', requerFuncionario: true },
  'S-2240': { grupo: 3, nome: 'Condições Ambientais do Trabalho', requerFuncionario: true },
  'S-1200': { grupo: 4, nome: 'Remuneração mensal', requerFuncionario: false },
  'S-1210': { grupo: 4, nome: 'Pagamentos', requerFuncionario: false },
  'S-1299': { grupo: 4, nome: 'Fechamento dos eventos periódicos', requerFuncionario: false },
};

export { CATALOGO_ESOCIAL };
