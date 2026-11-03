// Matriz de acesso das rotas, escrita à mão e INDEPENDENTE do código das rotas:
// ela diz quem DEVERIA entrar em cada endpoint. O teste rotas-acesso.test.js
// compara esta matriz com a pilha real do Express (nos dois sentidos) e
// dispara requisições para provar que a rota cumpre o que está aqui.
//
// Fonte das decisões: CLAUDE.md/perfis.js (admin_efficience = equipe Efficience,
// admin_cliente = dono do escritório, funcionario = equipe do escritório) e os
// comentários de src/routes/*.routes.js. Mudar a permissão de uma rota exige
// mudar esta matriz no mesmo PR: é o que faz a mudança ser decisão consciente.
import { PERFIS } from "../../src/config/perfis.js";

const EFF = [PERFIS.ADMIN_EFFICIENCE];
const ADMINS = [PERFIS.ADMIN_EFFICIENCE, PERFIS.ADMIN_CLIENTE];
const TODOS = [PERFIS.ADMIN_EFFICIENCE, PERFIS.ADMIN_CLIENTE, PERFIS.FUNCIONARIO];

const jwt = (perfis, extra = {}) => ({ tipo: "jwt", perfis, licenca: false, ...extra });
const agente = motivo => ({ tipo: "agente", motivo });
const publica = motivo => ({ tipo: "publica", motivo });

const AGENTE_TOKEN =
  "Rota do agente Python: não usa JWT, o controller valida o header x-licenca-token (validarTokenLicenca).";

