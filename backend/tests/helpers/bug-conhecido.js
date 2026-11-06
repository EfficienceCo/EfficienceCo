// Testes de bug conhecido: ficam com `skip` e a issue no motivo. Com RODAR_BUGS_CONHECIDOS=1 eles
// rodam de verdade (é como se prova que o `skip` ainda é necessário e que o teste falha pelo
// motivo certo). Quando a issue for corrigida, trocar `conhecido(...)` por `{}`.
export function conhecido(motivo) {
  return process.env.RODAR_BUGS_CONHECIDOS === "1" ? {} : { skip: motivo };
}
