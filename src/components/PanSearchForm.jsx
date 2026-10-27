import { useState } from 'react'
import { Loader2, Lock, RotateCcw, Search, Square } from 'lucide-react'
import { MAX_BULK_PANS, parsePanList } from '../utils/panValidation.js'

const SELECT_CLASS =
  'mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/30 disabled:bg-slate-50'

export default function PanSearchForm({
  panText,
  onPanTextChange,
  registrars,
  registrarId,
  onRegistrarChange,
  ipoId,
  onIpoChange,
  ipos,
  loading,
  onSubmit,
  onStop,
  onClear,
}) {
  const registrar = registrars.find((r) => r.id === registrarId)
  const [touched, setTouched] = useState(false)
  const { valid, invalid, duplicates } = parsePanList(panText)
  const tooMany = valid.length > MAX_BULK_PANS
  const panError = !touched
    ? ''
    : valid.length === 0
      ? 'Enter at least one PAN in the format ABCDE1234F.'
      : tooMany
        ? `You can check up to ${MAX_BULK_PANS} PANs at a time. Remove ${valid.length - MAX_BULK_PANS}.`
        : invalid.length > 0
          ? `Fix or remove ${invalid.length} invalid ${invalid.length === 1 ? 'entry' : 'entries'}: ${invalid.slice(0, 5).join(', ')}${invalid.length > 5 ? ', …' : ''}`
          : ''
  const canSubmit = valid.length > 0 && !tooMany && invalid.length === 0 && Boolean(ipoId) && !loading

  function handleSubmit(event) {
    event.preventDefault()
    setTouched(true)
    if (canSubmit) onSubmit(valid)
  }

  function handleClear() {
    setTouched(false)
    onClear()
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="card p-5 sm:p-6" aria-label="IPO status search">
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-5">
          <div>
            <label htmlFor="registrar-select" className="block text-sm font-semibold text-slate-800">
              Registrar
            </label>
            <select
              id="registrar-select"
              value={registrarId}
              onChange={(e) => onRegistrarChange(e.target.value)}
              disabled={loading}
              className={SELECT_CLASS}
            >
              {registrars.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            {registrar && !registrar.browserDirect ? (
              <p className="mt-1.5 text-xs text-slate-500">
                Checked through the local proxy: keep <code className="font-mono">npm run server</code> running.
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="ipo-select" className="block text-sm font-semibold text-slate-800">
              IPO
            </label>
            <select
              id="ipo-select"
              value={ipoId}
              onChange={(e) => onIpoChange(e.target.value)}
              disabled={loading}
              required
              className={SELECT_CLASS}
            >
              <option value="">Select an IPO</option>
              {ipos.map((ipo) => (
                <option key={ipo.clientId} value={ipo.clientId}>
                  {ipo.name}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-slate-500">The registrar checks status one IPO at a time.</p>
          </div>
        </div>

        <div>
          <label htmlFor="pan-input" className="block text-sm font-semibold text-slate-800">
            PANs
          </label>
          <textarea
            id="pan-input"
            name="pans"
            rows={8}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder={'ABCDE1234F\nPQRST5678K\n…'}
            value={panText}
            onChange={(e) => onPanTextChange(e.target.value.toUpperCase())}
            onBlur={() => setTouched(true)}
            disabled={loading}
            aria-invalid={Boolean(panError)}
            aria-describedby={panError ? 'pan-error pan-hint' : 'pan-hint'}
            className={`mt-1.5 block w-full resize-y rounded-lg border bg-white px-3 py-2.5 font-mono text-sm uppercase tracking-widest text-slate-900 shadow-sm focus:outline-none focus:ring-2 disabled:bg-slate-50 ${
              panError
                ? 'border-red-500 focus:border-red-600 focus:ring-red-600/30'
                : 'border-slate-300 focus:border-blue-600 focus:ring-blue-600/30'
            }`}
          />
          {panError ? (
            <p id="pan-error" role="alert" className="mt-1.5 text-xs font-medium text-red-700">
              {panError}
            </p>
          ) : null}
          <p id="pan-hint" className="mt-1.5 text-xs text-slate-500">
            One per line, or separated by commas or spaces. Up to {MAX_BULK_PANS}.{' '}
            <span className="font-medium text-slate-700">
              {valid.length} valid{duplicates > 0 ? `, ${duplicates} duplicate${duplicates === 1 ? '' : 's'} ignored` : ''}
              {invalid.length > 0 ? `, ${invalid.length} invalid` : ''}
            </span>
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          PANs are sent only to the IPO status service and are not stored.
        </p>
        <div className="flex gap-3">
          <button type="button" onClick={handleClear} className="btn-secondary flex-1 sm:flex-none">
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Clear
          </button>
          {loading ? (
            <button type="button" onClick={onStop} className="btn-secondary flex-1 sm:flex-none">
              <Square className="h-4 w-4" aria-hidden="true" />
              Stop
            </button>
          ) : null}
          <button type="submit" disabled={!canSubmit} aria-busy={loading} className="btn-primary flex-1 sm:flex-none">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Search className="h-4 w-4" aria-hidden="true" />
            )}
            {loading ? 'Checking…' : valid.length > 1 ? `Check ${valid.length} PANs` : 'Check IPO Status'}
          </button>
        </div>
      </div>
    </form>
  )
}
