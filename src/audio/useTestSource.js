import { useEffect } from 'react'

// 마이크 없이 박동을 확인하는 개발용 입력. (설정 > 마이크 없이 테스트)
// manual: 슬라이더 값, auto: 약한 소리 -> 중간 -> 큰 소리 시연, Space 키를 누르는 동안 큰 소리
export function useTestSource(levelRef, enabled, auto, manualRef) {
  useEffect(() => {
    if (!enabled) return
    let raf = 0
    let space = false
    const kd = (e) => { if (e.code === 'Space') { space = true; e.preventDefault() } }
    const ku = (e) => { if (e.code === 'Space') space = false }
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    const t0 = performance.now()
    const seq = [ // [길이(초), 레벨]
      [3.2, 0.22], [1.4, 0], [3.2, 0.5], [1.4, 0], [3.2, 0.95], [2.0, 0],
    ]
    const total = seq.reduce((a, s) => a + s[0], 0)
    const tick = () => {
      const t = (performance.now() - t0) / 1000
      let v = manualRef.current
      if (auto) {
        let x = t % total
        v = 0
        for (const [d, l] of seq) { if (x < d) { v = l; break } x -= d }
        if (v > 0) v = Math.min(1, v * (0.9 + 0.2 * Math.sin(t * 7.3) * Math.sin(t * 2.1)))
      }
      if (space) v = Math.max(v, 0.85)
      levelRef.current.value = v
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
      levelRef.current.value = 0
    }
  }, [enabled, auto, levelRef, manualRef])
}
