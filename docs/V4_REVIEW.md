# v4 구현 검토 기록 (2026-11-07)

계획: `docs/V4_PLAN.md`. 백엔드 계약: `docs/V4_BACKEND_CONTRACT.md`.

## 만든 것
- `v4/index.html` + `v4.css`(모노크롬 토큰, 라이트/다크) + `hero.css`/`hero.js`(배포본 히어로를 그대로 이식, 이미지 7장은 `assets/hero/*.webp`)
- `v4/samples.js`: 주제 7개(전체 포함) 바닥 캡슐, 샘플 카드 14장(히어로 + 핵심 섹션 3장, 원본 사이트 새 탭, "이 샘플로 시작")
- `v4/process.js`: STEP 1~5 카드(탭) + 패널 1개 영역(패널 5개는 한 번 만들고 `hidden`으로 전환). step 1 샘플 고르기, step 3 섹션 체크 → 구성 순서 스택(↑↓✕) → 오른쪽 한 흐름 미리보기(`preview.js`), 자료 안내, 레퍼런스 URL 3칸
- `v4/preview.js`: 선택 순서대로 섹션 타일. 타일 이미지는 선택 샘플 → 같은 주제 → 아무 샘플 → 와이어프레임 순으로 고름. 갤러리 타일은 v3 엔진이 실제로 움직임(11종 칩, 작품 크게 보기)
- `v4/gallery-mount.js`: v3 엔진을 스크롤 페이지 안에 올리고 완전히 내리는 어댑터. 세로 휠·터치는 페이지가 가져감(크게 보기 중에만 갤러리가 가져감)
- `v4/panels.js`(Codex): step 2 최소 입력, step 4 정리·가격·계산기·견적 복사, step 5 동의·접수·완료 화면, 진행 조회(코드/링크 파싱)
- `v4/order.js`(Codex + 수정): v4 주문 문서 생성, 저장, 타임아웃 뒤 같은 키 복구, 조회 파싱
- `v4/store.js`: 상태 하나, 불변 갱신, sessionStorage 보존(복원 시 전 필드 검증), `#step=N`
- 백엔드(Codex + 수정): `v3/backend/firestore.rules` v4 분기, `brief-sync.gs` v2 브리프 + 메일 상태기계, `storage.rules`(deny-all)
- 캡처(Argon): `scripts/v4-capture-sections.mjs`, `v4/assets/samples/<id>/*.webp` 14개 샘플 68장 + 640px 썸네일, `manifest.json`(실패 0)
- 샘플 배포(에이전트): getsite-cafe, getsite-gallery-lab, getsite-hero-fan, getsite-motion(/1.html, /2.html) 모두 200. 설정은 `deploy/samples/<site>/`
- `scripts/v4-build.mjs`: 루트 `firebase.json`이 가리키는 `public/`(배포본 index.html + v3 + v4) 조립. 배포는 하지 않음
- 테스트: `tests/v4/e2e.mjs` 52, `tests/v4/unit.test.mjs` 5, `tests/v4/store.test.mjs` 4, `tests/v4/backend.test.mjs` 2, `tests/v3/rules.test.mjs` 9(에뮬레이터)

## 테스트 근거
- v4 e2e 52/52 (소스 `/v4/`와 조립본 `/public/v4/` 양쪽): 샘플 14장·주제 필터·새 탭 링크·이미지 404 없음, 단계 전환·새로고침 복원·해시, step 3 스택=미리보기 순서·재정렬·갤러리 11종·크게 보기·갤러리 위 세로 휠이 흐름을 스크롤, step 2 검증(빈 필드·에러 포커스), 레퍼런스 https 검증, 가격 재계산(2쪽+영상+1회=950,000), 접수(첫 저장 타임아웃 → 같은 키로 복구), 문서 키 = 계약, 메일 발송 단정 문구 없음, 접수 후 편집 시 새 요청으로 분리, 조회(짧은 번호 안내·링크 파싱·HTML 이스케이프·비https 링크 차단), 320/375/414/768/1440 가로 스크롤 없음, 다크+모션 감소
- v3 e2e 52/52, 단위 35/35(v3 24 + v4 11), 규칙 9/9. 운영 Firebase에 쓰기 없음(테스트가 네트워크를 차단하고 검증)
- 캡처 검수: 68장 중 검은 영역 비율 10% 초과 0장(카페 4장은 프리로더 제거 후 재캡처)

