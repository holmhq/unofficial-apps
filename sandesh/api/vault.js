// Sealed secrets. A phone's SMSGate username, password and webhook signing
// key are stored encrypted under the app's VAULT_KEY runtime secret, which
// only the node's operator can set, and are never sent back to a browser.
//
// Holm's Web Crypto offers HMAC-SHA256 but no AES yet, so this is a
// textbook construction from HMAC alone: a counter-mode keystream with
// HMAC as the pseudorandom function, then encrypt-then-MAC. Separate keys
// for the two jobs, a fresh random nonce for every seal, and a version
// prefix so stored values can move to AES-GCM once the runtime has it.
//
//   enc  = HMAC(VAULT_KEY, "sandesh/enc/v1")    mac = HMAC(VAULT_KEY, "sandesh/mac/v1")
//   ks_i = HMAC(enc, nonce ‖ uint32be(i))       ciphertext = plaintext ⊕ ks
//   tag  = HMAC(mac, "v1" ‖ nonce ‖ ciphertext ‖ context)
//   blob = "v1." + base64url(nonce[16] ‖ ciphertext ‖ tag[32])
//
// The context names the owner and the field, so a sealed value can't be
// moved to another member or another field and still open.

import { HttpError } from './lib.js'

const VERSION = 'v1'
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

async function keys(env) {
  const secret = requireVault(env)
  const root = await hmacKey(encoder.encode(secret), ['sign'])
  const enc = await crypto.subtle.sign('HMAC', root, encoder.encode('sandesh/enc/v1'))
  const mac = await crypto.subtle.sign('HMAC', root, encoder.encode('sandesh/mac/v1'))
  return { enc: await hmacKey(enc, ['sign']), mac: await hmacKey(mac, ['sign', 'verify']) }
}

function hmacKey(raw, usages) {
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, usages)
}

async function keystream(enc, nonce, length) {
  const out = new Uint8Array(length)
  const block = new Uint8Array(nonce.length + 4)
  block.set(nonce)
  for (let i = 0, offset = 0; offset < length; i++, offset += 32) {
    new DataView(block.buffer).setUint32(nonce.length, i)
    const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', enc, block))
    out.set(bytes.subarray(0, Math.min(32, length - offset)), offset)
  }
  return out
}

function macInput(nonce, ciphertext, context) {
  const head = encoder.encode(VERSION)
  const tail = encoder.encode(context)
  const all = new Uint8Array(head.length + nonce.length + ciphertext.length + tail.length)
  all.set(head, 0)
  all.set(nonce, head.length)
  all.set(ciphertext, head.length + nonce.length)
  all.set(tail, head.length + nonce.length + ciphertext.length)
  return all
}

// Seal a string for one owner and field.
export async function seal(env, value, context) {
  const { enc, mac } = await keys(env)
  const plain = encoder.encode(String(value))
  const nonce = crypto.getRandomValues(new Uint8Array(16))
  const stream = await keystream(enc, nonce, plain.length)
  const ciphertext = new Uint8Array(plain.length)
  for (let i = 0; i < plain.length; i++) ciphertext[i] = plain[i] ^ stream[i]
  const tag = new Uint8Array(await crypto.subtle.sign('HMAC', mac, macInput(nonce, ciphertext, context)))
  const blob = new Uint8Array(16 + ciphertext.length + 32)
  blob.set(nonce, 0)
  blob.set(ciphertext, 16)
  blob.set(tag, 16 + ciphertext.length)
  return `${VERSION}.${toBase64url(blob)}`
}

// Open a sealed string, or throw if the vault key changed or the value was
// altered or moved. The tag is checked (in constant time) before anything
// is decrypted.
export async function open(env, sealed, context) {
  const { enc, mac } = await keys(env)
  const [version, body] = String(sealed || '').split('.')
  const blob = version === VERSION && body ? fromBase64url(body) : null
  if (!blob || blob.length < 48) throw new HttpError(409, 'vault_unreadable', unreadable)
  const nonce = blob.subarray(0, 16)
  const ciphertext = blob.subarray(16, blob.length - 32)
  const tag = blob.subarray(blob.length - 32)
  const good = await crypto.subtle.verify('HMAC', mac, tag, macInput(nonce, ciphertext, context))
  if (!good) throw new HttpError(409, 'vault_unreadable', unreadable)
  const stream = await keystream(enc, nonce, ciphertext.length)
  const plain = new Uint8Array(ciphertext.length)
  for (let i = 0; i < ciphertext.length; i++) plain[i] = ciphertext[i] ^ stream[i]
  return decoder.decode(plain)
}

const unreadable = "Sandesh can't read this phone's saved sign-in any more (the node's vault key may have changed). Connect the phone again."

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
