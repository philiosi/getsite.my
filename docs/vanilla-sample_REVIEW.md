# SANHA VANILLA 샘플 추가 기록

요청: sanha_vanilla 사이트를 getsite-my에 샘플로 추가 (2026-11-19, 사용자 지시). 결정: 복사본을 따로 호스팅, 실제 정보 그대로, 새 사이트 `getsite-vanilla`, 배포까지 한 번에.
상태: 2026-11-19 복사본, Firestore 규칙, getsite-my 호스팅을 배포했다. Apps Script는 같은 날 재로그인 후 배포했다. 커밋하지 않았다.

## 만든 것

| 구분 | 내용 |
|---|---|
| 복사본 | `~/Downloads/SANHA VANILLA 사이트.html`(11MB 한 파일, 운영 중인 sanhavanilla.com과 다른 새 디자인)에 `robots noindex` 메타 한 줄만 넣어 https://getsite-vanilla.web.app/ 에 배포. 응답 헤더 `X-Robots-Tag: noindex, nofollow`. 실제 전화·이메일·구매 링크·문의 폼은 그대로다. 배포 폴더는 저장소 밖 `dev/getsite.my/sanha-vanilla-sample/` (실제 연락처와 11MB 파일을 공개 저장소에 넣지 않기 위해) |
| 카드 | `v4·v5/data/samples.json`에 `vanilla` (제목 SANHA VANILLA, 배지 "실제 제작 사례", 주제 제품·브랜드, concept brand, 썸네일 products·about·business) |
| 캡처 | `v4·v5/assets/samples/vanilla/` 10장(hero, about, products, business, contact와 각 640 축소본), `manifest.json` 등록. 1440px 라이트 화면을 직접 캡처했다 |
| 섹션 미리보기 | `sections.json`: about `#about`, featured `#products`, services `#business`, contact `#contact`. 이 사이트는 해시로 화면을 바꾸므로 `…/#products` 링크가 해당 화면을 연다 |
| 부품 목록 | `node scripts/v4-parts.mjs`로 `v4/data/parts.json`, `v3/backend/parts-snapshot.gs`, `deploy/apps-script/parts-snapshot.gs` 재생성(p-52a6fa6e0d). `v5/data/parts.json`은 v4 결과에서 v5 샘플과 모션 장면만 남긴 것(이 규칙이 이전 v5 파일을 그대로 재현함을 확인) |
| 규칙 | `v3/backend/firestore.rules` `sampleId` 허용 목록에 `vanilla` 추가 |
| 테스트 | `tests/v5/e2e.mjs`(카드 블록, 샘플 수 11), `tests/v5/rules.test.mjs`(vanilla 주문 허용) |

## 배포 전에 발견한 것

- 운영 중인 getsite-my는 저장소 `main`(f0b36db)이 아니라 `form-optional-fields`(88cd575, 지금은 `origin/main`과 같음) 내용이었다. `main`에서 그대로 배포했다면 탭 pill 모션과 신청 폼 선택 항목 7개 파일이 되돌아갔을 것이다. 그 기준 위로 변경을 옮겨 다시 빌드했고, 배포 전 비교에서 운영과 달라지는 텍스트 파일은 이번 변경 10개뿐이었다.
- 운영 사이트에 `/admin-demo/`, `/gallery-lab/`, `/motion/` 두 페이지가 없어(404) FAQ와 3단계의 링크가 깨져 있었다. 이번 빌드에 포함돼 다시 살아났다(200).
- 운영 Firestore 규칙은 저장소 기준과 같았다(2026-11-15 배포본).

## 테스트 증거

