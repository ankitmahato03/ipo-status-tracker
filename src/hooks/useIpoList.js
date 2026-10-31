import { useCallback, useEffect, useRef, useState } from 'react'
import { getStaticIpoList } from '../config/ipos.js'
import { fetchIpoList } from '../services/ipoApi.js'

// Registrars publish new IPOs without notice, so the list is re-checked while
// the page is open: on a timer, and when the tab comes back into view.
export const IPO_LIST_REFRESH_MS = 10 * 60 * 1000
const RECHECK_ON_FOCUS_MS = 2 * 60 * 1000

function initialState(registrarId) {
  return { ipos: getStaticIpoList(registrarId), source: 'saved', loading: true, updatedAt: null, added: [] }
}

/**
 * Starts with the registrar's saved list and swaps in the live one from the
 * proxy (GET /api/ipos). If the live list can't load, the saved list stays.
 *
 * source:  'saved' (built-in list) | 'live'
 * added:   names of IPOs that appeared since the previous live list
 */
export function useIpoList(registrarId) {
  const [state, setState] = useState(() => initialState(registrarId))
  const controllerRef = useRef(null)
  const lastCheckRef = useRef(0)

  const load = useCallback((id) => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    lastCheckRef.current = Date.now()
    setState((prev) => ({ ...prev, loading: true }))

    fetchIpoList(id, { signal: controller.signal })
      .then((live) => {
        if (controller.signal.aborted) return
        if (!live?.length) return setState((prev) => ({ ...prev, loading: false }))
        setState((prev) => {
          const known = new Set(prev.ipos.map((ipo) => ipo.clientId))
          const added = prev.source === 'live' ? live.filter((ipo) => !known.has(ipo.clientId)).map((ipo) => ipo.name) : []
          return { ipos: live, source: 'live', loading: false, updatedAt: new Date(), added: added.length ? added : prev.added }
        })
      })
      .catch(() => {
        if (!controller.signal.aborted) setState((prev) => ({ ...prev, loading: false }))
      })
  }, [])

  useEffect(() => {
    setState(initialState(registrarId))
    load(registrarId)
    return () => controllerRef.current?.abort()
  }, [registrarId, load])

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load(registrarId)
    }, IPO_LIST_REFRESH_MS)
    function onVisible() {
      if (document.visibilityState === 'visible' && Date.now() - lastCheckRef.current > RECHECK_ON_FOCUS_MS) load(registrarId)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [registrarId, load])

  const refresh = useCallback(() => load(registrarId), [registrarId, load])
  const dismissAdded = useCallback(() => setState((prev) => ({ ...prev, added: [] })), [])

  return { ...state, refresh, dismissAdded }
}
