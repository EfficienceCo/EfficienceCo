// Algoritmo de matching de conciliação bancária, em 3 passes:
//   Pass 1 (automatico): mesmo tipo, diferença de valor <= R$0,01, diferença de data = 0 dias.
//   Pass 2 (provavel): mesmo tipo, diferença de valor <= R$0,01, diferença de data <= 3 dias,
//                       só entre o que sobrou do Pass 1.
//   Pass 3 (sem_par): tudo que restou de transações e/ou lançamentos vira par com o lado
//                      ausente em NULL.
// Cada transação/lançamento entra em no máximo um par.

const TOLERANCIA_VALOR = 0.01;

function diferencaDiasEmDias(dataA, dataB) {
  const a = new Date(`${dataA}T00:00:00Z`);
  const b = new Date(`${dataB}T00:00:00Z`);
  return Math.abs(a - b) / (1000 * 60 * 60 * 24);
}

// Entre o que resta, casa cada transação (ordenada por data, depois id, pra ser
// determinístico) com o lançamento restante mais próximo em data (desempate por
// menor diferença de valor) que respeite tipo/valor/dias. Remove ambos os lados
// do que resta assim que casados, pra não reutilizar em passes seguintes.
function rodarPasse(transacoesRestantes, lancamentosRestantes, maxDias, confianca, pares) {
  const ordenadas = [...transacoesRestantes.values()].sort(
    (a, b) => a.data_lancamento.localeCompare(b.data_lancamento) || String(a.id).localeCompare(String(b.id)),
  );

  for (const transacao of ordenadas) {
    let melhor = null;
    let melhorDiffDias = Infinity;
    let melhorDiffValor = Infinity;

    for (const lancamento of lancamentosRestantes.values()) {
      if (lancamento.tipo !== transacao.tipo) continue;

      // Arredondado a centavos: valores são NUMERIC(15,2), mas a subtração de dois
      // floats como 106.01 - 106.0 pode gerar 0.010000000000047748 e falhar a
      // tolerância de R$0,01 por erro de ponto flutuante.
      const diffValor = Math.round(Math.abs(Number(transacao.valor) - Number(lancamento.valor)) * 100) / 100;
      if (diffValor > TOLERANCIA_VALOR) continue;

      const diffDias = diferencaDiasEmDias(transacao.data_lancamento, lancamento.data_lancamento);
      if (diffDias > maxDias) continue;

      if (diffDias < melhorDiffDias || (diffDias === melhorDiffDias && diffValor < melhorDiffValor)) {
        melhor = lancamento;
        melhorDiffDias = diffDias;
        melhorDiffValor = diffValor;
      }
    }

    if (melhor) {
      pares.push({ transacao_id: transacao.id, lancamento_id: melhor.id, confianca });
      transacoesRestantes.delete(transacao.id);
      lancamentosRestantes.delete(melhor.id);
    }
  }
}

// Recebe as linhas de transacoes_extrato e lancamentos_contabeis (já filtradas por
// cliente/extrato/período) e retorna os pares { transacao_id, lancamento_id, confianca }
// prontos para inserir em pares_conciliacao.
export function executarMatching(transacoes, lancamentos) {
  const transacoesRestantes = new Map(transacoes.map((t) => [t.id, t]));
  const lancamentosRestantes = new Map(lancamentos.map((l) => [l.id, l]));
  const pares = [];

  rodarPasse(transacoesRestantes, lancamentosRestantes, 0, "automatico", pares);
  rodarPasse(transacoesRestantes, lancamentosRestantes, 3, "provavel", pares);

  for (const transacao of transacoesRestantes.values()) {
    pares.push({ transacao_id: transacao.id, lancamento_id: null, confianca: "sem_par" });
  }
  for (const lancamento of lancamentosRestantes.values()) {
    pares.push({ transacao_id: null, lancamento_id: lancamento.id, confianca: "sem_par" });
  }

  return pares;
}
