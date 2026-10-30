// BPM -> 심장 박동(쿵-쿵) 변형값. 렌더러와 무관한 순수 로직.
// 박동 주기와 크기는 모두 BPM으로 정해집니다. (소리의 크기는 관여하지 않음)
// 한 번의 박동 = 1차 박동(lub, 강함) + 2차 박동(dub, 약간 약함) + 수축(이완) 구간.

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const smooth = (t) => t * t * (3 - 2 * t)

// 빠르게 부풀고(attack) 천천히 가라앉는(decay) 한 번의 팽창
function bump(t, attack, decay) {
  if (t <= 0) return 0
  if (t < attack) return 0.5 - 0.5 * Math.cos((Math.PI * t) / attack)
  return Math.exp(-(t - attack) / decay)
}
// 완만한 종 모양 (수축 구간)
function soft(t, dur) {
  if (t <= 0 || t >= dur) return 0
  const x = Math.sin((Math.PI * t) / dur)
  return x * x
}

// BPM -> 몸통 변형량(비율). 80: 작고 안정적 / 100: 조금 빠르고 큼 / 120: 확실히 빠르고 큼(첫 절정)
// 145: 격렬하고 더 큼(클라이맥스) / 160: 최대치(형태가 무너지지 않게 상한)
// [BPM, 변형량]  (구간 사이는 부드럽게 보간)
export const AMP_TABLE = [
  [80, 0.034],
  [100, 0.062],
  [120, 0.115],
  [145, 0.16],
  [160, 0.18],
]
export function ampFromBpm(b) {
  const t = AMP_TABLE
  if (b <= t[0][0]) return t[0][1]
  for (let i = 1; i < t.length; i++) {
    if (b <= t[i][0]) {
      const [x0, y0] = t[i - 1]
      const [x1, y1] = t[i]
      return y0 + (y1 - y0) * smooth((b - x0) / (x1 - x0))
    }
  }
  return t[t.length - 1][1]
}

export const LIMITS = {
  baseMax: 0.165, // 박동 강도 1.0에서의 최대 변형(몸통 기준)
  hardMax: 0.22, // 박동 강도를 올려도 넘지 않는 절대 상한 (유리가 깨져 보이지 않게)
  scaleShare: 0.8, // 변형 중 전체 스케일로 가는 몫
  inflateShare: 0.2, // 변형 중 표면 팽창(몸통 반경 약 0.35 기준)으로 가는 몫
  bodyRadius: 0.35,
}

export class HeartEngine {
  constructor() {
    this.time = 0
    this.lastStart = -10
    this.cycles = [] // {t0, amp, lv, period}
    this.pulse = 0 // 스프링으로 다듬은 출력(몸통 변형 비율)
    this.vel = 0
    this.seed = 7
    this.out = { scale: 0, inflate: 0, glow: 0, bpm: 80, bpmN: 0, pulse: 0, beat: 0 }
  }

  _rand() { // 박동마다 아주 약한 불규칙성 (기계적으로 보이지 않게)
    this.seed = (this.seed * 16807) % 2147483647
    return this.seed / 2147483647
  }

  // dt: 프레임 간격(초), bpm: 현재 BPM(80~160), strength: 박동 강도 설정(1.0 기준)
  update(dt, bpm, strength = 1) {
    dt = clamp(dt, 0.0001, 0.05)
    this.time += dt
    bpm = clamp(bpm, 80, 160)
    const bn = (bpm - 80) / 80 // 0 (80 BPM) ~ 1 (160 BPM)
    const period = 60 / bpm

    // 1) 박동 시작: 주기는 BPM이 결정
    if (this.time - this.lastStart >= period) {
      const amp = Math.min(ampFromBpm(bpm) * strength * (0.97 + 0.06 * this._rand()), LIMITS.hardMax)
      this.cycles.push({ t0: this.time, amp, lv: bn, period })
      // 프레임 간격에 상관없이 주기가 정확하도록 남는 시간을 이월 (너무 뒤처지면 현재 시각으로 재동기)
      this.lastStart = this.time - this.lastStart - period > 0.1 ? this.time : this.lastStart + period
      if (this.cycles.length > 3) this.cycles.shift()
    }

    // 2) 박동 파형: 빠를수록 팽창이 날카롭고 깊게. 전체 길이는 주기에 비례해 줄어듦 (한 주기 안에서 쿵-쿵이 끝남)
    const ts = Math.pow(clamp(period / 0.75, 0.5, 1), 0.7) // 80bpm 기준 시간 배율
    let target = 0
    this.cycles = this.cycles.filter((c) => this.time - c.t0 < 1.2)
    for (const c of this.cycles) {
      const t = this.time - c.t0
      const lv = c.lv
      const gap = Math.min(0.3 * ts, c.period * 0.34) // lub -> dub 간격
      const lub = bump(t, (0.078 - 0.022 * lv) * ts, (0.1 + 0.04 * lv) * ts)
      const dub = (0.6 + 0.2 * lv) * bump(t - gap, (0.066 - 0.016 * lv) * ts, (0.12 + 0.04 * lv) * ts)
      const rest = -(0.3 + 0.16 * lv) * soft(t - gap - 0.09 * ts, 0.4 * ts) // 두 번째 박동 뒤 수축
      target += c.amp * (lub + dub + rest)
    }
    target = clamp(target, -LIMITS.hardMax * 0.4, LIMITS.hardMax)

    // 3) 임계감쇠 스프링 (둔탁하고 유기적인 움직임). 프레임이 느려도 발산하지 않도록 ≤4ms로 쪼개서 적분
    const w = 34 + 8 * bn
    const steps = Math.max(1, Math.ceil(dt / 0.004))
    const h = dt / steps
    for (let i = 0; i < steps; i++) {
      const acc = w * w * (target - this.pulse) - 2 * w * this.vel
      this.vel += acc * h
      this.pulse += this.vel * h
    }
    this.pulse = clamp(this.pulse, -LIMITS.hardMax * 0.42, LIMITS.hardMax * 1.05)

    // 4) 아주 느린 숨결 (0.25%)
    const breath = 0.0025 * Math.sin(this.time * 1.25)

    const norm = clamp(this.pulse / LIMITS.baseMax, -0.5, 1.6)
    this.out.pulse = this.pulse
    this.out.scale = this.pulse * LIMITS.scaleShare + breath
    this.out.inflate = this.pulse * LIMITS.inflateShare * LIMITS.bodyRadius
    this.out.glow = clamp(norm, 0, 1)
    this.out.beat = clamp(norm, 0, 1)
    this.out.bpm = bpm
    this.out.bpmN = bn
    return this.out
  }
}
