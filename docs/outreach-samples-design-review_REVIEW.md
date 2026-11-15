# 아웃리치 샘플 2종 (스테이라 요가, OLC Coffee) 디자인 점검·수정 기록

요청: 새로 만든 두 샘플을 멀티에이전트로 디자인 점검하고, 검토 의견을 반영해 수정·배포 (2026-11-16, 사용자 지시).
상태: 2026-11-16 `getsite-samples`에 배포했다. 라이브 9개 페이지가 수정본과 바이트 단위로 같고, 라이브 대상 계약 테스트 106개가 통과했다.

대상: https://getsite-samples.web.app/outreach/steira-yoga/ , https://getsite-samples.web.app/outreach/olc-coffee/

## 먼저 알아야 할 것: 덮어쓰기가 실제로 일어났다

- 2026-11-15 16:24의 다른 배포(스테이라·OLC 추가)가 기존 4개 페이지(또도스, 블레싱, 한솔, 로미)를 **수정 전 원본으로 되돌렸다.** 로미의 실제 전화번호와 `tel:` 링크가 다시 노출됐고, `X-Robots-Tag` 헤더와 og 이미지도 사라졌다.
- 2026-11-16에 어제 수정본 4개 + 새 페이지 2개 + WO 3개로 다시 배포해 복구했다.
- 이 사이트는 배포할 때마다 파일 전체가 교체된다. 배포 기준 폴더를 하나로 정하지 않으면 다시 일어난다. 지금 최신 전체본은 `deploy/samples/getsite-samples/`이고(WO 페이지는 공개 저장소라 제외), GitHub의 `samples/outreach/<slug>/index.html`은 **수정 전** 파일이다.

## 만든 것

| 구분 | 스테이라 요가 | OLC Coffee |
|---|---|---|
| 모바일 메뉴 | 숨겨져 있던 메뉴를 가로 스크롤 한 줄로 표시, 오른쪽 끝 페이드 | 같음 |
| 한글 줄바꿈 | `word-break: keep-all`, 제목 `text-wrap: balance` | 같음 |
| 가로 넘침 | 사진 `min-height` 충돌로 페이지 폭이 420px이던 것 해결 | 320px에서 326px이던 것 해결(하단 버튼) |
| 히어로 탭 | 탭을 무대 위쪽에 고정(전환해도 0px 이동), 44px, aria 연결, 방향키·Home·End, 설명 `aria-live` | 모바일에서 탭을 첫 화면 위로 이동하고 짧은 이름 표시, 같은 aria·키보드 처리 |
| 히어로 가독성 | 샘플 2(사진)에 스크림과 고정 밝은 글자색, 다크에서 안 보이던 호흡 고리·일출 선을 변수 색으로 | 샘플3 사진이 데스크톱에서 잘려 확대되던 CSS 수정, 모바일 커피잔·은행잎 겹침 해소, 다크 잔 색·햇살 반점 보정 |
| 대비 | 다크 제작 신청 버튼 2.4 → 7.6, 흐린 "하나/둘/셋"·별점·kicker 보정 | 다크 "예시" 배지 2.4, 상단 띠 3.39, 라이트 kicker 2.3, 보조 글자, 포커스 링 2.5 → 모두 기준 이상 |
| 정직성 | (기존 표시 유지) | 샘플3의 실제 도로명 주소 → "양주시 ○○로 000 (예시)" + 예시 안내 한 줄, 영업시간 모순 수정, "고른 샘플로 적용됩니다" 약속 문구 수정 |
| 접근성 | 건너뛰기 링크, `<main>`, 포커스 링, 별점 `role=img`, 갤러리 캡션 항상 표시 | 건너뛰기 링크, 포커스 링 색, 사진 있는 칸의 "사진 자리" 표시 숨김 |
| head | `robots noindex`, description, theme-color, og 4종 + og.png | 같음 |

유지한 것: 히어로 3종 탭 비교 구성과 탭 순서·기본 탭, 팔레트, 글꼴, 사진, 한 파일 구조, CTA 링크(`https://getsite-my.web.app/#start`), 모든 "(예시)" 표시.

