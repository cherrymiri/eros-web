# EROS — 열정적인 사랑 (인터랙티브 미디어아트)

소리를 내면 심장 모티프의 3D 확성기가 "쿵-쿵" 박동하는 웹사이트. React + Vite + Three.js(React Three Fiber).

## 개발
```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/ 생성
```
- `?test` : 마이크 없이 박동 확인(자동 시연, 스페이스바=큰 소리)
- `?dev`  : 설정 패널 열기 (감도 / 박동 강도 / 소음 기준 / 테스트)

## 구조
- `public/models/eros.glb` Blender에서 내보낸 모델 (형태 수정 없음, 삼각형 12만으로 경량화)
- `src/heart/HeartEngine.js` 소리 크기 → 쿵-쿵 박동 변형 (순수 로직)
- `src/audio/useMic.js` Web Audio 분석 (크기만 분석, 저장·전송 없음)
- `src/components/rubyMaterial.js` 루비 크리스털 재질 (투과/감쇠/위치별 두께)
- `src/components/Scene.jsx` 장면, 조명(코드 생성 소프트박스), 회전/확대

## 배포
Vercel이 GitHub 저장소의 `main` 브랜치를 자동 배포합니다. 코드를 수정해 `git push`하면 재배포됩니다.
(Framework: Vite, Build: `npm run build`, Output: `dist`)

## 박동 진폭 (src/heart/HeartEngine.js `AMP_TABLE`)
| 입력 레벨 | 몸통 변형(최대) |
|---|---|
| 약 0.2 (속삭임) | 약 1~2% |
| 약 0.5 (보통 말소리) | 약 5~8% |
| 약 0.8~1.0 (큰 목소리) | 약 12~16% |
설정의 ‘박동 강도’(0.4~1.6×)가 전체 크기를 배율로 조절합니다. 절대 상한 26%.

## 재질 (src/components/rubyMaterial.js, Scene.jsx `BackLight`)
검정 배경에서도 유리를 통과하는 빛이 있도록, 투과 패스에서만 그려지는 백라이트 카드를 둡니다(화면에는 나타나지 않음).


## v3 — 발성 지속 시간 기반 BPM (최종 수정)

- 박동은 소리의 **크기가 아니라 소리를 이어 낸 누적 시간**으로 빨라집니다. 80 BPM(기본) → 120 BPM(약 20초 누적) → 145 BPM(약 38초 누적) → 160 BPM(최대).
- 모든 조절값은 `src/heart/bpmConfig.js` 한 파일에 있습니다 (누적 시간 곡선, 숨 쉬는 허용 시간, 감소 속도, 문구 단계 경계, 발성 감지 기준).
- `src/audio/voiceDetector.js`: 주변 소음 적응 기준 + 주기성(목소리의 규칙적인 떨림) + 지속 시간 + 일정한 기계음 제외.
- `src/heart/BpmModel.js`: 누적 시간 → BPM, 숨 쉬는 멈춤은 천천히 감소, 긴 침묵은 80으로 복귀, 문구 단계 히스테리시스.
- 이전(소리 크기 기반) 버전으로 되돌리려면: `git checkout v2-loudness-pulse` (태그) 또는 `backup/v2-loudness-pulse` 브랜치.
