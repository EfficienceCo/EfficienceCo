const TOKEN_STORAGE_KEY = 'token';

function decodeBase64Url(base64Url) {
  if (!base64Url) {
    return '';
  }

  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const paddedBase64 = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');

  if (typeof window !== 'undefined' && typeof window.atob === 'function') {
    return window.atob(paddedBase64);
  }

  return '';
}

function parseJwtPayload(token) {
  try {
    const [, payload] = token.split('.');
    if (!payload) {
      return null;
    }
    return JSON.parse(decodeBase64Url(payload));
  } catch (_error) {
    return null;
  }
}

export function salvarToken(token) {
  if (typeof window === 'undefined') {
    return;
  }

  if (token) {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  }

  window.dispatchEvent(new Event('auth-token-changed'));
}

export function limparToken() {
  salvarToken(null);
}

export function obterSessao() {
  if (typeof window === 'undefined') {
    return { token: null, usuario: null, expirado: true };
  }

  const token = window.localStorage.getItem(TOKEN_STORAGE_KEY);
  if (!token) {
    return { token: null, usuario: null, expirado: true };
  }

  const usuario = parseJwtPayload(token);
  if (!usuario) {
    return { token, usuario: null, expirado: true };
  }

  const agoraEmSegundos = Math.floor(Date.now() / 1000);
  const expirado = Boolean(usuario?.exp && usuario.exp <= agoraEmSegundos);

  return { token, usuario, expirado };
}