담당: Codex가 스테이라, Argon이 OLC를 구현했다(계약서 A–H, 파일 하나씩). Claude가 계약서·테스트·og 이미지·2차와 3차 수정·통합을 맡았다.

## 테스트 증거 (헤드리스 Chrome)

- 계약 테스트 `t2.mjs` 106개: 로컬과 라이브 모두 통과. 같은 테스트를 수정 전 라이브에 돌리면 56개가 실패한다.
  - head 메타, `word-break`, 탭 aria 연결, roving tabindex, 방향키·Home·End, 포커스 링(굵기와 3:1 대비)
  - 320·375·1440px: 가로 넘침 없음, 메뉴 표시, 탭 높이 44px, 탭 전환 시 위치 변화 2px 이내, 375px 첫 화면 안에 탭, h1·h2·h3 단어 중간 줄바꿈 없음, 메뉴 이동 시 제목이 sticky 바에 안 가림, 콘솔 오류 0
  - 라이트·다크: 제작 신청 버튼, 상단 띠, 예시 배지, kicker 글자 대비 4.5 이상
- 기존 4개 페이지 검사(`check.mjs`) 오류 0.
- 스크린샷을 직접 확인: 두 페이지의 탭 3종(375 라이트·다크, 1440), 수정 부위, og 이미지.
- 라이브: 9개 페이지 200, 수정본과 바이트 동일, 아웃리치 6개에 `X-Robots-Tag: noindex, nofollow`, og.png 200, WO 3개는 원본 그대로.
- 주의: 호스팅이 `cache-control: max-age=3600`이라 이미 열어 본 브라우저는 최대 1시간 예전 화면을 보여 줄 수 있다. 새로 고침하면 된다.

## 리뷰 결과

1차 점검(수정 전): 디자인 리뷰 에이전트 2개(스크린샷 직접 확인), ECC a11y-architect, Gemini, Argon. Codex는 이미지 인자 문제로 출력 없이 실패했다.
2차 점검(수정 후): Codex·Gemini(diff), 디자인 리뷰 에이전트(수정 전후 스크린샷 비교).

