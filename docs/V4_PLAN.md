# v4 계획 — getsite.my 메인 페이지 재설계 (2026-11-07)

상태: 구현·테스트·리뷰 완료. 결과와 남은 결정은 `docs/V4_REVIEW.md`. 후속(섹션별 참고 화면·의견): `docs/V4_PICKS_PLAN.md`.

사용자 요구: 히어로 유지 · 주제별 샘플(모든 GitHub 샘플, 미배포분은 Firebase 배포) · 제작 과정 5단계를 누르면 아래에 선택창 · step 3 구성안(섹션 스택 + 우측 한 흐름 미리보기 + 갤러리 11종 선택 + 자료·레퍼런스 안내) · step 4 정리와 가격 · step 5 접수와 양쪽 메일 · FAQ/조회 유지 · 전용 페이지 섹션 제거 · 흑백 디자인 · `v4/index.html`.

## 0. 확인된 사실
- 배포본 `index.html` 7MB(이미지 인라인). 섹션: nav/hero/samples/how/start/faq/lookup/detail/admin(hidden)/footer. 주문은 `orders/<WO-YYYY-NNNN>` 4자리 공개 번호. 메일 자동 발송 없음(mailto).
- v3: `catalog.js`(컨셉 3, 갤러리 11, 가격), 갤러리 엔진+뷰어, `order/api.js`(비밀키 문서, 15s 타임아웃), `order/brief.js`, `backend/firestore.rules`·`brief-sync.gs` **미배포**(운영 규칙 열림).
- Firebase `getsite-my`: 호스팅 사이트 8개. 루트 `firebase.json`은 없는 `public/`·`firestore.rules`·`storage.rules`를 가리킴. `.gitignore`에 `preview/` 있음.
- 샘플 14개(아래 표). `cafe-warm-minimal/`은 GitHub에 없어 제외.

