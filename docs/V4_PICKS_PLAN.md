# v4 주문 구체화 계획: 섹션별 참고 화면 · 반영할 점 · 의견 (2026-11-07)

상태: 구현·테스트·리뷰 완료(배포 전). 결과와 판정은 `docs/V4_PICKS_REVIEW.md`.

## 0. 배경
실제 운영 접수 테스트(WO-2026-4780) 결과 메일·Drive brief는 정상 도착했으나, 내용이 "섹션 id 순서 + 갤러리 id + 샘플 id"뿐이라 제작에 쓸 수 없다는 운영자 피드백.
필요한 것: (1) 섹션마다 **어느 샘플의 어느 화면**을 참고로 골랐는지 (2) 갤러리 **구도와 작품 세트** (3) 그 화면에서 **무엇을 반영하고 싶은지** 섹션별 의견 (4) step 4에서 "고르신 구성이 이것 맞나요?" 시각 확인.

## 1. 확인된 사실 (코드 근거)
- step 3 미리보기는 `pickPreview`(v4/preview.js:11)가 "선택 샘플 → 같은 주제 → 아무 샘플" 순으로 **자동 1장**을 고른다. 고객은 바꿀 수 없고, 무엇을 보여줬는지 **어디에도 저장되지 않는다**.
- 실제 캡처 후보 수: hero 14, about 6, story 6, gallery 5(+라이브 엔진), featured 6, history 3(hansakim 중복 1), process 5, services 4, trust 5, faq 1, contact 7, booking 4, newsletter 0.
- 같은 캡처가 여러 섹션 후보로 쓰인다(`portfolio #works`=gallery·featured, `cafe #visit`=contact·booking 등, sections.json). → `sampleId:slug`만으로는 섹션을 특정할 수 없다.
- 주문 문서(order.js:23)와 brief v2에는 섹션 `{id,label}`만. 규칙(firestore.rules:41-69)은 키 목록 정확 일치·brief v2 고정, **운영 미배포**. v4 클라이언트도 **미배포** → 구 클라이언트 호환 부담 없음.
- gs 메일은 **고객 to + 운영자 BCC 한 통, 같은 본문**(brief-sync.gs:280). 운영자 전용 본문은 한 통 구조로 불가.
- gs v4 렌더의 참고 링크는 `text_`를 거치지 않는다(brief-sync.gs:128) + REF_RE가 백틱 허용 → brief.md 신뢰불가 펜스 탈출 가능(**기존 결함**).
- 주문 페이지(v3/order/page.js:31-80)에 결제 후 섹션별 요청(`sectionRequests`, 섹션 id 키) 입력이 이미 있다.
- 완료 화면의 "운영자에게 메일로 보내기"는 요약 전체를 `mailto:` 본문에 넣는다(panels.js) → 의견이 붙으면 URL 길이 한도 초과.

## 2. 옵션
| 옵션 | 내용 | 판단 |
|---|---|---|
| A | 자동 선택 유지, 보여준 화면만 기록 | 1단계로 포함(운영자 요구 1을 즉시 해결) |
| **B** | A + 섹션마다 참고 화면 고르기 + 반영할 점 칩 + 의견(선택) + step 4 확인 카드 | **추천** |
| C | B + 섹션별 이미지 업로드 | 제외(Storage 결제 플랜 필요, Drive 폴더 안내로 대체 유지) |

## 3. 최종 설계
### 3.1 데이터 계약
- **parts 카탈로그** `v4/data/parts.json` (빌드 스크립트 `scripts/v4-parts.mjs`가 sections.json × manifest.json으로 생성):
  `{ version, bySection: { <sectionId>: [ { ref:'<sampleId>:<slug>', sampleId, slug, file, thumb, w, h, anchor } ] } }`
  - 섹션 안에서만 유일. 검증은 항상 **(sectionId, ref) 쌍**. 중복 후보 제거(hansakim history). hero는 manifest에 thumb가 없으므로 빌드에서 640 썸네일 생성 또는 hero 전용 분기.
  - 같은 스크립트가 **gs 스냅숏** `v3/backend/parts-snapshot.gs`(+ `deploy/apps-script/` 사본)를 동시에 생성. 단위 테스트가 두 파일 일치를 검사. 기존 ref의 의미는 바꾸지 않는다(캡처 교체 시 version 증가).
