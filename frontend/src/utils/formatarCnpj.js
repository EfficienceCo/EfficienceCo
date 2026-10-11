/**
 * Máscara de exibição: 14 dígitos → 00.000.000/0000-00.
 * Qualquer outro tamanho devolve o valor original (estado/payload ficam crus).
 */
export function formatarCnpj(valor) {
  if (valor == null || valor === '') return valor;

  const digitos = String(valor).replace(/\D/g, '');

  if (digitos.length !== 14) {
    return valor;
  }

  return digitos.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    '$1.$2.$3/$4-$5',
  );
}