- `node --test` 단위 43개 통과(v5 unit, v4 parts·unit·store·backend).
- Firestore 에뮬레이터 `tests/v5/rules.test.mjs` 8개 통과(vanilla 허용, `vanilla-x` 거부 포함).
- `tests/v5/e2e.mjs`는 Playwright 의존성이 사라져 실행하지 못했다. 같은 항목을 헤드리스 Chrome으로 로컬 빌드와 운영 사이트에서 확인: 1440·375px에서 카드 11개와 "샘플 11개", 제목·배지·주제·링크, 대표 이미지와 썸네일 3장 로드, 가로 넘침 없음, 제품·브랜드 필터에 표시, "이 샘플로 시작" 선택, 페이지 오류 0 (14개 항목 통과).
- 배포 후: 운영 텍스트 파일 134개가 빌드본과 바이트 동일, vanilla 이미지 동일. 복사본도 바이트 동일.
- 실제 주문 저장은 접수 메일이 나가므로 시험하지 않았다.
- 배포 전후 호스팅 파일 목록 비교: 추가 37개(vanilla 이미지 30, 되살아난 admin-demo·gallery-lab·motion 7), 제거 8개(`/v3/backend/*`의 gs·규칙 소스. 이전 배포가 공개로 올려 두었던 것으로, 빌드 스크립트가 원래 제외한다).
- 수정한 `tests/v5/e2e.mjs`는 문법 검사만 했고 실행하지 못했다.

독립 리뷰(Codex·Gemini·ECC 에이전트)는 받지 않았다. 데이터 등록 위주 변경이고 기존 생성 스크립트를 썼다.

## 정정 (2026-11-19 23시): 최종본으로 교체

처음 올린 파일(다운로드 폴더의 `SANHA VANILLA 사이트.html`)은 최종본이 아니었다. 최종본은 `dev/sanha_vanilla/sanha-vanilla-site-single.html`(11월 19일 00:20, 히어로가 바닐라 농장 장면)이다. 이 파일에 noindex 태그만 더해 getsite-vanilla에 다시 배포했고, 캡처 10장을 새로 찍어 v4·v5에 교체한 뒤 getsite-my를 다시 배포했다. 운영 복사본과 운영 이미지가 로컬과 일치하고, 운영 카드 확인 14개 항목이 통과했다. 캡처 교체분은 아직 커밋하지 않았다.

## 남은 것 / 사용자가 할 일

1. **Apps Script (완료, 2026-11-19 22:01)**: 운영 계정으로 재로그인 후 `clasp push` 했다. 푸시 전 원격은 로컬과 `parts-snapshot` 하나만 달랐고(vanilla 추가분 38줄, 삭제 없음), 푸시 후 다시 내려받아 5개 파일이 로컬과 일치함을 확인했다. `PARTS`는 5분 주기 트리거로 도는 `brief-sync.gs`만 쓰므로 HEAD 반영으로 충분하고, 버전 고정된 웹앱 배포(@1, `ref-upload.gs`의 `doPost`)는 건드리지 않았다. 푸시 전 원격 사본은 세션 스크래치패드에만 있다. 아래는 배포 전 상태 설명이다: 그 전에는 vanilla로 들어온 접수 메일에 샘플 이름 대신 `vanilla`가 보이고, vanilla 화면을 참고로 고른 섹션은 "참고 화면 확인 후 연락드리겠습니다"로 나가며 운영자에게 "참고 화면 확인 필요" 알림이 온다(`brief-sync.gs:188-206`, 오류 없이 처리). 주문 저장 자체는 된다.
2. **배지**: "실제 제작 사례"는 이 디자인이 실제 의뢰 작업이라는 전제다. 운영 중인 사이트는 다른 디자인이다.
3. **문의 유입**: 복사본의 전화·메일·문의 폼이 실제 사업자에게 연결된다.
4. **git 상태**: OneDrive가 `.git` 파일 686개를 클라우드 전용으로 돌려 `.git/logs/HEAD`를 읽지 못한다. 그래서 로컬 `main`을 `origin/main`으로 옮기지 못했고, 7개 파일이 "수정됨"으로 보이지만 내용은 `origin/main`과 같다. `.git` 폴더를 내려받은 뒤 `git merge --ff-only origin/main`을 하면 정리된다. `stash@{0}`은 이번 변경의 사본이라 지워도 된다.
5. 캡처를 `scripts/v4-capture-sections.mjs`로 다시 뜨려면 숨겨진 화면을 먼저 열어야 한다(이 스크립트는 화면 전환을 모른다).