- **state.picks** `{ <sectionId(gallery 제외)>: { ref: '<sampleId>:<slug>' | 'new', by: 'auto'|'user', keep: ['layout'|'mood'|'content'], note: ≤300 } }`
  - `auto`를 제출 때 해석하지 않는다. **화면에 그린 순간의 실제 ref를 상태에 고정**(by:'auto'). step 4와 제출은 같은 값을 쓴다.
  - 해석 함수 `resolvePart(sectionId, sample, parts, samples)`는 순수 모듈 `v4/parts.js`로 분리해 미리보기·buildOrder가 공유.
  - 샘플 변경: by:'auto'이고 keep·note가 비어 있으면 새 샘플로 다시 해석. keep/note가 있으면 by:'user'로 굳혀 고객이 의견을 단 화면을 유지. by:'user'는 유지.
  - 캡처가 없으면(newsletter 등) `ref:'new'`. `new`이면 keep은 항상 `[]`.
- **갤러리는 별도 타입**: `state.gallery`(요청 구도, 기존) + `state.galleryNote` ≤300. 주문에는 `galleryNote`만 추가하고, 실제로 본 구도(auto→focus)와 작품 세트(concept)는 gs가 sampleId에서 직접 구한다(클라이언트 값 불신).
- **normalize()**: picks 키는 SECTION_IDS, (section, ref) 쌍이 parts에 있어야 함, 아니면 해당 섹션을 다시 auto 해석. keep 화이트리스트·중복 제거, note 정리(cleanText)·300자.

### 3.2 주문 문서 (schema 'v4' 유지, brief 'getsite.brief.v2' 유지)
- 최상위 추가: `picks`(map), `galleryNote`(string ≤300), `partsVersion`(string ≤20).
- **brief에는 의견·URL을 넣지 않는다.** brief.sections는 지금처럼 `{id,label}`. 해석·표시는 gs와 주문 페이지가 `picks` + 서버 스냅숏으로만 한다(중복 저장·클라이언트 URL 신뢰 제거).
- buildOrder: `picks`를 `state.sections`(gallery 제외)로 걸러 키 집합 일치 보장. stateFromDoc도 picks·galleryNote 복원(타임아웃 복구 경로의 요약 정확성).

### 3.3 규칙 (firestore.rules validV4)
- keys 목록에 `picks`,`galleryNote`,`partsVersion` 추가(hasAll·hasOnly 모두).
- `picks.keys().toSet() == d.sections.toSet().difference(['gallery'].toSet())`
- 13개 섹션 id 각각: `!(id in picks) || validPick(picks[id])`. validPick = `p is map && p.keys().hasOnly(['ref','by','keep','note']) && p.ref is string && p.ref.matches('^([a-z0-9-]{1,40}:[A-Za-z0-9_-]{1,40}|new)$') && p.by in ['auto','user'] && p.keep is list && p.keep.size()<=3 && p.keep.toSet().size()==p.keep.size() && p.keep.toSet().hasOnly(['layout','mood','content']) && p.note is string && p.note.size()<=300`.
- 기존 결함 동시 수정: brief.sections 원소·sampleScope 값 길이 제한, REF 정규식에서 백틱·`<>` 제외.
- 에뮬레이터로 표현식 한도 실측(validV4 전체 + 13 × validPick).
- 규칙은 (section, ref) 존재까지 검사하지 않는다 → gs가 검사.

### 3.4 Apps Script (brief-sync.gs)
- `renderBriefV4_`: picks가 있으면 섹션별 블록.
  - 표: 번호 · 섹션 · 참고 샘플(스냅숏 title) · 참고 화면(스냅숏으로 만든 캡처 URL·샘플 앵커 URL) · 반영할 점. **의견은 표에 넣지 않는다.**
  - 의견: 섹션별 별도 신뢰불가 펜스 블록, 줄바꿈 보존 정리 함수(`noteText_`: 제어·bidi 제거, 백틱 치환).
  - 갤러리: 요청 구도, 미리보기에서 본 구도, 작품 세트(sampleId에서 파생), 의견.
  - (section, ref)가 스냅숏에 없으면 그 섹션만 "확인 필요(ref)"로 표시하고 brief는 계속 생성(주문 전체 invalid 금지). 운영자 알림 1회.
  - picks 없는 기존 v4 문서는 현행 렌더(하위 호환).
  - 참고 링크도 `text_` 경유(기존 결함 수정).