| id | 원본 | 배포 | 주제 | 갤러리 데모 작품 세트 |
|---|---|---|---|---|
| artist | samples/artist-yoon-seohyun | getsite-artist.web.app | artist | atelier |
| hansakim | 외부 | hansakim.com | artist | atelier |
| nooreemadang | samples/nooreemadang | nooreemadang.web.app/madang/2026-nureongi/ | artist | atelier |
| haru | samples/art-haru | getsite-haru.web.app | class | atelier |
| soap | (저장소 미수록) | getsite-soap.web.app | product | brand |
| cup | samples/cup-cinematic | getsite-cup.web.app | product | brand |
| cup3d | samples/cup-3d | getsite-cup3d.web.app | product | brand |
| portfolio | samples/portfolio | getsite-portfolio.web.app | studio | studio |
| portfolio-react | samples/portfolio-react | getsite-react-portfolio.web.app | studio | studio |
| cafe | samples/cafe-neurinohu | **신규 getsite-cafe** | place | brand |
| gallery-layouts | samples/gallery-layouts | **신규 getsite-gallery-lab** | motion | studio |
| hero-stack-fan | samples/hero-stack-fan | **신규 getsite-hero-fan** | motion | studio |
| motion-1 / motion-2 | motion/*.html | **신규 getsite-motion** | motion | atelier |

## 1. 리뷰 판정 (ECC architect/planner/security, Codex, Gemini; Argon은 시간 초과로 미수신)
| 지적 | 출처 | 판정 | 반영 |
|---|---|---|---|
| v3 `buildBrief`·`brief-sync.gs`가 컨셉 3종·섹션 8개·scene 필수라 v4 선택(샘플 14, 섹션 13, 고객 순서)을 버림 | architect, Codex | 채택 | 주문 스키마 `v4`와 브리프 `getsite.brief.v2`를 새로 정의. 섹션은 고객 순서 그대로. scene 없음(히어로는 "선택 샘플의 첫 장면 방식"으로 기술) |
| 섹션 id 기준이 catalog/rules/gs에서 제각각 | architect | 채택 | `v4/data/sections.json` 13개가 기준. rules·gs·앱이 같은 목록을 쓰는지 unit 테스트 |
| `gallery-embed.js`는 import 시 1회 마운트, 패널 교체 시 누수 | architect, planner, Codex | 채택 | `v4/gallery-mount.js`: `mountGallery(el, conceptId) → {setLayout, destroy}`. step 패널은 교체하지 않고 `hidden` 토글 |
| 미리보기 흐름 안의 갤러리가 세로 휠을 가로챔 | architect, Gemini | 채택 | 타일 안 갤러리는 세로 휠을 절대 소비하지 않음(뷰어 열렸을 때만). `overscroll-behavior: contain` |
| store 얕은 병합 함정, 새로고침 시 입력 소실 | architect, Gemini | 채택 | 배열·객체는 항상 새로 만들기. `sessionStorage` 보존, `#step=N` 해시 |
| 주문 문서 타입 충돌(sections 객체 vs 문자열), refs 검증 불가 | architect, security, Codex, Gemini | 채택 | `sections`는 문자열 id 배열(≤13, 유일). `ref1`~`ref3` 평면 문자열(`^https://` ≤300). `schema:'v4'`로 rules 분기. 견적은 서버(gs)가 재계산 |
| 메일 폭탄·쿼터(100통/일)·중복 발송·피싱 본문 | security, Codex, Gemini | 채택 | gs: `KEY_RE` 검사, `getRemainingDailyQuota()` 20통 예약, 수신자별 상태(`opMail`,`custMail`: pending→sending→sent/failed/skipped), `updateTime` 조건부로 sending 기록 후 발송, 같은 이메일 24h 내 고객 메일 1통, 고객 메일은 고정 템플릿+주문 링크만, 운영자 메일 URL은 `hxxps://`로 무력화, 제목에 고객 문자열 없음. 쿼터 부족은 시도 횟수에 넣지 않음 |
| 규칙 미배포 상태의 노출, 규칙 배포 시 4자리 접수·조회 중단 | security, Codex, Gemini | 채택 | v4 배포와 규칙 배포를 한 릴리스로 묶음. 조회는 비밀키만. 기존 4자리 주문 3건은 운영자가 키를 새로 부여(사용자 결정) |
| 같은 키 재시도가 update가 되어 거부됨 | security, Codex | 채택 | 실패 시 `loadOrder(key)`로 존재 확인 → 있으면 성공 처리. rules 테스트 추가 |
| 섹션 미리보기 원본 매핑이 없어 타일이 빔 | planner, Codex | 채택 | `sections.json`에 `sampleId × selector` 후보 목록과 대체 순서(선택 샘플 → 같은 주제 → 아무 샘플 → 중립 와이어프레임 "이 샘플에 없는 섹션") |
| 캡처 타이밍(폰트·애니메이션·고정 nav·지연 로딩) | planner, Gemini | 채택 | 전체 스크롤 후 `document.fonts.ready`, 애니메이션 정지 CSS 주입, `position:fixed/sticky` 숨김, `element.screenshot()`, 빈 화면 판정 |
| 샘플 카드가 히어로 한 장뿐 | Codex | 채택 | 카드마다 히어로 + 핵심 섹션 3장 |
| Drive 폴더 생성이 `config/drive`를 읽지 않음, `#admin` 제거 시 관리 기능 소실 | Codex | 채택(일부) | `config/drive.apiUrl` 읽기를 v4 주문 흐름에 이식. `#admin`은 제거하되 Drive URL은 Firestore 콘솔에서 설정(사용자 결정 항목) |
| 파일 선택이 업로드로 이어지지 않음 | Codex, security | 채택 | 레퍼런스는 URL 3칸만. 이미지는 접수 후 Drive 폴더 안내. Storage는 deny-all 규칙만 작성 |
| 호스팅 루트 미정, `../v3/` 경로·주문 링크 404 | architect, planner, Codex | 채택 | `scripts/v4-build.mjs`가 `public/`(v3+v4+assets)을 조립. 주문 링크는 `/v3/order.html#t=` 절대 경로 |
| 이미지 130장 일괄 로딩 | Gemini | 채택 | `loading="lazy"`, 미리보기 타일은 보일 때만 |
| 표시번호 중복 가능 | Codex | 보류 | 운영자는 전체 키로 식별. 고객 화면은 주문 링크 보관을 안내 |
| 별도 Firebase 프로젝트로 검증 | Codex | 기각 | 에뮬레이터로 충분. 운영 쓰기 없음 |

## 2. 구조
```
v4/index.html, v4.css(모노크롬 토큰), app.js(store·nav·섹션 연결), hero.css/hero.js(배포본 이식, 이미지는 파일)
v4/samples.js(주제 탭+카드), process.js(step 행+패널 5개), preview.js(step 3 흐름), gallery-mount.js, order.js(v4 스키마·브리프 v2·저장·Drive·재시도)
v4/data/samples.json, sections.json  v4/assets/hero/*, assets/samples/<id>/{hero,<section>}.webp
scripts/v4-capture.mjs(히어로·메타), v4-capture-sections.mjs(섹션 크롭→webp), v4-build.mjs(public 조립)
deploy/samples/<site>/ (4개 사이트, 루트 firebase.json 불변)
v3/backend/firestore.rules(v4 분기), brief-sync.gs(v2 렌더+메일), storage.rules(deny-all)
tests/v4/unit.test.mjs, e2e.mjs; tests/v3/rules.test.mjs 확장
```
주문 문서 v4:
```
orders/<WO-YYYY-NNNN-20자> { schema:'v4', displayNo, catalogVersion, email, siteName, oneLiner, name,
  topic, sampleId, sections:[id…], galleryLayout, ref1, ref2, ref3, materials:'have'|'none',
  estimate:{pages, video, revisions, total}, status:'샘플 제작 대기', briefStatus:'pending',
  opMail:'pending', custMail:'pending', createdAt, brief:{schema:'getsite.brief.v2', …} }
```
디자인: hallmark `redesign`(IA·히어로 보존, 시각층 교체). 토큰은 studio 컨셉의 흑백(paper `oklch(98.5% 0.002 260)`, ink `oklch(19% 0.01 265)`, 회색 4단계, 강조색 없음 = ink). 표제 Archivo 700, 본문 Pretendard. 라이트/다크 모두. 다이얼: 변주 6 · 모션 6 · 밀도 4. 히어로는 파란 강조를 그대로 둠(사용자 지시).

## 3. 순서와 분담
0. 계약 파일(samples.json, sections.json, 스키마) — Claude. 완료 후 아래 병렬.
A. 샘플 4개 배포 — Claude 에이전트. B. 섹션 캡처 파이프라인 — Argon(agy). C. 규칙·gs·storage.rules·rules 테스트 — Codex. D. 토큰·골격·히어로 이식·store·샘플 섹션·step 3 — Claude. E. step 1/2/4/5 패널·order.js — Codex(골격 뒤).
F. 테스트(unit/e2e/rules) → G. 멀티AI 리뷰(codex/gemini/agy + ECC) → 수정 → H. `public/` 조립 → 미리보기 채널(사용자 승인 뒤).

## 4. 성공 기준
- 14개 샘플 카드 모두 원본 사이트가 새 탭으로 열림(200). 미배포 4개는 배포 후 200.
- step 1~5 전환에 상태 유지, 새로고침 후 복원. step 3: 섹션 체크 → 스택 순서 = 미리보기 순서, 갤러리 11종 전환과 크게 보기 동작, 세로 스크롤이 갤러리에 막히지 않음.
- 접수: 가짜 API로 성공/실패/재시도(같은 키) e2e. 에뮬레이터에서 v4 문서 생성 허용, 잘못된 refs/sections 거부.
- 320/375/414/768/1440 가로 스크롤 없음, 콘솔 에러 0, reduced-motion 동작.

## 5. 사용자가 할 일 / 결정
1. 규칙 배포(`v3/backend/firestore.rules`) — v4 배포와 동시. 기존 4자리 주문 3건 처리.
2. Apps Script 배포(`brief-sync.gs`) 후 트리거 설치 — 이것이 되어야 메일이 나감. 페이지는 발송을 단정하지 않음.
3. 히어로 파란색 유지 여부. 4. `#admin` 제거 동의(Drive URL은 Firestore `config/drive`에서). 5. 레퍼런스 이미지 업로드는 Drive 안내로 대체(Storage는 결제 플랜·콘솔 설정 필요). 6. v4 본체 배포는 미리보기 채널 확인 뒤 별도 승인.
