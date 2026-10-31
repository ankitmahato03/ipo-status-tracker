import { Lock, RefreshCw, ShieldCheck, Users } from 'lucide-react'

const HIGHLIGHTS = [
  { icon: RefreshCw, text: 'IPO lists update automatically' },
  { icon: Users, text: 'Check up to 50 PANs at once' },
  { icon: Lock, text: 'PANs are never stored' },
]

export default function Header() {
  return (
    <header className="bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-800 text-white">
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pt-10">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-3xl">IPO Application Status Checker</h1>
            <p className="mt-0.5 text-sm text-blue-100 sm:text-base">Check your IPO application status using your PAN.</p>
          </div>
        </div>
        <ul className="mt-6 flex flex-wrap gap-2">
          {HIGHLIGHTS.map(({ icon: Icon, text }) => (
            <li key={text} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-blue-50 ring-1 ring-white/15">
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {text}
            </li>
          ))}
        </ul>
      </div>
    </header>
  )
}
