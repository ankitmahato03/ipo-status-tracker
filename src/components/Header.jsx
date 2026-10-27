import { ShieldCheck } from 'lucide-react'

export default function Header() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-6 sm:px-6">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-700 text-white shadow-sm">
          <ShieldCheck className="h-6 w-6" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">IPO Application Status Checker</h1>
          <p className="mt-0.5 text-sm text-slate-600 sm:text-base">Check your IPO application status using your PAN.</p>
        </div>
      </div>
    </header>
  )
}
