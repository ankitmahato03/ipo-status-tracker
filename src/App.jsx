import { useCallback, useEffect, useRef, useState } from 'react'
import Header from './components/Header.jsx'
import PanSearchForm from './components/PanSearchForm.jsx'
import ErrorMessage from './components/ErrorMessage.jsx'
import BulkResults from './components/BulkResults.jsx'
import { INITIAL_REGISTRAR_ID, REGISTRARS } from './config/ipos.js'
import { useIpoList } from './hooks/useIpoList.js'
import { checkPans } from './services/bulkCheck.js'

export default function App() {
  const [panText, setPanText] = useState('')
  const [registrarId, setRegistrarId] = useState(INITIAL_REGISTRAR_ID)
  const ipoList = useIpoList(registrarId)
  const { ipos } = ipoList
  const [ipoId, setIpoId] = useState('')
  // One entry per PAN: { pan, status: 'pending' | 'checking' | 'done' | 'error', records, error }.
  // Kept in memory only.
  const [results, setResults] = useState([])
  // The registrar, IPO id and IPO name the current results belong to.
  const [batch, setBatch] = useState(null)
  const [running, setRunning] = useState(false)
  const [batchError, setBatchError] = useState(null)
  const inFlight = useRef(null)

  useEffect(() => () => inFlight.current?.abort(), [])

  // A refreshed list can drop the selected IPO (closed issues get removed).
  useEffect(() => {
    if (ipoId && !ipos.some((ipo) => ipo.clientId === ipoId)) setIpoId('')
  }, [ipos, ipoId])

  const runBatch = useCallback(async (pans, target) => {
    if (inFlight.current) return // ignore repeated clicks while a batch is running
    const controller = new AbortController()
    inFlight.current = controller
    setRunning(true)
    setBatchError(null)

    const update = (pan, patch) =>
      setResults((prev) => prev.map((r) => (r.pan === pan ? { pan, records: [], error: null, ...patch } : r)))

    try {
      const { stoppedOnError } = await checkPans(
        pans,
        { registrar: target.registrar, clientId: target.clientId },
        { onUpdate: update, signal: controller.signal },
      )
      if (stoppedOnError && !controller.signal.aborted) setBatchError(stoppedOnError)
    } finally {
      if (inFlight.current === controller) {
        inFlight.current = null
        setRunning(false)
      }
    }
  }, [])

  function handleSubmit(pans) {
    const target = {
      registrar: registrarId,
      clientId: ipoId,
      ipoName: ipos.find((ipo) => ipo.clientId === ipoId)?.name ?? 'Selected IPO',
    }
    setBatch(target)
    setResults(pans.map((pan) => ({ pan, status: 'pending', records: [], error: null })))
    runBatch(pans, target)
  }

  function handleRetryUnfinished() {
    const pans = results.filter((r) => r.status !== 'done').map((r) => r.pan)
    setResults((prev) => prev.map((r) => (r.status === 'done' ? r : { ...r, status: 'pending', error: null })))
    runBatch(pans, batch)
  }

  function handleRegistrarChange(id) {
    setRegistrarId(id)
    setIpoId('')
  }

  function handleStop() {
    inFlight.current?.abort()
    inFlight.current = null
    setRunning(false)
    // Anything that was mid-request goes back to waiting so it can be resumed.
    setResults((prev) => prev.map((r) => (r.status === 'checking' ? { ...r, status: 'pending' } : r)))
  }

  function handleClear() {
    handleStop()
    setPanText('')
    setIpoId('')
    setBatch(null)
    setBatchError(null)
    setResults([])
  }

  return (
    <div className="min-h-screen bg-slate-50/60">
      <Header />
      <main className="relative mx-auto -mt-10 max-w-6xl space-y-6 px-4 pb-10 sm:px-6">
        <PanSearchForm
          panText={panText}
          onPanTextChange={setPanText}
          registrars={REGISTRARS}
          registrarId={registrarId}
          onRegistrarChange={handleRegistrarChange}
          ipoId={ipoId}
          onIpoChange={setIpoId}
          ipoList={ipoList}
          loading={running}
          onSubmit={handleSubmit}
          onStop={handleStop}
          onClear={handleClear}
        />

        {batchError ? (
          <ErrorMessage
            error={{
              kind: batchError.kind,
              message: `Stopped after several PANs failed in a row. ${batchError.message}`,
              retryable: batchError.retryable,
            }}
            onRetry={handleRetryUnfinished}
          />
        ) : null}
        {results.length > 0 ? (
          <BulkResults results={results} ipoName={batch?.ipoName ?? 'Selected IPO'} running={running} onRetryFailed={handleRetryUnfinished} />
        ) : null}
      </main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-5 text-xs text-slate-500 sm:flex-row sm:justify-between sm:px-6">
          <p>Data comes directly from the selected registrar. Results are not stored.</p>
          <p>Not affiliated with KFin Technologies or MUFG Intime.</p>
        </div>
      </footer>
    </div>
  )
}
