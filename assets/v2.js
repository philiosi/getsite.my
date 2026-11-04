/* v2 presentation layer. Existing order/lookup integrations remain in v2.html. */
(function () {
'use strict';
const $ = id => document.getElementById(id);
const make = (tag, html, cls) => {const el=document.createElement(tag);el.innerHTML=html;if(cls)el.className=cls;return el;};
const oldHero=document.querySelector('.hero-scroll');
const cards=[...document.querySelectorAll('[data-sample-card]')];
const byId=id=>cards.find(c=>c.querySelector('[data-get]').dataset.get===id);
const shots=['artist','soap','arthada'].map(id=>byId(id).querySelector('img').src);
const hero=make('header',`<div class="v2-intro"><p class="eyebrow">A WEBSITE, UNIQUELY YOURS</p><h1>당신의 작품이<br>머무는 <em>또 하나의 공간.</em></h1><p class="hero-desc">작품과 이야기를 담은 나만의 웹사이트.<br>마음에 드는 샘플에서 가볍게 시작하세요.</p><div class="v2-actions"><a class="btn btn-p" href="#samples">사이트 샘플 보기 <span aria-hidden="true">↗</span></a><a class="quiet-link" href="#start" data-recommend>추천받고 싶어요 →</a></div><p class="hero-foot">기본 제작 50만 원 · VAT 별도<br>샘플 확인 후 진행 결정 · 지금 결제하지 않아요</p></div><div class="showcase"><div class="showcase-top"><span><i></i> MOTION PREVIEW</span><span>01 / 03</span></div><div class="motion-screen"><img src="${shots[0]}" alt="예술가 사이트의 첫 화면 모션 예시" fetchpriority="high"><div class="motion-caption"><small>ARTIST PORTFOLIO</small><b>작품의 결을,<br>화면 위에.</b><span>작품과 타이포그래피의 느린 움직임</span></div></div><div class="showcase-bottom"><span>사이트 캡처를 활용한 모션 연출 예시</span><button type="button" id="motionPause" aria-pressed="false">일시정지 Ⅱ</button></div><div class="motion-tabs" role="group" aria-label="모션 스타일"><button type="button" data-motion="0" aria-pressed="true">작가·작품</button><button type="button" data-motion="1" aria-pressed="false">브랜드·제품</button><button type="button" data-motion="2" aria-pressed="false">공방·클래스</button></div></div>`, 'v2-hero');
oldHero.replaceWith(hero);
document.querySelector('.nav').innerHTML='<a href="#samples">제작 사례</a><a href="#pricing">가격 안내</a><a href="#lookup">내 의뢰 확인</a><a class="cta" href="#start" data-recommend>문의하기 ↗</a>';
const specs=[['ARTIST PORTFOLIO','작품의 결을,<br>화면 위에.','작품과 타이포그래피의 느린 움직임'],['BRAND STORY','좋은 제품에는,<br>이야기가 있으니까.','제품 디테일을 따라가는 부드러운 확대'],['CREATIVE CLASS','만드는 순간을,<br>함께 나누세요.','작업 공간과 수업 장면의 여유로운 흐름']];
let paused=matchMedia('(prefers-reduced-motion: reduce)').matches;
function updateMotion(){hero.querySelector('.motion-screen').classList.toggle('is-paused',paused);$('motionPause').textContent=paused?'재생 ▷':'일시정지 Ⅱ';$('motionPause').setAttribute('aria-pressed',String(paused));}
$('motionPause').onclick=()=>{paused=!paused;updateMotion();};updateMotion();
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',e=>{paused=e.matches;updateMotion();});
hero.querySelectorAll('[data-motion]').forEach(b=>b.onclick=()=>{const i=+b.dataset.motion;hero.querySelectorAll('[data-motion]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));hero.querySelector('.motion-screen img').src=shots[i];hero.querySelector('.motion-screen img').alt=b.textContent+' 사이트 모션 예시';hero.querySelector('.motion-caption').innerHTML=`<small>${specs[i][0]}</small><b>${specs[i][1]}</b><span>${specs[i][2]}</span>`;hero.querySelector('.showcase-top span:last-child').textContent=`0${i+1} / 03`;hero.querySelector('.motion-screen').dataset.variant=i;});
const samples=$('samples');samples.querySelector('h2').innerHTML='<span class="eyebrow">SELECTED WEBSITES</span>어떤 공간을 만들고 싶으세요?';samples.querySelector('.sub').textContent='실제 운영 사례와 제작 샘플을 둘러보세요. 선택한 스타일을 바탕으로 제안해 드립니다.';
const grid=cards[0].parentElement;['hansakim','artist','soap','arthada','portfolio'].forEach(id=>{const c=byId(id);if(c)grid.appendChild(c);});
cards.forEach(c=>{c.querySelector('[data-get]').textContent='이 스타일로 문의하기 ↗';const box=c.querySelector('.capbox');box.classList.add('paused');box.setAttribute('aria-label','사이트 미리보기 재생 또는 정지');box.querySelector('.pause-hint').textContent='눌러서 미리보기 재생';});
document.addEventListener('click',e=>{const b=e.target.closest('[data-pause]');if(b&&!b.classList.contains('paused'))cards.forEach(c=>{const other=c.querySelector('.capbox');if(other!==b)other.classList.add('paused');});});
let expanded=false;const more=make('button','전체 샘플 보기 <span aria-hidden="true">↓</span>','btn btn-g more-samples');more.type='button';samples.append(more);
function limitCards(){[...grid.querySelectorAll('[data-sample-card]')].forEach((c,i)=>c.classList.toggle('v2-extra',!expanded&&i>2));more.textContent=expanded?'대표 샘플만 보기 ↑':'전체 샘플 보기 ↓';}
more.onclick=()=>{expanded=!expanded;limitCards();};limitCards();
samples.querySelectorAll('.fbtn').forEach(b=>b.addEventListener('click',()=>{expanded=true;limitCards();}));$('sampleSearch').addEventListener('input',()=>{expanded=true;limitCards();});
const pricing=make('section',`<div><p class="eyebrow">SIMPLE & TRANSPARENT</p><h2>작은 시작, 충분한 구성.</h2><p class="sub">작품을 보여주고, 새로운 연결을 만드는 데 필요한 것들.</p><a class="quiet-link" href="#start" data-recommend>내 사이트 상담하기 ↗</a></div><div class="pricing-card"><span>원페이지 기본 구성</span><p class="big-price">50<span>만 원</span></p><p class="hint">VAT 별도 · 도메인 구입 별도</p><ul><li>첫 화면 이미지·모션 연출 (20초 내)</li><li>작품·소개·이력·문의 등 원페이지 구성</li><li>한국어·영어 / 모바일 대응</li><li>호스팅 배포와 도메인 연결</li><li>기본 수정 2회 · 기본 유지보수 1년</li></ul><details><summary>추가 비용과 유지보수 범위</summary><p>추가 페이지 10만 원/장, 영상 기반 모션 작업 20만 원/30초, 추가 수정 5만 원/회 (모두 VAT 별도). 유지보수는 작은 텍스트·이미지 교체와 오류 수정 등을 포함하며, 구조 변경·기능 추가는 별도 견적입니다. 최종 범위와 금액은 상담 후 확정합니다.</p></details></div>`,'block v2-pricing');pricing.id='pricing';samples.after(pricing);
$('how').querySelector('h2').textContent='복잡한 준비 없이 시작하세요.';$('how').querySelector('.sub').textContent='자료가 완벽하지 않아도 괜찮아요. 함께 정리합니다.';
$('how').querySelector('.how').innerHTML='<div class="how-step"><span class="n">01</span><h3>짧게 문의하기</h3><p>샘플을 고르거나 추천을 요청하세요. 이름, 목적, 이메일이면 됩니다.</p></div><div class="how-step"><span class="n">02</span><h3>샘플 보고 결정하기</h3><p>구성과 샘플을 확인하고 제작 범위·견적·일정을 조율합니다.</p></div><div class="how-step"><span class="n">03</span><h3>나만의 사이트 완성</h3><p>진행 결정과 계약금 결제 후 자료를 받아 제작·검수·납품합니다.</p></div>';
const start=$('start'),lookup=$('lookup'),detail=$('detail');
const close=make('a','← 사이트 둘러보기','quiet-link back-home');close.href='#samples';start.prepend(close);
start.querySelector('h2').textContent='어떤 사이트를 만들고 싶으세요?';start.querySelector('.sub').textContent='세 가지만 알려주세요. 추천 구성을 확인한 뒤 요청을 보낼 수 있어요.';
['간단한 소개','추천 구성','확인·요청','접수 상태'].forEach((t,i)=>$('flow'+(i+1)).textContent=`${i+1} · ${t}`);
$('miniCard').querySelector('h3').textContent='당신의 이야기를 들려주세요.';$('miniCard').querySelector('.hint').textContent='작품과 어울리는 디자인·구성은 저희가 제안합니다.';
document.querySelector('label[for="siteName"]').textContent='작가명 또는 브랜드명 *';$('siteName').placeholder='예: 김누리 / 흙과불 공방';
const oldPurpose=$('purpose');const purpose=make('select','<option value="">목적을 선택해 주세요</option><option>작품과 작가 소개</option><option>전시 홍보</option><option>협업·소장 문의 받기</option><option>브랜드·제품 소개</option><option>공방·클래스 안내</option><option>아직 정하지 못했어요 — 추천받기</option>');purpose.id='purpose';oldPurpose.replaceWith(purpose);document.querySelector('label[for="purpose"]').textContent='사이트를 만드는 목적 *';
const form=$('miniForm');const nameField=$('siteName').closest('.field');form.prepend(nameField);nameField.after(purpose.closest('.field'));
$('contactName').closest('.field').hidden=true;$('siteName').addEventListener('input',()=>{$('contactName').value=$('siteName').value;});
const optional=make('details','<summary>세부 구성을 직접 정하고 싶어요 <span>(선택)</span></summary>','v2-optional');form.insertBefore(optional,$('makeProtoBtn'));
[$('secAuto').closest('.field'),$('gpChips').closest('.field'),document.querySelector('.sec-callout')].forEach(el=>optional.append(el));
document.querySelector('[name="hasData"]').closest('.field').hidden=true;$('photoField').hidden=true;
const ref=$('refSampleChoices').closest('.field');ref.hidden=true;
const selection=make('div','<span>선택한 스타일</span><b id="selectedStyle">추천받고 싶어요</b><a href="#samples">다른 샘플 보기 →</a>','selected-style');form.prepend(selection);
function showSelection(id){const c=byId(id);$('selectedStyle').textContent=c?c.dataset.title:'추천받고 싶어요';}
function step(n){['miniCard','protoCard','priceCard','doneCard'].forEach((id,i)=>$(id).hidden=i!==n-1);$('flow'+n).setAttribute('aria-current','step');[1,2,3,4].filter(i=>i!==n).forEach(i=>$('flow'+i).removeAttribute('aria-current'));const heading=$(['miniCard','protoCard','priceCard','doneCard'][n-1]).querySelector('h3');heading.tabIndex=-1;heading.focus({preventScroll:true});}
window.addEventListener('v2step',e=>step(e.detail));
window.addEventListener('v2open',e=>{location.hash='start';route();showSelection(e.detail);step(1);});
$('protoCard').querySelector('h3').textContent='이런 구성으로 시작해 볼까요?';$('protoTokens').closest('.proto-box').hidden=true;$('protoGallery').hidden=true;
['protoCard','priceCard'].forEach((id,i)=>{const back=make('button','← 이전 단계','btn btn-g');back.type='button';back.onclick=()=>step(i+1);$(id).append(back);});
$('showPriceBtn').textContent='예상 비용 확인하기 →';$('makeProtoBtn').textContent='추천 구성 보기 →';
const calc=$('calcBody').parentElement;const calcDetails=make('details','<summary>추가 옵션이 필요해요 (선택)</summary>');calc.before(calcDetails);calcDetails.append(calc);
$('priceCard').querySelector('h3').textContent='확인하고 샘플을 요청하세요.';
$('startBuildBtn').nextElementSibling.textContent='지금 결제되지 않습니다. 샘플 확인 후 제작 범위와 일정을 조율합니다.';
$('doneCard').querySelectorAll('.hint').forEach(el=>{if(el.textContent.includes('메일 프로그램'))el.hidden=true;});
['operatorMailBtn','myMailBtn','downloadSummaryBtn'].forEach(id=>$(id).hidden=true);$('successBox').hidden=true;
$('lookup').querySelector('.sub').textContent='접수할 때 받은 의뢰번호를 입력해 주세요.';
const detailLink=make('a','결제 후 제작 자료 입력하기 →','quiet-link');detailLink.href='#detail';lookup.append(detailLink);detail.prepend(close.cloneNode(true));lookup.prepend(close.cloneNode(true));
document.querySelector('footer').innerHTML='getsite.my <span>작품에서 시작하는 나만의 웹사이트.</span><a href="#lookup">내 의뢰 확인</a>';
function route(){const hash=location.hash;const work=['#start','#lookup','#detail','#admin'].includes(hash);document.body.classList.toggle('v2-work',work);start.hidden=hash!=='#start';lookup.hidden=hash!=='#lookup';detail.hidden=hash!=='#detail';$('admin').hidden=hash!=='#admin';if(work)window.scrollTo(0,0);}
window.addEventListener('hashchange',route);
document.addEventListener('click',e=>{const b=e.target.closest('[data-recommend]');if(b){showSelection(null);const artist=document.querySelector('[name="refSample"][value="artist"]');if(artist){artist.checked=true;artist.dispatchEvent(new Event('change'));}step(1);}});
const artist=document.querySelector('[name="refSample"][value="artist"]');if(artist){artist.checked=true;artist.dispatchEvent(new Event('change'));}
route();
})();
