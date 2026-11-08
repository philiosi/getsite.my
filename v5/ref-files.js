/* The reference files the customer chose, kept in memory only (File objects cannot go into sessionStorage).
   The store holds their metadata under the same ids; prune() drops files the store no longer lists. */
import { REF_FILE_MAX, REF_FILE_BYTES, refFileExt } from './store.js';

const files = new Map(); // id -> File
let seq = 0;
const newId = () => `f${Date.now().toString(36)}${(seq++).toString(36)}`;
const meta = (id, f) => ({ id, name: f.name, size: f.size, type: f.type || '' });

/** Adds files to the current list. Returns the new metadata list and Korean messages for each rejected file. */
export function addFiles(current, incoming) {
  const list = [...current].filter((m) => files.has(m.id));
  const rejected = [];
  for (const f of Array.from(incoming || [])) {
    if (!refFileExt(f.name)) { rejected.push(`${f.name}: 지원하지 않는 형식입니다.`); continue; }
    if (f.size > REF_FILE_BYTES) { rejected.push(`${f.name}: 20MB를 넘습니다.`); continue; }
    if (f.size === 0) { rejected.push(`${f.name}: 빈 파일입니다.`); continue; }
    if (list.some((m) => m.name === f.name && m.size === f.size)) continue; // the same file chosen twice
    if (list.length >= REF_FILE_MAX) { rejected.push(`최대 ${REF_FILE_MAX}개까지 올릴 수 있습니다.`); break; }
    const id = newId();
    files.set(id, f);
    list.push(meta(id, f));
  }
  return { list, rejected };
}

export const removeFile = (current, id) => { files.delete(id); return current.filter((m) => m.id !== id); };
export const getFile = (id) => files.get(id) || null;
/** Keeps only the ids the store still lists (after a reset or a reload). */
export function prune(list) { const keep = new Set(list.map((m) => m.id)); for (const id of [...files.keys()]) if (!keep.has(id)) files.delete(id); }
export const formatSize = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);
