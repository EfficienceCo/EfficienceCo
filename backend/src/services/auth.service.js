// Service de autenticacao
// Responsavel por validar credenciais do usuario
// Por enquanto usa um usuario hardcoded — sera substituido por consulta ao banco

// Usuario fixo para testes (temporario, sem banco ainda)
const usuario = { id: '1', email: 'admin@teste.com', senha: '123456', perfil: 'admin' };

// Compara email e senha recebidos com o usuario fixo
// Retorna o objeto do usuario se bater, ou null se nao bater
export function validarCredenciais(email, senha) {
  console.log('[auth.service] Validando credenciais para:', email);

  if (email === usuario.email && senha === usuario.senha) {
    console.log('[auth.service] Credenciais validas para usuario:', usuario.id);
    return usuario;
  }

  console.log('[auth.service] Credenciais invalidas para:', email);
  return null;
}
