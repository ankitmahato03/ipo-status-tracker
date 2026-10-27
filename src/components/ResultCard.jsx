import StatusBadge from './StatusBadge.jsx'
import { getAllotmentStatus, getRecordFields } from '../utils/formatters.js'

export default function ResultCard({ record, index }) {
  const fields = getRecordFields(record)

  return (
    <article className="card p-4" aria-label={`Application record ${index + 1}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-500">Record {index + 1}</h3>
        <StatusBadge status={getAllotmentStatus(record)} />
      </div>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-3 min-[420px]:grid-cols-2">
        {fields.map(({ key, label, value }) => (
          <div key={key} className="min-w-0">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
            <dd className={`mt-0.5 break-words text-sm font-semibold text-slate-900 ${key === 'Pan_No' || key === 'DP_CLID' ? 'font-mono' : ''}`}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </article>
  )
}
