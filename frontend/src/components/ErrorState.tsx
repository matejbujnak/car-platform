/** Friendly error state with a retry action (instead of a bare red text). */
export default function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="mt-16 text-center">
      <p className="text-lg font-medium text-slate-900">Something went wrong</p>
      <p className="mt-1 text-sm text-slate-500">{message}</p>
      <button
        onClick={onRetry ?? (() => window.location.reload())}
        className="mt-4 rounded bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        Try again
      </button>
    </div>
  );
}
