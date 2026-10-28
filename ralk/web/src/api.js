// Same-origin calls to Ralk's server. Errors arrive as { error: { code, message, details } }
// and are thrown as ApiError.

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

async function send(method, path, body, headers = {}) {
  let response
  try {
    response = await fetch(path, {
      method,
      headers: { accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined
    })
  } catch {
    throw new ApiError(0, 'offline', 'You seem to be offline. Check your connection and try again.')
  }
  const data = await response.json().catch(() => null)
  return { response, data }
}

function fail(response, data) {
  const e = (data && data.error) || {}
  return new ApiError(response.status, e.code || 'error', e.message || `Something went wrong (${response.status}).`, e.details)
}

export async function call(method, path, body) {
  const { response, data } = await send(method, path, body)
  if (!response.ok) throw fail(response, data)
  return data
}

export const get = (path) => call('GET', path)
export const post = (path, body = {}) => call('POST', path, body)
export const patch = (path, body = {}) => call('PATCH', path, body)
export const del = (path) => call('DELETE', path)
