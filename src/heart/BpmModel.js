import { BPM } from './bpmConfig'

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))

// 누적 발성 시간 -> BPM (구간 선형 보간)
export function bpmFromCharge(c, cfg = BPM) {
  const t = cfg.curve
  if (c <= t[0][0]) return t[0][1]
  for (let i = 1; i < t.length; i++) {
    if (c <= t[i][0]) {
      const [x0, y0] = t[i - 1]
      const [x1, y1] = t[i]
      return y0 + ((y1 - y0) * (c - x0)) / (x1 - x0)
    }
  }
  return t[t.length - 1][1]
}

// 소리의 '크기'가 아니라 '얼마나 오래 이어서 냈는지'로 BPM을 정하는 모델.
//  - 발성이 확인된 동안 charge(누적 발성 시간)가 쌓임
//  - 숨 쉬는 짧은 멈춤에서는 아주 조금만 줄고, 다시 소리를 내면 줄어든 값에서 이어짐
//  - 긴 침묵에서는 천천히 80으로 돌아감
export class BpmModel {
  constructor(cfg = BPM) {
    this.cfg = cfg
    this.maxCharge = cfg.curve[cfg.curve.length - 1][0]
    this.charge = 0
    this.v = 0 // 부드럽게 다듬은 발성 여부(0~1)
    this.silence = 0 // 마지막 발성 이후 경과 시간
    this.target = cfg.min // 목표 BPM
    this.bpm = cfg.min // 화면/박동에 쓰는 부드러운 BPM
    this.stage = 1
  }

  reset() { this.charge = 0; this.v = 0; this.silence = 0; this.target = this.cfg.min; this.bpm = this.cfg.min; this.stage = 1 }

  update(dt, voicing) {
    const c = this.cfg
    dt = clamp(dt, 0, 0.5)
    this.v += ((voicing ? 1 : 0) - this.v) * (1 - Math.exp(-dt / c.riseSmooth))
    if (voicing) this.silence = 0
    else this.silence += dt

    if (voicing) {
      this.charge += c.riseRate * this.v * dt
    } else if (this.silence > c.breathGrace) {
      const s = this.silence - c.breathGrace
      const k = this.silence <= c.shortPause ? 0 : clamp((this.silence - c.shortPause) / c.longDecayRamp, 0, 1)
      const rate = c.pauseDecay + (c.longDecay - c.pauseDecay) * k * k * (3 - 2 * k)
      this.charge -= rate * dt * clamp(s / 0.4, 0, 1)
    }
    this.charge = clamp(this.charge, 0, this.maxCharge)
    this.target = bpmFromCharge(this.charge, c)
    this.bpm += (this.target - this.bpm) * (1 - Math.exp(-dt / c.displayTau))

    // 문구 단계 (히스테리시스)
    const b = this.bpm
    if (this.stage === 1 && b >= c.stage2Up) this.stage = 2
    else if (this.stage === 2) {
      if (b >= c.stage3Up) this.stage = 3
      else if (b < c.stage2Down) this.stage = 1
    } else if (this.stage === 3 && b < c.stage3Down) this.stage = b < c.stage2Down ? 1 : 2
    return this
  }
}
