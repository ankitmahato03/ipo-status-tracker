import { app } from '@azure/functions'
import { handleStatus } from '../shared/registrars/proxyCore.js'

// POST /api/ipo-status  { registrar, pan, clientId } -> { data: [...] }
app.http('ipoStatus', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'ipo-status',
  handler: async (request) => {
    const body = await request.json().catch(() => null)
    const { status, body: jsonBody } = await handleStatus(body)
    return { status, jsonBody, headers: { 'Cache-Control': 'no-store' } }
  },
})
