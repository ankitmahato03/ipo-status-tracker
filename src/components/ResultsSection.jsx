import { Download, FileSearch, RefreshCw } from 'lucide-react'
import ResultCard from './ResultCard.jsx'
import ResultsTable from './ResultsTable.jsx'
import { recordsToCsv, slugify } from '../utils/formatters.js'

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

export default function ResultsSection({ records, ipoName, onRefresh }) {
  const count = records.length

  function handleExport() {
    const date = new Date().toISOString().slice(0, 10)
    downloadCsv(recordsToCsv(records, { ipoName }), `ipo-status-${slugify(ipoName) || 'results'}-${date}.csv`)
  }

  return (
    <section aria-labelledby="results-heading" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="results-heading" className="text-lg font-bold text-slate-900">
            {ipoName}
          </h2>
          <p className="text-sm text-slate-600" aria-live="polite">
            {count} {count === 1 ? 'record' : 'records'} found
          </p>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onRefresh} className="btn-secondary flex-1 sm:flex-none">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Refresh
          </button>
          {count > 0 ? (
            <button type="button" onClick={handleExport} className="btn-secondary flex-1 sm:flex-none">
              <Download className="h-4 w-4" aria-hidden="true" />
              Export CSV
            </button>
          ) : null}
        </div>
      </div>

      {count === 0 ? (
        <div className="card flex flex-col items-center gap-2 px-6 py-10 text-center">
          <FileSearch className="h-8 w-8 text-slate-400" aria-hidden="true" />
          <p className="font-semibold text-slate-800">No application records found for the supplied PAN.</p>
          <p className="text-sm text-slate-500">Check that you selected the right IPO and entered the PAN correctly.</p>
        </div>
      ) : (
        <>
          <div className="hidden md:block">
            <ResultsTable records={records} ipoName={ipoName} />
          </div>
          <div className="space-y-3 md:hidden">
            {records.map((record, index) => (
              <ResultCard key={index} record={record} index={index} />
            ))}
          </div>
          <p className="text-xs text-slate-500">
            PAN and demat account numbers are masked. Allotment status is shown only when the registrar returns an allotted
            share count. Exported CSV files contain the same masked values.
          </p>
        </>
      )}
    </section>
  )
}
