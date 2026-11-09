# v4 섹션별 참고 화면·의견 — 구현 리뷰 (2026-11-08)

계획: `docs/V4_PICKS_PLAN.md` (옵션 B). 상태: 구현·테스트·리뷰 수정 완료. **배포 안 함** (규칙·Apps Script·v4 모두 사용자 승인 대기).

## 1. 만든 것
- 섹션별 참고 화면 고르기(step 3 타일의 "다른 화면 고르기"), 반영할 점 칩(구성·분위기·내용), 섹션별 의견(300자), 갤러리 의견.
- step 4 확인 카드(`li.pick-card`), 접수 후 읽기 전용(의견·칩·고치기·가격 계산기 모두 잠금).
- 주문 문서: `picks: {섹션: '<ref>|<by>|<keep>|<note>'}`, `galleryNote`, `partsVersion`. 규칙은 섹션당 정규식 1개(13섹션 모두 1000식 한도 안, 에뮬레이터 확인).
- Apps Script: 서버 스냅숏 `PARTS`로 재해석한 섹션 표·의견 펜스가 들어간 brief.md, 정중한 접수 안내 메일(고른 구성 → 샘플 제작 후 링크 → 보고 결제 결정 → 결제 후 섹션별 세부 요구사항을 받아 다시 작업).
- 주문 페이지 "고르신 구성" 요약, 결제 후 입력칸에 접수 때 의견을 placeholder로 표시.

## 2. 테스트 근거
| 묶음 | 결과 |
|---|---|
| node 단위 (v4 unit/parts/backend, v3 unit) | 49/49 |
| v4 e2e (playwright, 가짜 API) | 90/90 |
| v3 e2e | 52/52 |
| 규칙 에뮬레이터 | 10/10 |

새 회귀 테스트는 모두 수정을 되돌리면 실패하는 것을 확인했다(링크 300자, 메일 큐 조건, 이메일 제어 문자, 참고 링크 문자 집합, 복구 상태, 계산기 잠금).

## 3. 리뷰어별 지적과 판정
리뷰어: Codex, Gemini, Argon(agy), ECC security-reviewer.

| 지적 | 출처 | 판정 | 조치 |
|---|---|---|---|
| gs 의견 길이를 UTF-16으로 세어 이모지 의견이 "확인 필요"가 됨 | security, Codex, Gemini | 채택 | `Array.from` 코드포인트, 정규식 `u` 플래그 |
| md 치환에 `$` 패턴이 해석됨 | security | 채택 | 함수 콜백 |
| parts.json 실패 시 의견 유실 | Codex, Argon | 채택 | 대체 카탈로그(모든 섹션 '새로 구성', 의견 유지) |
| 저장 중 수정이 접수본과 화면을 어긋나게 함 | Codex | 채택 | 보낸 상태로 되돌리고 안내 토스트 |
| 접수 후 step 4 계산기(+/−/영상)를 누르면 접수본이 분리됨 | Codex(High), Argon | 채택 | 접수 후 계산기 잠금 |
| 타임아웃 복구 뒤 화면이 서버 문서가 아닌 로컬 상태를 보여 줌 | Codex, Argon | 채택 | `submitOrder`가 `sentState`를 돌려주고 화면 상태를 서버본으로 교체 |
| 클라이언트 참고 링크 정규식이 `` ` < > ``를 허용(규칙은 거부) | Gemini, Argon | 채택 | 규칙과 같은 문자 집합 |
| 이메일 속 제로폭 문자: 2단계는 제거, 접수는 공백 → 규칙 거부 | Argon | 채택 | 이메일만 `cleanText` 후 정리(다른 글은 기존대로 공백) |
| 299~300자 참고 링크를 brief가 버림 | Argon | 채택 | gs 상한 292(+`https://` 8 = 300) |
| brief.md 표가 목록 안에 붙어 렌더되지 않음, "첫 장면: 선택 샘플" 문구가 표와 모순 | Argon | 채택 | 표를 `## 섹션별 구성` 블록으로 분리, 모순 문구 제거 |
| brief 동기화 실패로 멈춘 주문 20건이 메일 큐를 막음 | Argon | 채택(기존 결함) | 대기 메일은 `briefStatus == synced` 중에서만 조회(복합 동등 조건) |
| 주문 페이지 결제 후 입력칸이 검증 안 된 `brief.sections`를 우선 | Argon | 채택 | v4는 규칙이 검사한 `order.sections` 우선 |
| 후보 없는 섹션(뉴스레터)의 "고치기"가 아무 곳도 포커스하지 않음 | Argon | 채택 | 타일 자체에 포커스 |
| 문자열 끝 서로게이트 절단 | Argon | 이미 수정 | `clip()`(코드포인트) 사용 중, 주문 페이지 입력도 코드포인트로 자름 |
| 의견 입력 직후 blur 커밋으로 요약이 늘어나 버튼 클릭이 빗나갈 수 있음 | Argon | 보류 | 400ms 안에 버튼 위쪽을 누를 때만 발생. 다음 정리 때 요약 영역 높이 고정 검토 |
| 섹션 제거 후 다시 추가하면 의견이 사라짐 | Codex | 보류 | 제거는 의도된 정리. 되살리기는 별도 기능 |
| 단계 전환 시 한글 조합 중 글자 반영 | Codex | 보류 | blur·compositionend에서 커밋, 남은 위험 낮음 |
| 아무 주소로 메일 보내기(App Check 없음) | security | 보류(기존) | 일일 20통 예약·같은 주소 24h 1통으로 완화. App Check는 배포 결정 항목 |

## 4. 남은 위험
- 실제 Apps Script 실행(DriveApp·MailApp·복합 조건 runQuery)은 로컬에서 검증 불가. 배포 뒤 시험 주문 1건으로 확인 필요.
- 메일 큐 조건 변경 후, `failed`로 멈춘 주문을 운영자가 `pending`으로 되돌리면 brief가 다시 synced 된 다음 메일이 나간다(의도대로).

## 5. 사용자가 할 일
1. `deploy/apps-script/`의 `brief-sync.gs`, `parts-snapshot.gs`를 `clasp push`.
2. `v3/backend/firestore.rules`를 v4 배포와 같은 릴리스로 배포.
3. 배포 후 시험 주문 1건: 섹션별 고르기·의견 → brief.md 표 → 안내 메일 문구 확인.