| 지적 | 출처 | 판정 | 조치 |
|---|---|---|---|
| 스테이라 다크 제작 신청 버튼 대비 2.4 | 디자인, a11y, Argon | CONFIRMED (critical) | 변수 색 쌍으로 교체 (7.6) |
| OLC 샘플3 데스크톱 사진이 잘려 확대됨 (`height:auto`) | 디자인 | CONFIRMED (critical) | 무대 안에 `object-fit:cover` |
| OLC 샘플3 실제 주소, 예시 안내 사라짐 | 디자인, Gemini, Argon | CONFIRMED (critical) | 예시 표기 + 안내 한 줄 |
| 모바일 메뉴 없음 (두 페이지) | 전원 | CONFIRMED (high) | 가로 스크롤 메뉴 + 페이드 |
| 한글 단어 중간 줄바꿈 (두 페이지) | 전원 | CONFIRMED (high) | `keep-all`, `balance` |
| 스테이라 모바일 사진 넘침 (페이지 폭 420) | 디자인 | CONFIRMED (high, 실측) | `min-height` 충돌 제거 |
| 스테이라 샘플 2 글자가 사진에 묻힘 | 디자인, a11y, Argon | CONFIRMED (high) | 스크림 + 고정 글자색 |
| OLC 실제 사진 위 "사진 자리" 표시 | 디자인, Argon | CONFIRMED (high) | 사진 있는 칸에서 숨김 |
| OLC 모바일 탭이 첫 화면 밖 | 디자인, Argon | CONFIRMED (high, 실측 y=868) | 히어로 위로 이동 |
| OLC 모바일 커피잔·은행잎 겹침, 다크에서 잔 안 보임 | 디자인, Argon | CONFIRMED (high) | 잔 위치·색, 잎 불투명도 |
| OLC 다크 예시 배지 2.4, 상단 띠 3.39, 햇살 반점 | 디자인, a11y, Gemini | CONFIRMED | 색·불투명도 보정 |
| 탭 aria 연결·키보드·`aria-live` 없음 (두 페이지) | a11y, Gemini, Argon | CONFIRMED (medium) | 계약서 E대로 구현 |
| 포커스 표시 없음(스테이라), 링 대비 부족(OLC) | a11y, Gemini, Argon | CONFIRMED (medium) | `:focus-visible` 링 |
| OLC 영업시간 모순, CTA 약속 문구 | 디자인 | CONFIRMED (medium) | 문구 수정 |
| 스테이라 kicker 정렬, 흐린 장식 글자, 다크 상자 구분 | 디자인, a11y | CONFIRMED (medium) | 수정 |
| 건너뛰기 링크·`<main>` 없음, 별점 읽힘, 보조 글자 3.4 | a11y | CONFIRMED (medium) | Claude가 직접 수정 |
| (2차) 스테이라 원장 카드 아래 여백이 구현 중 빠짐 | Gemini, 디자인 | CONFIRMED (high, 신규) | `margin-bottom:20px` 복원 |
| (2차) 스테이라 스크림이 너무 진해 사진이 죽음 | 디자인 | CONFIRMED (high, 신규) | .86 → .42–.60 + 글자 그림자 |
| (2차) 스테이라 배지가 제목에 붙음 | Gemini, 디자인 | CONFIRMED | 여백 6px 복원 |
| (2차) 갤러리 캡션을 키보드로 볼 수 없음 | Codex, Gemini | CONFIRMED | 캡션 항상 표시 |
| (2차) OLC 모바일 탭 설명이 낭독기에서도 숨겨짐 | Codex | CONFIRMED | 시각적으로만 숨김 |
| (2차) 사진 로드 실패 시 대체 문구가 안 읽힘 | Codex | CONFIRMED | 실패 시 `aria-hidden` 해제 |
| (2차) 모바일 메뉴가 더 있다는 표시 없음 | 디자인 | CONFIRMED (medium) | 오른쪽 페이드 |
| (2차) 스테이라 샘플 1 버튼이 첫 화면 밖 | 디자인 | CONFIRMED (medium) | 모바일 호흡 원 축소 |
| 자동 모션 정지 버튼 없음 (WCAG 2.2.2) | a11y | DEFERRED | 히어로에 버튼이 추가되는 디자인 결정. `prefers-reduced-motion`은 동작한다 |
| 스테이라 입구 사진의 다른 상호 글자(거울상), OLC 카드 사진의 "Sejour" | 디자인, Argon | DEFERRED | 사진 교체·크롭은 사용자 결정 |
| "사진 자리" 빈 칸이 많음 (OLC 9곳, 스테이라 2곳) | 디자인 | DEFERRED | 사진이 있어야 채울 수 있다. OLC 모바일 갤러리는 2열로 줄였다 |
| 제작 신청 CTA가 맨 아래 한 곳뿐 | 디자인, Argon | DEFERRED | 선택 제안. 헤더나 하단 고정 버튼 추가 여부는 사용자 결정 |
| OLC HTML 888KB (base64 사진) | Argon | DEFERRED | 한 파일 구조 유지 조건. 사진을 파일로 분리하면 줄일 수 있다 |
| 영문 문구 `lang="en"`, 스테이라 1440에서 탭별 히어로 높이 차, 다크 자격 칩·원장 사진 자리 색 | a11y, 디자인 | DEFERRED (low) | 동작 영향 작음 |
| 탭 번호 순서(3·2·1) | Argon | REJECTED | 탭 순서는 의도된 것(계약서) |

## 남은 위험 / 사용자가 할 일

1. **배포 기준 정하기**: 다른 세션(Juno)이 GitHub `samples/outreach/…`의 예전 파일로 다시 배포하면 6개 페이지의 수정이 모두 사라진다. 그쪽 원본을 이번 수정본으로 바꾸거나, 배포를 `deploy/samples/getsite-samples/` 기준으로 통일해야 한다.
2. **주문 연결**: 두 샘플의 CTA는 `#start`만 연다. `?sample=outreach-steira-yoga` 식으로 연결하려면 `v5/data/outreach.json` 등록 + Firestore 규칙 배포 + CTA 링크 교체를 함께 해야 한다.
3. 보류 항목(표의 DEFERRED) 중 사진 관련과 CTA 추가는 결정이 필요하다.
4. 이번 변경은 커밋하지 않았다. 로컬 저장소는 GitHub보다 4커밋 뒤처져 있다.
