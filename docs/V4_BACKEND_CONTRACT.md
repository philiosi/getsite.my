# v4 주문 백엔드 계약

문서 경로는 `orders/WO-YYYY-NNNN-<영숫자 20자>`이며 `displayNo`는 앞의 `WO-YYYY-NNNN`과 같아야 한다. 키는 주문 조회의 비밀 자격증명이므로 고객에게 주문 링크를 보관하도록 안내한다. 생성은 `setDoc`과 서버 타임스탬프를 사용한다. 같은 키로 재시도할 때 쓰기가 거부되면 해당 키를 `getDoc`하여 존재 여부를 확인한다. 목록 조회는 허용되지 않는다.

생성 시 필드는 다음 전부이며 추가 필드는 허용되지 않는다.

```js
{
 schema:'v4', displayNo, catalogVersion, email, siteName, oneLiner, name,
 topic, sampleId, sections, galleryLayout, ref1, ref2, ref3, materials,
 estimate:{pages,video,revisions,total},
 status:'샘플 제작 대기', briefStatus:'pending', opMail:'pending', custMail:'pending',
 driveFolderUrl:'', createdAt:serverTimestamp(),
 brief:{schema:'getsite.brief.v2',catalogVersion,order:{displayNo,createdAt},
   delivery:{email},sample:{id,title,topic,url},sections:[{id,label}],
   gallery:{layoutId,name},references:{customerLinks:[]},sampleScope:{},
   customerText:{siteName,oneLiner,name}}
}
```

- `catalogVersion`은 문자열 최대 40자, `email`은 최대 120자의 ASCII 이메일, `siteName` 최대 80자, `oneLiner` 최대 200자, `name` 최대 40자이며 빈 문자열도 가능하다.
- `topic`은 `artist`, `product`, `studio`, `class`, `place`, `motion` 중 하나. `sampleId`는 `v4/data/samples.json`의 14개 ID 중 하나다.
- `sections`는 `v4/data/sections.json`의 13개 ID 중 중복 없는 1~13개이며 고객이 선택한 순서를 유지한다. `galleryLayout`은 `auto`, `focus`, `film`, `masonry`, `index`, `grid`, `strip`, `flow`, `timeline`, `coverflow`, `stack`, `museum` 중 하나다.
- 각 `ref1`~`ref3`은 빈 문자열 또는 `^https://[^\\s]{4,290}$`에 맞는 문자열이다. `materials`는 `have` 또는 `none`이다.
- `estimate.pages`와 `estimate.revisions`는 0~20 정수, `video`는 불리언, `total`은 정수다. 서버는 500000 + pages × 100000 + video × 200000 + revisions × 50000으로 재계산하고 불일치를 표시한다.
- `driveFolderUrl`은 생성 시 항상 빈 문자열이다. 폴더는 서버(Apps Script)가 만들고 그 링크를 채우며, 클라이언트 값은 쓰지 않는다. 브라우저는 폴더 생성 엔드포인트를 호출하지 않는다(비밀 키가 쿼리스트링으로 나가지 않도록). `email`은 소문자여야 한다.
- `brief`의 최상위 키는 위에 표시된 10개만 허용한다. `customerText`·`sample`·`gallery`·`references`의 값 길이와 개수도 규칙이 검사한다. 브리프를 제출하되 실제 제작 문서는 검증된 주문 필드와 서버 카탈로그로 재구성한다. `brief.sections`에도 선택 순서와 라벨을 담는다.
- 결제 후 고객은 `sectionRequests`(13개 섹션 ID를 키로 하는 최대 2000자 문자열), `sectionStatus:'pending'`, `detailSubmittedAt:serverTimestamp()`만 업데이트할 수 있다. 그 밖의 필드는 변경할 수 없다.

메일은 브리프 동기화 후 고객에게 한 통을 보내고 운영자를 BCC한다. 쿼터 부족 시 `mailNote:'skipped-quota'`로 보류하며 `sending` 상태는 자동 재발송하지 않는다. Apps Script와 Firestore 규칙은 별도 배포 및 트리거 설치가 필요하다.
