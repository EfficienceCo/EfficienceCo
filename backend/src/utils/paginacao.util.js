// O PostgREST corta a resposta em 1000 linhas e não avisa (db-max-rows).
// .limit(1001) não passa desse teto: a lista inteira sai página a página.
export const TAMANHO_PAGINA_POSTGREST = 1000;

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
