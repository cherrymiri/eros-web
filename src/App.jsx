import { useCallback, useEffect, useRef, useState } from 'react'
import Scene from './components/Scene'
import { useMic } from './audio/useMic'
import { useTestSource } from './audio/useTestSource'

import Readout from './components/Readout'
import Phrase from './components/Phrase'
import { useBpm } from './heart/useBpm'
import Opening from './components/Opening'
import Ending from './components/Ending'
import { heartSound } from './audio/heartSound'
import { enterFullscreen, fsSupported, isFullscreen, onFullscreenChange } from './fullscreen'

const DEFAULTS = { gateOffset: 0, strength: 1, noiseSuppression: false, echoCancel: true, heartOn: true, heartMin: 0.12, heartMax: 0.42 }
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
  useEffect(() => { heartSound.configure({ enabled: settings.heartOn, min: settings.heartMin, max: settings.heartMax }) }, [settings.heartOn, settings.heartMin, settings.heartMax])
  const live = mic.status === 'live'
  const busy = mic.status === 'requesting' || mic.status === 'calibrating'
  useTestSource(voiceRef, testOn && !live && !busy, auto, holdRef)
  const stage = useBpm(voiceRef, bpmRef)

  // 오프닝 → 체험 전환. ?test/?dev(개발·시험용)에서는 오프닝을 건너뜀
  const skipOpening = /[?&](test|dev)\b/.test(location.search) && !/[?&]opening\b/.test(location.search)
  const [phase, setPhase] = useState(skipOpening ? 'live' : 'opening') // opening | closing | live | climax | ending
  const [fs, setFs] = useState(isFullscreen())
  const fsOk = fsSupported()
  const started = useRef(skipOpening)
  useEffect(() => { // 개발·시험 모드(오프닝 없음): 첫 클릭/터치에서 소리 허용
    if (!skipOpening) return
    const on = () => { heartSound.unlock(); heartSound.setActive(true) }
    window.addEventListener('pointerdown', on, { once: true })
    return () => window.removeEventListener('pointerdown', on)
  }, [skipOpening])
  useEffect(() => onFullscreenChange(() => setFs(isFullscreen())), [])

  // 도달 보상: 120/145 BPM에 '처음' 도달했을 때 한 번만 큰 문구를 띄움.
  // 한 번 띄운 뒤에는 BPM이 충분히 내려가기(105/130 미만) 전까지 다시 띄우지 않아 경계에서 반복 팝업이 없음.
  const [reward, setReward] = useState(null)
  const armed = useRef({ 2: true, 3: true })
  const prevStage = useRef(1)
  useEffect(() => {
    const id = setInterval(() => {
      const b = bpmRef.current.bpm
      if (b < 105) armed.current[2] = true
      if (b < 130) armed.current[3] = true
    }, 250)
    return () => clearInterval(id)
  }, [])
  useEffect(() => {
    if (stage > prevStage.current && armed.current[stage]) {
      armed.current[stage] = false
      bpmRef.current.boostT = performance.now()
      setReward({ id: Date.now(), stage })
    }
    prevStage.current = stage
  }, [stage])

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

  // 160 BPM 최초 도달 → 약 2초 클라이맥스 유지 → 엔딩. (이번 체험에서 한 번만)
  const ended = useRef(false)
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  useEffect(() => {
    const id = setInterval(() => {
      if (phaseRef.current !== 'live' || ended.current) return
      if (bpmRef.current.bpm >= 159.5) {
        ended.current = true
        const b = bpmRef.current
        b.hold = true // 클라이맥스 동안 BPM 160 고정 (소리가 끊겨도 내려가지 않음)
        b.climaxUntil = performance.now() + 2100
        setPhase('climax')
        // 엔딩에서도 심박 160의 두근거림은 계속 이어지고(BPM 160 고정 유지), 진입 순간 짧은 효과음
        setTimeout(() => { mic.stop(); heartSound.ending(); setPhase('ending') }, 2100)
      }
    }, 100)
    return () => clearInterval(id)
  }, [mic])

  // 모든 체험 상태 초기화 (BPM 80, 문구·효과 제거). 전체화면은 건드리지 않음
  const resetExperience = useCallback(() => {
    bpmRef.current.resetReq = true
    bpmRef.current.boostT = -1e9
    bpmRef.current.climaxUntil = 0
    bpmRef.current.hold = false
    ended.current = false
    armed.current = { 2: true, 3: true }
    prevStage.current = 1
    setReward(null)
  }, [])
  // 오프닝의 시작 버튼: 클릭 이벤트 안에서 전체화면 → 마이크 요청을 동시에 시작하고 바로 전환
  const beginFromOpening = useCallback(() => {
    enterFullscreen() // 실패/미지원이어도 계속 진행
    heartSound.unlock(); heartSound.setActive(true) // 시작 버튼 클릭 안에서 소리 허용 → 80 BPM 박동 시작
    started.current = true
    resetExperience()
    mic.start() // 거부돼도 안내와 80 BPM 기본 박동으로 화면은 계속 동작
    setPhase('closing')
    setTimeout(() => setPhase('live'), 950)
  }, [mic, resetExperience])
  // 체험 화면의 '다시 체험하기'/'다시 시도': 오프닝 없이 초기화 후 다시 시작, 전체화면 유지
  const restart = useCallback(() => {
    resetExperience()
    heartSound.unlock(); heartSound.setActive(true)
    if (fsOk && !isFullscreen()) enterFullscreen()
    mic.start()
  }, [mic, resetExperience, fsOk])

  // 엔딩의 '다시 체험하기': 오프닝으로 돌아가지 않고, 전체화면을 유지한 채 BPM 80으로 바로 재시작
  const replay = useCallback(() => {
    resetExperience()
    heartSound.unlock(); heartSound.setActive(true)
    if (fsOk && !isFullscreen()) enterFullscreen()
    mic.start()
    setPhase('live')
  }, [mic, resetExperience, fsOk])

  const msg = MESSAGES[mic.status]
  const testing = testOn && !live && !busy
  let state = 'off'
  let stateText = '마이크 꺼짐'
  if (mic.status === 'requesting') { state = 'wait'; stateText = '마이크 연결 중…' }
  else if (mic.status === 'calibrating') { state = 'wait'; stateText = '주변 소음 확인 중…' }
  else if (live) { state = voiced ? 'voice' : 'on'; stateText = voiced ? '목소리 감지됨' : '마이크 켜짐 · 소리 기다리는 중' }
  else if (testing) { state = voiced ? 'voice' : 'on'; stateText = voiced ? '테스트 · 발성 중' : '테스트 모드' }

  return (
    <div className={`app phase-${phase}`}>
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
        <Phrase stage={stage} reward={reward} />
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
          <button className="btn" onClick={restart} disabled={busy}>
            {busy ? '준비 중…' : msg ? '다시 시도' : started.current ? '다시 체험하기' : '체험 시작'}
          </button>
        )}
        <p className="privacy">소리는 이 기기 안에서만 분석하며, 녹음·저장·전송하지 않습니다.</p>
      </main>

      {phase !== 'opening' && fsOk && !fs && (
        <button className="fsbtn" onClick={() => enterFullscreen()} aria-label="전체화면" title="전체화면">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
          </svg>
        </button>
      )}
      {phase === 'ending' && <Ending onReplay={replay} />}
      {(phase === 'opening' || phase === 'closing') && <Opening onStart={beginFromOpening} closing={phase === 'closing'} />}

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
          <label>
            <span>심장박동 음량 · 최소(80 BPM) <em>{Math.round(settings.heartMin * 100)}</em></span>
            <input type="range" min="0" max="60" step="1" value={Math.round(settings.heartMin * 100)}
              onChange={(e) => update({ heartMin: +e.target.value / 100, heartMax: Math.max(settings.heartMax, +e.target.value / 100) })} />
          </label>
          <label>
            <span>심장박동 음량 · 최대(160 BPM) <em>{Math.round(settings.heartMax * 100)}</em></span>
            <input type="range" min="0" max="60" step="1" value={Math.round(settings.heartMax * 100)}
              onChange={(e) => update({ heartMax: +e.target.value / 100, heartMin: Math.min(settings.heartMin, +e.target.value / 100) })} />
          </label>
          <label className="check">
            <input type="checkbox" checked={settings.heartOn} onChange={(e) => update({ heartOn: e.target.checked })} />
            <span>심장박동 소리 켜기</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={settings.echoCancel} onChange={(e) => update({ echoCancel: e.target.checked })} />
            <span>에코 제거(심장박동이 마이크에 들어가는 것 방지) — 다음 시작부터</span>
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
