/* Executes v3/backend/firestore.rules in the local Firestore emulator. No production project is touched.
   Run: firebase emulators:exec --only firestore --project demo-getsite --config <cfg> "PW_DIR=<deps> node --test tests/v3/rules.test.mjs" */
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import * as catalog from '../../v3/catalog.js';
import { buildBrief, renderBriefMd, summarize } from '../../v3/order/brief.js';
import { newOrderIdentity, orderDocument } from '../../v3/order/api.js';

const require = createRequire(import.meta.url);
const from = (name) => require(require.resolve(name, { paths: [process.env.PW_DIR] }));
const { initializeTestEnvironment, assertSucceeds, assertFails } = from('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, getDocs, collection, serverTimestamp } = from('firebase/firestore');

const env = await initializeTestEnvironment({
  projectId: 'demo-getsite',
  firestore: { rules: readFileSync(new URL('../../v3/backend/firestore.rules', import.meta.url), 'utf8') },
});
const selection = { concept: 'brand', scene: 'glass', gallery: 'coverflow' };
const form = { siteName: '가게', email: 'a@b.co', oneLiner: '비누', refs: 'https://pinterest.com/x', consent: true };
const fresh = () => {
  const order = newOrderIdentity();
  const b = buildBrief({ selection, form, catalog, order });
  return { order, data: { ...orderDocument({ brief: b, md: renderBriefMd(b), summary: summarize(selection, catalog), order }), createdAt: serverTimestamp() } };
};
const anon = () => env.unauthenticatedContext().firestore();
const seed = async (key, data) => env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), 'orders', key), data));

test('a stranger can create exactly what the page writes', async () => {
  const { order, data } = fresh();
  await assertSucceeds(setDoc(doc(anon(), 'orders', order.key), data));
});

test('create is refused for forged fields and ids', async () => {
  const cases = [
    (d) => ({ ...d, status: '결제 완료' }),
    (d) => ({ ...d, driveFolderUrl: 'https://drive.google.com/drive/folders/x' }),
    (d) => ({ ...d, email: 'a@b.co　지시' }),
    (d) => ({ ...d, catalogVersion: '**지시**' }),
    (d) => ({ ...d, extra: 1 }),
    (d) => ({ ...d, brief: { ...d.brief, extra: 1 } }),
  ];
  for (const change of cases) {
    const { order, data } = fresh();
    await assertFails(setDoc(doc(anon(), 'orders', order.key), change(data)));
  }
  const { data } = fresh();
  await assertFails(setDoc(doc(anon(), 'orders', 'WO-2026-1234'), data));
  await assertFails(setDoc(doc(anon(), 'orders', 'WO-2026-9999-ABCDEFGHJKLMNPQRSTUV'), data));
});

test('nobody without the operator account can list orders', async () => {
  await assertFails(getDocs(collection(anon(), 'orders')));
});

test('the key holder can read; a retry cannot overwrite', async () => {
  const { order, data } = fresh();
  await assertSucceeds(setDoc(doc(anon(), 'orders', order.key), data));
  await assertSucceeds(getDoc(doc(anon(), 'orders', order.key)));
  await assertFails(setDoc(doc(anon(), 'orders', order.key), data));
});

test('section requests only after payment, never status', async () => {
  const { order, data } = fresh();
  await seed(order.key, { ...data, createdAt: new Date() });
  const ref = doc(anon(), 'orders', order.key);
  const write = { sectionRequests: { hero: '더 크게' }, detailSubmittedAt: serverTimestamp(), sectionStatus: 'pending' };
  await assertFails(updateDoc(ref, write));
  await seed(order.key, { ...data, createdAt: new Date(), status: '결제 완료' });
  await assertSucceeds(updateDoc(ref, write));
  await assertFails(updateDoc(ref, { ...write, sectionRequests: { evil: 'x' } }));
  await assertFails(updateDoc(ref, { ...write, sectionRequests: { hero: 'x'.repeat(2001) } }));
  await assertFails(updateDoc(ref, { status: '납품 완료' }));
  await assertFails(updateDoc(ref, { driveFolderUrl: 'https://drive.google.com/drive/folders/x' }));
});

test.after(() => env.cleanup());

