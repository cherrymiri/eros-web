import { VOICE } from '../heart/bpmConfig'

// 마이크 신호에서 "사람이 소리를 내고 있는가"만 판단합니다. (크기가 아니라 '지속되는 목소리인지')
//  1) 에너지: 주변 소음(적응형 기준)보다 충분히 큰가
//  2) 주기성: "아—" 같은 유성음은 일정한 주기로 떨리고(자기상관 피크), 팬·바람·박수 같은 소음은 그렇지 않음
//  3) 지속성: 일정 시간 이어져야 인정(onset), 잠깐 끊겨도 hangover 동안 유지
export class VoiceDetector {
  constructor(cfg = VOICE) {
    this.cfg = cfg
    this.floor = -60 // 주변 소음 기준(dB)
    this.calib = []
    this.calibT = 0
    this.calibrated = false
    this.run = 0 // 후보가 이어진 시간
    this.lost = 0 // 후보가 끊긴 시간
    this.voicing = false
    this.db = -100
    this.harmonic = 0
    this.candidate = false
    this.mean = 0
    this.var = 0.04
    this.statRun = 0
  }

  startCalibration() { this.calib = []; this.calibT = 0; this.calibrated = false; this.run = 0; this.lost = 0; this.voicing = false; this.statRun = 0 }

  _features(x, sr) {
    const n = x.length
    let mean = 0
    for (let i = 0; i < n; i++) mean += x[i]
    mean /= n
    let e = 0
    for (let i = 0; i < n; i++) { const d = x[i] - mean; e += d * d }
    const db = 20 * Math.log10(Math.max(Math.sqrt(e / n), 1e-5))
    // 4분의 1로 줄여서(≈11–12kHz) 자기상관 계산량을 줄임
    const D = Math.max(1, Math.round(sr / 12000))
    const m = Math.floor(n / D)
    const y = new Float32Array(m)
    for (let i = 0; i < m; i++) { let s = 0; for (let j = 0; j < D; j++) s += x[i * D + j] - mean; y[i] = s / D }
    const fs = sr / D
    const lagMin = Math.floor(fs / this.cfg.f0Max)
    const lagMax = Math.min(Math.floor(fs / this.cfg.f0Min), m - 40)
    let best = 0
    // 에너지 기준 정규화 자기상관 (피치 후보 중 가장 큰 값)
    let e0 = 0
    for (let i = 0; i < m; i++) e0 += y[i] * y[i]
    if (e0 > 1e-12) {
      for (let lag = lagMin; lag <= lagMax; lag++) {
        let s = 0, e1 = 0
        const L = m - lag
        for (let i = 0; i < L; i++) { s += y[i] * y[i + lag]; e1 += y[i + lag] * y[i + lag] }
        const r = s / Math.sqrt((e0 * L) / m * e1 + 1e-12)
        if (r > best) best = r
      }
    }
    return { db, harmonic: Math.max(0, Math.min(1, best)) }
  }

  // x: 최근 시간영역 샘플(Float32), sr: 샘플레이트, dt: 이전 호출 이후 초, gateOffset: 사용자 조절(dB)
  process(x, sr, dt, gateOffset = 0) {
    const c = this.cfg
    const { db, harmonic } = this._features(x, sr)
    this.db = db
    this.harmonic = harmonic
    if (!this.calibrated) {
      this.calib.push(db)
      this.calibT += dt
      if (this.calibT >= c.calibrateSec) {
        const v = this.calib.slice().sort((a, b) => a - b)
        this.floor = Math.max(-72, v[Math.floor(v.length * 0.85)])
        this.calibrated = true
      }
      this.candidate = false
      this.voicing = false
      return this
    }
    const thr = Math.max(this.floor + c.marginDb + gateOffset, c.absMinDb)
    let cand = db > thr && harmonic >= c.harmonicMin
    // 일정한 웅웅거림(기계음·전원 험)은 주기적이어도 세기가 거의 변하지 않음 → 목소리가 아니라 소음으로 처리
    if (cand) {
      this.statRun += dt
      const kk = 1 - Math.exp(-dt / 1.2)
      if (this.statRun < 0.5) { this.mean = db; this.var = 0.04 } // 시작 직후의 급상승 구간은 통계에서 제외
      const d = db - this.mean
      this.mean += d * kk
      this.var += (d * d - this.var) * kk
      if (this.statRun > c.stationarySec && Math.sqrt(this.var) < c.stationaryStdDb) cand = false
    } else this.statRun = 0
    this.candidate = cand
    if (this.candidate) { this.run += dt; this.lost = 0 }
    else { this.lost += dt; if (this.lost > (this.voicing ? c.hangoverSec : 0.12)) this.run = 0 }
    // 시작: onset 이상 이어져야 / 유지: hangover 동안
    if (!this.voicing && this.run >= c.onsetSec) this.voicing = true
    else if (this.voicing && this.lost > c.hangoverSec) this.voicing = false
    // 주변 소음 기준 적응: 목소리 후보가 아닐 때만, 상승 속도는 제한
    if (!this.candidate && !this.voicing) {
      const k = 1 - Math.exp(-dt / c.floorTau)
      let d = (db - this.floor) * k
      d = d > 0 ? (harmonic >= c.harmonicMin ? 0 : Math.min(d, c.floorMaxRiseDbPerSec * dt)) : d // 목소리처럼 규칙적인 소리는 기준을 올리지 않음
      this.floor = Math.max(-75, this.floor + d)
    }
    return this
  }
}