export const MATRIZ = {
  "GET /health": publica("Health check do deploy: precisa responder sem login."),
  "POST /auth/login": publica("Login: ainda não existe token; o controller valida e-mail e senha."),
  "GET /licenca/validar": {
    tipo: "mista",
    motivo: "Aceita JWT opcional (frontend) ou x-licenca-token (agente); sem nenhum dos dois o controller responde 400.",
  },

  // --- agente (x-licenca-token) ---
  "GET /clientes/por-cnpj": agente(AGENTE_TOKEN),
  "GET /regras/:clienteId/versao": agente(AGENTE_TOKEN),
  "GET /regras/:clienteId": agente(AGENTE_TOKEN),
  "GET /eventos/agente": agente(AGENTE_TOKEN),
  "POST /eventos": agente(AGENTE_TOKEN),
  "POST /processos/:id/etapas/:etapaId/concluir": agente(AGENTE_TOKEN),
  "GET /processos/etapas/agente": agente(AGENTE_TOKEN),
  "POST /processos/etapas/:etapaId/concluir-execucao": agente(AGENTE_TOKEN),
  "POST /folha/upload/agente": agente(AGENTE_TOKEN),
  "POST /lancamentos-fiscais/cancelar": agente(AGENTE_TOKEN),
  "POST /lancamentos-fiscais": agente(AGENTE_TOKEN),
  "GET /apuracoes/folha-pendente": agente(AGENTE_TOKEN),
  "POST /apuracoes/:id/resultado-folha": agente(AGENTE_TOKEN),

  // --- licença por cliente, qualquer perfil logado (autorização no controller) ---
  "GET /licenca/:clienteId": jwt(null, { qualquerPerfil: true }),

  // --- clientes: painel interno da Efficience ---
  "GET /clientes": jwt(EFF),
  "GET /clientes/:id": jwt(EFF),
  "POST /clientes": jwt(EFF),
  "PATCH /clientes/:id": jwt(EFF),
  "DELETE /clientes/:id": jwt(EFF),

  // --- usuários e regras: donos (admin_efficience e admin_cliente) ---
  "GET /usuarios": jwt(ADMINS),
  "POST /usuarios": jwt(ADMINS),
  "PATCH /usuarios/:id": jwt(ADMINS),
  "DELETE /usuarios/:id": jwt(ADMINS),
  "GET /regras": jwt(ADMINS),
  "POST /regras": jwt(ADMINS),
  "PATCH /regras/:id": jwt(ADMINS),
  "DELETE /regras/:id": jwt(ADMINS),
  "GET /eventos": jwt(ADMINS),

  // --- eSocial ---
  "POST /eventos-esocial": jwt(ADMINS),
  "GET /eventos-esocial": jwt(TODOS),
  "GET /eventos-esocial/:id": jwt(TODOS),
  "GET /eventos-esocial/:id/xml": jwt(TODOS),
  "PATCH /eventos-esocial/:id/aprovar": jwt(ADMINS),
  "POST /eventos-esocial/:id/transmitir": jwt(ADMINS),

  // --- obrigações ---
  "GET /obrigacoes/proximas": jwt(TODOS),
  "GET /obrigacoes": jwt(TODOS),
  "POST /obrigacoes": jwt(ADMINS),
  "PATCH /obrigacoes/:id/concluir": jwt(ADMINS),
  "PATCH /obrigacoes/:id": jwt(ADMINS),
  "DELETE /obrigacoes/:id": jwt(ADMINS),

  // --- processos ---
  "GET /processos": jwt(TODOS),
  "POST /processos": jwt(ADMINS),
  "PATCH /processos/:id/etapas/:etapaId": jwt(TODOS),
  "POST /processos/:id/etapas/:etapaId/executar-acao": jwt(TODOS),
  "POST /processos/:id/etapas/:etapaId/expirar-execucao": jwt(TODOS),

  // --- notificações ---
  "GET /notificacoes": jwt(TODOS),
  "PATCH /notificacoes/:id/lida": jwt(TODOS),

  // --- folha: exige licença ativa do escritório ---
  "GET /folha/template": jwt(TODOS, { licenca: true }),
  "POST /folha/upload": jwt(TODOS, { licenca: true }),
  "POST /folha/:processamento_id/calcular": jwt(TODOS, { licenca: true }),
  "POST /folha/:processamento_id/gerar-saida": jwt(TODOS, { licenca: true }),
  "GET /folha/:processamento_id": jwt(TODOS, { licenca: true }),
  "GET /folha/:processamento_id/download/:arquivo": jwt(TODOS, { licenca: true }),

  // --- funcionários ---
  "POST /funcionarios": jwt(ADMINS),
  "GET /funcionarios": jwt(TODOS),
  "GET /funcionarios/:id": jwt(TODOS),
  "PATCH /funcionarios/:id/desligar": jwt(ADMINS),
  "PATCH /funcionarios/:id": jwt(ADMINS),

  // --- lançamentos ---
  "GET /lancamentos-fiscais/resumo": jwt(TODOS),
  "GET /lancamentos-fiscais": jwt(TODOS),
  "POST /lancamentos-contabeis": jwt(TODOS),
  "GET /lancamentos-contabeis": jwt(TODOS),
  "PATCH /lancamentos-contabeis/:id": jwt(TODOS),
  "DELETE /lancamentos-contabeis/:id": jwt(TODOS),

  // --- conciliações ---
  "POST /conciliacoes/extrato": jwt(TODOS),
  "GET /conciliacoes/extrato": jwt(TODOS),
  "GET /conciliacoes/extrato/:id/transacoes": jwt(TODOS),
  "POST /conciliacoes": jwt(TODOS),
  "GET /conciliacoes": jwt(TODOS),
  "PATCH /conciliacoes/:id/pares/:pareId/confirmar": jwt(TODOS),
  "PATCH /conciliacoes/:id/pares/:pareId/rejeitar": jwt(TODOS),
  "POST /conciliacoes/:id/concluir": jwt(TODOS),
  "GET /conciliacoes/:id/relatorio": jwt(TODOS),
  "GET /conciliacoes/:id": jwt(TODOS),

  // --- eficiência, apurações, certificados ---
  "GET /eficiencia": jwt(TODOS),
  "POST /apuracoes": jwt(ADMINS),
  "GET /apuracoes": jwt(TODOS),
  "GET /apuracoes/:id": jwt(TODOS),
  "PATCH /apuracoes/:id": jwt(ADMINS),
  "PATCH /apuracoes/:id/aprovar": jwt(ADMINS),
  "PATCH /apuracoes/:id/recalcular": jwt(ADMINS),
  "DELETE /apuracoes/:id": jwt(ADMINS),
  "POST /certificados": jwt(ADMINS),
  "GET /certificados": jwt(TODOS),
  "GET /certificados/:id": jwt(TODOS),
  "PATCH /certificados/:id/renovacao": jwt(ADMINS),
  "PATCH /certificados/:id": jwt(ADMINS),
  "POST /certificados/:id/iniciar-renovacao": jwt(ADMINS),
};

export const TODOS_OS_PERFIS = Object.values(PERFIS);
