// 심장박동 사운드 — 외부 음원 없이 Web Audio API로 직접 합성합니다.
// 화면의 이중 박동(HeartEngine)이 새 박동을 시작할 때마다 beat()가 호출되어,
// 같은 박동의 '두둑(lub)–둑(dub)'을 같은 시점에 울립니다. (별도 타이머 없음)
export const HEART_LIMITS = { hardMax: 0.6 } // 설정을 어떻게 올려도 넘지 않는 마스터 게인 상한

// BPM → 0~1 음량 곡선: 80 작고 부드럽게 / 100 조금 선명 / 120 첫 고조 / 145 절정 / 160 최대(상한은 설정값)
const VOL_CURVE = [[80, 0], [100, 0.22], [120, 0.58], [145, 0.88], [160, 1]]
const clamp = (x, a, b) => Math.min(b, Math.max(a, x))
export function volumeAt(bpm, min, max) {
  const lo = clamp(min, 0, HEART_LIMITS.hardMax)
  const hi = clamp(Math.max(max, lo), 0, HEART_LIMITS.hardMax)
  let k = 1
  if (bpm <= 80) k = 0
  else for (let i = 1; i < VOL_CURVE.length; i++) {
    if (bpm <= VOL_CURVE[i][0]) {
      const [b0, v0] = VOL_CURVE[i - 1], [b1, v1] = VOL_CURVE[i]
      k = v0 + ((bpm - b0) / (b1 - b0)) * (v1 - v0)
      break
    }
  }
  return lo + (hi - lo) * k
}

class HeartSound {
  constructor() {
    this.ctx = null
    this.master = null
    this.filter = null
    this.noiseBuf = null
    this.active = false // 소리를 내는 중인가 (시작 버튼 이후 ~ 엔딩 전)
    this.enabled = true
    this.min = 0.12
    this.max = 0.42
    this.lastBeatCtx = 0
    this.count = 0
    this.log = null // 시험용: 예약된 박동 기록
  }

  // 반드시 사용자의 클릭/터치 이벤트 안에서 호출 (브라우저 자동재생 제한)
  unlock() {
    try {
      if (!this.ctx) {
        const Ctx = window.AudioContext || window.webkitAudioContext
        if (!Ctx) return false
        const ctx = new Ctx({ latencyHint: 'interactive' })
        const master = ctx.createGain()
        master.gain.value = 0
        const filter = ctx.createBiquadFilter() // 박동이 빠를수록 조금 더 선명(밝게)
        filter.type = 'lowpass'
        filter.frequency.value = 380
        filter.Q.value = 0.5
        const comp = ctx.createDynamicsCompressor() // 마지막 안전장치(리미터)
        comp.threshold.value = -14
        comp.knee.value = 6
        comp.ratio.value = 12
        comp.attack.value = 0.003
        comp.release.value = 0.12
        filter.connect(master); master.connect(comp); comp.connect(ctx.destination)
        // 짧은 백색소음 버퍼 (타격감용)
        const len = Math.floor(ctx.sampleRate * 0.12)
        const buf = ctx.createBuffer(1, len, ctx.sampleRate)
        const d = buf.getChannelData(0)
        let seed = 12345
        for (let i = 0; i < len; i++) { seed = (seed * 16807) % 2147483647; d[i] = (seed / 2147483647) * 2 - 1 }
        Object.assign(this, { ctx, master, filter, noiseBuf: buf })
        document.addEventListener('visibilitychange', () => { if (!document.hidden) this._resume() })
        ctx.onstatechange = () => { if (ctx.state === 'interrupted' || ctx.state === 'suspended') this.needResume = true }
      }
      this._resume()
      return true
    } catch { return false }
  }
  _resume() { try { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume() } catch { /* 무시 */ } }

  configure({ enabled, min, max }) {
    if (enabled !== undefined) this.enabled = !!enabled
    if (min !== undefined) this.min = clamp(+min, 0, HEART_LIMITS.hardMax)
    if (max !== undefined) this.max = clamp(+max, 0, HEART_LIMITS.hardMax)
  }

  // 소리 켜기/끄기 (부드럽게 페이드)
  setActive(on) {
    this.active = !!on
    if (!this.ctx) return
    if (!on) this.master.gain.cancelScheduledValues(this.ctx.currentTime), this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.18)
    else this._resume()
  }

  _target(bpm) { return this.enabled ? volumeAt(bpm, this.min, this.max) : 0 }

  // 박동 하나(두둑 두 번) 예약. t1/t2: 박동 시작 후 첫째·둘째 정점까지의 초 (화면 박동과 동일)
  beat({ bpm, t1, t2, amp = 1 }) {
    const ctx = this.ctx
    if (!ctx || !this.active) return
    if (ctx.state !== 'running') { this._resume(); return }
    const now = ctx.currentTime
    // BPM에 따른 음량 (급변하지 않도록 아주 짧게 보간) + 밝기
    this.master.gain.setTargetAtTime(this._target(bpm), now, 0.12)
    const bn = clamp((bpm - 80) / 80, 0, 1)
    this.filter.frequency.setTargetAtTime(380 + 420 * bn, now, 0.15)
    // 출력 지연만큼 앞당겨 화면의 정점과 소리가 같은 순간에 오도록
    const lat = (ctx.outputLatency || 0) + (ctx.baseLatency || 0)
    const a1 = Math.max(now + 0.002, now + t1 - 0.012 - lat)
    const a2 = Math.max(a1 + 0.05, now + t2 - 0.010 - lat)
    const lv = 0.9 + 0.1 * bn
    this._thump(a1, 64 - 6 * bn, 40, 0.19, 0.95 * lv, bn)
    this._thump(a2, 76 - 6 * bn, 50, 0.15, (0.6 + 0.12 * bn) * lv, bn * 0.9)
    this.count++
    this.lastBeatCtx = a1
    if (this.log) this.log.push({ bpm, a1, a2, now })
  }

  // 한 번의 '둑': 피치가 내려가는 저음 + 2배음(작은 스피커용) + 짧은 저역 노이즈(타격감)
  _thump(t, f0, f1, dur, gain, bn) {
    const ctx = this.ctx
    const out = ctx.createGain()
    out.gain.setValueAtTime(0.0001, t)
    out.gain.exponentialRampToValueAtTime(gain, t + 0.011)
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    out.connect(this.filter)
    const mk = (type, a, b, g) => {
      const o = ctx.createOscillator(), og = ctx.createGain()
      o.type = type
      o.frequency.setValueAtTime(a, t)
      o.frequency.exponentialRampToValueAtTime(b, t + dur * 0.8)
      og.gain.value = g
      o.connect(og); og.connect(out)
      o.start(t); o.stop(t + dur + 0.05)
    }
    mk('sine', f0, f1, 1)
    mk('sine', f0 * 2.1, f1 * 2.1, 0.42) // 소형 스피커에서도 들리게
    const n = ctx.createBufferSource()
    n.buffer = this.noiseBuf
    const nf = ctx.createBiquadFilter(), ng = ctx.createGain()
    nf.type = 'lowpass'; nf.frequency.value = 160 + 120 * bn
    ng.gain.setValueAtTime(0.0001, t)
    ng.gain.exponentialRampToValueAtTime(0.22 + 0.2 * bn, t + 0.006)
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.06)
    n.connect(nf); nf.connect(ng); ng.connect(out)
    n.start(t); n.stop(t + 0.1)
  }
}

export const heartSound = new HeartSound()
if (typeof window !== 'undefined' && /[?&](dev|test)\b/.test(location.search)) window.__heart = heartSound
