import { useEffect, useRef } from 'react'

// BPM 단계별 영어 문구. 철자·문장부호·대소문자·아포스트로피를 그대로 유지해야 합니다.
export const PHRASES = ['Your love is rising...', 'I wanna love you loud!', "I'm loving you loud!"]

const INTRO_MS = 4200 // 중앙 등장 → 아래로 안착까지 전체 시간

// stage: 현재 문구 단계. reward: 새 단계에 '처음 도달'했을 때마다 {id, stage}로 바뀜 (같은 값이면 다시 재생하지 않음)
// 120/145 부근에서 오르내려도 reward가 새로 생기지 않는 한 문구는 다시 튀어나오지 않습니다.
export default function Phrase({ stage, reward }) {
  const wrap = useRef(null)
  const lastId = useRef(0)
  const anim = useRef(null)

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    if (!reward) { // 초기화: 진행 중인 문구 연출 제거
      lastId.current = 0
      if (anim.current) { anim.current.cancel(); anim.current = null }
      el.classList.remove('intro')
      return
    }
    if (reward.id === lastId.current) return
    lastId.current = reward.id
    if (anim.current) anim.current.cancel()
    const r = el.getBoundingClientRect()
    const vw = window.innerWidth, vh = window.innerHeight
    const narrow = vw < 700
    // 화면 중앙보다 약간 위(오브제의 윗부분 근처)에서 시작하고, 폭이 화면을 넘지 않게 배율을 제한
    const targetY = vh * (narrow ? 0.4 : 0.44)
    const dy = targetY - (r.top + r.height / 2)
    const s = Math.min(narrow ? 2.1 : 2.1, (vw * 0.92) / Math.max(r.width * 0.62, 1))
    el.classList.add('intro')
    const big = `translateY(${dy}px) scale(${s})`
    anim.current = el.animate(
      [
        { transform: `${big} scale(0.9)`, opacity: 0, offset: 0 },
        { transform: big, opacity: 1, offset: 0.14, easing: 'ease-out' },
        { transform: big, opacity: 1, offset: 0.52 },
        { transform: 'translateY(0) scale(1)', opacity: 1, offset: 1 },
      ],
      { duration: INTRO_MS, easing: 'cubic-bezier(.45,.05,.2,1)', fill: 'none' },
    )
    const done = () => el.classList.remove('intro')
    anim.current.onfinish = done
    anim.current.oncancel = done
  }, [reward])

  return (
    <div ref={wrap} className={`phrase stage${stage}`} aria-live="polite">
      {PHRASES.map((t, i) => (
        <p key={i} className={stage === i + 1 ? 'on' : ''} aria-hidden={stage !== i + 1}>{t}</p>
      ))}
    </div>
  )
}
