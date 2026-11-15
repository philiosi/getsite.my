# 아웃리치 샘플 4종 (getsite-samples) 수정·검증 기록

요청: 동료 세션(nooremadang-94)의 리뷰 `docs/outreach-samples-site_REVIEW.md`를 반영해 수정·테스트·검증 후 배포 (2026-11-15, 사용자 지시).
상태: 2026-11-15 `getsite-samples` 호스팅에 배포했다. 라이브 4개 페이지가 수정본과 바이트 단위로 같다.

대상: https://getsite-samples.web.app/outreach/{todos-cafe, blessing-atelier, hansol-pilates, romi-bungee-yoga}/

## 만든 것

수정 원본은 `deploy/samples/getsite-samples/`에 있다(배포에 쓴 `firebase.json` 포함). 저장소가 공개라 고객 주문 페이지 `public/WO-*`는 `.gitignore`로 제외했다. 다시 배포하려면 라이브에서 WO 페이지 3개를 내려받아 `public/`에 넣은 뒤 배포해야 한다(빠지면 그 페이지들이 사라진다).

| 구분 | 내용 |
|---|---|
| head | `robots noindex,nofollow`, description, theme-color, og 4종, og.png(1200×630), SVG 파비콘, 제목에 "(샘플)" |
| 호스팅 헤더 | `/outreach/**`에 `X-Robots-Tag: noindex, nofollow` |
| 샘플 표시 | 상단 바 "가격·일정·후기는 예시입니다". 모바일에서는 sticky 해제, 라이트·다크 대비 4.5 이상 |
| 정직성 | "실제 후기" 표현 삭제. 로미의 카운트다운과 모집률 78% 막대 삭제. 실제 전화번호 가림. `tel:`/`sms:` 링크 없음. 번호는 `010-0000-0000 (예시)`로 표시. 확인 안 된 SNS 링크 삭제. 단체·출강·FAQ 규정·오시는 길에 "(예시)" 표시 |
| 완료 화면 | "샘플 페이지라 실제로 전송되지는 않았어요"로 통일. 제출하면 완료 제목으로 포커스가 이동한다. "다시 작성"을 누르면 첫 입력칸으로 이동한다 |
| 모바일 | 가로 스크롤 메뉴, 앵커가 sticky 바 아래에 오도록 `scroll-margin-top` 설정, 320px까지 넘침 없음. 메뉴 포커스 링이 잘리지 않게 여백 추가. 하단 고정 CTA가 포커스를 가리지 않게 `scroll-padding-bottom` 추가 |
| 접근성 | 입력칸 `:focus-visible` 링 복구(또도스·로미). 어두운 배경 위 포커스 링 색 보정. 로미 시간표·키커·태그 글자색은 라이트 #B8300F, 다크 #FF8F75 토큰으로 바꿔 4.5 이상. 블레싱 오류에 `role=alert`를 달고 빈 필수 칸으로 포커스 이동. 별점에 `role=img`. 한솔 비교표의 잘못된 `role=table` 교체. 로미 시간표 스크롤 영역에 `tabindex=0`. reduced-motion 누락 애니메이션 정지 |
| 다크 | 블레싱 완료 체크(대비 1.18), 폼 상단 띠, 가격표 머리줄이 배경과 같은 색이던 것 보정 |
| 유지 | `?sample=` CTA 링크, 히어로, 팔레트, 글꼴 |

담당: 1차 구현은 Codex와 Argon이 파일을 나눠 맡았다(계약서 A–F). 2차 수정(리뷰 반영)은 Claude가 직접 했다.

## 테스트 증거 (헤드리스 Chrome, 로컬 서버 후 라이브)

- `check.mjs`: 4페이지 × 320/375/780/1440 × 라이트·다크 조합 28개를 돌렸고 오류 0이다.
  - 가로 넘침 0
  - robots, og 4종, description 있음
  - `tel:` 0, 실제 번호 없음
  - 약속 문구, 가짜 후기, 카운트다운, base64 이미지 모두 없음
- 라이브(`https://getsite-samples.web.app`)를 같은 스크립트로 다시 돌려 같은 결과를 얻었다.
- `clip.mjs`: 320px에서 화면 밖으로 잘리는 글자 0 (스크롤 영역 제외, 라이트·다크).
- `anchor.mjs`: 모든 메뉴 앵커의 제목이 sticky 바 아래에 온다 (375, 1440).
- `forms_focus.mjs`(회귀 테스트):
  - 제출하면 4개 모두 완료 문구가 나오고 포커스가 완료 제목(H3/H4)으로 간다.
  - "다시 작성"을 누르면 `#fName`으로 간다.
  - 블레싱 빈 제출 시 `#fName`으로 포커스가 가고 `role=alert`가 붙는다.
  - 블레싱 수요일 선택 시 휴무 오류가 나온다.
  - 수정 전 백업에서는 포커스가 BODY에 남고 role이 없어 실패하는 것을 확인했다.
- 스크린샷을 직접 확인했다: 로미 시간표 라이트·다크, 블레싱 예약 다크, 또도스 연락 카드, 한솔 FAQ.
- 라이브 확인:
  - 4페이지 200, `X-Robots-Tag: noindex, nofollow`, 로컬 수정본과 바이트 동일.
  - og.png와 사진 200.
  - WO-2026-3246/6934/7191 세 페이지는 배포 전 원본과 동일.

