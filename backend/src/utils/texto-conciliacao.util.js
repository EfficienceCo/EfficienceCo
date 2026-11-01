// Tetos de texto da conciliação. A coluna é TEXT (migration 67) e não recusa
// tamanho: o limite mora aqui, como o teto do NUMERIC(15,2) mora no controller.
// Descrição do lançamento e MEMO/NAME do OFX compartilham o mesmo número porque
// os dois viram a descrição que o contador lê e que entra no PDF. 500 cabe um
// parágrafo (o caso de 200 do relatório continua válido) e recusa a colagem de
// 5.000/10.000. Categoria é rótulo ("fornecedor"), não narrativa.
export const DESCRICAO_MAXIMO = 500;
export const CATEGORIA_MAXIMO = 100;
