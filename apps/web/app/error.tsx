'use client';

/**
 * Next.js App Router error boundary.
 * Automatically replaces the crashed UI subtree with this component.
 * The `error` prop contains the thrown Error. `reset` retries rendering.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white border border-zinc-200 rounded-2xl shadow-sm p-8 flex flex-col gap-5">
        {/* Icon */}
        <div className="w-12 h-12 rounded-full bg-red-50 border border-red-100 flex items-center justify-center text-red-500 text-xl">
          ⚠
        </div>

        {/* Heading */}
        <div>
          <h1 className="text-lg font-semibold text-zinc-900 mb-1">Something went wrong</h1>
          <p className="text-sm text-zinc-500 leading-relaxed">
            Warden encountered an unexpected error. No transaction has been broadcast.
            Your pending approvals have been preserved in local storage.
          </p>
        </div>

        {/* Error detail — collapsed by default, useful for debugging */}
        {error?.message && (
          <details className="text-xs text-zinc-400 font-mono bg-zinc-50 border border-zinc-100 rounded-lg p-3 cursor-pointer">
            <summary className="font-sans font-medium text-zinc-500 text-xs cursor-pointer mb-1">
              Error detail
            </summary>
            <span className="break-all">{error.message}</span>
            {error.digest && (
              <span className="block mt-1 text-zinc-300">digest: {error.digest}</span>
            )}
          </details>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={reset}
            className="flex-1 px-4 py-2.5 text-sm font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-700 transition-colors"
          >
            Try again
          </button>
          <button
            onClick={() => window.location.assign('/')}
            className="flex-1 px-4 py-2.5 text-sm font-medium border border-zinc-200 text-zinc-600 rounded-lg hover:bg-zinc-50 transition-colors"
          >
            Return home
          </button>
        </div>
      </div>
    </div>
  );
}