## 6. 후속: 첫 장면 모션·갤러리 "보면서 고르기" (2026-11-08)
결정(사용자): motion-2의 7가지 장면을 첫 장면 후보로, 영상 장면은 "영상 옵션"으로 표시하고 "영상을 만든 뒤 웹용 Remotion으로 다시 제작"한다고 안내. 7번 샘플이 실제로 Remotion으로 다시 만든 영상이며 이미 배포되어 있음.
아이디어 검토: Codex·Argon·ECC architect 모두 새 창 대신 같은 페이지 대화상자, `picks.hero` 확장(규칙 변경 없음), 갤러리 11종 유지를 권함. Gemini는 API 오류로 실패.

| 항목 | 내용 |
|---|---|
| 데이터 | `v4/data/motion-scenes.json`(7장면·안내 문구) → `scripts/v4-parts.mjs`가 hero 후보 뒤에 `motion-2:scene-*`(kind `motion`)로 추가, gs 스냅숏에도 반영. 포스터는 `scripts/v4-capture-motion.mjs`로 캡처 |
| 모션 샘플 | `motion/…-2.html`에 `?embed=1`(무대만), `#scene=N`, 같은 출처 postMessage(장면·재생) 추가. 원본 동작은 그대로 |
| 화면 | `v4/picker.js`: 전체화면 `<dialog>`. 모션은 같은 출처 iframe(열 때만 로드, 닫으면 해제), 갤러리는 실제 엔진. 보는 것은 주문을 바꾸지 않고 "선택"만 반영. 타일: "모션 장면 보며 고르기 (7)", 포스터 위 "움직임 보기", 갤러리 "크게 보며 고르기" |
| 영상 옵션 | 영상 장면을 고르면 영상 옵션이 켜지고(버튼에 +200,000원 표시), 그 장면이 빠지면 다시 꺼짐. 고객이 직접 옵션을 만지면 그 뒤로는 따라가지 않음. 옵션이 꺼진 채 영상 장면이면 step 4·brief에 확인 필요, 메일에 확인 안내 |
| 서버·주문 페이지 (Codex) | brief 표에 `모션: 이름 · [포스터] · [움직임 보기]`, 영상 안내·확인 필요 줄, 메일 문구, 주문 페이지 요약 |
| 배포 조립 | `scripts/v4-build.mjs`가 `motion/`도 복사(빠뜨리면 배포 때 살아 있는 /motion/ 페이지가 사라졌음) |

테스트: node 56/56, v4 e2e 114/114, v3 e2e 52/52(Codex 변경 뒤 실행). 규칙은 바뀌지 않아 재실행하지 않음.
리뷰(Codex, 변경분): ① 일시정지 중 영상 장면으로 가면 영상이 재생됨 → embed에서 일시정지 상태면 영상 재생을 막음 ② 영상 장면을 바꾸거나 첫 장면을 빼도 영상 요금이 남음 → `videoAuto`로 장면이 켠 옵션만 되돌림(단위 테스트) ③ 장면을 바꾼 뒤 포커스가 사라진 버튼으로 감 → 닫을 때 다시 그려진 버튼으로(e2e). 모두 채택·수정.
확인 못 한 것: 헤드리스 크롬은 이 MP4를 재생하지 않아 ①은 실제 브라우저에서 확인 필요.

사용자가 할 일(추가): 수정한 `motion/…-2.html`은 v4와 함께 배포해야 선택창이 동작(현재 배포본에는 embed 모드가 없음). `node scripts/v4-build.mjs` 뒤 미리보기 채널에서 375px·데스크톱으로 선택창 확인.

미리보기 배포(2026-11-08, 사용자 승인): `node scripts/v4-build.mjs` → `firebase hosting:channel:deploy v4-picks --expires 7d`. https://getsite-my--v4-picks-rc0m5eqs.web.app (2026-11-15 만료). live 채널은 그대로(마지막 릴리스 02:28). 1440·375에서 모션 선택창 로드·장면 전환·영상 장면 선택 시 영상 옵션 켜짐, 페이지 오류 0 확인. 규칙·Apps Script는 아직 배포 안 함.

Apps Script 배포(2026-11-08 09:06, 사용자 승인): `deploy/apps-script` `clasp push` → 원격 4파일(brief-sync, parts-snapshot 포함)이 로컬과 같음 확인. 이전 원격본 백업은 세션 scratchpad `gas-remote/`.
Firestore 규칙: **보류(사용자 결정)**. 운영 규칙은 orders 생성·조회 전체 허용 12줄이고, 현재 live 루트 페이지는 옛 형식(`WO-YYYY-NNNN`, v2 필드)으로 저장하므로 새 규칙을 먼저 올리면 live 접수·조회·상세 제출이 모두 거부된다. live를 v4로 바꾸는 릴리스(`v4-build --root=v4` + hosting live 배포)와 같은 시각에 배포할 것. 그 전까지 미리보기 채널에서는 주문 접수 시험이 안 된다(운영 규칙은 통과하지만 운영 DB에 기록되므로 하지 않음).

## 7. v5: 3단계 단순화 (2026-11-08)
요청: "모션그래픽이랑 갤러리만 샘플로 보여주자. 갤러리는 선택 가능하게.. 모션 그래픽은 그냥 예시로만... 나머지 섹션은 그냥 구성만 선택하게... 그걸 v5로 해줘."
- `v5/` = v4 복사본(상태 키 `getsite.v5.state`). 바꾼 곳: `parts.js` `examplesOnly()`(hero 모션 장면만 남기고 모든 섹션 후보 비움 → 모든 섹션이 `new`), `preview.js`(섹션 타일은 구성만, 첫 장면은 포스터 + "모션 예시 보기 (7)"), `picker.js`(모션은 보기 전용, 선택 버튼 없음, 영상 장면은 4단계 옵션·Remotion 안내), `order.js`(새로 구성 섹션은 "새로 구성 참고" 대신 섹션 이름만), `panels.js`·`step4.css`(문구, 빈 썸네일 칸 숨김), `process.js`(안내 문구).
- 주문 형식은 v4 그대로(schema v4, picks 전부 `new|auto||<의견>`): 규칙·Apps Script 변경 없음. 섹션별 의견과 갤러리 구도·의견은 그대로 전송.
- `scripts/v4-build.mjs`가 `v5/`도 복사. 테스트 `tests/v5/e2e.mjs` 19/19.
- 미리보기: https://getsite-my--v4-picks-rc0m5eqs.web.app/v5/ (v4는 /v4/ 그대로). live 변경 없음.

