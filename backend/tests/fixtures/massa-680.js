import { PERFIS } from "../../src/config/perfis.js";

// Valores fictícios fixos. O hash foi calculado uma vez, fora do gerador.
export const CONFIG_MASSA_680 = Object.freeze({
  instante: "2026-10-15T12:00:00.000Z",
  prefixoIds: "68000000-0000-4000-8000",
  senhaHash: "$2b$04$abcdefghijklmnopqrstuuZqQ888nqu01ta1zylhIIQERU6/gcMAO",
});

function baseValida(base, tamanho) {
  if (typeof base !== "string" || !new RegExp(`^\\d{${tamanho}}$`).test(base) || /^(\d)\1+$/.test(base)) {
    throw new Error(`Use uma base sintética com ${tamanho} dígitos, sem repetição integral.`);
  }
}

function digitoVerificador(digitos, pesos) {
  const soma = [...digitos].reduce((total, digito, indice) => total + Number(digito) * pesos[indice], 0);
  const resto = soma % 11;
  return resto < 2 ? "0" : String(11 - resto);
}

export function gerarCpfSintetico(base) {
  baseValida(base, 9);
  const primeiro = digitoVerificador(base, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const segundo = digitoVerificador(base + primeiro, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return base + primeiro + segundo;
}

export function gerarCnpjSintetico(base) {
  baseValida(base, 12);
  const primeiro = digitoVerificador(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const segundo = digitoVerificador(base + primeiro, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return base + primeiro + segundo;
}

// Função pura: não lê .env, não usa relógio/sorteio e não acessa o banco.
// Cada cliente_id é um contexto isolado do esquema atual. A relação adicional
// escritório -> vários clientes, pedida na issue, ainda precisa de alinhamento.
export function criarMassaBase680({ instante, prefixoIds, senhaHash } = CONFIG_MASSA_680) {
  if (
    typeof instante !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(instante) ||
    !Number.isFinite(Date.parse(instante)) || new Date(instante).toISOString() !== instante
  ) {
    throw new Error("Informe uma data de referência ISO UTC válida, como 2026-10-15T12:00:00.000Z.");
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}$/i.test(prefixoIds ?? "")) {
    throw new Error("Informe um prefixo UUID válido para os IDs da massa.");
  }
  if (!/^\$2[ab]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(senhaHash ?? "")) {
    throw new Error("Informe um hash bcrypt previamente calculado para a massa.");
  }
  const criadoEm = new Date(instante).toISOString();
  const id = numero => `${prefixoIds}-${String(numero).padStart(12, "0")}`;
  const rotulos = ["A", "B"];
  const clientes = rotulos.map((rotulo, indice) => ({
    id: id(indice + 1),
    nome: `Contexto sintético ${rotulo} #680`,
    cnpj: gerarCnpjSintetico(`${68000001 + indice}0001`),
    criado_em: criadoEm,
  }));
  const perfis = Object.values(PERFIS);
  const usuarios = clientes.flatMap((cliente, indiceCliente) => perfis.map((perfil, indicePerfil) => ({
    id: id(101 + indiceCliente * perfis.length + indicePerfil),
    cliente_id: cliente.id,
    nome: `Usuário sintético ${rotulos[indiceCliente]} ${perfil} #680`,
    email: `massa-680-${rotulos[indiceCliente].toLowerCase()}-${perfil}@example.invalid`,
    perfil,
    senha_hash: senhaHash,
    criado_em: criadoEm,
  })));
  return { clientes, usuarios };
}