## 리뷰어
| 리뷰어 | 상태 | 건수 |
|---|---|---|
| Codex(계획) / Codex(코드) | 정상 | 12 / 4 |
| Gemini(계획) / Gemini(코드) | 정상 | 8 / 2 |
| Argon agy(계획) / Argon(코드) | 정상(계획은 시간 초과 뒤 도착) | 15 / 13 |
| ECC architect / planner / security(계획) | 정상 | 9 / 9 / 9 |
| ECC typescript-reviewer / a11y-architect / security-reviewer(코드) | 정상 | 11 / 19 / 7 |

## 판정 (코드 리뷰)
| 지적 | 출처 | 판정 | 조치 |
|---|---|---|---|
| step 3 밖에서 샘플·갤러리가 바뀌면 재진입 때 타일이 안 바뀜 | TS, Codex, Argon | 확인 | `createFlow`가 마지막으로 그린 샘플·구도를 기억해 비교 |
| sessionStorage 오염 값으로 첫 그리기에서 크래시 | TS, Codex, Gemini, Argon | 확인 | `normalize()`가 필드별 타입·허용값·범위 검증, 단위 테스트 |
| 브라우저가 `config/drive`를 읽어 폴더 API를 부르며 비밀 키를 쿼리로 보냄 | security | 확인 | 클라이언트의 폴더 생성 제거. 폴더는 Apps Script가 만들고 링크를 채움 |
| v4 create가 `driveFolderUrl`을 받아 피싱 링크가 메일에 들어갈 수 있음 | security | 확인 | 규칙에서 `''` 강제, gs는 항상 자기 폴더 URL로 덮어씀 |
| 레퍼런스 `https://::::` 통과 | Codex | 확인 | `validRef()`(URL 파싱+호스트) + 규칙 호스트 정규식 |
| 타임아웃 뒤 수정하고 재시도하면 옛 문서를 성공으로 표시 | Codex, Argon, TS | 확인 | 편집하면 이전 시도를 분리(새 키). 복구 시 요약은 서버 문서 기준 |
| 접수 후 요약이 현재 폼으로 다시 계산됨 | TS | 확인 | 제출 시점 요약을 `order.summary`로 고정 |
| 조회 요청이 겹치면 결과가 섞임 | TS | 확인 | 시퀀스 토큰 |
| 배경 `touch-action:none`이 세로 터치 스크롤을 막음, 닫히는 중 휠 누출, masonry/flow 방향키 무효 | Argon | 확인 | 뷰어 밖에서는 `pan-y` 강제, `.g-view` 존재 중 휠 소비, 방향키 양축 전달 |
| 스택 ↑↓✕ 포커스 소실, 단계 이동 후 포커스 소실, 라디오 포커스 표시 없음, 비활성 버튼 때문에 오류에 못 닿음, 오류 설명 연결, 상태 영역, 완료 ✓ 낭독, 탭 레이블, scroll-padding, 대비(ink-3), 링크 이름 중복, `hidden`이 display에 덮임 | a11y(19), Argon | 확인 | 모두 반영. `[hidden]{display:none!important}`로 step 1 주제 필터 버그도 함께 해결 |
| 갤러리 칩의 `role=radio`+`aria-pressed` 혼용 | a11y | 확인 | `role=group` + `aria-pressed` |
| 메일 중복 방지가 대소문자로 우회됨, 쿼터·stuck 알림이 5분마다 반복, invalid 주문이 메일 큐를 막음 | security, Argon | 확인 | 이메일 소문자 강제(규칙+클라이언트), 알림 1회(`mailNote`), invalid는 `skipped-invalid` |
| `brief` 내부 값 무제한 | security, Codex | 확인 | 규칙에 customerText·sample·gallery·references 길이·개수 검사 |
| 320px에서 긴 URL·코드가 패널을 넘침, `.calc-row` 빈 트랙, `img.src=''` | Argon | 확인 | CSS·대체 이미지 |
| `#faq` 같은 해시가 첫 그리기에서 `#step=1`로 덮임 | Argon | 확인 | 단계가 실제로 바뀔 때만 기록 |
| 주문 페이지 recap이 v4 주문에서 빔 | Argon | 확인 | `brief.sample.title` 사용 |
| 데이터 로드 실패 시 조용히 빈 페이지 | TS | 확인 | 안내 문구 표시 |
| `+tag` 이메일 변형으로 중복 방지 우회, App Check 없음 | security | 보류 | 운영 후 App Check 도입 검토. 쿼터 예약과 24h 중복 방지로 완화 |
| 접수 후 다시 쓸 때 옛 키 문서가 운영자에게 남음 | 자체 | 보류 | 운영 절차(같은 이메일 2건이면 뒤 것 기준) |
| 운영자 BCC 사본의 링크가 활성 상태 | Codex(백엔드) | 수용 | 고객 메일에는 고정 템플릿과 주문 링크만 들어가므로 위험이 낮음 |