## 8. v5: 섹션별 색·번호·구조 그림 (2026-11-08)

사용자 요청: 3단계 섹션 미리보기가 전부 같은 모양이라 구분이 안 됨 → (가) 옅은 파스텔 배경 + 진한 글자.

| 담당 | 파일 |
|---|---|
| Claude (계약·테스트·판정) | `v5/section-colors.css`(섹션 id별 `--sec-bg/-soft/-acc/-ink`, 다크 모드 포함), `v5/index.html` 링크, `tests/v5/e2e.mjs` +9개 검사 |
| Codex (구현) | `v5/preview.js`(큰 번호·이름·설명·`.sk-<id>` 구조 그림, 순서 바뀌면 번호 갱신), `v5/sketches.css`(새 파일) |
| Argon (구현) | `v5/v4.css` `.stack li`/`.no` 색 칩, `v5/step4.css` `.pick-card` 왼쪽 띠·`.pick-no` 칩 |

색은 순서가 아니라 섹션에 붙는다(같은 섹션은 미리보기·구성 순서·4단계에서 같은 색). 주문 형식·규칙·Apps Script 변경 없음.

리뷰(Codex·Gemini·Argon·ECC typescript-reviewer·ECC a11y-architect):

| 지적 | 출처 | 판정 | 조치 |
|---|---|---|---|
| 색이 들어간 머리줄의 `.src` 회색 글자가 다크 모드에서 AA 미달 가능 | a11y, Gemini, Argon | 확정 | `--sec-ink` 82% 섞은 색으로 |
| 첫 장면·갤러리 타일에 순서 번호 없음(02부터 시작해 보임) | Argon | 확정 | 모든 타일 머리줄에 `.tile-no` 칩, 테스트 추가 |
| 큰 번호·이름을 스크린 리더가 두 번 읽음 | Argon | 확정 | 큰 번호·이름 `aria-hidden`, 테스트 추가 |
| 세로 전환이 화면 폭(560px) 기준이라 2단 화면의 좁은 칸에서 답답함 | Argon | 확정 | 컨테이너 쿼리(타일 폭 520px 이하) |
| `.pick-card` 띠 그림자 중복 | ECC, Argon | 확정(낮음) | 하나 삭제 |
| 이력 그림의 점과 선이 어긋남 | Gemini | 기각 | 1440·1024·375 스크린샷에서 점이 선 위에 정상 |
| 다크 모드 `.stack li` 띠 대비 낮음 | ECC, Argon | 기각 | 장식, 번호 칩이 같은 정보를 줌 |
| 모션 없는 첫 장면이 기본 3줄 그림 | Argon | 기각 | 의도된 대체 |
| 결함 없음 | Codex | — | — |

검증: 로컬 28/28, 미리보기 https://getsite-my--v4-picks-rc0m5eqs.web.app/v5/ 에서도 28/28(Firebase 차단, 가짜 API). 1440·1024·768·375, 다크 모드 스크린샷 확인. live·규칙은 그대로.

## 9. v5: 레퍼런스 링크별 메모와 참고 이미지 업로드 (2026-11-08)

### 만든 것
- **3단계 안내 문구:** 색감, 스타일, 분위기가 담긴 사이트·이미지·핀터레스트·인스타그램 주소를 최대 3개 받는다고 안내한다.
- **링크별 메모:** 링크마다 "참고할 부분" 입력란이 있다(100자).
- **참고 이미지 파일:** jpg, png, webp, gif, heic, zip을 받는다.
  - 최대 10개, 파일당 20MB까지이고 끌어다 놓기와 키보드 선택을 모두 지원한다.
  - 지원하지 않는 형식이나 크기 초과는 이유와 함께 거절한다.
  - 고른 파일은 목록으로 보이고 "빼기"로 지울 수 있다.
  - 파일 전체에 대한 메모 칸이 하나 있다(200자).
- **접수 뒤 업로드:**
  - 주문이 저장된 다음에 파일을 Storage `refs/<의뢰코드>/ref-<n>.<ext>`에 올린다.
  - 영수증에는 파일마다 올리는 중, 올림, 실패가 표시된다.
  - 실패한 파일은 바이트가 남아 있을 때만 다시 올릴 수 있다. 그 밖에는 Drive 폴더로 안내한다.
  - 업로드가 실패해도 접수는 유지된다.
- **주문 데이터:** 메모와 파일 정보는 `brief.references`에 `{ customerLinks, refNotes[3], files: 'ref-1.jpg,…', fileNote }`로 들어간다.
  - **firestore.rules는 바꾸지 않았다.** 섹션 13개를 모두 고른 주문이 이미 식 1000개 한도 바로 아래에 있어서다. 에뮬레이터에서 측정했다.
  - 최상위 선택 필드로 넣는 방식, 목록을 원소마다 검사하는 방식, 필수 키로 넣는 방식은 모두 한도를 넘었다.
- **storage.rules:**
  - 생성만 허용하고 덮어쓰기는 막는다.
  - 파일 이름 형식, 크기(1B~20MB), 확장자와 짝이 맞는 형식을 검사한다.
  - 주문의 `files`에 적힌 이름만 올릴 수 있고, 목록은 120자·10개 이하여야 한다.
  - 접수 후 1시간 안에만 올릴 수 있고, 아무도 읽을 수 없다.
- **운영자 브리프(brief-sync.gs):**
  - 링크 옆에 메모를, 신뢰할 수 없는 블록 안에 파일 이름과 파일 메모를 넣는다.
  - 메모 안의 주소는 `hxxps://`로 바꿔 클릭되지 않게 한다.

### 담당
| 담당 | 범위 |
|---|---|
| Claude | 계약(store 상태와 상수, `ref-files.js`, `order.js`의 refsOut·refLines·uploadRefFiles), `api.js` uploadRefFile, storage.rules, brief-sync.gs, index.html, 모든 테스트, 리뷰 판정과 수정 |
| Codex | `process.js` 3단계 UI, `panels.js` 4단계 요약과 5단계 업로드·재시도 |
| Argon | `refs.css` |

