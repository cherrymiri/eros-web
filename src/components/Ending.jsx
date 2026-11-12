// 160 BPM 도달 후 엔딩. 가사는 지정 문구 그대로 (대소문자·띄어쓰기·한글 포함 변경 금지).
export const LYRICS = [
  'you make me wanna love you loud',
  'Need a microphone and speaker',
  'Just so I can scream it out',
  '조용하란 mouth 터질듯한 나의 심장 sound',
  'I wanna love you loud',
]
export const CREDIT = 'Inspired by lyrics from "LOUD" by NMIXX'

// 마스크 리빌: 각 줄을 overflow:hidden 마스크로 감싸고, 글자가 아래에서 위로 살짝 올라오며 드러남 (짧고 빠르게, 거의 한 번에)
export default function Ending({ onReplay, leaving }) {
  return (
    <section className={`ending${leaving ? ' leaving' : ''}`} aria-label="EROS 엔딩">
      <div className="en-inner">
        <p className="en-lyrics" aria-label={LYRICS.join(' ')}>
          {LYRICS.map((t, i) => (
            <span key={i} className={`ln ln${i}${i === LYRICS.length - 1 ? ' last' : ''}`} aria-hidden="true">
              <span className="tx" style={{ animationDelay: `${0.55 + i * 0.1}s` }}>{t}</span>
            </span>
          ))}
        </p>
        <p className="en-credit">{CREDIT}</p>
        <button className="en-btn" onClick={onReplay}>다시 체험하기</button>
      </div>
    </section>
  )
}