- brief.json에 같은 구조(서버 해석값) 기록.
- **메일은 한 통 구조 유지.** 본문에 서버 화이트리스트 문자열만으로 만든 "고르신 구성" 목록(섹션 → 샘플명·화면)과 "섹션별 의견 N건(서버 집계)"만 추가. 고객 의견 원문은 메일에 넣지 않는다(타인 이메일 피싱 방지). 운영자는 Drive brief.md에서 의견 확인.
- **캡처 이미지 Drive 복사는 하지 않는다**(1차). 공개 URL 링크로 충분. 필요해지면 별도 상태(`refsStatus`)·별도 단계·실패 무시로 추가.

### 3.5 화면
- **step 3 (가볍게)**: 타일 머리에 "참고: 화가 윤서현의 소개 화면 · 다른 화면 고르기 (6)" 버튼. 누른 타일만 가로 썸네일 트랙(64px, scroll-snap, `role=radiogroup`, "새로 구성" 포함) 펼침. hero는 선택 샘플·같은 주제 우선 최대 6개 + "더 보기". 상단 안내 "추천 화면이 골라져 있습니다. 바꾸고 싶은 섹션만 고르세요". 타일 갱신은 `update(pick)`로 img·aria만 교체(전체 재생성 금지).
- **step 4 (확인과 의견)**: "구성 순서" 상자를 섹션 카드 목록으로 교체.
  - 카드: 순서 · 섹션명 · 썸네일 · "○○의 △△ 화면 참고"(또는 "새로 구성") · 반영할 점 칩 3개(new면 숨김) · 접힌 "의견 추가"(textarea, placeholder 예시) · "고치기"(→ `goToSection(id)`: step 3 표시 후 해당 타일 펼침·스크롤·포커스).
  - 갤러리 카드: 구도명 · "미리보기는 집중형 예시"(auto일 때) · 작품 세트 · 의견.
  - 상단 문구 "고르신 구성이 맞는지 확인해 주세요. 의견은 선택입니다".
  - 의견은 blur 또는 400ms debounce 후 1회 반영(IME·포커스 유지, 접수 분리 남발 방지). 접수 완료 후 읽기 전용.
- **summaryText**: 섹션별 줄(참고 화면·반영할 점·의견). 복사·다운로드는 전체. `mailto:`는 의견 제외 짧은 요약 + 의뢰 코드(길이 한도). 저장 요약 한도 4000→8000.
- **주문 페이지(v3/order/page.js)**: v4 recap에 섹션별 참고(v4/data/parts.json fetch) 표시. 결제 후 섹션 요청 입력의 초기 안내에 picks.note 노출.

