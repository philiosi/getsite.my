# 아웃리치 샘플 → 주문 연결 (`?sample=`) 구현·검토 기록

요청서: `claude-request-sample-link.md` (2026-11-15). 상태: 2026-11-15 호스팅과 Firestore 규칙을 함께 배포했고 라이브에서 4개 링크를 확인했다. 실제 주문 저장(라이브 Firestore 쓰기)은 접수 메일이 나가므로 시험하지 않았다(에뮬레이터 규칙 테스트로 대신 확인).

## 만든 것

| 파일 | 내용 |
|---|---|
| `v5/data/outreach.json` (새) | 아웃리치 샘플 등록부 4개. 한 줄 추가로 샘플을 늘린다. 공개 카드·1단계 그리드에는 나오지 않는다. |
| `v5/app.js` | outreach.json을 읽어 `data.pool`(공개 + 아웃리치) 구성, `?sample=` 처리, 처리 후 쿼리 제거(다른 파라미터는 유지) |
| `v5/store.js` | `startFromSample(sample)`: 샘플·사이트 이름·목적·섹션을 한 번에 적용하고 2단계로 이동 |
| `v5/order.js`, `v5/panels.js`, `v5/preview.js`, `v5/process.js` | 선택된 샘플 조회를 `(data.pool \|\| data.samples)`로 변경 |
| `v3/backend/firestore.rules` | `sampleId` 허용 목록에 4개 ID 추가 (1줄). **아직 배포 안 함.** |
| `tests/v5/unit.test.mjs`, `tests/v5/rules.test.mjs` | 등록부 검증, `startFromSample`, 규칙-등록부 ID 동기, 에뮬레이터 규칙 테스트 |

## 요청서와 달랐던 점 (v5 실제 구조에 맞춘 부분)

- 요청서의 `SAMPLES` 배열·`selectSample()`·`#siteName`·`#purpose`·`#start`·`proto` 구조는 v5에 없다. 대응: `data/samples.json` → 공개 샘플, `store.pickSample`, 입력란 `#v4-siteName`·`#v4-oneLiner`, `#start`는 `#process`(2단계 최소 입력)로 처리.
- **Firestore 규칙이 `sampleId`를 허용 목록으로 검사한다.** 목록에 없으면 주문 저장이 거부된다(에뮬레이터로 확인: 규칙 변경 없이는 새 테스트가 실패). 지난 candle 샘플 추가 때도 같은 한 줄을 고쳤다. 요청서의 "Firestore 건드리지 말 것"과 충돌하므로 규칙 파일만 로컬에서 고치고 배포는 승인을 기다린다.
- `topic`, `concept`, `sectionIds`는 요청서에 없어서 정했다(공개 샘플과 같은 기준). 다르게 하려면 `outreach.json`만 고치면 된다.
  - todos-cafe: place / brand, 나머지 셋: class / atelier
  - 섹션 매핑: todos `hero, about, services, gallery, contact` · blessing `hero, featured, services, gallery, trust, booking` · hansol `hero, about, services, story, trust, booking` · romi `hero, featured, services, booking, contact`

## 테스트 증거 (로컬 빌드 + 헤드리스 Chrome, 가짜 API)

- 4개 링크 모두: 샘플 선택됨, 사이트 이름·목적 채워짐, 2단계 열림, 섹션 적용, 토스트 "이 샘플로 신청합니다: …", `#process`로 스크롤, 공개 카드 10개·1단계 그리드 10개 그대로, 쿼리 제거.
- `?sample=없는ID`, `?sample=`, 파라미터 없음, `__proto__` 류: 빈 신청 폼, 오류 없음.
- 직접 고친 사이트 이름은 새로고침 뒤에도 유지(자동 재적용 없음). 다른 쿼리(`utm_*`)는 유지.
- 제출 페이로드(가짜 API): `sampleId`·`topic`·`brief.sample{id,title,topic,url}`가 샘플에 맞게 나감. 자동 제출 없음.
- 390px: 가로 넘침 없음, 2단계 입력 폼 정상.
- `node --test tests/v5/unit.test.mjs` 5개 통과. Firestore 에뮬레이터 `tests/v5/rules.test.mjs` 7개 통과(신규 1개는 규칙 변경 전에는 실패 확인).

## 리뷰 결과

| 지적 | 출처 | 판정 | 조치 |
|---|---|---|---|
| 접수 메일에 샘플 이름 대신 `outreach-hansol-pilates`가 나가고 작품 세트가 빈칸 (Apps Script `PARTS.samples`에 없음) | silent-failure-hunter, typescript-reviewer | CONFIRMED (`brief-sync.gs:213,262`) | 범위 밖(brief-sync). 보류, 아래 "남은 것" |
| 화면의 작품 세트가 `concept` 없어 항상 atelier | typescript-reviewer | CONFIRMED | 수정: 4개에 `concept` 추가 |
| 다른 쿼리(utm 등)가 사라짐 | typescript-reviewer | CONFIRMED | 수정: `sample`만 제거 |
| outreach.json 로딩 실패가 조용함 | silent-failure-hunter | CONFIRMED | 수정: `console.warn` 추가 (고객 화면 메시지는 요청서의 "오류 내지 않는다"에 따라 안 넣음) |
| 규칙 허용 목록과 등록부가 어긋나도 모름 | silent-failure-hunter | CONFIRMED | 수정: ID 동기 테스트 추가 |
| 링크를 다시 열면 이전 입력·접수 표시가 덮임 | 둘 다 | REJECTED | 링크 의도가 새 샘플로 시작이고, 비어 있을 때만 채우면 다른 링크의 이름이 남는 더 나쁜 결과가 된다 |
| 저장된 샘플 ID가 사라지면 step 3–5에서 샘플 미선택 | silent-failure-hunter | DEFERRED | 공개 샘플에도 있는 기존 동작 |
| `v5/v4.css`에 `@bk/...` 문자열이 들어가 다크 로고 CSS가 깨짐 | Gemini | REJECTED | 파일·diff에 해당 문자열 없음. 도구 오류로 인한 오판. 다크 로고는 브라우저로 확인함 |
| 결함 없음 | Codex | - | - |

## 남은 것 / 사용자가 할 일

1. **배포 승인**: 호스팅(`firebase deploy --only hosting`)과 Firestore 규칙(`--only firestore:rules`)을 함께 올려야 한다. 호스팅만 먼저 올리면 링크로 들어온 고객이 마지막 제출에서 "서버 저장에 실패했습니다"를 본다.
2. **접수 메일(Apps Script)**: 아웃리치 ID를 `PARTS.samples`에 추가하거나 `brief.sample.title`로 대체하도록 `brief-sync.gs`·`parts-snapshot.gs`를 고치고 clasp로 배포해야 메일에 샘플 이름이 제대로 나온다. 그 전에는 운영자·고객 메일에 ID 문자열이 보인다.
3. 아웃리치 샘플 쪽 버튼(Juno 작업): `https://getsite-my.web.app/?sample=<id>#start` 형식 그대로 쓰면 된다.
4. 한솔 필라테스는 라이트 고정 샘플이다. getsite-my 쪽에는 이 샘플만 따로 다크로 바꾸는 코드가 없고, 사이트 전체 테마는 방문자 설정을 따른다.
5. 새 아웃리치 샘플 추가 절차: `outreach.json`에 한 항목 + `firestore.rules`의 `sampleId` 목록에 ID 추가(동기 테스트가 빠뜨리면 실패시킨다) + 규칙 배포.
