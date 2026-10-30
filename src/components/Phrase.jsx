// BPM 단계별 영어 문구. 세 문구를 겹쳐 두고 현재 단계만 서서히 보이게(페이드) 합니다.
// 문구는 철자·문장부호·대소문자·아포스트로피를 그대로 유지해야 합니다.
export const PHRASES = ['Your love is rising...', 'I wanna love you loud!', "I'm loving you loud!"]

export default function Phrase({ stage }) {
  return (
    <div className={`phrase stage${stage}`} aria-live="polite">
      {PHRASES.map((t, i) => (
        <p key={i} className={stage === i + 1 ? 'on' : ''} aria-hidden={stage !== i + 1}>{t}</p>
      ))}
    </div>
  )
}