### 리뷰 (1차: Codex, Gemini, Argon, ECC 보안·접근성·JS / 2차: Codex 차이분)

**확인되어 고친 것**

| 지적 | 출처 | 조치 |
|---|---|---|
| 업로드 중에 고치면 끊긴 접수가 되살아남 | ECC-JS, Argon, Codex | 업로드가 끝났을 때 의뢰 코드가 그대로일 때만 결과를 기록 |
| 저장 중에 파일을 빼면 바이트가 사라짐 | ECC-JS, Argon, Codex | 제출 시점에 File 객체를 고정 |
| 새로고침 뒤 재시도 버튼이 아무 일도 안 함 | ECC-JS, Argon, Codex | 바이트가 남은 파일만 재시도, 나머지는 Drive 안내 |
| 업로드 중 새로고침하면 결과가 사라짐 | Codex | "올리는 중" 상태로 먼저 기록하고, 새로고침 뒤에는 실패로 표시 |
| 시간 초과 뒤에도 업로드가 계속되어 재시도가 거부됨 | ECC-JS, Codex | `uploadBytesResumable`로 바꾸고 시간 초과 시 cancel |
| 120자를 넘는 파일명에서 확장자가 잘려 파일이 빠짐 | Gemini, Argon | 확장자를 남기고 자름 |
| 상태 안내 영역이 display:none이라 읽히지 않음, 포커스가 튐, 실패 건수 안내 없음 | ECC-a11y, Argon | 영역은 늘 렌더링, 첫 표시 때만 포커스 이동, 결과 문구에 실패 건수 |
| 오류 알림(role=alert)이 숨김 해제와 함께 나와 놓침, 추가·제거 안내 없음 | ECC-a11y | 알림은 항상 DOM에 두고 polite 영역으로 안내 |
| 빼기 뒤 포커스가 목록 밖으로 나감 | Argon | 남은 마지막 버튼으로 이동 |
| 거절된 파일만 고르면 접수가 끊김 | Argon | 바뀐 것이 없으면 store를 수정하지 않음 |
| 4단계 요약에 공백 메모가 "— 참고:"로 나옴 | Argon | `refsOut` 사용 |
| 확장자와 형식이 따로 검사됨, 주문 조회 3번 | Argon | 짝 검사, 조회 1번 |
| `files` 문자열 크기 상한 없음 | ECC-보안 | 120자 상한 |
| 메모 안의 주소가 브리프에서 클릭됨, C1 제어문자 | ECC-보안, Argon | `hxxps://`로 변환, 제어문자 제거 |
| 이모지가 반으로 잘림 | Argon | 끝에 남은 반쪽 문자 제거 |
| 복구 재시도 때 저장된 이름과 지금 파일이 다름 | Argon | 이름이 같을 때만 짝짓고, 아니면 바이트 없음으로 처리 |
| 드롭 영역 테두리 대비, 쓰이지 않는 CSS | ECC-a11y | `--ink-3` 테두리, 정리 |
| 일부 파일만 재시도 가능한데 전체가 가능하다고 안내 (2차) | Codex | 가능한 파일만 재시도, 문구 구분 |

**기각한 것**

| 지적 | 출처 | 사유 |
|---|---|---|
| refs.css 64행 미디어 쿼리가 깨짐 | Gemini | 실제 파일은 정상 `@container`. 지적 내용이 사실과 다름 |
| 브리프 백틱으로 코드 블록 탈출 | Gemini | `text_()`가 백틱을 `'`로 바꿈. 테스트로 확인 |
| 복구 재시도 때 다른 jpg가 올라감 (2차) | Codex | 파일을 바꾸면 `edit()`가 접수를 끊어 새 의뢰 코드가 됨. 새로고침 뒤에는 바이트가 없음 |

**보류 (사용자 결정 필요)**

| 지적 | 출처 | 이유 |
|---|---|---|
| 익명 업로드로 저장 용량을 키울 수 있음(주문 1건당 최대 200MB) | ECC-보안, Codex | App Check, 예산 알림, `refs/` 수명 주기 삭제는 콘솔 설정이 필요 |
| 업로드 파일의 내용 검증 없음 | ECC-보안, Codex | 형식은 클라이언트가 신고한 값. 운영자는 내려받은 zip을 샌드박스에서 열어야 함 |
| `brief.references` 크기 상한 없음 | ECC-보안 | 기존 규칙의 빈틈. Firestore 규칙 한도 때문에 이번에는 손대지 않음 |

### 테스트
- v5 e2e 55/55: 로컬과 미리보기 모두 통과. 미리보기에서는 Firebase를 막고 가짜 API를 썼다.
- 수정 4건(되살아남, 확장자, 올리는 중 표시, 재시도 포커스)은 수정을 되돌리면 테스트가 실패하는 것을 확인했다.
- 규칙 에뮬레이터(`tests/v5/rules.test.mjs`) 5/5.
- `tests/v5/unit.test.mjs`와 v4 backend 테스트 13/13.
- v4 e2e 114/114, v4 unit·store·parts 테스트 통과.
- 미리보기 주소: https://getsite-my--v4-picks-rc0m5eqs.web.app/v5/ (2026-11-15 만료)

### 사용자가 할 일 (v5 운영 전환 때)
1. Firebase Storage 버킷 `getsite-my.firebasestorage.app`이 있는지, 요금제가 무엇인지 확인한다. 새 버킷은 Blaze 요금제가 필요할 수 있으며, 이번에 확인하지 못했다.
2. `firestore.rules`와 `storage.rules`를 운영 전환과 함께 배포한다. Storage가 Firestore를 읽도록 허용하는 질문이 나오면 승인한다.
3. 바뀐 `brief-sync.gs`를 Apps Script에 다시 배포한다. 다시 배포하기 전에는 운영자 브리프에 메모와 파일 목록이 나오지 않는다.
4. 남용 방지: App Check, 예산 알림, `refs/` 수명 주기 규칙(예: 90일 뒤 삭제)을 설정한다.
5. 참고 파일 확인: Firebase 콘솔 → Storage → `refs/<의뢰코드>/`. zip은 안전한 환경에서 연다.

## 10. v5: 참고 이미지 저장소를 Firebase Storage에서 Google Drive로 변경 (2026-11-08)

