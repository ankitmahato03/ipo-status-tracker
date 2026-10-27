import { useCallback, useEffect, useRef, useState } from 'react'
import Header from './components/Header.jsx'
import PanSearchForm from './components/PanSearchForm.jsx'
import ErrorMessage from './components/ErrorMessage.jsx'
import BulkResults from './components/BulkResults.jsx'
import { INITIAL_REGISTRAR_ID, REGISTRARS, getStaticIpoList } from './config/ipos.js'
import { checkPans } from './services/bulkCheck.js'
import { fetchIpoList } from './services/ipoApi.js'

// Starts with the registrar's fallback list and swaps in the live list when the
// registrar publishes one (needs the proxy; the fallback stays if it's down).
function useIpoList(registrarId) {
  const [ipos, setIpos] = useState(() => getStaticIpoList(registrarId))
  useEffect(() => {
    const controller = new AbortController()
    setIpos(getStaticIpoList(registrarId))
    fetchIpoList(registrarId, { signal: controller.signal })
      .then((live) => {
        if (live?.length && !controller.signal.aborted) setIpos(live)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [registrarId])
  return ipos
}

export default function App() {
  const [panText, setPanText] = useState('')
  const [registrarId, setRegistrarId] = useState(INITIAL_REGISTRAR_ID)
  const ipos = useIpoList(registrarId)
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
    <div className="min-h-screen bg-white">
      <Header />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <PanSearchForm
          panText={panText}
          onPanTextChange={setPanText}
          registrars={REGISTRARS}
          registrarId={registrarId}
          onRegistrarChange={handleRegistrarChange}
          ipoId={ipoId}
          onIpoChange={setIpoId}
          ipos={ipos}
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
      <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs text-slate-500 sm:px-6">
        Data is provided by the selected registrar. This tool does not store PANs or search history.
      </footer>
    </div>
  )
}
