import { useCallback, useEffect, useRef, useState } from 'react'
import Scene from './components/Scene'
import { useMic } from './audio/useMic'
import { useTestSource } from './audio/useTestSource'

import Readout from './components/Readout'
import Phrase from './components/Phrase'
import { useBpm } from './heart/useBpm'

const DEFAULTS = { gateOffset: 0, strength: 1, noiseSuppression: false }
function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('eros-settings') || '{}') } } catch { return { ...DEFAULTS } }
}

const MESSAGES = {
  denied: {
    title: '마이크 사용이 허용되지 않았어요',
    body: '주소창 왼쪽의 자물쇠(또는 설정) 아이콘에서 마이크를 ‘허용’으로 바꾼 뒤 다시 시도해 주세요. 허용하지 않아도 설정의 ‘마이크 없이 테스트’로 움직임을 볼 수 있어요.',
  },
  nomic: { title: '마이크를 찾을 수 없어요', body: '마이크가 연결되어 있는지 확인한 뒤 다시 시도해 주세요.' },
  unsupported: {
    title: '이 환경에서는 마이크를 쓸 수 없어요',
    body: 'HTTPS 주소의 최신 Chrome·Safari에서 열어 주세요. 카카오톡·인스타그램 등 앱 안의 브라우저에서는 막힐 수 있어요.',
  },
  error: { title: '마이크 연결에 문제가 생겼어요', body: '잠시 후 다시 시도해 주세요.' },
}

