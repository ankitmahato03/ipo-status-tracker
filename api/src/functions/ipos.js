import { app } from '@azure/functions'
import { handleIpos } from '../shared/registrars/proxyCore.js'

// GET /api/ipos?registrar=mufg -> { data: [{ clientId, name }] }
app.http('ipos', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'ipos',
  handler: async (request) => {
    const { status, body } = await handleIpos(request.query.get('registrar'))
    return { status, jsonBody: body, headers: { 'Cache-Control': 'no-store' } }
  },
})