사용자 요청: "firestore 사용안해..원드라이브로 가자". OneDrive 개인 계정은 로그인하지 않은 사람의 업로드를 받을 수 없습니다(Microsoft 문서 기준, 파일 요청 기능은 회사·학교 계정 전용). 그래서 사용자가 Google Drive를 선택했습니다. 주문 데이터는 지금처럼 Firestore에 저장합니다(사이트 전체가 쓰는 방식).

- **새 파일 `v3/backend/ref-upload.gs`** (구현 Codex, 리뷰 수정 Claude). brief-sync와 같은 Apps Script 프로젝트에 있는 공개 웹 앱(doPost) 하나입니다. 파일은 운영자 Drive `getsite-order-refs/<의뢰키>/ref-N.ext`에 저장합니다. 사본은 `deploy/apps-script/`에 있습니다.
  - 다음 조건을 확인합니다: 키 형식, 이름 형식, 확장자와 형식의 일치, 실제 파일 앞부분 바이트(jpg·png·gif·webp·heic·zip), 크기 1B–20MB, 주문에 적힌 이름(10개 이하), 접수 후 1시간 이내(저장 직전에 한 번 더 확인).
  - 덮어쓰지 않습니다. 같은 이름이 이미 있으면 `exists`로 답하고, 브라우저는 이를 성공으로 처리합니다.
  - 창구 전체 한도: 1분에 60건(Firestore 조회 전에 확인), 6시간에 약 1GB.
  - 스크립트 잠금을 쓰지 않고 syncBriefs와 다른 폴더를 써서, 업로드가 몰려도 브리프 생성과 메일 발송이 멈추지 않습니다.
- `v3/order/api.js` `uploadRefFile`: 파일을 base64로 바꿔 text/plain으로 POST합니다(CORS 사전 요청 없음). 주소는 `REF_UPLOAD_URL`이고 배포 전에는 비어 있습니다. 비어 있으면 업로드는 실패로 처리되고, 접수 화면에 Drive 폴더 안내가 나옵니다.
- `storage.rules`는 원래대로 전부 거부로 되돌렸습니다. Storage 업로드 코드와 Storage 규칙 테스트도 뺐습니다. 운영자 브리프에는 저장 위치가 `Drive getsite-order-refs/…`로 표시됩니다.

| 지적 | 출처 | 판정 | 조치 |
|---|---|---|---|
| 업로드가 syncBriefs와 스크립트 잠금을 같이 써서 서로 막을 수 있음 | Codex, ECC 보안 | 확인 | 잠금을 없애고 폴더를 분리, 회귀 테스트(LockService를 부르면 실패) |
| 임의 키로 Firestore 읽기·UrlFetch 할당량 소모 | Codex, ECC 보안 | 확인 | 조회 전에 분당 60건 한도, 회귀 테스트 |
| 반복 주문으로 Drive 용량 고갈 | Codex, ECC 보안 | 일부 확인 | 6시간 약 1GB 한도. 완전한 방지는 아님(남은 위험) |
| 1시간 제한을 대기 전에만 확인 | Codex | 확인 | 저장 직전 재확인, 회귀 테스트 |
| REF_UPLOAD_URL이 비어 있음 | Codex | 보류 | 배포 때 사용자가 입력 |
| 실제 리디렉션 경로의 CORS가 테스트되지 않음 | Codex | 보류 | 실제 배포 후 한 번 확인 필요 |
| zip·heic 내용 자체는 검사하지 않음 | ECC 보안 | 남은 위험 | 운영자는 zip을 격리된 환경에서 열 것 |

테스트: ref-upload 9/9(수정을 빼면 3개 실패를 확인), upload-client 8/8, v5 e2e 55/55, Firestore 규칙 3/3, unit·backend 22/22, v4 e2e 114/114, v4 unit·store·parts 24/24. 미리보기 채널에 재배포했습니다. 운영, 규칙, Apps Script는 배포하지 않았습니다.

## 11. 갤러리 샘플(레이아웃 15종) 모바일: 작품을 가리던 번호·버튼 정리 (2026-11-08)

사용자 요청: "모든 갤러리 모바일 환경에서 작품 넘버, 자세히보기(+버튼) 들이 작품을 가려… 전부 수정해줘".
대상 파일은 `samples/gallery-layouts/index.html`이고, 배포 사본 `deploy/samples/gallery-lab/public/index.html`(getsite-gallery-lab)은 바이트 단위로 같습니다. 주문 페이지 3단계의 갤러리(`v3/gallery`)에는 번호나 "+"가 이미지 위에 겹치지 않아 대상이 아니었습니다.

**바꾼 것 (≤720px에서만, 구현 Codex·리뷰 수정 Claude)**
- 이미지 위의 `No.01` 배지는 숨기고, 번호는 카드 본문 `.card-no`로 옮겼습니다.
- "+" 버튼은 숨겼습니다. 이미지를 누르면 상세가 열립니다.
- 포커스, 오토플레이, 썸네일 무대의 제목, 설명, 자세히 보기, 카운터, 화살표, 일시정지, 진행 막대를 이미지 아래로 내렸습니다.
- 타임라인 연도가 네 자리 모두 보이게 했습니다.
- 스트립에서 펼쳐진 카드의 이미지를 누르면 상세가 열립니다. 접힌 카드는 펼쳐집니다(키보드 Enter도 같음).
- 다크 모드 모노 팔레트의 포커스 링을 보이게 했습니다.

| 지적 | 출처 | 판정 | 조치 |
|---|---|---|---|
| 스트립: "+"를 숨기면 상세를 열 수 없음 | ECC 접근성, Argon | 확인 | 펼쳐진 카드 이미지가 상세를 엶. 회귀 테스트(원본에서 실패) |
| 다크 모노 팔레트에서 포커스 링 대비 약 1.1:1 | ECC 접근성 | 확인 | outline을 `--ink`로 |
| 오토플레이 진행 막대 트랙 대비 부족 | ECC 접근성 | 확인 | ink 30% 트랙 |
| 스트립 접힌 카드에서 번호 줄이 제목을 밀어냄 | Argon | 확인 | 접힌 카드에서는 번호 숨김 |
| 타임라인 점이 선과 어긋남 | Argon | 확인 | 점 위치 보정 |
| 비비드 팔레트 색이 모바일 번호에 안 보임 | Argon | 기각 | 색을 넣으면 11px 글자 대비가 AA 미달 |
| 커버플로우·피크 모바일 번호 없음 | Argon | 기각 | 아래 카운터·점 표시가 순서를 알려 줌 |
| 드래그 카드 키보드로 상세 열기 없음, 비비드 `.card-year` 대비 | ECC 접근성 | 보류 | 이번 변경 전부터 있던 문제 |

