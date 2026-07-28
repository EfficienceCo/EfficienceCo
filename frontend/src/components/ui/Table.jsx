export default function Table({ children, className = '' }) {
  return <table className={`min-w-full divide-y divide-slate-200 text-sm ${className}`}>{children}</table>;
}