## 4. 리뷰 판정
| 지적 | 출처 | 판정 | 반영 |
|---|---|---|---|
| `sampleId:slug`가 섹션 간 중복 | architect, codex | 채택 | picks는 섹션 키 map, 검증은 (section, ref) 쌍 |
| auto를 제출 때 해석하면 본 화면과 기록이 어긋남 | codex, planner, architect | 채택 | 그린 순간 ref 고정(by:auto), 공유 순수 함수 |
| 샘플 변경 시 의견이 다른 화면에 붙음 | planner | 채택 | 의견·칩이 있으면 by:user로 굳힘 |
| 갤러리는 캡처 후보가 아님, auto=focus 표시 | codex, planner, agy | 채택 | 별도 타입, 표시값은 gs가 파생 |
| brief에 의견·이미지 URL을 넣으면 무검증·SSRF·중복 | security, architect | 채택 | brief 불변, 최상위 picks만, URL은 서버가 스냅숏으로 조립 |
| 규칙 13섹션 검증 누락 패턴, keep 중복 | security | 채택 | `!(id in picks) \|\| validPick`, toSet 크기 비교 |
| 규칙에서 집합 비교 불가 | gemini | **기각** | Firestore 규칙은 `toSet()`·`difference()`·set `==` 지원(architect 확인). 에뮬레이터로 확인 |
| 'v4.1' schema는 기존 분기에서 막힘 | architect, codex | 채택 | schema 'v4' 유지 |
| 규칙·클라이언트 배포 순서 | codex, architect | 채택 | gs → 규칙 → 클라이언트. 현재 둘 다 미배포라 이번 릴리스에 함께 |
| 알 수 없는 ref 하나로 주문 전체 invalid | architect, security | 채택 | 섹션만 "확인 필요" |
| 이미지 Drive 복사가 6분 한도·실패 전파 | 전원 | 채택 | 1차 제외, 링크만 |
| 메일 한 통에 운영자 전용 본문 불가 | codex, security | 채택 | 한 통 유지, 화이트리스트 목록 + 의견 건수, 의견 원문은 Drive |
| 의견을 md 표에 넣으면 깨짐·탈출 | security, codex | 채택 | 표 밖 펜스 블록, 줄바꿈 보존 정리 |
| 참고 링크 백틱 펜스 탈출(기존) | security | 채택(코드 확인: gs:128) | text_ 경유 + 정규식 수정 |
| gs 스냅숏 수동 이중 관리 | agy, gemini, codex | 채택 | 빌드 스크립트 단일 생성 + 일치 테스트 + version |
| gs가 parts.json을 런타임 fetch | gemini | 기각 | 배포 전 404·호스팅 장애에 brief가 묶임. 생성 스냅숏으로 충분 |
| 375px 과부하(13 × 띠·칩·입력), hero 14개 | 전원 | 채택 | step 3는 접힌 썸네일만, 칩·의견은 step 4 카드에서 접힘 |
| 의견 입력마다 edit()로 접수 분리·IME 깨짐 | planner | 채택 | blur/debounce, 접수 후 읽기 전용 |
| new일 때 keep 칩 모순 | gemini, agy | 채택 | 숨김 + keep=[] 강제 |
| stateFromDoc picks 미복원, 요약 4000자 | architect, codex, planner | 채택 | 복원 + 8000 |
| mailto 길이 한도 | agy | 채택 | mailto는 의견 제외 짧은 요약 |
| "고치기" 대상 이동 계약 | codex | 채택 | goToSection(id) |
| 주문 페이지 결제 후 요청과의 관계 | agy | 채택(파일명은 page.js로 정정) | picks.note를 초기 안내로 |
| 주문 페이지 접수 시각 `doc.ts` | agy | 보류 | 인용 파일(v3/order/order.js)이 없음. 구현 때 page.js에서 확인 |
| 타인 이메일로 메일 발송(소유 확인 없음) | security | 보류 | 기존 문제. 고정 템플릿·24h 제한으로 완화, App Check는 운영 후 |

