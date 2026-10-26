// Same-origin calls to Zend's server. Errors arrive as
// { error: { code, message, details } } and are thrown as ApiError.

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

export async function call(method, path, body) {
  let response
  try {
    response = await fetch(path, {
      method,
      headers: { accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined
    })
  } catch {
    throw new ApiError(0, 'offline', "You're offline. Zend will catch up when you're back.")
  }
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const e = (data && data.error) || {}
    throw new ApiError(response.status, e.code || 'error', e.message || `Something went wrong (${response.status}).`, e.details)
  }
  return data
}

export const get = (path) => call('GET', path)
export const post = (path, body = {}) => call('POST', path, body)
export const patch = (path, body = {}) => call('PATCH', path, body)
export const del = (path) => call('DELETE', path)
