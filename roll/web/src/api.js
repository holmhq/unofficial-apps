// Same-origin calls to Roll's server. Errors arrive as { error: { code, message, details } }
// and are thrown as ApiError.

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

async function raw(method, path, body, headers = {}) {
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
  const { response, data } = await raw(method, path, body)
  if (!response.ok) throw fail(response, data)
  return data
}

export const get = (path) => call('GET', path)
export const post = (path, body = {}) => call('POST', path, body)
export const patch = (path, body = {}) => call('PATCH', path, body)
export const del = (path) => call('DELETE', path)

// A POST or PUT with upload progress, which fetch can't report. Resolves with the JSON
// answer; rejects with an ApiError like call() does.
export function send(method, path, body, { onProgress, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(method, path)
    xhr.setRequestHeader('accept', 'application/json')
    for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value)
    if (onProgress) xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(event.loaded / event.total) }
    xhr.onload = () => {
      let data = null
      try { data = JSON.parse(xhr.responseText) } catch {}
      if (xhr.status >= 200 && xhr.status < 300) return resolve(data)
      const e = (data && data.error) || {}
      const message = xhr.status === 413 && !e.message ? 'That file is too large for this server.' : e.message || `Something went wrong (${xhr.status}).`
      reject(new ApiError(xhr.status, e.code || (xhr.status === 413 ? 'too_large' : 'error'), message))
    }
    xhr.onerror = () => reject(new ApiError(0, 'offline', 'The upload stopped. Check your connection and try again.'))
    xhr.send(body)
  })
}
