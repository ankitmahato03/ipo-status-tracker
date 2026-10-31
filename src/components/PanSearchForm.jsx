import { useState } from 'react'
import { Loader2, Lock, RefreshCw, RotateCcw, Search, Sparkles, Square, X } from 'lucide-react'
import { MAX_BULK_PANS, parsePanList } from '../utils/panValidation.js'

const SELECT_CLASS =
  'mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/30 disabled:bg-slate-50'

function StepLabel({ step, htmlFor, as: Tag = 'label', children }) {
  return (
    <Tag htmlFor={htmlFor} className="flex items-center gap-2 text-sm font-semibold text-slate-800">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-700 text-[11px] font-bold text-white" aria-hidden="true">
        {step}
      </span>
      {children}
    </Tag>
  )
}

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function IpoListStatus({ ipoList, disabled }) {
  const { ipos, source, loading, updatedAt, refresh } = ipoList
  const count = `${ipos.length} ${ipos.length === 1 ? 'IPO' : 'IPOs'}`
  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
      <span className="inline-flex items-center gap-1.5 text-slate-500" aria-live="polite">
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-700" aria-hidden="true" />
        ) : (
          <span className={`h-2 w-2 rounded-full ${source === 'live' ? 'bg-emerald-500' : 'bg-amber-500'}`} aria-hidden="true" />
        )}
        {loading
          ? 'Checking the registrar for new IPOs…'
          : source === 'live'
            ? `${count} · live list, updated ${formatTime(updatedAt)}`
            : `${count} · saved list (live list unavailable)`}
      </span>
      <button
        type="button"
        onClick={refresh}
        disabled={loading || disabled}
        className="inline-flex items-center gap-1 rounded font-semibold text-blue-700 hover:text-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-50"
      >
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        Refresh list
      </button>
    </div>
  )
}

function NewIposNotice({ names, onDismiss }) {
  if (!names.length) return null
  return (
    <div role="status" className="mt-2 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900 ring-1 ring-emerald-200">
      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <p className="flex-1">
        <span className="font-semibold">{names.length === 1 ? 'New IPO added:' : `${names.length} new IPOs added:`}</span>{' '}
        {names.join(', ')}
      </p>
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="rounded p-0.5 hover:bg-emerald-100">
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}

export default function PanSearchForm({
  panText,
  onPanTextChange,
  registrars,
  registrarId,
  onRegistrarChange,
  ipoId,
  onIpoChange,
  ipoList,
  loading,
  onSubmit,
  onStop,
  onClear,
}) {
  const { ipos } = ipoList
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
    <form onSubmit={handleSubmit} noValidate className="card p-5 shadow-lg shadow-slate-900/5 sm:p-7" aria-label="IPO status search">
      <div className="grid gap-7 md:grid-cols-2 md:gap-8">
        <div className="space-y-6">
          <fieldset disabled={loading}>
            <StepLabel step={1} as="legend">
              Registrar
            </StepLabel>
            <div className="mt-2 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
              {registrars.map((r) => {
                const selected = r.id === registrarId
                return (
                  <label
                    key={r.id}
                    className={`flex cursor-pointer items-center justify-center rounded-lg border px-3 py-2.5 text-center text-sm font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-600 has-[:disabled]:cursor-not-allowed ${
                      selected
                        ? 'border-blue-600 bg-blue-50 text-blue-800 ring-1 ring-blue-600'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="registrar"
                      value={r.id}
                      checked={selected}
                      onChange={() => onRegistrarChange(r.id)}
                      className="sr-only"
                    />
                    {r.name}
                  </label>
                )
              })}
            </div>
            {import.meta.env.DEV && registrar && !registrar.browserDirect ? (
              <p className="mt-2 text-xs text-slate-500">
                Local development: keep <code className="font-mono">npm run server</code> running for this registrar.
              </p>
            ) : null}
          </fieldset>

          <div>
            <StepLabel step={2} htmlFor="ipo-select">
              IPO
            </StepLabel>
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
            <IpoListStatus ipoList={ipoList} disabled={loading} />
            <NewIposNotice names={ipoList.added} onDismiss={ipoList.dismissAdded} />
          </div>
        </div>

        <div>
          <StepLabel step={3} htmlFor="pan-input">
            PANs
          </StepLabel>
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
            className={`mt-2 block w-full resize-y rounded-lg border bg-white px-3 py-2.5 font-mono text-sm uppercase tracking-widest text-slate-900 shadow-sm focus:outline-none focus:ring-2 disabled:bg-slate-50 ${
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
          <div id="pan-hint" className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            <span>One per line, or separated by commas or spaces. Up to {MAX_BULK_PANS}.</span>
            <span className="rounded-full bg-blue-50 px-2 py-0.5 font-semibold text-blue-800">{valid.length} valid</span>
            {duplicates > 0 ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
                {duplicates} duplicate{duplicates === 1 ? '' : 's'} ignored
              </span>
            ) : null}
            {invalid.length > 0 ? (
              <span className="rounded-full bg-red-50 px-2 py-0.5 font-semibold text-red-800">{invalid.length} invalid</span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-7 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          PANs are sent only to the registrar and are not stored.
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
