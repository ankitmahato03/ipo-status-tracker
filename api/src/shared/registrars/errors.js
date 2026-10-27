// Shared by every registrar adapter, the browser client and the proxy server.
export class IpoApiError extends Error {
  constructor(kind, message, { status } = {}) {
    super(message)
    this.name = 'IpoApiError'
    this.kind = kind
    this.status = status
  }

  get retryable() {
    return ['timeout', 'network', 'rate_limited', 'server', 'http', 'malformed'].includes(this.kind)
  }
}

export function malformed() {
  return new IpoApiError('malformed', 'The IPO status service returned a response in an unexpected format.')
}

export function errorForStatus(status) {
  if (status === 429) {
    return new IpoApiError('rate_limited', 'Too many requests. Please wait a minute and try again.', { status })
  }
  if (status === 401 || status === 403) {
    return new IpoApiError(
      'forbidden',
      `The IPO status service refused the request (HTTP ${status}). It may not permit access from this application.`,
      { status },
    )
  }
  if (status >= 500) {
    return new IpoApiError('server', `The IPO status service is temporarily unavailable (HTTP ${status}).`, { status })
  }
  return new IpoApiError('http', `The IPO status service returned an unexpected response (HTTP ${status}).`, { status })
}
