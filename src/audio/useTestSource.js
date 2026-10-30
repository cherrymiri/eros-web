import { useEffect } from 'react'

// 마이크 없이 박동을 확인하는 개발용 입력. (설정 > 마이크 없이 테스트)
//  - 자동 시연: "아—" 발성과 짧은 숨 쉬는 멈춤, 긴 침묵을 반복해 BPM이 오르고 내리는 과정을 보여줌
//  - 수동: 체크하면 발성 중으로 처리 / 스페이스바를 누르고 있는 동안 발성
export function useTestSource(voiceRef, enabled, auto, holdRef) {
  useEffect(() => {
    if (!enabled) return
    let raf = 0
    let space = false
    const kd = (e) => { if (e.code === 'Space' && !/INPUT|TEXTAREA|BUTTON/.test(e.target.tagName)) { space = true; e.preventDefault() } }
    const ku = (e) => { if (e.code === 'Space') space = false }
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    const t0 = performance.now()
    const seq = [ // [길이(초), 발성 여부]
      [10, 1], [1.5, 0], [10, 1], [2, 0], [10, 1], [1.5, 0], [12, 1], [2.5, 0], [14, 1], [1.5, 0], [14, 1], [3, 0], [16, 1], [30, 0],
    ]
    const total = seq.reduce((a, s) => a + s[0], 0)
    const tick = () => {
      const t = (performance.now() - t0) / 1000
      let v = holdRef.current ? 1 : 0
      if (auto) {
        let x = t % total
        v = 0
        for (const [d, on] of seq) { if (x < d) { v = on; break } x -= d }
      }
      if (space) v = 1
      voiceRef.current.voicing = !!v
      voiceRef.current.candidate = !!v
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
      voiceRef.current.voicing = false
      voiceRef.current.candidate = false
    }
  }, [enabled, auto, voiceRef, holdRef])
}
