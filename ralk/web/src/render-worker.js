// Renders earshot sounds off the main thread. A message { id, sound, seed? } answers with
// { id, sound, sr, left, right } (the two channels, transferred) or { id, error }.
import { render } from '/vendor/earshot/earshot.js'

self.onmessage = (event) => {
  const { id, sound, seed } = event.data || {}
  try {
    const out = render(sound, seed ? { seed } : undefined)
    const [left, right] = out.channels
    self.postMessage({ id, sound, sr: out.sr, left, right, meta: out.meta }, [left.buffer, right.buffer])
  } catch (error) {
    self.postMessage({ id, sound, error: String(error && error.message || error) })
  }
}
