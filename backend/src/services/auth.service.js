const usuario = { id: '1', email: 'admin@teste.com', senha: '123456', perfil: 'admin' };

function validarCredenciais(email, senha) {
  if (email === usuario.email && senha === usuario.senha) {
    return usuario;
  }
  return null;
}

module.exports = { validarCredenciais };