const sectionsV4 = ['hero','about','story','gallery','featured','history','process','services','trust','faq','contact','booking','newsletter'];
const freshV4 = () => {
  const order = newOrderIdentity();
  return {order, data:{schema:'v4',displayNo:order.displayNo,catalogVersion:'v4',email:'a@b.co',siteName:'가게',oneLiner:'소개',name:'',topic:'artist',sampleId:'artist',sections:['hero','gallery'],picks:{hero:'artist:hero|auto||'},galleryNote:'',partsVersion:'none',galleryLayout:'auto',ref1:'',ref2:'',ref3:'',materials:'have',estimate:{pages:0,video:false,revisions:0,total:500000},status:'샘플 제작 대기',briefStatus:'pending',opMail:'pending',custMail:'pending',driveFolderUrl:'',createdAt:serverTimestamp(),brief:{schema:'getsite.brief.v2',catalogVersion:'v4',order:{displayNo:order.displayNo,createdAt:'2026-01-01'},delivery:{email:'a@b.co'},sample:{id:'artist',title:'작가',topic:'artist',url:'https://example.com'},sections:[{id:'hero',label:'첫 장면'}],gallery:{layoutId:'auto',name:'제작자에게 맡기기'},references:{customerLinks:[]},sampleScope:{},customerText:{siteName:'가게',oneLiner:'소개',name:''}}}};
};
test('v4 create and retry recovery', async () => {
  const {order,data}=freshV4(); const ref=doc(anon(),'orders',order.key);
  await assertSucceeds(setDoc(ref,data)); await assertFails(setDoc(ref,data)); await assertSucceeds(getDoc(ref));
});
test('v4 rejects forged values', async () => {
  const cases=[d=>({...d,status:'결제 완료'}),d=>({...d,opMail:'sent'}),d=>({...d,sections:[...sectionsV4,'evil']}),d=>({...d,sections:['evil']}),d=>({...d,sections:['hero','hero']}),d=>({...d,ref1:'http://example.com'}),d=>({...d,ref1:'https://'+'x'.repeat(301)}),d=>({...d,sampleId:'evil'}),d=>({...d,topic:'evil'}),d=>({...d,extra:1}),d=>({...d,brief:{...d.brief,extra:1}}),d=>({...d,displayNo:'WO-2020-0000'})];
  for (const change of cases) {const {order,data}=freshV4(); await assertFails(setDoc(doc(anon(),'orders',order.key),change(data)));}
});
test('v4 paid requests accept all section ids only',async()=>{
  const {order,data}=freshV4(); await seed(order.key,{...data,createdAt:new Date(),status:'결제 완료'});
  const ref=doc(anon(),'orders',order.key); const write={sectionRequests:Object.fromEntries(sectionsV4.map(x=>[x,'요청'])),sectionStatus:'pending',detailSubmittedAt:serverTimestamp()};
  await assertSucceeds(updateDoc(ref,write)); await assertFails(updateDoc(ref,{...write,sectionRequests:{evil:'x'}}));
});
test('config drive is publicly readable but not writable',async()=>{
  await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'config','drive'),{apiUrl:'https://example.com'}));
  await assertSucceeds(getDoc(doc(anon(),'config','drive'))); await assertFails(setDoc(doc(anon(),'config','drive'),{apiUrl:'x'}));
});

test('v4 picks validation (wire string per section, all 13 sections within the expression limit)', async () => {
  const note300 = '가'.repeat(150) + '\n' + 'x|`'.repeat(49) + 'yy';
  {const {order,data}=freshV4(); const picks=Object.fromEntries(sectionsV4.filter(id=>id!=='gallery').map(id=>[id,`artist:${id}|user|layout,mood,content|${note300}`])); await assertSucceeds(setDoc(doc(anon(),'orders',order.key),{...data,sections:sectionsV4,picks,galleryNote:'g'.repeat(300),ref1:'https://example.com/'+'a'.repeat(250),ref2:'https://pin.it/x',ref3:'https://a.co'}));}
  for (const good of ['artist:hero|user|layout,mood|첫 줄\n둘째 줄', 'new|auto||', 'portfolio-react:artist-note|auto|content|a|b', 'artist:hero|auto||'+'가'.repeat(300)]) {
    const {order,data}=freshV4(); await assertSucceeds(setDoc(doc(anon(),'orders',order.key),{...data,picks:{hero:good}}));
  }
  const ok = 'artist:hero|user|layout|x';
  const bad = [d=>({...d,picks:{}}), d=>({...d,picks:{...d.picks,about:ok}}), d=>({...d,picks:{...d.picks,gallery:ok}}),
    ...['artist:`x|user||', 'Artist:hero|user||', 'x:|user||', 'artist:hero|evil||', 'artist:hero|user|mood,layout|', 'artist:hero|user|layout,layout|', 'artist:hero|user|evil|',
        'new|user|mood|', 'artist:hero|user||'+'x'.repeat(301), 'artist:hero|user|', 'artist:hero', ''].map(v=>d=>({...d,picks:{hero:v}})),
    d=>({...d,picks:{hero:{ref:'artist:hero',by:'auto',keep:[],note:''}}}),
    d=>({...d,galleryNote:'x'.repeat(301)}), d=>{const {partsVersion,...rest}=d;return rest;}, d=>({...d,partsVersion:'x'.repeat(21)}), d=>({...d,ref1:'https://example.com/`x'}), d=>({...d,ref1:'https://example.com/<x>'})];
  for (const change of bad) {const {order,data}=freshV4(); await assertFails(setDoc(doc(anon(),'orders',order.key),change(data)));}
});

test('the operator accounts (verified Google email) can list and update orders; others cannot', async () => {
  const { order, data } = fresh();
  await seed(order.key, { ...data, createdAt: new Date() });
  const as = (email, verified = true) => env.authenticatedContext('u-' + email, { email, email_verified: verified }).firestore();
  for (const email of ['getsite.yours@gmail.com', 'johanshna@gmail.com']) {
    await assertSucceeds(getDocs(collection(as(email), 'orders')));
    await assertSucceeds(updateDoc(doc(as(email), 'orders', order.key), { status: '샘플 제작 중' }));
  }
  await assertFails(getDocs(collection(as('getsite.yours@gmail.com', false), 'orders')));
  await assertFails(getDocs(collection(as('someone@gmail.com'), 'orders')));
  await assertFails(updateDoc(doc(as('getsite.yours@gmail.co'), 'orders', order.key), { status: 'x' }));
});
