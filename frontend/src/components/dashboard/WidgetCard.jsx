import Link from 'next/link';

export default function WidgetCard({
  title,
  description,
  href,
  linkLabel = 'Ver detalhes',
  children,
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          ) : null}
        </div>

        {href ? (
          <Link
            href={href}
            className="whitespace-nowrap rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            {linkLabel}
          </Link>
        ) : null}
      </header>

      <div className="mt-4">{children}</div>
    </section>
  );
}
