# EROS — 열정적인 사랑 (인터랙티브 미디어아트)

소리를 내면 심장 모티프의 3D 확성기가 "쿵-쿵" 박동하는 웹사이트. React + Vite + Three.js(React Three Fiber).

## 개발
```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/ 생성
```
- `?test` : 마이크 없이 박동 확인(자동 시연, 스페이스바=큰 소리)
- `?dev`  : 설정 패널 열기 (감도 / 소음 기준 / 테스트)

## 구조
- `public/models/eros.glb` Blender에서 내보낸 모델 (형태 수정 없음, 삼각형 12만으로 경량화)
- `src/heart/HeartEngine.js` 소리 크기 → 쿵-쿵 박동 변형 (순수 로직)
- `src/audio/useMic.js` Web Audio 분석 (크기만 분석, 저장·전송 없음)
- `src/components/rubyMaterial.js` 루비 크리스털 재질 (투과/감쇠/위치별 두께)
- `src/components/Scene.jsx` 장면, 조명(코드 생성 소프트박스), 회전/확대

## 배포
Vercel이 GitHub 저장소의 `main` 브랜치를 자동 배포합니다. 코드를 수정해 `git push`하면 재배포됩니다.
(Framework: Vite, Build: `npm run build`, Output: `dist`)
