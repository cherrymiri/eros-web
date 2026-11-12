// Fullscreen API 래퍼 (Chrome/Edge/Firefox + Safari 접두사). 지원하지 않거나 거부돼도 예외 없이 false를 반환합니다.
const root = () => document.documentElement
export const fsSupported = () =>
  !!(document.fullscreenEnabled || document.webkitFullscreenEnabled) && !!(root().requestFullscreen || root().webkitRequestFullscreen)
export const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement)

// 반드시 사용자 클릭 이벤트 핸들러 안에서 직접 호출해야 합니다. (await 뒤에서 호출하면 브라우저가 거부함)
export function enterFullscreen() {
  try {
    if (!fsSupported() || isFullscreen()) return Promise.resolve(isFullscreen())
    const el = root()
    const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen()
    return Promise.resolve(p).then(() => true, () => false)
  } catch {
    return Promise.resolve(false)
  }
}

export function onFullscreenChange(cb) {
  document.addEventListener('fullscreenchange', cb)
  document.addEventListener('webkitfullscreenchange', cb)
  return () => {
    document.removeEventListener('fullscreenchange', cb)
    document.removeEventListener('webkitfullscreenchange', cb)
  }
}
