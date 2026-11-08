/* Order persistence. Firebase loads only on submit.
   The document ID is the secret: display number + 20 random characters.
   A retry reuses the same key, so one submission is one order.
   Tests and local previews can inject window.__GETSITE_API__. */

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyD07kkhsr7Gu0pQ1NFtNNLxtzSp7ArXreA',
  authDomain: 'getsite-my.firebaseapp.com',
  projectId: 'getsite-my',
  storageBucket: 'getsite-my.firebasestorage.app',
};
const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** Unbiased random string (119 bits at 20 characters over 57 symbols). */
export function randomToken(length = 20, rng = globalThis.crypto) {
  const out = [];
  const limit = 256 - (256 % ALPHABET.length);
  while (out.length < length) {
    const bytes = rng.getRandomValues(new Uint8Array(length * 2));
    for (const b of bytes) {
      if (b < limit && out.length < length) out.push(ALPHABET[b % ALPHABET.length]);
    }
  }
  return out.join('');
}

export function newOrderIdentity(now = new Date(), rng = globalThis.crypto) {
  const year = now.getFullYear();
  const n = new Uint16Array(1);
  rng.getRandomValues(n);
  const displayNo = `WO-${year}-${String(1000 + (n[0] % 9000))}`;
  return { displayNo, key: `${displayNo}-${randomToken(20, rng)}` };
}

export const ORDER_KEY_RE = /^WO-[0-9]{4}-[0-9]{4}-[A-Za-z0-9]{20}$/;
export const DRIVE_URL_RE = /^https:\/\/drive\.google\.com\/drive\/folders\/[A-Za-z0-9_-]+(\?usp=[a-z_]+)?$/;

/** The /exec URL of the ref-upload.gs web app deployment. Empty until it is deployed: uploads then fail
    and the receipt points the customer to the Drive folder instead. */
export const REF_UPLOAD_URL = 'https://script.google.com/macros/s/AKfycbzITy-QX1z81kOfphkSQBDS_ozverzlJhSFEuy7sdVkGDP4RcC8rYcRpZpV4UjvO0j-Cw/exec';

/** File → base64 without the data: prefix. */
function fileBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).slice(String(r.result).indexOf(',') + 1));
    r.onerror = () => reject(r.error || new Error('read failed'));
    r.readAsDataURL(file);
  });
}

let dbPromise = null;

async function firestore() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const [{ initializeApp, getApps }, fs] = await Promise.all([
        import(`${SDK}/firebase-app.js`),
        import(`${SDK}/firebase-firestore.js`),
      ]);
      const app = getApps()[0] || initializeApp(FIREBASE_CONFIG);
      return { db: fs.getFirestore(app), fs };
    })().catch((e) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

/** A write that never answers (offline) becomes a retryable failure instead of an endless spinner. */
export function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'timeout' })), ms); }),
  ]).finally(() => clearTimeout(timer));
}

const defaultApi = {
  async saveOrder(key, doc) {
    const { db, fs } = await firestore();
    await withTimeout(fs.setDoc(fs.doc(db, 'orders', key), { ...doc, createdAt: fs.serverTimestamp() }), 15000);
  },
  async loadOrder(key) {
    const { db, fs } = await firestore();
    const snap = await withTimeout(fs.getDoc(fs.doc(db, 'orders', key)), 15000);
    return snap.exists() ? snap.data() : null;
  },
  async saveSectionRequests(key, requests) {
    const { db, fs } = await firestore();
    await withTimeout(fs.updateDoc(fs.doc(db, 'orders', key), { sectionRequests: requests, detailSubmittedAt: fs.serverTimestamp(), sectionStatus: 'pending' }), 15000);
  },
  /** v5 reference files go to the operator's Google Drive (getsite-order-refs/<key>/) through the
      Apps Script web app in v3/backend/ref-upload.gs, only after the order exists: the script checks the
      order lists the name, is under an hour old, and the bytes match the type. It never overwrites, and
      answers `exists` for a name already saved, which counts as done (the retry after a lost answer). */
  async uploadRefFile(key, name, file, contentType) {
    const url = globalThis.__REF_UPLOAD_URL__ || REF_UPLOAD_URL;
    if (!url) throw Object.assign(new Error('upload not configured'), { code: 'not-configured' });
    const data = await fileBase64(file);
    // text/plain keeps it a simple request: Apps Script answers no CORS preflight.
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ key, name, type: contentType, data }), signal: AbortSignal.timeout(180000) });
    const json = res.ok ? await res.json().catch(() => null) : null;
    if (!json?.ok) throw Object.assign(new Error(`upload refused: ${json?.error || res.status}`), { code: json?.error || 'http' });
  },
  /** Optional. Uses the existing Apps Script folder endpoint when one is configured. */
  async requestFolder(key) {
    const base = globalThis.__DRIVE_API_URL__;
    if (!base) return null;
    const url = `${base}${base.includes('?') ? '&' : '?'}order=${encodeURIComponent(key)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.ok && DRIVE_URL_RE.test(json.folderUrl || '') ? json.folderUrl : null;
  },
};

export const api = () => globalThis.__GETSITE_API__ || defaultApi;

/** Fields kept compatible with the v2 order document, plus the v3 brief. */
export function orderDocument({ brief, md, summary, order }) {
  return {
    siteName: brief.customerText.siteName,
    purpose: brief.customerText.oneLiner,
    email: brief.delivery.email,
    name: brief.customerText.name,
    sample: summary,
    sections: brief.sections.map((s) => s.label),
    sectionsDelegated: true,
    sectionRequirement: '결제 후 섹션별로 받음',
    galleryLayout: brief.gallery.layoutId,
    galleryRequirement: `갤러리 구도: ${brief.gallery.name}`,
    materials: '접수 후 안내',
    driveFolderUrl: '',
    estimate: '기본 500,000원 (VAT 별도)',
    status: '샘플 제작 대기',
    summary: summary.slice(0, 200),
    schema: 'v3',
    displayNo: order.displayNo,
    catalogVersion: brief.catalogVersion,
    brief,
    briefStatus: 'pending',
  };
}

export function orderLink(key, base = globalThis.location?.href) {
  return `${new URL('order.html', base).href}#t=${encodeURIComponent(key)}`;
}

/** Read a public configuration document without loading Firebase in injected tests. */
export async function loadConfig(docPath) {
  if (globalThis.__GETSITE_API__) {
    return typeof globalThis.__GETSITE_API__.loadConfig === 'function' ? globalThis.__GETSITE_API__.loadConfig(docPath) : null;
  }
  const { db, fs } = await firestore();
  const snap = await withTimeout(fs.getDoc(fs.doc(db, docPath)), 8000);
  return snap.exists() ? snap.data() : null;
}
