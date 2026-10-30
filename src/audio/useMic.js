import { useCallback, useEffect, useRef, useState } from 'react'
import { VoiceDetector } from './voiceDetector'

// 마이크는 "목소리가 이어지고 있는지"만 이 기기 안에서 실시간 판단합니다. 오디오는 재생·저장·전송되지 않습니다.
// status: idle | requesting | calibrating | live | denied | nomic | unsupported | error
// voiceRef.current = { voicing, candidate, db, floor, harmonic }
export function useMic(voiceRef, settingsRef) {
  const [status, setStatus] = useState('idle')
  const res = useRef({ stream: null, ctx: null, raf: 0, run: 0, det: null })

  const clearVoice = useCallback(() => {
    const v = voiceRef.current
    v.voicing = false; v.candidate = false; v.db = -100; v.harmonic = 0; v.mic = false
  }, [voiceRef])

  const cleanup = useCallback(() => {
    const r = res.current
    r.run++
    clearInterval(r.raf)
    if (r.stream) r.stream.getTracks().forEach((t) => t.stop())
    if (r.ctx && r.ctx.state !== 'closed') r.ctx.close().catch(() => {})
    r.stream = null
    r.ctx = null
    clearVoice()
  }, [clearVoice])

  const stop = useCallback(() => {
    cleanup()
    setStatus('idle')
  }, [cleanup])

  const start = useCallback(async () => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported')
      return
    }
    cleanup()
    const myRun = res.current.run
    setStatus('requesting')
    let stream
    try {
      // 자동 게인(AGC)은 끄고(작은 소리가 갑자기 커지는 것 방지), 브라우저의 소음 억제는 설정에 따라 사용
      const s = settingsRef.current
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: s.noiseSuppression === true, autoGainControl: false },
      })
    } catch (e) {
      const n = e && e.name
      if (n === 'NotAllowedError' || n === 'SecurityError' || n === 'PermissionDeniedError') setStatus('denied')
      else if (n === 'NotFoundError' || n === 'DevicesNotFoundError' || n === 'OverconstrainedError') setStatus('nomic')
      else setStatus('error')
      return
    }
    if (res.current.run !== myRun) {
      stream.getTracks().forEach((t) => t.stop())
      return
    }
    const Ctx = window.AudioContext || window.webkitAudioContext
    const ctx = new Ctx()
    try { await ctx.resume() } catch { /* iOS: 사용자 제스처 안에서 재개됨 */ }
    const src = ctx.createMediaStreamSource(stream)
    const an = ctx.createAnalyser()
    an.fftSize = 2048
    an.smoothingTimeConstant = 0
    src.connect(an) // destination에는 연결하지 않음 (재생/하울링 없음)
    res.current.stream = stream
    res.current.ctx = ctx
    stream.getAudioTracks().forEach((t) => (t.onended = () => { cleanup(); setStatus('error') }))

    const hasF32 = typeof an.getFloatTimeDomainData === 'function'
    const f32 = new Float32Array(an.fftSize)
    const u8 = new Uint8Array(an.fftSize)
    const det = new VoiceDetector()
    det.startCalibration()
    res.current.det = det
    voiceRef.current.mic = true
    setStatus('calibrating')
    let last = performance.now()
    let wasCal = true

    const tick = () => {
      if (res.current.run !== myRun) return
      const now = performance.now()
      const dt = Math.min(0.5, (now - last) / 1000) // 화면이 느려져도 실제 경과 시간으로 계산
      last = now
      if (hasF32) an.getFloatTimeDomainData(f32)
      else { an.getByteTimeDomainData(u8); for (let i = 0; i < u8.length; i++) f32[i] = (u8[i] - 128) / 128 }
      det.process(f32, ctx.sampleRate, dt, settingsRef.current.gateOffset || 0)
      const v = voiceRef.current
      v.voicing = det.voicing; v.candidate = det.candidate; v.db = det.db; v.floor = det.floor; v.harmonic = det.harmonic
      if (wasCal && det.calibrated) { wasCal = false; setStatus('live') }
    }
    // 그래픽이 무거워 화면 프레임이 느려져도 발성 판단은 일정한 간격으로 계속 돌도록 타이머 사용
    res.current.raf = setInterval(tick, 30)
  }, [cleanup, voiceRef, settingsRef])

  // 다시 측정(설정창): 켜져 있는 동안 주변 소음 기준을 다시 잡음
  const recalibrate = useCallback(() => {
    if (res.current.stream) start()
  }, [start])

  useEffect(() => cleanup, [cleanup])
  return { status, start, stop, recalibrate }
}
