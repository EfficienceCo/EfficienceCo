// Licença do agente local nos testes das rotas que ele usa (TEST-11, #688): uma linha em `licencas`
// com token próprio, e o cabeçalho com que o agente se identifica. Só dado sintético.
import { randomUUID } from "node:crypto";

export async function criarLicenca(banco, clienteId) {
  const token = `token-teste-688-${randomUUID()}`;
  const { error } = await banco.from("licencas").insert({ cliente_id: clienteId, token, ativa: true, validade: null });
  if (error) throw new Error(`Erro preparando licencas: ${error.message}`);
  return token;
}

// Há uma licença por cliente (licencas_cliente_id_unique): o teste altera a que já existe.
export async function alterarLicenca(banco, token, campos) {
  const { error } = await banco.from("licencas").update(campos).eq("token", token);
  if (error) throw new Error(`Erro alterando licencas: ${error.message}`);
}

// Sem token, nenhum cabeçalho: é o pedido de quem não se identificou.
export function cabecalhoLicenca(token) {
  return token === undefined ? {} : { "x-licenca-token": token };
}
