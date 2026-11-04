// O PostgREST corta a resposta em 1000 linhas e não avisa (db-max-rows).
// .limit(1001) não passa desse teto: a lista inteira sai página a página.
export const TAMANHO_PAGINA_POSTGREST = 1000;

// `.in("id", [...])` vai na URL. Centenas de UUIDs estouram o limite do gateway
// e a resposta vira 500. Lotes de 100 cabem e batem no padrão do #691/#692.
export const LOTE_CONSULTA_IDS = 100;

const RANGE_NAO_SATISFAZ = "Requested range not satisfiable";

// `montarConsulta` devolve uma query nova a cada chamada. O builder do
// supabase não se reexecuta depois do primeiro await.
export async function buscarTodasAsLinhas(montarConsulta) {
  const linhas = [];
  let inicio = 0;

  for (;;) {
    const { data, error } = await montarConsulta().range(
      inicio,
      inicio + TAMANHO_PAGINA_POSTGREST - 1,
    );

    if (error) {
      if (error.message === RANGE_NAO_SATISFAZ) {
        return { data: linhas, error: null };
      }
      return { data: null, error };
    }

    const pagina = data ?? [];
    linhas.push(...pagina);
    if (pagina.length < TAMANHO_PAGINA_POSTGREST) {
      return { data: linhas, error: null };
    }
    inicio += TAMANHO_PAGINA_POSTGREST;
  }
}

// `montarConsulta(idsDoLote)` monta a query com `.in` só daquele pedaço.
export async function buscarPorIdsEmLotes(ids, montarConsulta) {
  if (!ids.length) return { data: [], error: null };

  const linhas = [];
  for (let i = 0; i < ids.length; i += LOTE_CONSULTA_IDS) {
    const { data, error } = await montarConsulta(ids.slice(i, i + LOTE_CONSULTA_IDS));
    if (error) return { data: null, error };
    linhas.push(...(data ?? []));
  }
  return { data: linhas, error: null };
}

// Mesmo lote do SELECT: update com `.in` grande também estoura a URL.
export async function atualizarPorIdsEmLotes(ids, montarUpdate) {
  if (!ids.length) return { error: null };

  for (let i = 0; i < ids.length; i += LOTE_CONSULTA_IDS) {
    const { error } = await montarUpdate(ids.slice(i, i + LOTE_CONSULTA_IDS));
    if (error) return { error };
  }
  return { error: null };
}
