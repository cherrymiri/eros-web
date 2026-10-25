import { useCallback, useEffect, useRef, useState } from 'react'

// 마이크는 "소리 크기"만 실시간 분석합니다. 오디오는 스피커로 재생·저장·전송되지 않습니다.
// status: idle | requesting | calibrating | live | denied | nomic | unsupported | error
export function useMic(levelRef, settingsRef) {
  const [status, setStatus] = useState('idle')
  const res = useRef({ stream: null, ctx: null, raf: 0, run: 0 })

  const cleanup = useCallback(() => {
    const r = res.current
    r.run++
    cancelAnimationFrame(r.raf)
    if (r.stream) r.stream.getTracks().forEach((t) => t.stop())
    if (r.ctx && r.ctx.state !== 'closed') r.ctx.close().catch(() => {})
    r.stream = null
    r.ctx = null
    levelRef.current.value = 0
    levelRef.current.db = -100
  }, [levelRef])

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
      // 자동 게인/노이즈 억제를 꺼야 실제 소리 크기를 그대로 읽을 수 있습니다.
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
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
    an.fftSize = 1024
    an.smoothingTimeConstant = 0
    src.connect(an) // destination에는 연결하지 않음 (재생/하울링 없음)
    res.current.stream = stream
    res.current.ctx = ctx
    stream.getAudioTracks().forEach((t) => (t.onended = () => { cleanup(); setStatus('error') }))

    const f32 = typeof an.getFloatTimeDomainData === 'function' ? new Float32Array(an.fftSize) : null
    const u8 = new Uint8Array(an.fftSize)
    const calib = { t0: performance.now(), vals: [] }
    setStatus('calibrating')

    const tick = () => {
      if (res.current.run !== myRun) return
      let sum = 0
      if (f32) {
        an.getFloatTimeDomainData(f32)
        for (let i = 0; i < f32.length; i++) sum += f32[i] * f32[i]
        sum /= f32.length
      } else {
        an.getByteTimeDomainData(u8)
        for (let i = 0; i < u8.length; i++) { const v = (u8[i] - 128) / 128; sum += v * v }
        sum /= u8.length
      }
      const db = 20 * Math.log10(Math.max(Math.sqrt(sum), 1e-5))
      const s = settingsRef.current
      levelRef.current.db = db

      if (calib.t0 !== null) {
        // 시작 직후 1.5초: 전시장의 기본 소음 측정
        calib.vals.push(db)
        if (performance.now() - calib.t0 > 1500) {
          const v = calib.vals.slice().sort((a, b) => a - b)
          const p = v[Math.floor(v.length * 0.85)] // 상위 일부는 우발적 소리로 보고 제외
          s.ambientDb = Math.max(-68, p)
          calib.t0 = null
          setStatus('live')
        }
        levelRef.current.value = 0
      } else {
        // 기본 소음 + 여유(6dB) + 사용자 조절값 이상부터 반응, 감도에 따라 풀스케일 범위가 달라짐
        const gate = s.ambientDb + 6 + s.gateOffset
        const range = 28 / s.sensitivity
        levelRef.current.value = Math.min(1, Math.max(0, (db - gate) / range))
      }
      res.current.raf = requestAnimationFrame(tick)
    }
    res.current.raf = requestAnimationFrame(tick)
  }, [cleanup, levelRef, settingsRef])

  // 다시 측정(설정창): 켜져 있는 동안 기본 소음을 재설정
  const recalibrate = useCallback(() => {
    if (res.current.stream) start()
  }, [start])

  useEffect(() => cleanup, [cleanup])
  return { status, start, stop, recalibrate }
}
