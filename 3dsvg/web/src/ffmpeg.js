// FFmpeg compiled to WebAssembly (ffmpeg.wasm, served from /vendor/ffmpeg),
// for trimming, cropping, resizing and converting a recording. Its core is
// about 32 MB, so it loads only when a video needs it, and once per visit.

import { FFmpeg } from '../vendor/ffmpeg/index.js'

let ffmpeg = null
let loading = null

async function load(onStatus) {
  if (!loading) {
    ffmpeg = new FFmpeg()
    onStatus('Downloading the converter (32 MB, once)…')
    loading = ffmpeg.load({
      coreURL: new URL('/vendor/ffmpeg/core/ffmpeg-core.js', location.href).href,
      wasmURL: new URL('/vendor/ffmpeg/core/ffmpeg-core.wasm', location.href).href
    }).catch(e => { ffmpeg = null; loading = null; throw e })
  }
  await loading
  return ffmpeg
}

const CRF = { high: '18', mid: '23', low: '28' }
const QSCALE = { high: '2', mid: '4', low: '6' }
const BITRATE = { high: '16M', mid: '8M', low: '2M' }

// blob: the recording. Options: input ('webm' or 'mp4'), format ('mp4' or
// 'webm'), trimStart/trimEnd in seconds, aspect (width / height, to crop
// to), width (to scale to), quality ('low', 'mid', 'high'), duration.
export async function convert(blob, options, onStatus) {
  const ff = await load(onStatus)
  const { input = 'webm', format = 'mp4', trimStart, trimEnd, aspect, width, quality = 'high', duration = 0 } = options
  const inName = `input.${input}`
  const outName = `output.${format}`

  const onProgress = ({ progress, time }) => {
    let pct = 0
    if (progress > 0 && progress <= 1) pct = Math.round(progress * 100)
    else if (time > 0 && duration > 0) pct = Math.round(Math.min(1, time / 1_000_000 / duration) * 100)
    if (pct > 0) onStatus(`${pct}%`, pct)
  }
  // The last lines FFmpeg printed, for the console when a conversion fails.
  const log = []
  const onLog = ({ message }) => { log.push(message); if (log.length > 30) log.shift() }
  ff.on('progress', onProgress)
  ff.on('log', onLog)
  onStatus('Converting…')
  await ff.writeFile(inName, new Uint8Array(await blob.arrayBuffer()))

  const filters = []
  // Crop to the chosen shape from the middle; commas inside an expression
  // are escaped, since a bare comma separates filters.
  if (aspect) filters.push(`crop=w=min(iw\\,ih*${aspect}):h=min(ih\\,iw/${aspect})`)
  if (width) filters.push(`scale=${width}:-2`)

  const args = codec => {
    const a = []
    if (trimStart !== undefined) a.push('-ss', String(trimStart))
    a.push('-i', inName)
    if (trimEnd !== undefined) a.push('-t', String(trimEnd - (trimStart ?? 0)))
    if (filters.length) a.push('-vf', filters.join(','))
    // A browser recording counts time in milliseconds; without a set frame
    // rate FFmpeg would write a thousand frames a second.
    a.push('-r', '60', ...codec, '-pix_fmt', 'yuv420p')
    if (format === 'mp4') a.push('-movflags', '+faststart')
    a.push('-an', '-y', outName)
    return a
  }

  try {
    let code
    if (format === 'mp4') {
      // H.264 plays everywhere; MPEG-4 Part 2 is the fallback.
      code = await ff.exec(args(['-c:v', 'libx264', '-preset', 'veryfast', '-crf', CRF[quality]]))
      if (code !== 0) code = await ff.exec(args(['-c:v', 'mpeg4', '-q:v', QSCALE[quality]]))
    } else {
      // VP9's realtime mode runs out of memory in this build; the default
      // mode is slower but sound.
      code = await ff.exec(args(['-c:v', 'libvpx-vp9', '-b:v', BITRATE[quality]]))
    }
    if (code !== 0) {
      console.warn('[ffmpeg]', log.join('\n'))
      throw new Error('The video could not be converted.')
    }
    const data = await ff.readFile(outName)
    return new Blob([data], { type: format === 'mp4' ? 'video/mp4' : 'video/webm' })
  } finally {
    ff.off('progress', onProgress)
    ff.off('log', onLog)
    await ff.deleteFile(inName).catch(() => {})
    await ff.deleteFile(outName).catch(() => {})
  }
}
