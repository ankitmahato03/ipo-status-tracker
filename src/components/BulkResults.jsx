import { AlertTriangle, Clock, Download, Loader2, MinusCircle, RefreshCw } from 'lucide-react'
import StatusBadge from './StatusBadge.jsx'
import {
  BULK_STATUS_LABELS,
  bulkResultsToCsv,
  flattenBulkResults,
  formatFieldValue,
  maskIdentifier,
  slugify,
  summarizeBulkResults,
} from '../utils/formatters.js'

function downloadCsv(csv, filename) {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

const OTHER_STATUS_STYLES = {
  pending: { icon: Clock, className: 'bg-slate-50 text-slate-600 ring-slate-200' },
  checking: { icon: Loader2, className: 'bg-blue-50 text-blue-800 ring-blue-200', spin: true },
  no_record: { icon: MinusCircle, className: 'bg-slate-100 text-slate-700 ring-slate-300' },
  error: { icon: AlertTriangle, className: 'bg-amber-50 text-amber-900 ring-amber-200' },
}

function BulkStatus({ status, error }) {
  const style = OTHER_STATUS_STYLES[status]
  if (!style) return <StatusBadge status={status} />
  const Icon = style.icon
  return (
    <span
      title={error?.message}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${style.className}`}
    >
      <Icon className={`h-3.5 w-3.5 ${style.spin ? 'animate-spin' : ''}`} aria-hidden="true" />
      {BULK_STATUS_LABELS[status]}
    </span>
  )
}

function Stat({ label, value, className }) {
  return (
    <div className="rounded-xl border border-slate-200 px-4 py-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${className}`}>{value}</p>
    </div>
  )
}

const cell = (record, key) => (record ? formatFieldValue(key, record[key]) : '') || <span className="text-slate-400">—</span>

export default function BulkResults({ results, ipoName, running, onRetryFailed }) {
  const lines = flattenBulkResults(results)
  const counts = summarizeBulkResults(results)
  const progress = counts.total ? Math.round((counts.finished / counts.total) * 100) : 0
  const unfinished = results.filter((r) => r.status !== 'done').length

  function handleExport() {
    const date = new Date().toISOString().slice(0, 10)
    downloadCsv(bulkResultsToCsv(results, { ipoName }), `ipo-status-${slugify(ipoName) || 'results'}-${date}.csv`)
  }

  return (
    <section aria-labelledby="results-heading" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="results-heading" className="text-lg font-bold text-slate-900">
            {ipoName}
          </h2>
          <p className="text-sm text-slate-600" aria-live="polite">
            {running ? 'Checking' : 'Checked'} {counts.finished} of {counts.total} {counts.total === 1 ? 'PAN' : 'PANs'}
          </p>
        </div>
        <div className="flex gap-3">
          {!running && unfinished > 0 ? (
            <button type="button" onClick={onRetryFailed} className="btn-secondary flex-1 sm:flex-none">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Retry {unfinished} unfinished
            </button>
          ) : null}
          <button type="button" onClick={handleExport} disabled={counts.finished === 0} className="btn-secondary flex-1 sm:flex-none">
            <Download className="h-4 w-4" aria-hidden="true" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-blue-700 transition-all" style={{ width: `${progress}%` }} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Allotted" value={counts.allotted} className="text-emerald-700" />
        <Stat label="Not allotted" value={counts.not_allotted} className="text-red-700" />
        <Stat label="No record" value={counts.no_record} className="text-slate-700" />
        <Stat label="Errors" value={counts.error} className="text-amber-700" />
      </div>

      <div className="card overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <caption className="sr-only">Allotment status for each PAN in {ipoName}</caption>
          <thead className="bg-slate-50">
            <tr>
              {['#', 'PAN', 'Applicant name', 'Application no.', 'Category'].map((label) => (
                <th key={label} scope="col" className="whitespace-nowrap px-4 py-3 text-left font-semibold text-slate-700">
                  {label}
                </th>
              ))}
              <th scope="col" className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-700">
                Applied
              </th>
              <th scope="col" className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-700">
                Allotted
              </th>
              <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-700">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((line, i) => (
              <tr key={i} className="hover:bg-slate-50/60">
                <td className="px-4 py-3 text-slate-500">{line.index}</td>
                <td className="whitespace-nowrap px-4 py-3 font-mono text-slate-900">{maskIdentifier(line.pan)}</td>
                <td className="px-4 py-3 text-slate-900">{cell(line.record, 'Name')}</td>
                <td className="px-4 py-3 text-slate-900">{cell(line.record, 'Appln_No')}</td>
                <td className="px-4 py-3 text-slate-900">{cell(line.record, 'category')}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-900">{cell(line.record, 'App_Shares')}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-900">{cell(line.record, 'All_Shares')}</td>
                <td className="px-4 py-3">
                  <BulkStatus status={line.status} error={line.error} />
                  {line.status === 'error' ? <p className="mt-1 max-w-xs text-xs text-amber-900">{line.error?.message}</p> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        # matches the order of the PANs you entered. PANs are masked; allotment status is shown only when the registrar
        returns an allotted share count. The exported CSV contains the same masked values.
      </p>
    </section>
  )
}
