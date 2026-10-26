// Sealed secrets. A phone's SMSGate username, password and webhook signing
// key are stored encrypted under the app's VAULT_KEY runtime secret, which
// only the node's operator can set, and are never sent back to a browser.
//
// AES-256-GCM from Web Crypto, with its key derived from VAULT_KEY by HKDF
// and a fresh random 12-byte IV for every seal:
//
//   key  = HKDF-SHA256(VAULT_KEY, salt "sandesh/vault", info "aes-256-gcm/v2")
//   blob = "v2." + base64url(iv[12] ‖ AES-GCM(key, iv, plaintext, aad = context))
//
// The context names the owner and the field, and is authenticated with the
// value, so a sealed value can't be moved to another member or another
// field and still open. Values sealed by Sandesh 0.1.0 ("v1.", an HMAC-only
// stop-gap from before the runtime had AES) don't open: their members
// connect the phone again.

import { HttpError } from './lib.js'

const VERSION = 'v2'
const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function vaultReady(env) {
  const secret = env.holm.secrets.get('VAULT_KEY')
  return typeof secret === 'string' && secret.length >= 16
}

export function requireVault(env) {
  if (vaultReady(env)) return env.holm.secrets.get('VAULT_KEY')
  throw new HttpError(503, 'vault_missing',
    `This node hasn't given Sandesh a vault key yet, so it can't keep a phone's password safely. ` +
    `The node's operator runs: holm secret runtime set --app ${env.holm.app.id} VAULT_KEY "$(openssl rand -hex 32)"`)
}

async function vaultKey(env) {
  const root = await crypto.subtle.importKey('raw', encoder.encode(requireVault(env)), 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: encoder.encode('sandesh/vault'), info: encoder.encode('aes-256-gcm/v2') },
    root, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

// Seal a string for one owner and field.
export async function seal(env, value, context) {
  const key = await vaultKey(env)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(context) }, key, encoder.encode(String(value))))
  const blob = new Uint8Array(12 + ciphertext.length)
  blob.set(iv, 0)
  blob.set(ciphertext, 12)
  return `${VERSION}.${toBase64url(blob)}`
}

// Open a sealed string, or throw if the vault key changed or the value was
// altered, moved, or sealed by an older Sandesh.
export async function open(env, sealed, context) {
  const key = await vaultKey(env)
  const [version, body] = String(sealed || '').split('.')
  const blob = version === VERSION && body ? fromBase64url(body) : null
  if (!blob || blob.length < 12 + 16) throw new HttpError(409, 'vault_unreadable', unreadable)
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: blob.subarray(0, 12), additionalData: encoder.encode(context) }, key, blob.subarray(12))
    return decoder.decode(plain)
  } catch {
    throw new HttpError(409, 'vault_unreadable', unreadable)
  }
}

const unreadable = "Sandesh can't read this phone's saved sign-in any more (the node's vault key changed, or an older Sandesh saved it). Connect the phone again."

function toBase64url(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64url(text) {
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}