## 5. 단계와 분담 (파일 소유가 겹치지 않게)
| 단계 | 내용 | 담당 | 파일 |
|---|---|---|---|
| 1 계약 | parts 빌드(json+gs 스냅숏), parts.js resolvePart, store picks/normalize, buildOrder·stateFromDoc, 기존 e2e 키 목록 수정. **UI 변경 없이 자동 참고 화면이 주문에 들어감(옵션 A 완성)** | Claude | scripts/v4-parts.mjs, v4/data/parts.json, v4/parts.js, v4/store.js, v4/order.js(buildOrder·stateFromDoc) |
| 2 백엔드 | 규칙 validPick·기존 결함, gs 렌더·메일 목록·하위 호환, rules/backend 테스트 | Codex | firestore.rules, brief-sync.gs(+deploy 사본), tests/v3/rules.test.mjs, tests/v4/backend.test.mjs |
| 3 step 3 | 접힌 썸네일 트랙, 타일 update, 샘플 변경 처리, goToSection | Claude | v4/preview.js, v4/process.js, v4.css(step3 영역) |
| 4 step 4 | 섹션 카드·칩·의견(debounce·잠금)·고치기, summaryText·mailto | Argon | v4/panels.js(renderPanel4/5), v4/summary.js(order.js에서 summaryText 분리), v4.css(step4 영역) |
| 5 주문 페이지 | v4 recap, 결제 후 요청 초기 안내 | Argon | v3/order/page.js |
| 6 검증 | 아래 테스트 + 실제 운영 접수 1건으로 brief.md·메일 확인 | Claude | tests/v4/*.mjs |

2는 1의 계약이 확정되면 3과 병렬. 4·5는 1·3 뒤. 모든 산출물은 Claude가 검토하고, 끝나면 multi-AI 코드 리뷰 1회.

## 6. 성공 기준 (측정 방법)
- unit: parts 빌드 결과와 gs 스냅숏 일치, 중복 후보 0, resolvePart가 pickPreview와 같은 결과(14 샘플 × 12 섹션 전수), normalize가 잘못된 ref를 auto로 되돌림, new면 keep=[].
- rules(에뮬레이터): 정상 picks 허용, 키 집합 불일치·잘못된 ref 형식·keep 중복/이상값·note 301자·gallery 키 포함 거부, 표현식 한도 내.
- backend: picks 있는 문서의 brief.md에 섹션별 샘플명·화면 링크·반영할 점·의견 블록, 알 수 없는 ref는 해당 섹션만 "확인 필요", picks 없는 문서는 현행 출력, **고객 메일 본문에 의견 원문 없음**, 백틱 포함 링크·의견이 펜스를 깨지 않음.
- e2e: 썸네일 고르기→타일 이미지 변경, 샘플 변경 시 auto 갱신·user 유지·의견 단 auto는 고정, step 4 카드 내용=step 3 선택, 의견 입력 중 포커스 유지, 고치기→해당 타일 포커스, 섹션 뺐다 넣기 후 picks 키=sections, 제출 문서 picks, 타임아웃 복구 요약에 의견, 접수 후 의견 잠김, 320/375/414/768/1440 가로 스크롤 없음.
- 실제 접수 1건: Drive brief.md에 "소개 = ○○의 △△ 화면, 반영: 구성·분위기, 의견: …"이 보이고, 메일에 고르신 구성 목록이 보임(사용자 확인).

## 7. 롤백
v4·규칙 모두 미배포라 운영 영향 없음. 파일 단위 백업(저장소가 git 아님) 후 작업. gs는 clasp 버전 기록으로 되돌릴 수 있고, picks 없는 문서 렌더는 그대로 남아 있어 클라이언트만 되돌려도 동작.

## 8. 사용자 결정 / 할 일
1. 이 계획(옵션 B, 의견은 step 4) 승인.
2. 메일 정책: 의견 원문은 메일에 넣지 않고 Drive brief에서만 보기(추천) vs 운영자용 두 번째 메일(상태기계·쿼터 2배).
3. 구현 후 `clasp push`(gs 갱신)와 실제 접수 1건 확인.
4. 기존 결정 대기: v4 미리보기 채널 배포, 규칙 배포, 테스트 주문 2건 정리.

```json
{
  "plan_summary": "v4 주문에 섹션별 참고 화면(샘플×화면)·반영할 점·의견과 갤러리 구도/작품 세트를 담고 step 4에서 시각 확인",
  "analysis": {
    "architecture": {"score": 7.5, "strengths": ["brief 불변·최상위 picks로 신뢰 경계 단순", "서버 스냅숏 재해석", "하위 호환"], "weaknesses": ["parts 카탈로그 버전 관리 필요", "규칙 표현식 한도 미측정"]},
    "implementation": {"score": 7.0, "difficulty": "중간", "timeline": "미측정", "blockers": ["규칙 에뮬레이터 실측", "step 3 타일 갱신 방식 변경"]},
    "cost_efficiency": {"score": 9.0, "monthly_cost": "추가 인프라 없음(이미지 복사 제외로 UrlFetch·Drive 증가 없음)", "resource": "낮음"},
    "risk_analysis": {"score": 7.0, "critical_risks": ["auto 해석 불일치", "의견 피싱·펜스 탈출"], "mitigation": ["그린 순간 고정", "메일 원문 제외·noteText_·표 밖 블록"]},
    "integration": {"score": 7.0, "compatibility": "Good(v4·규칙 미배포)", "issues": ["gs 스냅숏 동기화", "주문 페이지 v4 recap"]}
  },
  "reviewers": {"codex": "ok", "gemini": "ok", "agy": "ok(일부 파일 인용 오류)", "ecc": ["architect", "planner", "security-reviewer"]},
  "confidence_score": 0.8
}
```
