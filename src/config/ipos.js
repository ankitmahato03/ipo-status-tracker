import { DEFAULT_REGISTRAR_ID, REGISTRARS, getRegistrar } from '../registrars/index.js'

// Registrars answer per IPO: each request carries the IPO's client id. Each
// adapter ships a fallback list; registrars with a live list (MUFG Intime)
// replace it at runtime. Override a list with VITE_IPO_LIST_<REGISTRAR ID>,
// e.g. VITE_IPO_LIST_MUFG (VITE_IPO_LIST still works for KFintech).
export function parseIpoList(json) {
  try {
    const list = JSON.parse(json)
    if (!Array.isArray(list)) return null
    const valid = list.filter(
      (item) => item && /^\d+$/.test(String(item.clientId ?? '')) && typeof item.name === 'string' && item.name.trim(),
    )
    return valid.length ? valid.map((item) => ({ clientId: String(item.clientId), name: item.name.trim() })) : null
  } catch {
    return null
  }
}

const env = import.meta.env ?? {}

export function getStaticIpoList(registrarId) {
  const registrar = getRegistrar(registrarId)
  if (!registrar) return []
  const override = env[`VITE_IPO_LIST_${registrar.id.toUpperCase()}`] || (registrar.id === 'kfintech' && env.VITE_IPO_LIST)
  return (override && parseIpoList(override)) || registrar.ipos
}

export const INITIAL_REGISTRAR_ID = getRegistrar(env.VITE_REGISTRAR)?.id ?? DEFAULT_REGISTRAR_ID
export { REGISTRARS }
