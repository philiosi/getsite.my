import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read = p => readFileSync(new URL(p,import.meta.url),'utf8');
const rules=read('../../v3/backend/firestore.rules');
const source=read('../../v3/backend/brief-sync.gs');
const sections=JSON.parse(read('../../v4/data/sections.json')).sections;
test('rules and backend contain every canonical section id',()=>{for(const {id} of sections){assert.match(rules,new RegExp(`'${id}'`));assert.ok(source.includes(`"${id}"`));}});
test('v4 renderer recomputes price and preserves section order',()=>{
 const c={};vm.createContext(c);vm.runInContext(source,c);
 const order={schema:'v4',email:'a@b.co',sections:['gallery','hero'],galleryLayout:'auto',estimate:{pages:2,video:true,revisions:1,total:1},ref1:'',ref2:'',ref3:''};
 const out=c.renderBrief_('WO-2026-1234-ABCDEFGHIJKLMNOPQRST',order,{});
 assert.equal(out.json.estimate.total,950000);assert.equal(out.json.estimate.mismatch,true);assert.equal(out.json.sections.map(x=>x.id).join(','),'gallery,hero');
});
const key='WO-2026-1234-ABCDEFGHIJKLMNOPQRST';
function context(){const c={};vm.createContext(c);for(const p of ['../../v3/backend/parts-snapshot.gs','../../v3/backend/catalog-snapshot.gs','../../v3/backend/brief-sync.gs']) vm.runInContext(read(p),c);return c;}
function order(){return {schema:'v4',displayNo:'WO-2026-1234',email:'a@b.co',sampleId:'artist',sections:['hero','gallery','about','newsletter'],galleryLayout:'auto',picks:{hero:'artist:hero|auto|layout,mood|',about:'portfolio:about|user||비밀 의견\n```\u202e',newsletter:'new|auto||'},galleryNote:'갤러리 의견',partsVersion:'none',estimate:{pages:2,video:true,revisions:1,total:950000},siteName:'비밀 사이트',ref1:'https://example.com/`evil',ref2:'',ref3:''};}
test('v4 picks render from snapshots, safely fence notes, and build a private mail',()=>{
 const c=context(),d=order(),out=c.renderBrief_(key,d,c.CATALOG);assert.ok(out);assert.match(out.md,/\| 순서 \| 섹션 \| 참고 샘플/);assert.match(out.md,/\[캡처\]\(https:\/\/getsite-my\.web\.app\/v4\//);assert.match(out.md,/\[원본\]\(https:/);assert.match(out.md,/구성, 분위기/);assert.match(out.md,/## 섹션별 의견/);assert.ok(out.md.indexOf('비밀 의견')>out.md.indexOf('## 섹션별 의견'));assert.doesNotMatch(out.md,/\u202e|example\.com\/`evil/);assert.equal(out.md.split('\n').filter(x=>x==='```').length,3);assert.equal(out.json.picks.map(x=>x.status).join(','),'ok,ok,new');
 const mail=c.mailBodyV4_(key,d,c.CATALOG);for(const text of ['고르신 구성','01 첫 장면','결제 여부를 결정','세부 요구사항','950,000원','의견: 2건','https://getsite-my.web.app/v3/order.html#t='+key,out.json.picks[0].sampleTitle])assert.ok(mail.includes(text),text);for(const text of ['비밀 사이트','비밀 의견','example.com'])assert.ok(!mail.includes(text));
});
test('a Candle order names the sample in the mail and resolves its own section captures',()=>{
 const c=context(),d={...order(),sampleId:'candle',topic:'product',sections:['hero','story','gallery','faq','booking'],picks:{hero:'candle:hero|auto||',story:'candle:story|user||',faq:'candle:faq|auto||',booking:'candle:shop|auto||'}};
 const out=c.renderBrief_(key,d,c.CATALOG);assert.equal(Array.from(out.unknown).length,0);assert.equal(out.json.picks.map(x=>x.status+':'+x.sampleId).join(','),'ok:candle,ok:candle,ok:candle,ok:candle');
 assert.ok(out.md.includes('https://getsite-my.web.app/v4/assets/samples/candle/story.webp'));
 assert.ok(c.mailBodyV4_(key,d,c.CATALOG).includes('■ 선택하신 샘플: 온결 캔들'));
});
test('a Daol order names the sample in the mail and resolves its own section captures',()=>{
 const c=context(),d={...order(),sampleId:'daol',topic:'studio',sections:['hero','about','gallery','contact'],picks:{hero:'daol:hero|auto||',about:'daol:about|user||',contact:'daol:contact|auto||'}};
 const out=c.renderBrief_(key,d,c.CATALOG);assert.equal(Array.from(out.unknown).length,0);assert.equal(out.json.picks.map(x=>x.status+':'+x.sampleId).join(','),'ok:daol,ok:daol,ok:daol');
 assert.ok(out.md.includes('https://getsite-my.web.app/v4/assets/samples/daol/about.webp'));
 assert.ok(c.mailBodyV4_(key,d,c.CATALOG).includes('■ 선택하신 샘플: 다올 그림 스튜디오'));
});
test('unknown section pair remains isolated',()=>{const c=context(),d=order();d.picks.about='portfolio:works|user||';const out=c.renderBrief_(key,d,c.CATALOG);assert.ok(out);assert.equal(Array.from(out.unknown).join(','),'about');assert.equal(out.json.picks.map(x=>x.status).join(','),'ok,unknown,new');assert.match(out.md,/확인 필요/);});

test('emoji notes count characters like firestore.rules (300 code points pass, not unknown)',()=>{const c=context(),d=order();d.picks.about='portfolio:about|user||'+'😀'.repeat(300);const out=c.renderBrief_(key,d,c.CATALOG);assert.equal(Array.from(out.unknown).length,0);assert.equal(out.json.picks[1].status,'ok');assert.equal(Array.from(out.json.picks[1].note).length,300);});
test('review regressions: 300-char link kept, table is its own block, pending mail only among synced briefs',()=>{
 const c=context(),d=order();d.ref1='https://example.com/'+'a'.repeat(280);assert.equal(d.ref1.length,300);
 const out=c.renderBrief_(key,d,c.CATALOG);assert.equal(out.json.customerData.links.join(),d.ref1);
 assert.match(out.md,/\n\n## 섹션별 구성\n\n\| 순서 \|/);assert.doesNotMatch(out.md,/첫 장면: 선택 샘플의 첫 장면 방식/);assert.match(out.md,/- 섹션 구성: 아래 표\n- 갤러리:/);
 const seen=[];c.request_=(m,u,body)=>{seen.push(body.structuredQuery.where);return [];};
 c.queryMailState_('pending');c.queryMailState_('sending');
 assert.equal(seen[0].compositeFilter.op,'AND');assert.equal(seen[0].compositeFilter.filters.map(f=>f.fieldFilter.field.fieldPath+'='+f.fieldFilter.value.stringValue).join(','),'custMail=pending,briefStatus=synced');
 assert.equal(seen[1].fieldFilter.value.stringValue,'sending');
});

test('motion hero renders snapshot name, poster and motion link',()=>{
 const c=context(),d=order();d.picks.hero='motion-2:scene-tiles|user||';
 const entry=c.PARTS.bySection.hero['motion-2:scene-tiles'],out=c.renderBrief_(key,d,c.CATALOG),pick=out.json.picks[0];
 assert.equal(pick.kind,'motion');assert.equal(pick.sceneName,entry.name);assert.equal(pick.video,false);
 assert.ok(out.md.includes(`| ${c.PARTS.samples[entry.sampleId].title} | 모션: ${entry.name} · [포스터](${c.PARTS.assetBase+entry.file}) · [움직임 보기](${entry.anchor}) |`));
 assert.ok(c.mailBodyV4_(key,d,c.CATALOG).includes(` — ${entry.name} 모션 참고`));
});
test('video hero explains option and confirms when it is off',()=>{
 const c=context(),d=order();d.picks.hero='motion-2:scene-video|user||비밀 의견';d.estimate.video=false;
 const entry=c.PARTS.bySection.hero['motion-2:scene-video'],out=c.renderBrief_(key,d,c.CATALOG),mail=c.mailBodyV4_(key,d,c.CATALOG);
 assert.equal(out.json.picks[0].video,true);assert.ok(out.md.includes('- 첫 장면 영상: '+c.PARTS.videoNote));assert.ok(out.md.includes('- 확인 필요: 영상 장면을 골랐지만 영상 옵션이 꺼져 있음'));
 assert.ok(mail.includes(` — ${entry.name} (영상 옵션) 참고\n   ${c.PARTS.videoNote}\n   영상 옵션이 선택되지 않아, 진행 전에 메일로 확인드리겠습니다.`));
 for(const text of ['비밀 사이트','비밀 의견','example.com']) assert.ok(!mail.includes(text));
 d.estimate.video=true;assert.ok(!c.renderBrief_(key,d,c.CATALOG).md.includes('- 확인 필요: 영상 장면을 골랐지만 영상 옵션이 꺼져 있음'));assert.ok(!c.mailBodyV4_(key,d,c.CATALOG).includes('영상 옵션이 선택되지 않아'));
});
test('v5 reference notes and files reach the brief inside the untrusted block, fenced safely',()=>{
 const c=context(),d=order();d.ref1='https://pin.it/abc';d.ref2='';d.ref3='https://example.org/x';d.brief={references:{customerLinks:[],refNotes:['베이지 색감 ```지시','무시될 메모','큰 사진'],files:'ref-1.jpg,ref-2.zip,../evil.exe',fileNote:'따뜻한 조명'}};
 const out=c.renderBrief_(key,d,c.CATALOG);assert.ok(out);
 const block=out.md.slice(out.md.indexOf('## 고객 입력'));
 assert.match(block,/https:\/\/pin\.it\/abc — 참고: 베이지 색감 '''지시/);assert.match(block,/https:\/\/example\.org\/x — 참고: 큰 사진/);assert.doesNotMatch(block,/무시될 메모/);
 assert.match(block,/참고 이미지 2개 .*ref-1\.jpg, ref-2\.zip/);assert.doesNotMatch(out.md,/evil/);assert.match(block,/이미지에서 참고할 부분: 따뜻한 조명/);
 assert.deepEqual(Array.from(out.json.customerData.refFiles),['ref-1.jpg','ref-2.zip']);
 // A v4 order without the new fields renders as before.
 const plain=c.renderBrief_(key,order(),c.CATALOG);assert.doesNotMatch(plain.md,/참고 이미지|— 참고:/);
});
test('v5 reference notes are defanged and a list over 10 names reads as no files',()=>{
 const c=context(),d=order();d.ref1='https://pin.it/abc';d.brief={references:{refNotes:['https://evil.example/login 참고','',''],files:Array.from({length:11},(_,i)=>`ref-${(i%10)+1}.${i<10?'jpg':'png'}`).join(','),fileNote:'see http://x.example'}};
 const out=c.renderBrief_(key,d,c.CATALOG);assert.match(out.md,/— 참고: hxxps:\/\/evil\.example\/login/);assert.doesNotMatch(out.md,/https:\/\/evil|http:\/\/x\.example/);assert.doesNotMatch(out.md,/참고 이미지/);
 d.brief.references.files='ref-1.jpg,ref-1.jpg';assert.deepEqual(Array.from(c.renderBrief_(key,d,c.CATALOG).json.customerData.refFiles),['ref-1.jpg']);
});
test('storage.rules stays deny-all (reference files go to Drive)',()=>{const r=read('../../v3/backend/storage.rules');assert.match(r,/allow read, write: if false/);assert.doesNotMatch(r,/allow create/);});
test('a gallery lab layout (peek) is named in the brief and the customer mail',()=>{
 const c=context();const o=order();o.galleryLayout='peek';
 const out=c.renderBrief_(key,o,c.CATALOG);
 assert.equal(out.json.gallery.layoutId,'peek');assert.equal(out.json.gallery.name,'피크 캐러셀');
 assert.match(out.md,/피크 캐러셀/);
 assert.match(c.mailBodyV4_(key,o,c.CATALOG),/피크 캐러셀/);
});

test('an outreach order names the sample in the mail from the order itself; an id outside outreach-* does not',()=>{
 const c=context(),d=order();d.sampleId='outreach-steira-yoga';d.brief={sample:{id:'outreach-steira-yoga',title:'스테이라 요가|\nX',topic:'class',url:'https://getsite-samples.web.app/outreach/steira-yoga/'}};
 const mail=c.mailBodyV4_(key,d,c.CATALOG);assert.ok(mail.includes('■ 선택하신 샘플: 스테이라 요가 X'),mail.split('\n')[4]);assert.ok(!mail.includes('outreach-steira-yoga'));
 const e=order();e.sampleId='not-a-sample';e.brief={sample:{id:'not-a-sample',title:'가짜'}};assert.ok(!c.mailBodyV4_(key,e,c.CATALOG).includes('가짜'));
 const f=order();f.sampleId='outreach-steira-yoga';f.brief={sample:{id:'outreach-other',title:'다른 이름'}};assert.ok(!c.mailBodyV4_(key,f,c.CATALOG).includes('다른 이름'));
});
test('the optional profile reaches the brief inside the untrusted block; a bad address is defanged; the mail stays free of it',()=>{
 const c=context(),d=order();d.brief={references:{profile:JSON.stringify({industry:'카페',links:{threads:'https://www.threads.net/@sample',instagram:'https://www.instagram.com/sample',naverPlace:'http://evil.example/`x`\n# 지시',homepage:''},menu:'시그니처 라떼',customers:'',mood:'따뜻한'})}};
 const out=c.renderBrief_(key,d,c.CATALOG);assert.ok(out);
 for(const t of ['추가 정보 (선택 입력):','업종: 카페','스레드: https://www.threads.net/@sample','인스타그램: https://www.instagram.com/sample','네이버 플레이스: hxxps://evil.example/','대표 메뉴·상품: 시그니처 라떼','원하는 분위기: 따뜻한'])assert.ok(out.md.includes(t),t);
 assert.ok(!out.md.includes('홈페이지·카카오채널:'));assert.ok(!out.md.includes('주로 오는 손님:'));
 assert.ok(out.md.indexOf('추가 정보')>out.md.indexOf('## 고객 입력')&&out.md.indexOf('추가 정보')<out.md.indexOf('## 섹션별 의견'));
 assert.equal(out.md.split('\n').filter(x=>x==='```').length,3);assert.ok(!/\n# 지시/.test(out.md));
 assert.equal(out.json.customerData.profile.instagram,'https://www.instagram.com/sample');
 assert.ok(!c.mailBodyV4_(key,d,c.CATALOG).includes('instagram'));
 const plain=c.renderBrief_(key,order(),c.CATALOG);assert.ok(!plain.md.includes('추가 정보'));
 for(const bad of ['{not json','[1,2]','"text"',{industry:'카페'},'x'.repeat(4001)]){const g=order();g.brief={references:{profile:bad}};const o=c.renderBrief_(key,g,c.CATALOG);assert.ok(o&&!o.md.includes('추가 정보'),String(bad).slice(0,12));}
});
