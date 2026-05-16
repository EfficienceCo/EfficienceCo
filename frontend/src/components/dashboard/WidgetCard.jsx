import Link from 'next/link';

export default function WidgetCard({
  title,
  description,
  href,
  linkLabel = 'Ver detalhes',
  children,
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm text-zinc-500">{description}</p>
          ) : null}
        </div>

        {href ? (
          <Link
            href={href}
            className="whitespace-nowrap rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100"
          >
            {linkLabel}
          </Link>
        ) : null}
      </header>

      <div className="mt-4">{children}</div>
    </section>
  );
}
