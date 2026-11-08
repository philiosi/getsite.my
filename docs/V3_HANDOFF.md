# v3 인수인계 (2026-11-06, 계정 전환 대비)

## 완료
- v3 전체 구현: 셸, 장면 4종, 갤러리 11종, 주문 시트, order.html, backend(rules, brief-sync.gs). 커밋, 배포, 운영 규칙 변경은 하지 않음.
- 테스트: node --test tests/v3/unit.test.mjs (18/18), tests/v3/e2e.mjs (34/34). e2e 통과 후 닫는 페이지 머리글을 수정했으므로 다시 돌려야 함.

## 진행 상황 (갱신)
멀티 AI 리뷰 1회차. 결과 파일이 있으면 읽고, 없으면 다시 돌린다.
- /private/tmp/claude-501/-Users-philiosi-Library-CloudStorage-OneDrive----dev-getsite-my/3c3f5b87-5d68-4d9c-9a2e-cd95dff27f29/scratchpad/rev_codex.md, rev_gemini.md, rev_agy.md (브리프: review_brief.md, review_full.md)
- ECC typescript-reviewer, silent-failure-hunter, security-reviewer: 세션이 끊기면 결과가 사라지므로 재실행

## 남은 일
1. 리뷰 지적을 코드로 확인해 판정하고, critical/high 수정, 회귀 테스트 추가, 테스트 재실행 (최대 3회차)
2. docs/V3_REVIEW.md 작성, docs/V3_PLAN.md에 redesign 감사 반영 내용과 운영자 승인 조합 스크린샷 기준 추가
3. Hallmark slop test, tokens.css, .hallmark/log.json
4. 최종 보고

## 사용자에게 받아야 할 결정
- orders 공개 목록 노출(익명 list로 3건 조회됨) 규칙 변경 승인과 노출된 3건 처리
- Apps Script 배포, Muse 권한, /v3/ 배포
- 스튜디오 컨셉을 누리마당 Gaegu로 할지 (감사 제안, 미채택)
- 원본을 OneDrive 밖으로 옮길지

## 실행
- python3 -m http.server 5180 --bind 127.0.0.1 (저장소 루트) 후 http://127.0.0.1:5180/v3/
- e2e: PW_DIR=/private/tmp/claude-501/-Users-philiosi-Library-CloudStorage-OneDrive----dev-getsite-my/3c3f5b87-5d68-4d9c-9a2e-cd95dff27f29/scratchpad/pw node tests/v3/e2e.mjs
- 스크래치패드는 임시 폴더라 재부팅 시 사라질 수 있음

## 갱신 2026-11-06
리뷰 1회차와 수정 완료. 결과는 docs/V3_REVIEW.md. 단위 24/24, 브라우저 37/37.
리뷰 2회차와 수정 완료. 규칙은 에뮬레이터에서 5/5. 남은 것은 사용자 결정(V3_REVIEW.md '사용자가 할 일')뿐.
