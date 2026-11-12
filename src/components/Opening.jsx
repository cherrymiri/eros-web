import { useState } from 'react'

// 오프닝 화면. 텍스트는 작품 기획 문구 그대로입니다.
// closing: 시작 버튼을 눌러 페이드아웃 중
export default function Opening({ onStart, closing }) {
  const [pressed, setPressed] = useState(false)
  return (
    <section className={`opening${closing ? ' closing' : ''}`} aria-label="EROS 오프닝">
      <div className="op-inner">
        <p className="op-kicker">WHEN LOVE RESPONDS</p>
        <h1 className="op-title">EROS</h1>
        <p className="op-sub">열정적인 사랑</p>
        <i className="op-rule" aria-hidden="true" />
        <p className="op-desc">
          어떤 사랑은 마음속에만 머무르지 않습니다.
          <br />
          커져가는 감정은 결국 밖으로 터져 나옵니다.
        </p>
        <p className="op-guide">당신의 목소리로 사랑의 박동을 깨워보세요.</p>
        <button
          className="op-btn"
          disabled={pressed}
          onClick={() => { setPressed(true); onStart() }} // 전체화면·마이크 요청은 이 클릭 안에서 바로 실행됨
        >
          체험 시작하기
        </button>
        <p className="op-note">마이크 사용 권한이 필요합니다.</p>
      </div>
    </section>
  )
}
