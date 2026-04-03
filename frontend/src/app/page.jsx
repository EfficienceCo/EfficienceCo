export default function Home() {
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

        <form className="space-y-5">
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
              className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-white placeholder:text-slate-400 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-500/20"
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
              className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-white placeholder:text-slate-400 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-500/20"
              required
            />
          </div>

          <button
            type="button"
            className="w-full rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-slate-900"
          >
            Entrar
          </button>
        </form>
      </section>
    </main>
  );
}
