/**
 * Normalização e validação de CPF (dígitos verificadores).
 * Usado por funcionários e pela planilha de folha.
 */

export function normalizarCpf(valor) {
  if (valor === null || valor === undefined || valor === "") return "";
  if (typeof valor === "number" && Number.isFinite(valor)) {
    return String(Math.trunc(valor)).replace(/\D/g, "");
  }
  if (typeof valor === "string") {
    return valor.replace(/\D/g, "");
  }
  return "";
}

export function cpfValido(cpf) {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) {
    return false;
  }

  const calcularDigito = (quantidade) => {
    const soma = cpf
      .slice(0, quantidade)
      .split("")
      .reduce((total, digito, indice) => total + Number(digito) * (quantidade + 1 - indice), 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return calcularDigito(9) === Number(cpf[9]) && calcularDigito(10) === Number(cpf[10]);
}
