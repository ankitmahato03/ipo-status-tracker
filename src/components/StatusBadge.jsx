import { CheckCircle2, XCircle } from 'lucide-react'
import { ALLOTMENT_LABELS } from '../utils/formatters.js'

export default function StatusBadge({ status }) {
  if (!status) return <span className="text-slate-400">—</span>
  const allotted = status === 'allotted'
  const Icon = allotted ? CheckCircle2 : XCircle
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
        allotted ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' : 'bg-red-50 text-red-800 ring-1 ring-red-200'
      }`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {ALLOTMENT_LABELS[status]}
    </span>
  )
}
