'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '../services/auth.service';
import { salvarToken } from '../services/session.service';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

function getErrorMessage(error) {
  const apiMessage = error?.response?.data?.message;
  const apiErro = error?.response?.data?.erro;

  if (apiMessage) {
    return apiMessage;
  }

  if (apiErro) {
    return apiErro;
  }

  if (error?.response?.status === 404) {
    return 'Endpoint de login nao encontrado na API. Confira as portas do frontend e backend.';
  }

  if (error?.code === 'ERR_NETWORK') {
    return `Nao foi possivel conectar com a API em ${apiUrl}.`;
  }

  return 'Nao foi possivel realizar login. Tente novamente.';
}

export default function Home() {
  const router = useRouter();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((previousValue) => ({
      ...previousValue,
      [name]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setErrorMessage('');
    setSuccessMessage('');

    if (!formData.email || !formData.password) {
      setErrorMessage('Preencha e-mail e senha.');
      return;
    }

    setIsLoading(true);

    try {
      const data = await login(formData.email, formData.password);

      if (data?.token) {
        salvarToken(data.token);
        router.push('/dashboard');
        return;
      }

      setSuccessMessage(data?.message || 'Login enviado com sucesso.');
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-4">
      <section className="w-full max-w-md rounded-2xl border border-slate-700/70 bg-slate-900/70 p-8 shadow-2xl backdrop-blur">
        <div className="mb-8 space-y-2 text-center">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-300">
            Efficience Co
          </p>
          <h1 className="text-3xl font-bold text-white">Entrar na plataforma</h1>
          <p className="text-sm text-slate-300">
            Use seu e-mail e senha para acessar sua conta.
          </p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label
              htmlFor="email"
              className="block text-sm font-medium text-slate-200"
            >
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="voce@empresa.com"
              value={formData.email}
              onChange={handleChange}
              disabled={isLoading}
              className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-white placeholder:text-slate-400 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-500/20 disabled:cursor-not-allowed disabled:opacity-70"
              required
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-200"
            >
              Senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Digite sua senha"
              value={formData.password}
              onChange={handleChange}
              disabled={isLoading}
              className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-white placeholder:text-slate-400 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-500/20 disabled:cursor-not-allowed disabled:opacity-70"
              required
            />
          </div>

          {errorMessage && (
            <p className="rounded-xl border border-rose-500/60 bg-rose-950/30 px-3 py-2 text-sm text-rose-200">
              {errorMessage}
            </p>
          )}

          {successMessage && (
            <p className="rounded-xl border border-emerald-500/50 bg-emerald-950/25 px-3 py-2 text-sm text-emerald-200">
              {successMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:cursor-not-allowed disabled:bg-sky-600 disabled:text-slate-100"
          >
            {isLoading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </section>
    </main>
  );
}
