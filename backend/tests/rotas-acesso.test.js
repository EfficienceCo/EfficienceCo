/**
 * TEST-6 (#683): quem pode entrar em cada rota registrada no app.js.
 *
 * A lista de rotas NÃO é escrita à mão: vem da pilha do Express (helpers/rotas.js).
 * O que cada rota deveria exigir está em helpers/matriz-acesso.js. Este arquivo:
 *   1. obriga a matriz a ter exatamente as rotas do app (nenhuma a mais, nenhuma a menos);
 *   2. prova com requisições HTTP reais que cada rota cumpre a matriz:
 *      sem token -> 401; perfil não permitido -> 403 (sem chegar ao handler/banco);
 *      perfil permitido passa da barreira; licença quando exigida.
 *
 * Isolamento por escritório dentro das consultas fica na TEST-9, não aqui.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { criarCenarioBanco } from "./helpers/banco.js";
import { iniciarApiTeste } from "./helpers/http.js";
import { enumerarRotas, chaveDaRota } from "./helpers/rotas.js";
import { MATRIZ, TODOS_OS_PERFIS } from "./helpers/matriz-acesso.js";

const MINIMO_DE_ROTAS = 85; // piso de sanidade (a lista completa está na matriz); abaixo disso a varredura estaria olhando pouca coisa
const ID = "11111111-2222-4333-8444-555555555555";
const ERRO_PERFIL = "Acesso negado: perfil sem permissão";
const ERRO_LICENCA = "Licença inativa ou expirada";

let api;
let rotas; // [{ metodo, caminho, chave }]
const cenario = criarCenarioBanco();

function preencher(caminho) {
  return caminho.replace(/:arquivo/g, "arquivo.xlsx").replace(/:[A-Za-z_]+/g, ID);
}

function token(payload, opcoes = {}) {
  return jwt.sign(payload, opcoes.segredo ?? process.env.JWT_SECRET, { expiresIn: "5m", ...opcoes.jwt });
}

// Chamadas sem resposta (timeout, conexão derrubada) são registradas aqui; varrer as trata como falha
// da rota em qualquer verificador, mesmo os que só procuram um status ruim.
let semResposta = [];

async function chamar(rota, { headers = {}, corpo: corpoPedido } = {}) {
  const corpo = rota.metodo === "GET" ? undefined : corpoPedido; // GET não leva corpo
  try {
    const resposta = await fetch(new URL(preencher(rota.caminho), api.baseUrl), {
      method: rota.metodo,
      headers: corpo === undefined ? headers : { ...headers, "Content-Type": "application/json" },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
    });
    const tipo = resposta.headers.get("content-type") ?? "";
    return { status: resposta.status, corpo: tipo.includes("json") ? await resposta.json() : await resposta.text() };
  } catch (erro) {
    // rota que trava ou derruba a conexão: vira falha nomeada, não aborta o arquivo
    semResposta.push(`sem resposta (${erro.name}: ${erro.message})`);
    return { status: `sem resposta (${erro.name}: ${erro.message})`, corpo: undefined };
  }
}

const comPerfil = (perfil, clienteId = ID) =>
  ({ Authorization: `Bearer ${token({ id: ID, email: "t@example.invalid", perfil, cliente_id: clienteId })}` });

async function varrer(lista, executar) {
  const falhas = [];
  for (const rota of lista) {
    semResposta = [];
    const motivo = await executar(rota);
    if (semResposta.length) falhas.push(`${rota.chave}: ${semResposta[0]}`);
    else if (motivo) falhas.push(`${rota.chave}: ${motivo}`);
  }
  return falhas;
}

const doTipo = tipo => () => rotas.filter(rota => MATRIZ[rota.chave]?.tipo === tipo);
const jwtRotas = doTipo("jwt");
const agenteRotas = doTipo("agente");

before(async () => {
  api = await iniciarApiTeste();
  const { default: app } = await import("../src/app.js");
  rotas = enumerarRotas(app).map(rota => ({ ...rota, chave: chaveDaRota(rota) }));
});

after(async () => {
  await api?.fechar();
  await cenario.limpar();
});

describe("matriz de acesso x rotas registradas no app.js", () => {
  it(`a varredura enxerga pelo menos ${MINIMO_DE_ROTAS} rotas (não passa vazia)`, () => {
    assert.ok(rotas.length >= MINIMO_DE_ROTAS, `só ${rotas.length} rotas enumeradas`);
  });

  it("toda rota registrada tem entrada na matriz (rota nova sem decisão de acesso falha)", () => {
    const semEntrada = rotas.filter(rota => !MATRIZ[rota.chave]).map(rota => rota.chave);
    assert.deepEqual(semEntrada, []);
  });

  it("toda entrada da matriz existe no app (matriz e lista de públicas não ficam velhas)", () => {
    const existentes = new Set(rotas.map(rota => rota.chave));
    const velhas = Object.keys(MATRIZ).filter(chave => !existentes.has(chave));
    assert.deepEqual(velhas, []);
  });

  it("não há rota duplicada na pilha (a mesma chave duas vezes esconderia uma delas)", () => {
    const vistas = new Set();
    const repetidas = rotas.filter(rota => vistas.size === vistas.add(rota.chave).size).map(rota => rota.chave);
    assert.deepEqual(repetidas, []);
  });

  it("rota pública, mista e de agente sempre trazem o motivo", () => {
    const sem = Object.entries(MATRIZ)
      .filter(([, regra]) => ["publica", "agente", "mista"].includes(regra.tipo))
      .filter(([, regra]) => typeof regra.motivo !== "string" || regra.motivo.trim().length < 20)
      .map(([chave]) => chave);
    assert.deepEqual(sem, []);
  });

  it("as rotas JWT por perfil usam só perfis que existem", () => {
    for (const [chave, regra] of Object.entries(MATRIZ)) {
      if (regra.tipo !== "jwt" || regra.qualquerPerfil) continue;
      assert.ok(regra.perfis?.length > 0, chave);
      for (const perfil of regra.perfis) assert.ok(TODOS_OS_PERFIS.includes(perfil), `${chave}: ${perfil}`);
    }
  });
});

describe("rotas JWT: sem credencial válida respondem 401", () => {
  it("sem token", async () => {
    const lista = jwtRotas();
    assert.ok(lista.length >= 60, `só ${lista.length} rotas JWT na varredura`);
    const falhas = await varrer(lista, async rota => {
      const { status, corpo } = await chamar(rota);
      return status === 401 && corpo?.erro === "Token nao fornecido" ? null : `esperava 401, veio ${status}`;
    });
    assert.deepEqual(falhas, []);
  });

  const invalidos = {
    "com esquema que não é Bearer": () => ({ Authorization: `Basic ${token({ perfil: "admin_efficience" })}` }),
    // "Bearer " (token vazio) não chega pelo HTTP (o servidor corta o espaço final); coberto em auth.test.js.
    "Bearer sozinho, sem token": () => ({ Authorization: "Bearer" }),
    "mal formado": () => ({ Authorization: "Bearer isto.nao.e-um-jwt" }),
    "expirado": () => ({
      Authorization: `Bearer ${token({ id: ID, perfil: "admin_efficience" }, { jwt: { expiresIn: -60 } })}`,
    }),
    "assinado com outro segredo": () => ({
      Authorization: `Bearer ${token({ id: ID, perfil: "admin_efficience" }, { segredo: "outro-segredo" })}`,
    }),
  };
  for (const [nome, montar] of Object.entries(invalidos)) {
    it(`token ${nome}`, async () => {
      const falhas = await varrer(jwtRotas(), async rota => {
        const { status } = await chamar(rota, { headers: montar() });
        return status === 401 ? null : `esperava 401, veio ${status}`;
      });
      assert.deepEqual(falhas, []);
    });
  }
});

describe("rotas JWT: perfil não permitido responde 403 antes do handler", () => {
  // Maiúscula/minúscula, espaço, vazio, ausente e perfil inventado: tudo deve ser recusado.
  // Decisão: o perfil é comparado por igualdade exata (deny by default). Os tokens reais
  // saem do login com o valor do banco, em minúscula; qualquer variação é suspeita.
  const variantes = [
    ...TODOS_OS_PERFIS,
    ...TODOS_OS_PERFIS.map(perfil => perfil.toUpperCase()),
    "Admin_Cliente", "Funcionario", " admin_cliente", "admin_cliente ", "superadmin", "", undefined,
  ];

  it("para cada rota, todo perfil fora da matriz recebe 403", async () => {
    const lista = jwtRotas().filter(rota => !MATRIZ[rota.chave].qualquerPerfil);
    assert.ok(lista.length >= 60, `só ${lista.length} rotas com perfil na varredura`);
    const falhas = await varrer(lista, async rota => {
      const permitidos = MATRIZ[rota.chave].perfis;
      for (const perfil of variantes.filter(valor => !permitidos.includes(valor))) {
        const { status, corpo } = await chamar(rota, { headers: comPerfil(perfil) });
        if (status !== 403 || corpo?.erro !== ERRO_PERFIL) {
          return `perfil ${JSON.stringify(perfil)} recebeu ${status}, esperava 403`;
        }
      }
      return null;
    });
    assert.deepEqual(falhas, []);
  });
});

describe("rotas JWT: perfil permitido passa da barreira de perfil", () => {
  // As rotas licenca:true são cobertas com mais rigor no bloco de licença (perfil permitido + licença ativa).
  // Sem corpo e com ids aleatórios os handlers respondem 400/404; o que interessa é não ser 401 nem 403 de perfil.
  it("cada perfil da matriz não é barrado nem por falta de login nem por perfil", async () => {
    const lista = jwtRotas().filter(rota => !MATRIZ[rota.chave].licenca);
    const falhas = await varrer(lista, async rota => {
      const permitidos = MATRIZ[rota.chave].qualquerPerfil ? TODOS_OS_PERFIS : MATRIZ[rota.chave].perfis;
      for (const perfil of permitidos) {
        const { status, corpo } = await chamar(rota, { headers: comPerfil(perfil, randomUUID()) });
        if (status === 401 || (status === 403 && corpo?.erro === ERRO_PERFIL)) {
          return `perfil ${perfil} foi barrado (${status})`;
        }
      }
      return null;
    });
    assert.deepEqual(falhas, []);
  });
});

// POST /eventos valida o corpo ANTES do token (400 em corpo vazio). Para provar a autenticação,
// as rotas do agente recebem um corpo bem formado; o que decide a resposta é só a credencial.
const CORPO_VALIDO = { cliente_id: ID, descricao: "evento sintético #683", sucesso: true };

describe("rotas do agente (x-licenca-token): JWT não vale e token ausente ou desconhecido é recusado", () => {
  it("sem nenhuma credencial: 401", async () => {
    const lista = agenteRotas();
    assert.ok(lista.length >= 10, `só ${lista.length} rotas de agente`);
    const falhas = await varrer(lista, async rota => {
      const { status } = await chamar(rota, { corpo: CORPO_VALIDO });
      return status === 401 ? null : `esperava 401, veio ${status}`;
    });
    assert.deepEqual(falhas, []);
  });

  it("JWT válido de admin_efficience, sem x-licenca-token: continua 401", async () => {
    const falhas = await varrer(agenteRotas(), async rota => {
      const { status } = await chamar(rota, { headers: comPerfil("admin_efficience"), corpo: CORPO_VALIDO });
      return status === 401 ? null : `JWT foi aceito como credencial do agente (${status})`;
    });
    assert.deepEqual(falhas, []);
  });

  it("x-licenca-token que não existe no banco: 401", async () => {
    const falhas = await varrer(agenteRotas(), async rota => {
      const { status } = await chamar(rota, { headers: { "x-licenca-token": `inexistente-${randomUUID()}` }, corpo: CORPO_VALIDO });
      return status === 401 ? null : `esperava 401, veio ${status}`;
    });
    assert.deepEqual(falhas, []);
  });
});

describe("rotas públicas e mistas", () => {
  it("GET /health responde 200 sem token", async () => {
    const { status, corpo } = await chamar({ metodo: "GET", caminho: "/health" });
    assert.equal(status, 200);
    assert.deepEqual(corpo, { status: "ok" });
  });

  it("POST /auth/login sem credenciais: 400 (não 401, pois não exige token)", async () => {
    const { status } = await chamar({ metodo: "POST", caminho: "/auth/login" });
    assert.equal(status, 400);
  });

  it("GET /licenca/validar: sem nada 400; JWT inválido 401; x-licenca-token desconhecido 404", async () => {
    const rota = { metodo: "GET", caminho: "/licenca/validar" };
    assert.equal((await chamar(rota)).status, 400);
    assert.equal((await chamar(rota, { headers: { Authorization: "Bearer lixo" } })).status, 401);
    assert.equal((await chamar(rota, { headers: { "x-licenca-token": `inexistente-${randomUUID()}` } })).status, 404);
  });
});

describe("licença (banco real): só as rotas marcadas na matriz exigem licença ativa", () => {
  const cenarios = {};

  before(async () => {
    const hoje = Date.now();
    const definicoes = {
      semLicenca: null,
      vencida: { ativa: true, validade: new Date(hoje - 86_400_000).toISOString() },
      inativa: { ativa: false, validade: new Date(hoje + 86_400_000).toISOString() },
      ativa: { ativa: true, validade: new Date(hoje + 86_400_000).toISOString() },
      ativaSemValidade: { ativa: true, validade: null },
    };
    for (const [nome, licenca] of Object.entries(definicoes)) {
      const cliente = await cenario.criarCliente({ nome: `Cliente ${nome} sintético #683` });
      if (licenca) {
        const { error } = await cenario.banco.from("licencas")
          .insert({ cliente_id: cliente.id, token: `teste-683-${randomUUID()}`, ...licenca });
        assert.equal(error, null, error?.message);
      }
      cenarios[nome] = cliente.id;
    }
  });

  after(async () => {
    const ids = Object.values(cenarios);
    if (ids.length) await cenario.banco.from("licencas").delete().in("cliente_id", ids);
  });

  const comLicenca = () => jwtRotas().filter(rota => MATRIZ[rota.chave].licenca);
  const semLicencaExigida = () => jwtRotas().filter(rota => !MATRIZ[rota.chave].licenca);

  it("a matriz marca as rotas da folha como exigentes de licença", () => {
    assert.ok(comLicenca().length >= 6);
  });

  for (const situacao of ["semLicenca", "vencida", "inativa"]) {
    it(`cliente ${situacao}: 403 de licença em toda rota que exige, para admin_cliente e funcionario`, async () => {
      const falhas = await varrer(comLicenca(), async rota => {
        for (const perfil of ["admin_cliente", "funcionario"]) {
          const { status, corpo } = await chamar(rota, { headers: comPerfil(perfil, cenarios[situacao]) });
          if (status !== 403 || corpo?.erro !== ERRO_LICENCA) return `${perfil} recebeu ${status}`;
        }
        return null;
      });
      assert.deepEqual(falhas, []);
    });
  }

  // Com licença ativa cada perfil permitido tem que PASSAR de verdade pelas rotas da folha:
  // nem 401, nem 403 de perfil, nem 403 de licença. Pega perfil removido de exigirPerfil.
  const barrado = ({ status, corpo }) =>
    status === 401 ? "401" : status === 403 && corpo?.erro === ERRO_PERFIL ? "403 de perfil"
      : status === 403 && corpo?.erro === ERRO_LICENCA ? "403 de licença" : null;

  for (const situacao of ["ativa", "ativaSemValidade"]) {
    it(`licença ${situacao}: todo perfil permitido da matriz passa nas rotas que exigem licença`, async () => {
      const falhas = await varrer(comLicenca(), async rota => {
        for (const perfil of MATRIZ[rota.chave].perfis.filter(valor => valor !== "admin_efficience")) {
          const motivo = barrado(await chamar(rota, { headers: comPerfil(perfil, cenarios[situacao]) }));
          if (motivo) return `${perfil} barrado: ${motivo}`;
        }
        return null;
      });
      assert.deepEqual(falhas, []);
    });
  }

  it("admin_efficience (sem cliente) passa nas rotas que exigem licença quando a matriz o permite", async () => {
    const falhas = await varrer(comLicenca(), async rota => {
      if (!MATRIZ[rota.chave].perfis.includes("admin_efficience")) return null;
      for (const clienteId of [null, cenarios.vencida]) {
        const motivo = barrado(await chamar(rota, { headers: comPerfil("admin_efficience", clienteId) }));
        if (motivo) return `admin_efficience barrado: ${motivo}`;
      }
      return null;
    });
    assert.deepEqual(falhas, []);
  });

  // CARACTERIZAÇÃO (ACESSO-02): afirma o estado atual, em que só /folha exige licença. Quando o
  // João decidir o ACESSO-02, a matriz (campo licenca) e ESTE teste mudam juntos, no mesmo PR.
  it("rotas que a matriz NÃO marca como exigentes de licença não barram cliente sem licença", async () => {
    const lista = semLicencaExigida().filter(rota => !MATRIZ[rota.chave].qualquerPerfil);
    const falhas = await varrer(lista, async rota => {
      const perfil = MATRIZ[rota.chave].perfis.includes("admin_cliente") ? "admin_cliente" : MATRIZ[rota.chave].perfis[0];
      const { status, corpo } = await chamar(rota, { headers: comPerfil(perfil, cenarios.vencida) });
      return status === 403 && corpo?.erro === ERRO_LICENCA ? "exige licença sem constar na matriz" : null;
    });
    assert.deepEqual(falhas, []);
  });

  // BUG (ACESSO-01): buscarLicencaCliente só confere o cliente do token quando o perfil é
  // admin_cliente; um funcionario consulta a licença de QUALQUER escritório pelo id.
  // O comportamento certo está abaixo, marcado skip; o catálogo pede issue `bug`.
  // Decisão sobre 403 x 404: aqui vale 403 (não 404). O recurso consultado é a licença do PRÓPRIO
  // escritório informado na URL, que existe e é conhecida; não há id oculto a proteger, e o 403 é
  // o que o controller já devolve ao admin_cliente. O isolamento por consulta (404) é da TEST-9.
  it("funcionario de um escritório não consulta a licença de outro",
    { skip: "BUG (ACESSO-01): funcionario lê licença de outro escritório" }, async () => {
      const { status } = await chamar(
        { metodo: "GET", caminho: `/licenca/${cenarios.ativa}` },
        { headers: comPerfil("funcionario", cenarios.vencida) },
      );
      assert.equal(status, 403);
    });

  it("admin_cliente de um escritório não consulta a licença de outro", async () => {
    const { status } = await chamar(
      { metodo: "GET", caminho: `/licenca/${cenarios.ativa}` },
      { headers: comPerfil("admin_cliente", cenarios.vencida) },
    );
    assert.equal(status, 403);
  });
});
