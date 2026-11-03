import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import dns from "node:dns";
import http from "node:http";
import { request as requisitarHttps } from "node:https";
import net from "node:net";
import tls from "node:tls";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createClient } from "@supabase/supabase-js";
import soap from "soap";
import { lerTentativas, consumirTentativas } from "../helpers/servicos-externos.js";

// DNS é um serviço externo: o teste deve falhar antes de precisar dele.
beforeEach(t => {
  t.mock.method(dns, "lookup", (host, opcoes, callback) => {
    if (!["127.0.0.1", "::1", "localhost"].includes(host)) {
      throw new Error("DNS externo não deveria ser necessário.");
    }
    const concluir = typeof opcoes === "function" ? opcoes : callback;
    const endereco = host === "::1" ? { address: "::1", family: 6 } : { address: "127.0.0.1", family: 4 };
    queueMicrotask(() => opcoes?.all
      ? concluir(null, [endereco])
      : concluir(null, endereco.address, endereco.family));
  });
});

function conferirTentativa(servico, transporte) {
  const registros = consumirTentativas();
  assert.equal(registros.length, 1);
  assert.equal(registros[0].servico, servico);
  if (transporte) assert.equal(registros[0].transporte, transporte);
  return registros[0];
}

test("#679: fetch ao eSocial é bloqueado e não registra segredo da query", async () => {
  await assert.rejects(fetch("https://esocial.example.invalid/enviar?token=nao-registrar"), /bloqueado: eSocial/);
  const tentativa = conferirTentativa("eSocial", "fetch");
  assert.equal(tentativa.destino, "https://esocial.example.invalid/enviar");
});

test("#679: Request de SEFAZ é bloqueado", async () => {
  const pedido = new Request("https://nfe.sefaz.example.invalid/autorizar", { method: "POST", body: "xml-sintetico" });
  await assert.rejects(fetch(pedido), /bloqueado: SEFAZ/);
  assert.equal(conferirTentativa("SEFAZ", "fetch").metodo, "POST");
});

test("#679: import nomeado de HTTPS bloqueia provedor de e-mail", () => {
  assert.throws(() => requisitarHttps({ hostname: "sendgrid.example.invalid", path: "/mail/send", method: "POST" }), /bloqueado: e-mail/);
  conferirTentativa("e-mail", "https.request");
});

test("#679: cliente SOAP real é bloqueado antes de buscar WSDL", { timeout: 5_000 }, async () => {
  await assert.rejects(soap.createClientAsync("https://esocial.example.invalid/servico?singleWsdl"), /bloqueado: eSocial/);
  const tentativa = conferirTentativa("eSocial");
  assert.match(tentativa.transporte, /^https?\./);
});

test("#679: SMTP por TCP e TLS é bloqueado antes de conectar", () => {
  assert.throws(() => net.createConnection(587, "smtp.example.invalid"), /bloqueado: e-mail/);
  conferirTentativa("e-mail", "tcp");
  assert.throws(() => tls.connect(465, "smtp.example.invalid"), /bloqueado: e-mail/);
  conferirTentativa("e-mail", "tcp");
});

test("#679: destino externo desconhecido também é bloqueado", async () => {
  await assert.rejects(fetch("https://desconhecido.example.invalid/api"), /bloqueado: rede externa/);
  conferirTentativa("rede externa");
});

test("#679: servidor HTTP local continua acessível", async t => {
  const servidor = http.createServer((req, res) => { res.end("local-ok"); });
  await new Promise(resolve => servidor.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => servidor.close(resolve)));
  const resposta = await fetch(`http://127.0.0.1:${servidor.address().port}/health`);
  assert.equal(await resposta.text(), "local-ok");
  assert.deepEqual(lerTentativas(), []);
});

test("#679: SDK do storage local é interceptado mesmo quando devolve error", async t => {
  let recebidas = 0;
  const servidor = http.createServer((req, res) => { recebidas += 1; res.writeHead(500).end(); });
  await new Promise(resolve => servidor.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => servidor.close(resolve)));
  const banco = createClient(`http://127.0.0.1:${servidor.address().port}`, "chave-ficticia-679", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await banco.storage.from("bucket-sintetico").upload("arquivo.txt", "conteudo-sintetico");
  assert.match(error?.message ?? "", /bloqueado: storage/);
  assert.equal(recebidas, 0, "Nenhuma requisição deve chegar ao servidor de storage.");
  conferirTentativa("storage", "fetch");
});

test("#679: bloqueio ignorado faz teste falhar e próximo teste recebe registro limpo", { timeout: 10_000 }, async () => {
  const setup = new URL("../setup-env.js", import.meta.url).href;
  const helper = new URL("../helpers/servicos-externos.js", import.meta.url).href;
  const codigo = `
    import test from 'node:test';
    import assert from 'node:assert/strict';
    import { lerTentativas } from ${JSON.stringify(helper)};
    test('tentativa ignorada', async () => {
      try { await fetch('https://esocial.example.invalid/enviar'); } catch {}
    });
    test('registro seguinte limpo', () => { assert.deepEqual(lerTentativas(), []); });
  `;
  for (const optIn of ["", "1"]) {
    // A flag sozinha não deve liberar rede em testes que não são o gov manual.
    const env = { ...process.env, ESOCIAL_GOV_INTEGRATION: optIn };
    delete env.NODE_TEST_CONTEXT;
    await assert.rejects(
      promisify(execFile)(process.execPath, ["--import", setup, "--test-reporter=tap", "--input-type=module", "--eval", codigo], { env, timeout: 4_000 }),
      erro => erro.code === 1 && /Tentativa externa não verificada.*eSocial/.test(erro.stdout + erro.stderr) && /ok 2 - registro seguinte limpo/.test(erro.stdout),
    );
  }
  assert.deepEqual(lerTentativas(), []);
});
