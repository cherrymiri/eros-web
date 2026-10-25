// 소리 크기(0~1) -> 심장 박동(쿵-쿵) 변형값. 렌더러와 무관한 순수 로직.
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

// 소리 크기(L) -> 몸통 변형량(비율). 약한 소리 1~2%, 중간 5~8%, 큰 소리 12~16%.
// [L, 변형량]  (구간 사이는 부드럽게 보간)
export const AMP_TABLE = [
  [0.0, 0.0],
  [0.08, 0.008],
  [0.2, 0.017],
  [0.35, 0.05],
  [0.5, 0.08],
  [0.65, 0.115],
  [0.82, 0.155],
  [1.0, 0.178],
]
export function ampFromLevel(L) {
  const t = AMP_TABLE
  if (L <= 0) return 0
  for (let i = 1; i < t.length; i++) {
    if (L <= t[i][0]) {
      const [x0, y0] = t[i - 1]
      const [x1, y1] = t[i]
      return y0 + (y1 - y0) * smooth((L - x0) / (x1 - x0))
    }
  }
  return t[t.length - 1][1]
}

export const LIMITS = {
  baseMax: 0.165, // 박동 강도 1.0에서의 최대 변형(몸통 기준)
  hardMax: 0.26, // 박동 강도를 올려도 넘지 않는 절대 상한
  scaleShare: 0.8, // 변형 중 전체 스케일로 가는 몫
  inflateShare: 0.2, // 변형 중 표면 팽창(몸통 반경 약 0.35 기준)으로 가는 몫
  bodyRadius: 0.35,
}

export class HeartEngine {
  constructor() {
    this.fast = 0 // 빠르게 따라가는 입력 (attack 빠름 / release 느림)
    this.slow = 0 // 평균 (온셋 감지용)
    this.active = false
    this.time = 0
    this.lastStart = -10
    this.cycles = [] // {t0, amp, L}
    this.pulse = 0 // 스프링으로 다듬은 출력(몸통 변형 비율)
    this.vel = 0
    this.seed = 7
    this.out = { scale: 0, inflate: 0, glow: 0, bpm: 0, active: false, level: 0, pulse: 0 }
  }

  _rand() { // 박동마다 아주 약한 불규칙성 (기계적으로 보이지 않게)
    this.seed = (this.seed * 16807) % 2147483647
    return this.seed / 2147483647
  }

  _startCycle(amp, L) {
    this.cycles.push({ t0: this.time, amp, L })
    this.lastStart = this.time
    if (this.cycles.length > 3) this.cycles.shift()
  }

  update(dt, rawLevel, strength = 1) {
    dt = clamp(dt, 0.0001, 0.05)
    this.time += dt
    const raw = clamp(rawLevel, 0, 1)

    // 1) 입력 보정: 오르는 건 빠르게, 내리는 건 천천히 -> 떨림 방지
    const k = raw > this.fast ? 1 - Math.exp(-dt / 0.05) : 1 - Math.exp(-dt / 0.28)
    this.fast += (raw - this.fast) * k
    this.slow += (this.fast - this.slow) * (1 - Math.exp(-dt / 0.7))
    const L = this.fast

    // 2) 활성 판정 (히스테리시스)
    if (!this.active && L > 0.08) this.active = true
    else if (this.active && L < 0.04) this.active = false

    // 3) 박동 시작 타이밍: 작은 소리 ~60bpm, 큰 소리 ~110bpm (속도 차이는 보조, 진폭이 핵심)
    const bpm = 58 + 52 * Math.pow(L, 0.9)
    const period = 60 / bpm
    const sinceStart = this.time - this.lastStart
    const maxAmp = Math.min(LIMITS.baseMax * strength, LIMITS.hardMax)
    const ampOf = (lv) => Math.min(ampFromLevel(lv) * strength * (0.95 + 0.1 * this._rand()), LIMITS.hardMax)
    if (this.active) {
      const onset = this.fast - this.slow > 0.16 && sinceStart > 0.34 // 갑작스런 큰 소리에 즉시 반응
      if (sinceStart >= period || onset) this._startCycle(onset ? Math.min(ampOf(L) * 1.1, LIMITS.hardMax) : ampOf(L), L)
    }

    // 4) 박동 파형 합성: 소리가 클수록 팽창이 빠르고 깊고, 이완(수축)도 더 깊게
    let target = 0
    this.cycles = this.cycles.filter((c) => this.time - c.t0 < 1.2)
    for (const c of this.cycles) {
      const t = this.time - c.t0
      const lv = c.L
      const gap = Math.min(0.3, period * 0.34) // lub -> dub 간격
      const lub = bump(t, 0.078 - 0.022 * lv, 0.1 + 0.04 * lv)
      const dub = (0.6 + 0.2 * lv) * bump(t - gap, 0.066 - 0.016 * lv, 0.12 + 0.04 * lv)
      const rest = -(0.34 + 0.2 * lv) * soft(t - gap - 0.09, 0.4) // 두 번째 박동 뒤 수축
      target += c.amp * (lub + dub + rest)
    }
    target = clamp(target, -LIMITS.hardMax * 0.4, LIMITS.hardMax)

    // 5) 임계감쇠 스프링 (둔탁하고 유기적인 움직임)
    // 프레임이 느려도 발산하지 않도록 고정 간격(≤4ms)으로 쪼개서 적분
    const w = 34
    const steps = Math.max(1, Math.ceil(dt / 0.004))
    const h = dt / steps
    for (let i = 0; i < steps; i++) {
      const acc = w * w * (target - this.pulse) - 2 * w * this.vel
      this.vel += acc * h
      this.pulse += this.vel * h
    }
    this.pulse = clamp(this.pulse, -LIMITS.hardMax * 0.42, LIMITS.hardMax * 1.05)

    // 6) 아주 느린 숨결 (소리가 없을 때도 죽어 보이지 않게, 0.3%)
    const breath = 0.003 * Math.sin(this.time * 1.25) * (1 - clamp(L * 4, 0, 1))

    const norm = clamp(this.pulse / LIMITS.baseMax, -0.5, 1.6)
    this.out.pulse = this.pulse
    this.out.scale = this.pulse * LIMITS.scaleShare + breath
    this.out.inflate = this.pulse * LIMITS.inflateShare * LIMITS.bodyRadius
    this.out.glow = clamp(norm, 0, 1)
    this.out.bpm = Math.round(bpm)
    this.out.active = this.active
    this.out.level = L
    this.out.max = maxAmp
    return this.out
  }
}