테스트(`tests/samples/gallery-layouts.mjs`): 375px·320px에서 15개 레이아웃 모두 작품 위에 UI 없음, 연도 온전, 옆 스크롤 없음, 탭으로 상세 열기, 스트립 동작을 확인합니다. 원본에서는 26개 이상 실패하고 수정본은 전부 통과합니다. 데스크톱 1280px 화면은 15개 레이아웃 모두 원본과 픽셀이 같습니다. getsite-gallery-lab에는 아직 배포하지 않았습니다.

## 12. 갤러리 랩: 뮤지엄 월 · 캐러셀 제자리 확대 · 필름 제거 (2026-11-08)

대상: `samples/gallery-layouts/index.html` (배포 사본 `deploy/samples/gallery-lab/public/index.html` 동일). 미리보기 채널 `mobile-fit`만 갱신, 운영(getsite-gallery-lab.web.app)은 그대로.

**만든 것**
- 가로 필름 레이아웃 삭제(14종, 번호·헤더 문구·조합 수 168 정리).
- 뮤지엄 월: 사용자가 지정한 기준(v3 주문 페이지 `?g=museum`, `v3/gallery/l/set-b.css`)에 맞춘 따뜻한 회벽·패널 이음선·걸이 레일·바닥 띠, 5px 진한 액자 + 크림 매트 + 안쪽 그림자, 액자 옆 벽 라벨(휴대폰은 아래), 한 눈높이 정렬, 휴대폰 가로 스크롤 한 줄, 데스크톱 마우스 끌어 둘러보기.
- 피크·드래그 캐러셀: 클릭하면 상세 대화상자 대신 제자리 확대(spotlight). 양옆 작품이 좌우로 밀려나고, 선택 작품이 흰 매트와 함께 커지고, 캡션(No., 제목, 연도·분류·재료, 설명)이 작품 아래 벽 라벨처럼 붙음. ←/→·버튼·점·스와이프로 확대 상태에서 이동, Esc·"← 목록으로"·작품 재클릭으로 복귀. 숨은 작품은 inert, 창 크기 변경 시 다시 맞춤.

**담당**: Claude(사실 확인, 계약·브리프, 필름 제거, 뮤지엄 CSS 통합, 테스트, 캡션 배경·스크롤 위치·트랙 전환 수정) · Codex(스포트라이트 JS/CSS, 수정 2회) · Argon(뮤지엄 월 CSS, 별도 파일로 전달 후 통합).

**테스트**
- `tests/samples/gallery-spotlight.mjs` (신규, 196 PASS): 1280·375·320에서 계약 전부, 다크 모드 캡션 대비 ≥4.5, Tab이 숨은 작품에 안 감, 확대 중 창 크기 변경, 레이아웃 전환 중 키 입력, 뮤지엄 이후 다른 레이아웃 클릭, 뮤지엄 액자·눈높이·라벨·휴대폰 스크롤·마우스 패닝, 감속 모드, 헤더 문구.
  수정 전 파일에서 106개, 리뷰 반영 전 파일에서 11개 실패 확인.
- `tests/samples/gallery-layouts.mjs` 116 PASS(14종으로 갱신). 커버플로우 감속 시간 검사가 부하 중 1회 582ms로 실패, 이후 2회 연속 통과(해당 코드 변경 없음).

**리뷰**
| 지적 | 출처 | 판정 | 조치 |
|---|---|---|---|
| 뮤지엄 패닝 리스너가 #stage에 누적돼 다른 레이아웃 클릭을 삼킴 | Codex·Gemini·Argon·ECC JS·a11y | CONFIRMED | AbortController + 레이아웃 확인 |
| 확대 중 숨은 작품이 Tab·클릭됨 | 5곳 모두 | CONFIRMED | inert |
| 창 크기 변경·회전 시 캡션·높이·배율 고정 | 5곳 모두 | CONFIRMED | 디바운스 resize |
| 드래그 확대에서 흰 카드 위 캡션, 다크 대비 1.1 | ECC JS·Gemini | CONFIRMED | 본문 display:none, 캡션 배경 제거 |
| 레이아웃 전환 240ms 중 키 입력 TypeError | ECC JS·Argon | CONFIRMED | null 가드 |
| 헤더 문구 "열다섯·15종·필름" | Argon | CONFIRMED | 14종으로 |
| 확대 중 드래그가 작품을 캡션에서 떼어냄 | Argon | CONFIRMED | 놓을 때 한 칸 이동 |
| 휴대폰 닫기 버튼이 매트에 닿음 | Gemini·Argon | CONFIRMED | 간격 확보 |
| 좁은 창 패닝 vs scroll-snap, 라벨 선택 | ECC JS·a11y | CONFIRMED | 패닝 중 snap 끔, user-select:none |
| 닫기 버튼 이름 불일치, aria-atomic, 현재 점 표시, 포커스 스크롤 | a11y | CONFIRMED | 반영 |
| 열 때 스크롤이 닫기 버튼을 고정 패널 아래로 밀 수 있음 / 늘어나기 전 스크롤 | Codex 2차·silent-failure | 재현 안 됨, 값싼 수정 | 늘어난 뒤 패널 아래까지만 스크롤 |
| 확대 중 짧은 드래그 후 트랙 전환 none | silent-failure | CONFIRMED(low) | 제자리 복귀 애니메이션 |
| 감속 모드에서 드래그 트랙 애니메이션 | 4곳 | REJECTED | 전역 `*{transition-duration:.01ms !important}`가 이미 덮음(테스트로 확인) |
| 텍스트 모드에서 뮤지엄 액자 16:7 | ECC JS·Argon | REJECTED | 새 CSS가 이미 처리(테스트로 확인) |
| 모바일 지연 클릭으로 스와이프 후 열림 | Gemini | REJECTED | width=device-width에서 300ms 지연 없음 |
| 피크 세로 스크롤 중 넘어감 | Argon | REJECTED | pan-y가 포인터를 취소 |
| 320px 200% 글자에서 라벨 잘림, 미세 플릭 탭 | a11y·ECC JS | DEFERRED(low) | — |

