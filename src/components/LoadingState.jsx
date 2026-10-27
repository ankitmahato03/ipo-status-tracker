import { Loader2 } from 'lucide-react'

export default function LoadingState() {
  return (
    <div className="card p-6" role="status" aria-live="polite">
      <div className="flex items-center gap-3 text-sm font-medium text-slate-700">
        <Loader2 className="h-5 w-5 animate-spin text-blue-700" aria-hidden="true" />
        Fetching your application status…
      </div>
      <div className="mt-5 space-y-3" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />
        ))}
      </div>
    </div>
  )
}
