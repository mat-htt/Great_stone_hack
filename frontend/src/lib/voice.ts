/**
 * Голосовой ввод с текстом в реальном времени.
 *  1) Свой сервер: Vosk (русская модель, офлайн) по WebSocket — работает в любом браузере с микрофоном.
 *  2) Запасной путь: распознавание речи браузера (Web Speech API, Chrome/Edge/Safari).
 * Текст приходит в onText по мере речи; после остановки ничего не отправляется само —
 * пользователь читает, правит и отправляет сам.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { tokenStore } from '../api'

type Engine = 'server' | 'browser'
export type VoiceState = 'idle' | 'starting' | 'listening' | 'finishing'

const WORKLET = `
class Pcm extends AudioWorkletProcessor {
  constructor() { super(); this.buf = []; this.ratio = sampleRate / 16000; this.pos = 0 }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (ch) {
      let level = 0
      for (let i = 0; i < ch.length; i++) level = Math.max(level, Math.abs(ch[i]))
      // простое понижение частоты до 16 кГц
      for (; this.pos < ch.length; this.pos += this.ratio) {
        const s = Math.max(-1, Math.min(1, ch[Math.floor(this.pos)]))
        this.buf.push(s < 0 ? s * 0x8000 : s * 0x7fff)
      }
      this.pos -= ch.length
      if (this.buf.length >= 1600) { this.port.postMessage({ pcm: Int16Array.from(this.buf).buffer, level }, []); this.buf = [] }
    }
    return true
  }
}
registerProcessor('pcm-16k', Pcm)`

let serverOk: boolean | null = null
async function serverAvailable(): Promise<boolean> {
  if (serverOk !== null) return serverOk
  try { const r = await fetch('/api/voice/status'); serverOk = r.ok && (await r.json()).server === true } catch { serverOk = false }
  return serverOk
}

const tidy = (s: string) => { const t = s.replace(/\s+/g, ' ').trim(); return t ? t[0].toUpperCase() + t.slice(1) : '' }

export function voiceProblem(): string | null {
  if (!window.isSecureContext) return 'Микрофон в браузере работает только по защищённому адресу. Откройте приложение по https://…:8443 или с localhost.'
  if (!navigator.mediaDevices?.getUserMedia && !((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) return 'Этот браузер не умеет записывать голос'
  return null
}

/** onText(текст целиком, ещё распознаётся?) — вызывается по мере речи. */
export function useVoice(onText: (text: string, interim: boolean) => void, onError?: (msg: string) => void) {
  const [state, setState] = useState<VoiceState>('idle')
  const [level, setLevel] = useState(0)
  const [engine, setEngine] = useState<Engine | null>(null)
  const cleanup = useRef<() => void>(() => {})
  const stopFn = useRef<() => void>(() => {})
  const textCb = useRef(onText); textCb.current = onText
  const errCb = useRef(onError); errCb.current = onError

  const finish = useCallback(() => { cleanup.current(); cleanup.current = () => {}; setState('idle'); setLevel(0) }, [])

  const startServer = async (): Promise<boolean> => {
    let stream: MediaStream
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } }) }
    catch (e: any) { errCb.current?.(e?.name === 'NotAllowedError' ? 'Разрешите доступ к микрофону в настройках браузера' : 'Не удалось включить микрофон'); return true }
    const ctx = new AudioContext()
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }))
    try { await ctx.audioWorklet.addModule(url) } catch { stream.getTracks().forEach((t) => t.stop()); ctx.close(); return false } finally { URL.revokeObjectURL(url) }
    const src = ctx.createMediaStreamSource(stream)
    const node = new AudioWorkletNode(ctx, 'pcm-16k')
    const mute = ctx.createGain(); mute.gain.value = 0
    src.connect(node); node.connect(mute); mute.connect(ctx.destination)
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/voice/ws`)
    ws.binaryType = 'arraybuffer'
    let ready = false
    let doneTimer = 0
    node.port.onmessage = (e) => { setLevel((l) => l * 0.5 + Math.min(1, e.data.level * 2.5) * 0.5); if (ready && ws.readyState === 1) ws.send(e.data.pcm) }
    ws.onopen = () => ws.send(JSON.stringify({ token: tokenStore.get() }))
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data)
      if (m.error) { errCb.current?.(m.message || 'Голосовой ввод недоступен'); finish(); return }
      if (m.ready) { ready = true; setState('listening'); return }
      textCb.current(tidy([m.final, m.partial].filter(Boolean).join(' ')), !m.done)
      if (m.done) finish()
    }
    ws.onerror = () => { errCb.current?.('Нет связи с сервером распознавания'); finish() }
    ws.onclose = () => { if (ready) finish() }
    cleanup.current = () => {
      window.clearTimeout(doneTimer)
      node.port.onmessage = null
      try { src.disconnect(); node.disconnect() } catch { /* уже отключено */ }
      stream.getTracks().forEach((t) => t.stop()); ctx.close().catch(() => {})
      if (ws.readyState <= 1) ws.close()
    }
    stopFn.current = () => {
      setState('finishing')
      // микрофон выключаем сразу, сервер дораспознаёт хвост
      stream.getTracks().forEach((t) => t.stop())
      if (ws.readyState === 1) ws.send('stop'); else finish()
      doneTimer = window.setTimeout(finish, 3000)
    }
    return true
  }

  const startBrowser = (): boolean => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return false
    const r = new SR(); r.lang = 'ru-RU'; r.continuous = true; r.interimResults = true
    r.onstart = () => setState('listening')
    r.onresult = (e: any) => {
      let all = '', interim = false
      for (let i = 0; i < e.results.length; i++) { all += e.results[i][0].transcript + ' '; if (!e.results[i].isFinal) interim = true }
      setLevel(0.6); textCb.current(tidy(all), interim)
    }
    r.onerror = (e: any) => errCb.current?.(e.error === 'not-allowed' ? 'Разрешите доступ к микрофону' : e.error === 'network' ? 'Распознавание браузера требует интернет — а сервер распознавания недоступен' : 'Не расслышал, попробуйте ещё раз')
    r.onend = () => { setState('idle'); setLevel(0) }
    cleanup.current = () => { try { r.abort() } catch { /* noop */ } }
    stopFn.current = () => { setState('finishing'); try { r.stop() } catch { finish() } }
    try { r.start() } catch { return false }
    return true
  }

  const start = useCallback(async () => {
    const problem = voiceProblem()
    if (problem) { errCb.current?.(problem); return }
    setState('starting')
    if (await serverAvailable() && typeof navigator.mediaDevices?.getUserMedia === 'function' && await startServer()) { setEngine('server'); return }
    if (startBrowser()) { setEngine('browser'); return }
    setState('idle'); errCb.current?.('Голосовой ввод недоступен в этом браузере')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const stop = useCallback(() => stopFn.current(), [])
  useEffect(() => () => cleanup.current(), [])
  return { state, level, engine, start, stop, active: state !== 'idle' }
}