export default function App() {
  const voiceRef = useRef({ voicing: false, candidate: false, db: -100, floor: -60, harmonic: 0, mic: false })
  const bpmRef = useRef({ bpm: 80, target: 80, charge: 0, stage: 1, voicing: false })
  const glowRef = useRef(null)
  const hudRef = useRef({ pulse: 0, scale: 0, bpm: 80 })
  const settingsRef = useRef({ ...loadSettings() })
  const holdRef = useRef(false)

  const [settings, setSettings] = useState(loadSettings)
  const [panel, setPanel] = useState(() => new URLSearchParams(location.search).has('dev'))
  const [testOn, setTestOn] = useState(() => new URLSearchParams(location.search).has('test'))
  const [auto, setAuto] = useState(true)
  const [hold, setHold] = useState(false)
  const meterRef = useRef(null)

  if (typeof window !== 'undefined' && /[?&](dev|test)\b/.test(location.search)) window.__eros = { voiceRef, bpmRef, hudRef, settingsRef }
  const mic = useMic(voiceRef, settingsRef)
  const live = mic.status === 'live'
  const busy = mic.status === 'requesting' || mic.status === 'calibrating'
  useTestSource(voiceRef, testOn && !live && !busy, auto, holdRef)
  const stage = useBpm(voiceRef, bpmRef)

  const update = useCallback((patch) => {
    setSettings((s) => {
      const n = { ...s, ...patch }
      Object.assign(settingsRef.current, n)
      try { localStorage.setItem('eros-settings', JSON.stringify(n)) } catch { /* 저장 불가 환경 무시 */ }
      return n
    })
  }, [])

  // 마이크 상태 표시(항상 보임) + 설정창의 입력 확인 막대
  const [voiced, setVoiced] = useState(false)
  useEffect(() => {
    let raf
    let was = false
    const loop = () => {
      const v = voiceRef.current
      if (v.voicing !== was) { was = v.voicing; setVoiced(was) }
      if (panel && meterRef.current) {
        const x = Math.min(1, Math.max(0, (v.db - v.floor) / 30))
        meterRef.current.style.transform = `scaleX(${x.toFixed(3)})`
        meterRef.current.style.background = v.candidate ? 'var(--ruby-deep)' : 'rgba(255,255,255,.35)'
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [panel])

  const msg = MESSAGES[mic.status]
  const testing = testOn && !live && !busy
  let state = 'off'
  let stateText = '마이크 꺼짐'
  if (mic.status === 'requesting') { state = 'wait'; stateText = '마이크 연결 중…' }
  else if (mic.status === 'calibrating') { state = 'wait'; stateText = '주변 소음 확인 중…' }
  else if (live) { state = voiced ? 'voice' : 'on'; stateText = voiced ? '목소리 감지됨' : '마이크 켜짐 · 소리 기다리는 중' }
  else if (testing) { state = voiced ? 'voice' : 'on'; stateText = voiced ? '테스트 · 발성 중' : '테스트 모드' }

  return (
    <div className="app">
      <div className="stage">
        <Scene bpmRef={bpmRef} settingsRef={settingsRef} glowRef={glowRef} hudRef={hudRef} phaseLive={live || testing} />
        <div className="glow" ref={glowRef} aria-hidden="true" />
      </div>

      <header className="title">
        <h1>EROS</h1>
        <p>열정적인 사랑</p>
      </header>

      <Readout bpmRef={bpmRef} stage={stage} />

      <main className="ui">
        <Phrase stage={stage} />
        <div className="guide">
          <strong>“아—” 하고 소리를 길게 내보세요.</strong>
          <span>잠시 숨을 쉬어도 괜찮아요. 다시 이어서 소리를 내면 박동이 계속 이어집니다.</span>
        </div>

        {msg && !busy ? (
          <div className="notice" role="alert">
            <strong>{msg.title}</strong>
            <span>{msg.body}</span>
          </div>
        ) : null}

        <div className={`mic-state ${state}`} role="status" aria-live="polite">
          <i aria-hidden="true" />
          <span>{stateText}</span>
        </div>

        {live ? (
          <button className="btn ghost" onClick={mic.stop}>체험 종료</button>
        ) : (
          <button className="btn" onClick={mic.start} disabled={busy}>
            {busy ? '준비 중…' : msg ? '다시 시도' : '체험 시작'}
          </button>
        )}
        <p className="privacy">소리는 이 기기 안에서만 분석하며, 녹음·저장·전송하지 않습니다.</p>
      </main>

      <button className="gear" onClick={() => setPanel((p) => !p)} aria-expanded={panel} aria-label="설정">
        {panel ? '닫기' : '설정'}
      </button>

      {panel && (
        <section className="panel" aria-label="발성 감지 및 테스트 설정">
          <div className="meter" aria-hidden="true"><i ref={meterRef} /></div>
          <label>
            <span>소음 기준 <em>{settings.gateOffset > 0 ? '+' : ''}{settings.gateOffset} dB</em></span>
            <input type="range" min="-4" max="24" step="1" value={settings.gateOffset}
              onChange={(e) => update({ gateOffset: +e.target.value })} />
          </label>
          <label>
            <span>박동 강도 <em>{settings.strength.toFixed(1)}×</em></span>
            <input type="range" min="0.4" max="1.6" step="0.1" value={settings.strength}
              onChange={(e) => update({ strength: +e.target.value })} />
          </label>
          <label className="check">
            <input type="checkbox" checked={settings.noiseSuppression} onChange={(e) => update({ noiseSuppression: e.target.checked })} />
            <span>브라우저 소음 억제 — 시끄러운 전시장에서만 (다음 시작부터)</span>
          </label>
          <small>막대가 붉게 켜질 때 목소리로 인식됩니다. 주변 소음에도 인식되면 ‘소음 기준’을 올리고, 작은 목소리를 놓치면 낮춰 주세요. BPM은 소리의 크기가 아니라 소리를 이어 낸 시간으로 결정됩니다.</small>
          <div className="row">
            <button className="mini" onClick={mic.recalibrate} disabled={!live}>주변 소음 다시 측정</button>
          </div>
          <hr />
          <label className="check">
            <input type="checkbox" checked={testOn} onChange={(e) => setTestOn(e.target.checked)} />
            <span>마이크 없이 테스트</span>
          </label>
          {testOn && (
            <>
              <label className="check">
                <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
                <span>자동 시연 (발성 · 숨 · 침묵 반복)</span>
              </label>
              {!auto && (
                <label className="check">
                  <input type="checkbox" checked={hold} onChange={(e) => { setHold(e.target.checked); holdRef.current = e.target.checked }} />
                  <span>발성 중으로 처리</span>
                </label>
              )}
              <small>스페이스바를 누르고 있는 동안에도 발성으로 처리돼요.</small>
            </>
          )}
        </section>
      )}
    </div>
  )
}
