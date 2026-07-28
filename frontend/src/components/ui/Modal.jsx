export default function Modal({ children, className = '' }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-xl ${className}`}>
      {children}
    </div>
  );
}