## 디자인 검수 (hallmark 프리플라이트)
- 흑백 두 색만(강조색 = ink). 히어로만 배포본의 파란색을 그대로 둠(사용자 지시). 긴 대시 0건. 카드 호버 2px 상승·이미지 1.025 확대, 버튼 눌림. 섹션 구조: 히어로 / 샘플 격자+바닥 캡슐 / 단계 탭+패널 / 2열 FAQ / 조회. 320~1440 가로 스크롤 없음. 라이트·다크·모션 감소 확인.
- 스크린샷: 스크래치패드 `shots4/`, `shots5/`(hero·step1~5·faq, 1440/375).

## 남은 위험
- Apps Script 메일 발송은 실제로 돌려 보지 못했다(배포가 사용자 몫). 상태기계는 코드 리뷰로만 확인.
- 실제 터치 기기에서 미리보기 안 갤러리의 세로 스크롤은 미검증(CSS로만 대응).
- hansakim 섹션 캡처 중 `#contact`·`#collections`는 어두운 배경이라 "단색" 경고가 남지만 내용은 정상.
- `deploy/` 폴더(약 40MB)가 OneDrive 안에 생겼다. `.gitignore`에 `deploy/*/public/`, `deploy/*/.firebase/`, `public/`를 추가하는 것이 좋다.

## 사용자가 할 일 / 결정
1. **미리보기 채널 배포 승인**: `node scripts/v4-build.mjs` 뒤 `firebase hosting:channel:deploy v4 --project getsite-my`. 현재 배포본은 그대로 두고 `/v4/`만 추가된다.
2. **규칙 배포**(`v3/backend/firestore.rules`): v4를 본 사이트로 올릴 때 함께. 배포하면 기존 4자리 번호 주문 3건은 고객 조회가 끊기므로 처리 방법 결정(운영자가 키를 새로 부여하거나 메일로 안내).
3. **Apps Script 배포**(`brief-sync.gs`, `catalog-snapshot.gs`, `appsscript.json`) + `installTrigger` 1회. 이것이 되어야 Drive 폴더와 안내 메일이 나간다. 페이지는 "곧 발송됩니다"로만 안내한다.
4. 히어로의 파란 강조색 유지 여부(지금은 유지).
5. 관리자 섹션(`#admin`)은 v4에 없음. Drive API URL은 더 이상 쓰지 않는다(폴더는 Apps Script가 만든다).
6. 레퍼런스 이미지 업로드는 Drive 폴더 안내로 대체했다. Storage 업로드를 원하면 결제 플랜·콘솔 설정이 필요하다.
7. v4를 루트로 올릴 때: `node scripts/v4-build.mjs --root=v4` 뒤 배포. 샘플 섹션의 소개 문구와 샘플 설명은 모두 내가 쓴 초안이라 한 번 검토가 필요하다.
