import { useEffect, useRef, useState } from 'react'
import { BpmModel } from './BpmModel'

// 발성 감지(voiceRef) -> BPM 모델을 매 프레임 갱신하고 bpmRef에 기록. 문구 단계(stage)만 React 상태로 알림.
// 마이크가 없거나 소리가 없어도 모델은 계속 돌아 80 BPM 기본 박동이 유지됩니다.
export function useBpm(voiceRef, bpmRef) {
  const [stage, setStage] = useState(1)
  const model = useRef(null)
  if (!model.current) model.current = new BpmModel()
  useEffect(() => {
    const m = model.current
    let raf = 0
    let last = performance.now()
    let st = m.stage
    const tick = () => {
      const now = performance.now()
      let dt = (now - last) / 1000
      last = now
      const ts = typeof window.__bpmTimeScale === 'number' ? window.__bpmTimeScale : 1 // 개발용 시간 가속
      m.update(Math.min(dt, 0.25) * ts, voiceRef.current.voicing)
      const b = bpmRef.current
      b.bpm = m.bpm; b.target = m.target; b.charge = m.charge; b.stage = m.stage; b.voicing = voiceRef.current.voicing
      if (m.stage !== st) { st = m.stage; setStage(st) }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    if (/[?&](dev|test)\b/.test(location.search)) window.__bpmModel = m
    return () => cancelAnimationFrame(raf)
  }, [voiceRef, bpmRef])
  return stage
}
