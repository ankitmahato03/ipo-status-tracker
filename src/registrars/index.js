/*
 * Registrar adapters. Each one implements:
 *
 *   id, name            identifier ("kfintech") and display name
 *   defaultUrl          upstream endpoint (overridable per registrar)
 *   browserDirect       true if browsers may call it directly (CORS allowed);
 *                       false means requests always go through the proxy
 *   ipos                fallback IPO list: [{ clientId, name }]
 *   query({ pan, clientId }, { url, fetch, signal })
 *                       -> Promise<record[]> using the app's field names
 *                          (Name, Appln_No, Pan_No, DP_CLID, category,
 *                          App_Shares, All_Shares; extra fields are kept).
 *                          [] means no record. Throws IpoApiError on failure.
 *   listIpos({ url, fetch, signal })   optional; live IPO list, read by the
 *                                      proxy (GET /api/ipos) and cached there
 *
 * To add a registrar, write an adapter file and add it to REGISTRARS.
 */
import { kfintech } from './kfintech.js'
import { mufg } from './mufg.js'

export const REGISTRARS = [kfintech, mufg]
export const DEFAULT_REGISTRAR_ID = kfintech.id

export function getRegistrar(id) {
  return REGISTRARS.find((registrar) => registrar.id === id) ?? null
}
