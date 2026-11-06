# Samples — getsite.my 샘플 모음

getsite.my에서 만든 샘플 사이트들을 모아둔 폴더입니다. 모든 샘플은 가상·샘플 표기이며, 실제 고객 사이트가 아닙니다.
루트의 `index.html` / `firebase.json`(getsite.my 본체)과 `motion/` 폴더는 이 폴더와 무관하며 건드리지 않습니다.

각 샘플 폴더의 `index.html`을 열면 해당 샘플이 표시됩니다. 단, GitHub 저장소 파일 보기에서는 자바스크립트·에셋이 실행되지 않을 수 있습니다. 실제 동작 확인은 Firebase 주소나 로컬에서 `index.html`을 여는 방식을 이용하세요.

| 폴더 | 샘플 | 원본 아티팩트 slug | Firebase | 크기 |
| --- | --- | --- | --- | --- |
| `cafe-neurinohu/` | 카페 느린오후 — 가상 로컬 카페 원페이지 (KIMI식 모션 이식, 간격 축소 적용본) | `kape-neurinohu` | — (아티팩트만 존재) | index.html 2,256,138 바이트 |
| `portfolio/` | 브랜드 디자이너 김지우 포트폴리오 — 정적본 (가상 인물) | `portfolio-site` | https://getsite-portfolio.web.app | index.html 2,388,815 바이트 |
| `portfolio-react/` | 브랜드 디자이너 김지우 포트폴리오 — React 본문 (Vite 빌드, `assets/` 포함) | `react-portfolio` | https://getsite-react-portfolio.web.app | 합계 약 1,440,911 바이트 |
| `artist-yoon-seohyun/` | 화가 윤서현 예술가 포트폴리오 (가상 화가) | `space-3` | https://getsite-artist.web.app | index.html 10,305,464 바이트 |
| `art-haru/` | 그림공방 하루 — 아트하다 익명 샘플 | `space-4` | https://getsite-haru.web.app | index.html 4,664,488 바이트 |
| `soap-motion/` | 친환경 비누 '거품숲' 모션그래픽 | `space-5` | https://getsite-soap.web.app | index.html 62,980,675 바이트 |
| `cup-cinematic/` | 도자기 컵 시네마틱 | `space-6` | https://getsite-cup.web.app | index.html 2,047,823 바이트 |
| `cup-3d/` | Blender 컵 3D | `blender-3d` | https://getsite-cup3d.web.app | index.html 10,381,043 바이트 |
| `gallery-layouts/` | Work Gallery Layouts — 갤러리 레이아웃 15종 | `work-gallery-layouts` | — (아티팩트만 존재) | index.html 6,270,360 바이트 |
| `hero-stack-fan/` | Hero Stack Fan Motion — 샘플 히어로를 쌓아 펼치는 모션 페이지 | `hero-stack-fan-motion` | — (아티팩트만 존재) | index.html 502,911 바이트 |

## 제외한 것

- `web-order-studio`(getsite.my 본체): 이미 저장소 루트에 있음.
- `space`(폴리마켓 모의거래 대시보드): 내부용이라 제외.
- `kimi-grido1-racing-systems`: 취소된 KIMI 단독 빌드라 제외.
- `space-2`, `space-7`: 아티팩트에 저장된 버전이 없어 정체를 확인할 수 없어 제외.
- `motion/`: 2026-11-06에 이미 올린 화가 히어로 샘플 2개가 있는 별도 폴더로, 그대로 유지.

## 참고

- 업로드 전 비밀정보 검사 완료: `AIzaSy…` 형식의 Google API 키, GitHub 토큰, 개인키 등 실제 비밀정보 0건 (Google Fonts 링크만 존재).
- `portfolio-react/`의 에셋 경로는 서브폴더에서 동작하도록 `/assets/` → 상대경로 `assets/`로 바꿔 올렸습니다.
