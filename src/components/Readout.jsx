import { useEffect, useRef } from 'react'
import { BPM } from '../heart/bpmConfig'

const pct = (b) => ((b - BPM.min) / (BPM.max - BPM.min)) * 100
const pad = (n) => String(Math.round(n)).padStart(3, '0')

// BPM 숫자 + 세로 분절 게이지 (마이크 음량이 아니라 '현재 BPM'을 보여줌)
export default function Readout({ bpmRef, stage }) {
  const root = useRef(null)
  const num = useRef(null)
  const fill = useRef(null)
  const cursor = useRef(null)
  const l120 = useRef(null)
  const l145 = useRef(null)

  useEffect(() => {
    let raf = 0
    let lastTxt = ''
    let lastG = -1
    let h120 = false
    let h145 = false
    const tick = () => {
      const b = bpmRef.current.bpm
      const txt = pad(b)
      if (txt !== lastTxt && num.current) { num.current.textContent = txt; lastTxt = txt }
      const g = Math.round(((b - BPM.min) / (BPM.max - BPM.min)) * 100) / 100 // 0~1, 번짐 세기
      if (g !== lastG && root.current) { root.current.style.setProperty('--g', g); lastG = g }
      const p = pct(b)
      if (fill.current) fill.current.style.height = `${p}%`
      if (cursor.current) cursor.current.style.bottom = `${p}%`
      const r120 = b >= BPM.targets[0] - 0.5
      const r145 = b >= BPM.targets[1] - 0.5
      if (r120 !== h120 && l120.current) { l120.current.classList.toggle('hit', r120); h120 = r120 }
      if (r145 !== h145 && l145.current) { l145.current.classList.toggle('hit', r145); h145 = r145 }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [bpmRef])

  return (
    <aside className={`readout stage${stage}`} ref={root} aria-label="현재 BPM">
      <div className="bpm-num" role="status" aria-live="off">
        <span className="digits" ref={num}>080</span>
        <span className="unit">BPM</span>
      </div>
      <div className="gauge" aria-hidden="true">
        <div className="track" />
        <div className="fill" ref={fill} />
        <div className="cursor" ref={cursor} />
        {BPM.ticks.map((t) => (
          <span key={t} className={`tick${BPM.targets.includes(t) ? ' is-target' : ''}`} style={{ bottom: `${pct(t)}%` }}>
            <i />
            <b>{t}</b>
          </span>
        ))}
        <span className="target t120" ref={l120} style={{ bottom: `${pct(BPM.targets[0])}%` }} />
        <span className="target t145" ref={l145} style={{ bottom: `${pct(BPM.targets[1])}%` }} />
      </div>
    </aside>
  )
}
