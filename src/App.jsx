import { useCallback, useEffect, useRef, useState } from 'react'
import Scene from './components/Scene'
import { useMic } from './audio/useMic'
import { useTestSource } from './audio/useTestSource'

const DEFAULTS = { sensitivity: 1, gateOffset: 0 }
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
  const levelRef = useRef({ value: 0, db: -100 })
  const glowRef = useRef(null)
  const hudRef = useRef({ level: 0, active: false, bpm: 0 })
  const settingsRef = useRef({ ...loadSettings(), ambientDb: -55 })
  const manualRef = useRef(0)

  const [settings, setSettings] = useState(loadSettings)
  const [panel, setPanel] = useState(() => new URLSearchParams(location.search).has('dev'))
  const [testOn, setTestOn] = useState(() => new URLSearchParams(location.search).has('test'))
  const [auto, setAuto] = useState(true)
  const [manual, setManual] = useState(0)
  const meterRef = useRef(null)

  if (typeof window !== 'undefined' && /[?&](dev|test)\b/.test(location.search)) window.__eros = { levelRef, hudRef, settingsRef }
  const mic = useMic(levelRef, settingsRef)
  const live = mic.status === 'live'
  const busy = mic.status === 'requesting' || mic.status === 'calibrating'
  useTestSource(levelRef, testOn && !live && !busy, auto, manualRef)

  const update = useCallback((patch) => {
    setSettings((s) => {
      const n = { ...s, ...patch }
      Object.assign(settingsRef.current, n)
      try { localStorage.setItem('eros-settings', JSON.stringify(n)) } catch { /* 저장 불가 환경 무시 */ }
      return n
    })
  }, [])

  // 설정창이 열려 있을 때만 입력 레벨 막대 갱신
  useEffect(() => {
    if (!panel) return
    let raf
    const loop = () => {
      if (meterRef.current) meterRef.current.style.transform = `scaleX(${levelRef.current.value.toFixed(3)})`
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [panel])

  const msg = MESSAGES[mic.status]
  let hint = '소리를 내면, 심장이 뜁니다'
  let sub = '마이크를 켜고 목소리를 들려주세요'
  if (mic.status === 'requesting') { hint = '마이크 연결 중…'; sub = '브라우저의 마이크 권한 요청을 허용해 주세요' }
  if (mic.status === 'calibrating') { hint = '주변 소음을 확인하고 있어요'; sub = '잠시만 조용히 해 주세요' }
  if (live) { hint = '소리를 내 보세요'; sub = '작게 속삭이면 부드럽게, 크게 외치면 강렬하게' }
  if (testOn && !live && !busy) { hint = '테스트 모드'; sub = auto ? '자동 시연 중 · 스페이스바를 누르면 큰 소리' : '설정의 슬라이더로 음량을 조절하세요' }

  return (
    <div className="app">
      <div className="stage">
        <Scene levelRef={levelRef} glowRef={glowRef} hudRef={hudRef} phaseLive={live || (testOn && !busy)} />
        <div className="glow" ref={glowRef} aria-hidden="true" />
      </div>

      <header className="title">
        <h1>EROS</h1>
        <p>열정적인 사랑 · 세상을 향한 목소리</p>
      </header>

      <main className="ui">
        {msg && !busy ? (
          <div className="notice" role="alert">
            <strong>{msg.title}</strong>
            <span>{msg.body}</span>
          </div>
        ) : (
          <div className="hint" aria-live="polite">
            <strong>{hint}</strong>
            <span>{sub}</span>
          </div>
        )}

        {live ? (
          <button className="btn ghost" onClick={mic.stop}>체험 종료</button>
        ) : (
          <button className="btn" onClick={mic.start} disabled={busy}>
            {busy ? '준비 중…' : msg ? '다시 시도' : '체험 시작'}
          </button>
        )}
        <p className="privacy">소리의 크기만 이 기기에서 분석하며, 녹음·저장·전송하지 않습니다.</p>
      </main>

      <button className="gear" onClick={() => setPanel((p) => !p)} aria-expanded={panel} aria-label="설정">
        {panel ? '닫기' : '설정'}
      </button>

      {panel && (
        <section className="panel" aria-label="감도 및 테스트 설정">
          <div className="meter" aria-hidden="true"><i ref={meterRef} /></div>
          <label>
            <span>감도 <em>{settings.sensitivity.toFixed(1)}</em></span>
            <input type="range" min="0.5" max="2.5" step="0.1" value={settings.sensitivity}
              onChange={(e) => update({ sensitivity: +e.target.value })} />
          </label>
          <label>
            <span>소음 기준 <em>{settings.gateOffset > 0 ? '+' : ''}{settings.gateOffset} dB</em></span>
            <input type="range" min="-6" max="24" step="1" value={settings.gateOffset}
              onChange={(e) => update({ gateOffset: +e.target.value })} />
          </label>
          <small>배경 소음에 계속 뛰면 ‘소음 기준’을 올리고, 반응이 약하면 ‘감도’를 올려 주세요.</small>
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
                <span>자동 시연 (약함 → 중간 → 강함)</span>
              </label>
              {!auto && (
                <label>
                  <span>테스트 음량 <em>{manual.toFixed(2)}</em></span>
                  <input type="range" min="0" max="1" step="0.01" value={manual}
                    onChange={(e) => { const v = +e.target.value; setManual(v); manualRef.current = v }} />
                </label>
              )}
              <small>스페이스바를 누르고 있으면 큰 소리로 처리돼요.</small>
            </>
          )}
        </section>
      )}
    </div>
  )
}
