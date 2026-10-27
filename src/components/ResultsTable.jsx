import StatusBadge from './StatusBadge.jsx'
import { formatFieldValue, getAllotmentStatus, getColumns, getFieldLabel, isNumericField } from '../utils/formatters.js'

export default function ResultsTable({ records, ipoName }) {
  const columns = getColumns(records)

  return (
    <div className="card overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <caption className="sr-only">Application records for {ipoName}</caption>
        <thead className="bg-slate-50">
          <tr>
            <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-700">
              #
            </th>
            {columns.map((key) => (
              <th
                key={key}
                scope="col"
                className={`whitespace-nowrap px-4 py-3 font-semibold text-slate-700 ${isNumericField(key) ? 'text-right' : 'text-left'}`}
              >
                {getFieldLabel(key)}
              </th>
            ))}
            <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-700">
              Allotment status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {records.map((record, index) => (
            <tr key={index} className="hover:bg-slate-50/60">
              <td className="px-4 py-3 text-slate-500">{index + 1}</td>
              {columns.map((key) => (
                <td
                  key={key}
                  className={`px-4 py-3 text-slate-900 ${isNumericField(key) ? 'text-right tabular-nums' : ''} ${
                    key === 'Pan_No' || key === 'DP_CLID' ? 'font-mono' : ''
                  }`}
                >
                  {formatFieldValue(key, record[key]) || <span className="text-slate-400">—</span>}
                </td>
              ))}
              <td className="px-4 py-3">
                <StatusBadge status={getAllotmentStatus(record)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