## 리뷰 결과 (Codex, Gemini, Argon, ECC a11y-architect)

| 지적 | 출처 | 판정 | 조치 |
|---|---|---|---|
| 모바일 샘플 바 `span{white-space:nowrap}`로 320px 잘림 | Gemini, Argon | REJECTED | 320px에서 글자 박스를 측정했고 잘림 0 |
| 또도스 `.day-row` 320px 잘림 | Argon | REJECTED | 같은 측정에서 잘림 0 |
| 입력칸 `outline:none`이 `:focus-visible`을 이김 (또도스 :430, 로미 :263) | Codex, ECC | CONFIRMED | 더 구체적인 `:focus-visible` 규칙 추가 |
| 완료 화면에서 포커스가 사라지고 안내가 불안정 (4곳) | ECC | CONFIRMED (high) | 완료 제목에 `tabindex=-1` + focus, 다시 작성 시 첫 칸 focus |
| 블레싱 오류 알림 없음, 포커스 이동 없음 | ECC | CONFIRMED (high) | `role=alert`, 첫 빈 칸 focus |
| 로미 coral-deep 글자 대비 3.5–4.1 (태그·시간 열·키커·필수 표시) | ECC, Gemini | CONFIRMED (high) | `--coral-text` 토큰 (라이트 5.1+, 다크 6.4+) |
| 블레싱 다크 체크 1.18, 폼 띠·표 머리줄이 배경과 같음 | Gemini | CONFIRMED | 다크 전용 색 지정 |
| 블레싱 라이트 포커스 링 2.3–2.6, 히어로 위치 3.9 | ECC | CONFIRMED | 라이트 링은 숲색, 어두운 영역은 #C9A44E (5.2) |
| 한솔 샘플 바 링크 포커스 링 1.5, 또도스 어두운 배경 링 2.1–2.6 | ECC | CONFIRMED | 링 색을 밝게 |
| 모바일 메뉴 포커스 링 잘림 | ECC | CONFIRMED | 스크롤 컨테이너에 4px 여백 |
| 하단 고정 CTA가 포커스를 가림 (한솔, 로미) | ECC | CONFIRMED | `scroll-padding-bottom:90px` (모바일) |
| 한솔 `#formCard` 앵커가 헤더에 가림 | Argon | CONFIRMED | `scroll-margin-top` 96/132px |
| 로미 "② 문자로 일정 확정" 약속 | Codex | CONFIRMED | "② 일정 확정" |
| 또도스 인스타그램 언급 2곳 | Codex | CONFIRMED | 중립 문구로 교체 |
| 또도스 클릭 안 되는 연락 카드에 화살표와 hover | Codex | CONFIRMED | 화살표와 hover 삭제 |
| 블레싱 단체·출강 주장, 한솔 취소 규정·오시는 길 | Codex, Argon | CONFIRMED | "(예시)" 표시 |
| 별점 `div`의 aria-label이 무시됨, 한솔 `role=table` 오용 | ECC | CONFIRMED | `role=img`, `role=region`+`tabindex=0` |
| 로미 라디오 aria-label 불일치·그룹명 중복, 체크 ✓ 읽힘 | ECC | CONFIRMED | aria-label 제거, `aria-hidden` |
| 로미 시간표 스크롤 영역 키보드 접근, reduced-motion 누락 | ECC | CONFIRMED | `tabindex=0`, 애니메이션 정지 목록에 추가 |
| 또도스 메뉴 설명이 지어낸 내용 | Codex | REJECTED | 샘플 바가 예시임을 밝힘. 메뉴 설명은 디자인 예시의 일부 |
| 또도스 "답장을 받을 수 있는" 안내 | Codex | REJECTED | 완료 화면이 미전송을 명시함 |
| 로미 h1 강조색 2.8 (큰 글자) | ECC | DEFERRED | 히어로 팔레트 유지 조건(F). 바꾸려면 디자인 결정 필요 |
| 한솔 모바일 포커스 순서 (CSS order) | ECC | DEFERRED | 헤더 구조 변경이 필요 |
| 입력칸 밑줄 대비 1.2–1.6, 필수 칸 `required` 없음, fieldset 구조 | ECC | DEFERRED (low) | 포커스 표시는 따로 있음 |
| 로미 아이콘을 추상 도형 SVG로 교체 | Argon | DEFERRED (low) | 이모지 대신 SVG로 결정 |
| 또도스 다크 샘플 바 CSS 미사용 | Argon | DEFERRED (low) | 동작 영향 없음 |

## 남은 위험 / 사용자가 할 일

1. **덮어쓰기 위험**: Juno가 자기 원본에서 getsite-samples를 다시 배포하면 이번 수정이 모두 사라진다. 다음 배포는 `deploy/samples/getsite-samples/`의 파일에 WO 페이지를 더해서 해야 한다. 이 사이트는 배포할 때 전체 파일이 교체된다.
2. 결정한 것:
   - 로미의 프로모션 문구는 "예시 프로모션" 표시를 달고 유지했다.
   - 이모지 아이콘은 SVG로 바꿨다.
   - 다르게 원하면 알려 주면 된다.
3. 보류 항목(위 표 DEFERRED)은 디자인 결정이 필요한 것들이다.
