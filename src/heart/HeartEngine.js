// 소리 크기(0~1) -> 심장 박동(쿵-쿵) 변형값. 렌더러와 무관한 순수 로직.
// 한 번의 박동 = 1차 박동(lub, 강함) + 2차 박동(dub, 약간 약함) + 짧은 수축(이완) 구간.

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))

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

export const LIMITS = {
  maxScale: 0.07, // 전체 스케일 최대 +7%
  maxInflate: 0.028, // 표면 팽창(모델 단위) 최대
}

export class HeartEngine {
  constructor() {
    this.fast = 0 // 빠르게 따라가는 입력 (attack 빠름 / release 느림)
    this.slow = 0 // 평균 (온셋 감지용)
    this.active = false
    this.time = 0
    this.lastStart = -10
    this.cycles = [] // {t0, amp}
    this.pulse = 0 // 스프링으로 다듬은 출력
    this.vel = 0
    this.out = { scale: 0, inflate: 0, glow: 0, bpm: 0, active: false, level: 0 }
  }

  _startCycle(amp) {
    this.cycles.push({ t0: this.time, amp })
    this.lastStart = this.time
    if (this.cycles.length > 3) this.cycles.shift()
  }

  update(dt, rawLevel) {
    dt = clamp(dt, 0.0001, 0.05)
    this.time += dt
    const raw = clamp(rawLevel, 0, 1)

    // 1) 입력 보정: 오르는 건 빠르게, 내리는 건 천천히 -> 떨림 방지
    const k = raw > this.fast ? 1 - Math.exp(-dt / 0.05) : 1 - Math.exp(-dt / 0.28)
    this.fast += (raw - this.fast) * k
    this.slow += (this.fast - this.slow) * (1 - Math.exp(-dt / 0.7))
    const L = this.fast

    // 2) 활성 판정 (히스테리시스)
    if (!this.active && L > 0.1) this.active = true
    else if (this.active && L < 0.05) this.active = false

    // 3) 박동 시작 타이밍
    const bpm = 60 + 62 * Math.pow(L, 0.9) // 작은 소리 ~65bpm, 큰 소리 ~120bpm
    const period = 60 / bpm
    const sinceStart = this.time - this.lastStart
    const amp = LIMITS.maxScale * (0.2 + 0.8 * Math.pow(L, 0.8)) // 약하게 -> 강렬하게
    if (this.active) {
      const onset = this.fast - this.slow > 0.16 && sinceStart > 0.34 // 갑작스런 큰 소리에 즉시 반응
      if (sinceStart >= period || onset) this._startCycle(onset ? Math.min(amp * 1.12, LIMITS.maxScale) : amp)
    }

    // 4) 박동 파형 합성
    let target = 0
    this.cycles = this.cycles.filter((c) => this.time - c.t0 < 1.2)
    for (const c of this.cycles) {
      const t = this.time - c.t0
      const gap = Math.min(0.3, period * 0.34) // lub -> dub 간격
      const lub = bump(t, 0.07, 0.11)
      const dub = 0.68 * bump(t - gap, 0.06, 0.13)
      const rest = -0.16 * soft(t - gap - 0.14, 0.34) // 두 번째 박동 뒤 살짝 수축
      target += c.amp * (lub + dub + rest)
    }
    target = clamp(target, -LIMITS.maxScale * 0.25, LIMITS.maxScale)

    // 5) 임계감쇠 스프링 (둔탁하고 유기적인 움직임)
    const w = 38
    const acc = w * w * (target - this.pulse) - 2 * w * this.vel
    this.vel += acc * dt
    this.pulse += this.vel * dt
    this.pulse = clamp(this.pulse, -LIMITS.maxScale * 0.3, LIMITS.maxScale * 1.05)

    // 6) 아주 느린 숨결 (소리가 없을 때도 죽어 보이지 않게, 0.3%)
    const breath = 0.003 * Math.sin(this.time * 1.25) * (1 - clamp(L * 4, 0, 1))

    const norm = clamp(this.pulse / LIMITS.maxScale, -0.3, 1.05)
    this.out.scale = this.pulse + breath
    this.out.inflate = LIMITS.maxInflate * clamp(norm, -0.3, 1)
    this.out.glow = clamp(norm, 0, 1)
    this.out.bpm = Math.round(bpm)
    this.out.active = this.active
    this.out.level = L
    return this.out
  }
}
