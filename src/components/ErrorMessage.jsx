import { AlertTriangle, RefreshCw } from 'lucide-react'

const TITLES = {
  timeout: 'Request timed out',
  network: 'Network error',
  rate_limited: 'Too many requests',
  server: 'Service unavailable',
  forbidden: 'Access refused',
  malformed: 'Unexpected response',
  config: 'Configuration error',
  registrar: 'Registrar message',
}

export default function ErrorMessage({ error, onRetry }) {
  return (
    <div role="alert" className="card border-red-200 bg-red-50/60 p-5">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-red-900">{TITLES[error?.kind] ?? 'Something went wrong'}</h2>
          <p className="mt-1 text-sm text-red-800">{error?.message || 'The request could not be completed.'}</p>
          {onRetry && error?.retryable !== false ? (
            <button type="button" onClick={onRetry} className="btn-secondary mt-4 border-red-300 text-red-800 hover:bg-red-100">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Retry
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