**남은 일(사용자 결정)**: 운영 갤러리 랩 반영 여부. v3 주문 페이지 갤러리(`v3/gallery/`)에는 이번 변경 없음.

## 13. 뮤지엄 월 제자리 확대(spotlight) — 2026-11-09

- **What changed:** a click (or Enter) on a work in the museum wall no longer opens the detail dialog. The work is enlarged in place, and its neighbours slide off left and right and become inert. A caption (No., title, meta, description) hangs under the frame, and the beside-label hides.
- **Controls:**
  - "← 목록으로", ←/→ buttons at the top right, ←/→ keys, and a swipe or drag over 40px.
  - Esc, a click on the enlarged work, or a click on empty wall closes it; focus returns to the work.
  - Resizing refits it; under reduced motion it changes at once.
  - After opening, the page scrolls the caption into view without pushing the wall under the deck.
- **Implementers:**
  - Codex: JS and layout CSS. It stopped partway on its usage limit.
  - Argon: the look CSS (picture-light pool, dimmed wall, caption type, buttons).
  - Claude: integration, caption placement measured from the real image box, button position, scroll-into-view, review fixes.
- **Reviews:**
  - Codex could not review (usage limit until 01:22).
  - Gemini and Argon:

    | 지적 | 출처 | 판정 | 조치 |
    |---|---|---|---|
    | bindOpen에 stage 신호가 붙어, 뮤지엄 뒤 포커스 레이아웃의 "자세히 보기"가 죽음 | Argon | CONFIRMED (high) | 신호를 stage에만 적용, 회귀 테스트 추가 |
    | museum에서 `.card-open` 클릭이 삼켜짐 | Gemini, Argon | CONFIRMED (low; 버튼은 museum에서 숨김) | 모든 data-open이 토글 |
    | 확대된 카드 빈 영역 클릭 시 안 닫힘 | Argon | CONFIRMED (low) | 닫힘 처리 |
    | reduced motion 닫힐 때 애니메이션 | Argon | REJECTED | 전역 `*` transition-duration !important |
    | 빈 벽 클릭 후 포커스 body로 | Argon | REJECTED | 테스트로 반박(포커스 작품 복귀) |
    | 마지막→처음 넘김 시 슬라이드 방향 반대 | Gemini | DEFERRED (low) | 벽 위치 기준 방향 유지 |

- **Tests:**
  - `tests/samples/gallery-spotlight.mjs` passes 300+ checks: museum at 1280/375/320, light and dark, reduced motion. The two new regression tests failed before the fix.
  - `tests/samples/gallery-layouts.mjs`: all PASS.
- **Deploy:** preview `mobile-fit` and live https://getsite-gallery-lab.web.app (deployed with the user's approval, "다 끝나면 배포까지 해줘").

## 14. v5 운영 전환 (2026-11-09)

- **Real upload test:**
  - Created a minimal test order (`WO-2026-9999-…`, only `createdAt` and `brief.references.files`) in production through the Firestore REST API.
  - Uploaded from a real browser with `api().uploadRefFile`, which follows the Apps Script redirect and checks CORS:
    - First upload: ok. Saved as Drive `getsite-order-refs/<key>/ref-1.jpg`.
    - Same file again: ok (`exists`).
    - Unlisted name: `not-listed`.
  - Afterwards the test order was deleted (GET 404) and the Drive folder was moved to trash.
  - The deployed Apps Script files are identical to `deploy/apps-script/`, checked with `clasp pull`.
- **Switch:**
  - Ran `node scripts/v4-build.mjs --root=v5` (new option). The root and `/p/**` now redirect to `/v5/`.
  - Ran `firebase deploy --only firestore:rules,hosting`. `firebase.json` now points to `v3/backend/firestore.rules` and `storage.rules`. Storage was not deployed.
- **Before the switch:**
  - Live was the v2 single page. Its rules let anyone create and read orders, including the list.
  - Both were saved in `backups/live-2026-11-09/`, which git ignores: `firestore.rules.live` and the hosting version id.
- **Checks:**
  - Before deploy:
    - Rules emulator: 13/13.
    - v5 unit and ref-upload: 11/11.
    - v5 e2e: 55/55.
    - Preview channel `v5-switch` smoke test passed.
  - After deploy:
    - `/`, `/p/1234`, `/v5/`, `/v3/order.html` and `/motion/…?embed=1` load with no errors and no 4xx.
    - Anonymous order list: 403. Legacy 4-digit create: 403.
- **Rollback:**
  - Hosting: Firebase console → Hosting → release history → restore version `de684950c383da4b`.
  - Rules: redeploy `backups/live-2026-11-09/firestore.rules.live`.
- **Consequences:**
  - The v2 order page and old `/p/<number>` previews no longer work; they redirect to `/v5/`.
  - The `getsite.my` custom domain does not answer. Only `getsite-my.web.app` serves.

## 15. v5를 메인 주소에 직접, 샘플 정리, 관리자 페이지 샘플 (2026-11-09)

### v5 at the root
- **Build:** `node scripts/v4-build.mjs --main=v5`. v5's files are copied to the root as well, and `/v5/` stays for old links. The `../v3/` paths resolve to `/v3/` from the root, so nothing in v5 changed.
- **Firebase config:** `firebase.json` turns the `/p/**` rewrite into a 301 redirect to `/`. A rewrite would serve the root page at `/p/x`, where its relative `./app.js` paths break.
- **Backup of the redirect version:** live version `555fdc3d2f941171` (`backups/live-2026-11-09b/`, gitignored) and git tag `live-2026-11-09-redirect`.
- **Tests:**
  - v5 e2e 55/55 at `/` and at `/v5/` (local and preview channel); unit and ref-upload 11/11.
  - `tests/v5/upload-client.mjs` updated: its old case expected an empty upload URL, and it now intercepts the deployed URL instead of calling it.

### Samples removed from 주제별 샘플 and 샘플 선택
- **v5 only:** `v5/data/samples.json` (v4 unchanged).
- **Removed samples:** 작품 갤러리 레이아웃 15종, 히어로 쌓고 펼치기, Clay and Glaze 도자기 컵·3D 컵, and 화가 히어로 모션 5종·7종.
- **Also removed:**
  - their plain hero parts in `v5/data/parts.json`;
  - the now-empty 모션·실험 topic.
- **Kept:** the seven motion scenes of step 3 (parts with kind `motion`), which are labelled by scene, not by sample.
- **Spacing:** topic chips to `pick-grid` is now 24px (`.choices + .pick-grid`).

### FAQ: 관리자 페이지
- A new item after 유지보수: the admin page is developed separately, updates the site's basic info and data, and follows the site's section composition.
- It links to `/admin-demo/`.

### Admin page sample (`samples/admin-demo/`, served at `/admin-demo/`)
- **Reference:** the hansakim.com `/admin/` structure, read from its public markup:
  - login card;
  - menus with counts;
  - list, new item and modal form;
  - KO/EN fields;
  - image attach, preview and delete;
  - two-step delete;
  - toast;
  - export, backup and status check.

  The look is getsite's own (light, with dark mode). It is not the hansakim theme.
- **Behaviour:**
  - Five site types (fictional data from the getsite samples) and 13 section toggles.
  - The admin menus are `modulesFor(sections)`: each section maps to a module, and 기본 정보 and 백업 are always present.
  - No backend; data stays in the visitor's localStorage.
- **Who wrote what:**
  - Claude: `index.html` and `schema.js` (contract), the test, and the review fixes.
  - Codex: `admin.js`.
  - Argon: `admin.css`.
- **Test:** `tests/samples/admin-demo.mjs`, 95/95. It checks:
  - menus per type and per toggle;
  - validation;
  - CRUD, two-step delete and images;
  - export, import and reset;
  - no markup injection;
  - focus, labels and the stored-state check;
  - 1280, 375 and 320, light and dark, with no sideways scroll, AA contrast and no errors.

  The regression tests fail against the pre-fix code.

| Finding | Source | Verdict | Action |
|---|---|---|---|
| Focus lost after save/delete/nav/section toggle (DOM re-render) | TS reviewer, a11y, Codex, Gemini | CONFIRMED | `focusKey`/`refocus` after each re-render; tests |
| Hidden file input not reachable by keyboard | TS reviewer, a11y | CONFIRMED | removed `hidden` (CSS already visually hides it); test |
| Corrupt stored state crashes boot / silent discard | silent-failure, TS reviewer | CONFIRMED | stored state goes through the import check; notice toast; test |
| Import: object values, empty required items, duplicate ids | silent-failure, TS reviewer, Codex | CONFIRMED | `checkValues`, unique ids; tests |
| Save while an image is still decoding loses it | Codex | CONFIRMED | `data-pending` blocks save; test |
| Bad number input / bare `https://` accepted | TS reviewer | CONFIRMED | `badInput`, digit pattern, `new URL`; tests |
| Checkbox labelled twice; no `aria-required` | a11y | CONFIRMED | one label; `aria-required`; tests |
| Focus ring invisible on the current menu item | a11y | CONFIRMED | ink ring on the accent fill |
| Toast/confirm step not announced | a11y | CONFIRMED | text set after showing, errors assertive; `role=alert` |
| Readonly values trimmed on save; transparent PNG turns black | silent-failure | CONFIRMED | readonly kept as received; white ground |
| Confirm dialog cancel loses focus | Gemini | REJECTED | the browser restores it; test passes |
| Preset select overflows at 320px | a11y (unverified) | REJECTED | 320px test: no overflow |
| Stretched mobile grid row (gap above the title) | Claude (screenshot) | CONFIRMED | `align-content: start` |
| Broken stored image keeps its value; count read as "작품 3" | silent-failure, a11y | DEFERRED | low |

- **Reviewers:** Codex, Gemini, the ECC TypeScript reviewer, silent-failure-hunter and a11y-architect returned findings (table above). Argon's review failed with a network error (`AGY_ERROR` retryable) and produced nothing.
- **What is left:** the demo is not a real admin. A real one needs Google sign-in, Firestore rules and storage per customer site.

## 13. Step 3 gallery viewer = the gallery lab (2026-11-10)

- "크게 보며 고르기" opens `/gallery-lab/index.html?pick=1[&layout=]` (build copies `samples/gallery-layouts`) in a same-origin iframe.
  The lab hides its hero in pick mode and posts `{type:'getsite:gallery-layout', id}` at the start of each `apply()`;
  the dialog accepts it only from its frame, same origin, known id. "이 구도로 선택" / "제작자에게 맡기기" store the layout.
- New order values `peek`, `autoplay`, `drag`, `thumbnav` (`LAB_GALLERIES` / `ALL_GALLERIES` in v3/catalog.js, v5 store,
  firestore.rules, Apps Script catalog snapshot, order lookup page). The v3 engine's 11 layouts are unchanged.
- Tests: v5 e2e 111/113 locally (the 2 `/p/` checks need Firebase rewrites); rules 4/4; backend 12/12; v3/v4/v5 unit pass.
  Regression tests fail without their fix: rules list, catalog snapshot, quick choose after a switch.
- Reviewers: ECC typescript-reviewer, Codex, Gemini (no defects); Argon produced no output (failed).

| Finding | Source | Verdict | Action |
|---|---|---|---|
| Choose right after a switch stores the old layout (post after 240ms) | ECC, Codex | CONFIRMED | post at start of `apply()`; test |
| Order lookup page shows raw id for new layouts | ECC | CONFIRMED | `ALL_GALLERIES` in v3/order/page.js |
| Lab load failure leaves "불러오는 중" forever | ECC | CONFIRMED | load check + message; test |
| Apps Script must be updated before rules/site, else brief null | ECC | CONFIRMED (deploy order) | deploy Apps Script first |
| Rapid switches can briefly show a stale view | Codex | DEFERRED | pre-existing lab transition; the last swap renders right |
| `?layout=` applies without `pick=1` | Codex | REJECTED | intended by the contract; default unchanged |

### 13b. The step 3 gallery tile is the lab inline (2026-11-10)

- The tile's old v3-engine preview and 11 chips are replaced by the lab in pick mode (lazy iframe `.g-lab`) with a
  "선택한 구도" line and a "제작자에게 맡기기" button. The lab's first post after loading is its starting point and is
  ignored; later posts (a layout button pressed) store the layout. A choice made in the large viewer is sent to the inline
  lab as `{type:'getsite:gallery-set', id}` (the lab accepts it only from its parent, same origin).
- sections.json: "구도 14가지". e2e 117/117 locally. Argon review timed out (15 min, no output).
