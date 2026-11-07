'use strict';
// ================= TIỆN ÍCH =================
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clone = o => JSON.parse(JSON.stringify(o));
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const todayISO = () => iso(new Date());
function parseISO(s){ const [y,m,d] = String(s).split('-').map(Number); return new Date(y, (m||1)-1, d||1); }
function addDays(s, n){ const d = parseISO(s); d.setDate(d.getDate() + Number(n)); return iso(d); }
function addMonths(s, n){ const d = parseISO(s); const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + Number(n)); const last = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate(); d.setDate(Math.min(day, last)); return iso(d); }
function daysBetween(a, b){ return Math.round((parseISO(b) - parseISO(a)) / 86400000); }
function fmtDate(s){ if(!s) return ''; const [y,m,d] = s.split('-'); return `${d}/${m}/${y}`; }
function num(v){ if(v === '' || v == null) return null; if(typeof v === 'number') return isNaN(v) ? null : v; const n = parseFloat(String(v).replace(/\s/g,'').replace(',', '.')); return isNaN(n) ? null : n; }
const fmtN = (x, d = 0) => x == null || isNaN(x) ? '—' : Number(x).toLocaleString('vi-VN', {maximumFractionDigits: d, minimumFractionDigits: 0});
const money = x => fmtN(Math.round(x || 0)) + ' đ';
function frac(x){ x = num(x); if(!x) return ''; const w = Math.floor(x), r = +(x - w).toFixed(2); const f = {0.25:'¼', 0.5:'½', 0.75:'¾'}[r]; if(f) return (w ? w : '') + f; return fmtN(x, 2); }
function relDays(s){ const n = daysBetween(todayISO(), s); if(n === 0) return 'hôm nay'; if(n === 1) return 'ngày mai'; if(n === -1) return 'hôm qua'; return n > 0 ? `còn ${n} ngày` : `quá ${-n} ngày`; }

// ================= LƯU TRỮ =================
// Chế độ chính 'dir': dữ liệu là các file trong một thư mục trên máy (File System Access API – Chrome/Edge).
// Chế độ dự phòng 'idb'/'ls': lưu trong trình duyệt. IndexedDB luôn được dùng để nhớ "liên kết tới thư mục".
const IDB = {
  db: null, mode: 'idb',
  async init(){
    try {
      this.db = await new Promise((res, rej) => {
        const r = indexedDB.open('ho-so-benh-nhan', 1);
        r.onupgradeneeded = () => { const db = r.result; for(const s of ['patients','drugs','templates','files','kv']) if(!db.objectStoreNames.contains(s)) db.createObjectStore(s, {keyPath:'id'}); };
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
    } catch(e){ console.warn('IndexedDB lỗi, dùng localStorage', e); this.mode = 'ls'; }
    try { if(navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch(e){}
  },
  _ls(store){ try { return JSON.parse(localStorage.getItem('hsbn_' + store) || '[]'); } catch(e){ return []; } },
  _lsw(store, arr){ localStorage.setItem('hsbn_' + store, JSON.stringify(arr)); },
  _req(store, mode, fn){ return new Promise((res, rej) => { const tx = this.db.transaction(store, mode); const r = fn(tx.objectStore(store)); tx.oncomplete = () => res(r && r.result); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); }); },
  async all(store){ if(this.mode === 'ls') return this._ls(store); return this._req(store, 'readonly', s => s.getAll()); },
  async get(store, id){ if(this.mode === 'ls') return this._ls(store).find(x => x.id === id); return this._req(store, 'readonly', s => s.get(id)); },
  async put(store, obj){ if(this.mode === 'ls'){ const a = this._ls(store).filter(x => x.id !== obj.id); a.push(obj); this._lsw(store, a); return; } return this._req(store, 'readwrite', s => s.put(obj)); },
  async putMany(store, arr){ if(this.mode === 'ls'){ const ids = new Set(arr.map(x=>x.id)); const a = this._ls(store).filter(x => !ids.has(x.id)).concat(arr); this._lsw(store, a); return; } return this._req(store, 'readwrite', s => { arr.forEach(o => s.put(o)); }); },
  async del(store, id){ if(this.mode === 'ls'){ this._lsw(store, this._ls(store).filter(x => x.id !== id)); return; } return this._req(store, 'readwrite', s => s.delete(id)); },
  async clear(store){ if(this.mode === 'ls'){ this._lsw(store, []); return; } return this._req(store, 'readwrite', s => s.clear()); },
};

const DIR_DATA = 'du-lieu';
const COLL_FILE = {drugs: 'danh-muc-thuoc.json', templates: 'mau-tu-van.json', kv: 'cai-dat.json'};
const LOCAL_KV = new Set(['fh', 'dirh', 'pref', 'mirror', 'pendsync']);   // chỉ lưu trong trình duyệt (liên kết thư mục, tuỳ chọn, trạng thái bản sao)
const MIRROR_STORES = ['patients', 'drugs', 'templates'];   // bản sao trong trình duyệt để mở app ngay khi chưa có quyền thư mục
const README_TXT = `THƯ MỤC DỮ LIỆU – HỒ SƠ BỆNH NHÂN
==================================
benh-nhan\\       mỗi bệnh nhân một file .json (thông tin, tiền sử, các lượt khám, đơn thuốc)
tep-dinh-kem\\    ảnh, PDF kết quả xét nghiệm / siêu âm / nội soi đã đính kèm
danh-muc-thuoc.json   danh mục thuốc (giá, liều, cảnh báo)
mau-tu-van.json       mẫu chế độ ăn, vận động, PHCN, YHCT, tâm lý…
cai-dat.json          thông tin phòng khám in trên phiếu
sao-luu\\         bản sao lưu tự động mỗi ngày (giữ 60 ngày gần nhất)
da-xoa\\          hồ sơ / file đã xoá trong app được chuyển vào đây, không mất hẳn

LƯU Ý
- Không sửa, đổi tên file trong lúc app đang mở.
- Sao chép cả thư mục này sang USB / ổ khác định kỳ để phòng hỏng máy.
- Đây là dữ liệu sức khoẻ cá nhân: giữ máy có mật khẩu, không chia sẻ thư mục.
`;
const slugName = s => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'benh-nhan';
const safeFile = s => String(s || 'file').replace(/[\\/:*?"<>|\x00-\x1f]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80) || 'file';
const dataUrlToBlob = async u => (await fetch(u)).blob();
const blobToDataUrl = b => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error); fr.readAsDataURL(b); });
const tsName = () => { const d = new Date(); return iso(d) + '_' + pad(d.getHours()) + 'h' + pad(d.getMinutes()) + 'm' + pad(d.getSeconds()); };

function makeDirStore(root){
  const D = {
    root, data: null, pdir: null, fdir: null, name: root.name,
    cache: {patients: new Map(), drugs: new Map(), templates: new Map(), kv: new Map()},
    pfile: new Map(),   // id bệnh nhân -> tên file
    ffile: new Map(),   // id tệp đính kèm -> tên file
    fpend: new Map(),   // tệp đính kèm chưa ghi được -> blob
    dirty: new Set(), q: new Map(), err: null,
    async open(){
      this.data = root.name === DIR_DATA ? root : await root.getDirectoryHandle(DIR_DATA, {create: true});
      this.pdir = await this.data.getDirectoryHandle('benh-nhan', {create: true});
      this.fdir = await this.data.getDirectoryHandle('tep-dinh-kem', {create: true});
      for await (const [n, h] of this.pdir.entries()){
        if(h.kind !== 'file' || !n.endsWith('.json')) continue;
        try { const p = JSON.parse(await (await h.getFile()).text()); if(p && p.id){ this.cache.patients.set(p.id, p); this.pfile.set(p.id, n); } } catch(e){ console.warn('Bỏ qua file hỏng', n, e); }
      }
      for(const [s, fn] of Object.entries(COLL_FILE)){
        try { const fh = await this.data.getFileHandle(fn); const arr = JSON.parse(await (await fh.getFile()).text()); for(const o of (Array.isArray(arr) ? arr : [])) if(o && o.id) this.cache[s].set(o.id, o); } catch(e){ if(e.name !== 'NotFoundError') console.warn('Không đọc được', fn, e); }
      }
      for await (const [n, h] of this.fdir.entries()) if(h.kind === 'file'){ const i = n.indexOf('__'); if(i > 0) this.ffile.set(n.slice(0, i), n); }
      try { await this.data.getFileHandle('DOC-TRUOC.txt'); } catch(e){ try { await this._write(this.data, 'DOC-TRUOC.txt', () => '﻿' + README_TXT.replace(/\n/g, '\r\n')); } catch(_){} }
      return this;
    },
    hasData(){ return this.cache.kv.has('settings'); },
    async _write(dir, name, make){
      const key = dir.name + '/' + name, prev = this.q.get(key) || Promise.resolve();
      const p = prev.catch(() => {}).then(async () => { const fh = await dir.getFileHandle(name, {create: true}); const w = await fh.createWritable(); try { await w.write(await make()); await w.close(); } catch(e){ try { await w.abort(); } catch(_){} throw e; } });
      this.q.set(key, p);
      try { await p; } finally { if(this.q.get(key) === p) this.q.delete(key); }
    },
    async _trash(dir, name){
      try {
        const f = await (await dir.getFileHandle(name)).getFile();
        const tr = await (await this.data.getDirectoryHandle('da-xoa', {create: true})).getDirectoryHandle(dir.name, {create: true});
        await this._write(tr, tsName() + '_' + name, () => f);
        await dir.removeEntry(name);
      } catch(e){ if(e.name !== 'NotFoundError') throw e; }
    },
    async _do(key, fn){ try { await fn(); this.dirty.delete(key); if(!this.dirty.size) this.err = null; } catch(e){ this.dirty.add(key); this.err = e; if(typeof onStoreError === 'function') onStoreError(e); throw e; } },
    _writeP(id){ return this._do('p:' + id, async () => {
      const p = this.cache.patients.get(id); if(!p) return;
      const fn = slugName(p.name) + '_' + String(p.code || id).replace(/[^\w-]/g, '') + '_' + id.replace(/[^\w-]/g, '') + '.json', old = this.pfile.get(id);
      await this._write(this.pdir, fn, () => JSON.stringify(p, null, 1));
      this.pfile.set(id, fn);
      if(old && old !== fn) try { await this.pdir.removeEntry(old); } catch(e){}
    }); },
    _writeC(s){ return this._do('c:' + s, () => this._write(this.data, COLL_FILE[s], () => JSON.stringify([...this.cache[s].values()], null, 1))); },
    _writeF(id){ return this._do('f:' + id, async () => {
      const it = this.fpend.get(id); if(!it) return;
      const fn = id + '__' + safeFile(it.name), old = this.ffile.get(id);
      await this._write(this.fdir, fn, () => it.blob);
      this.ffile.set(id, fn); this.fpend.delete(id);
      if(old && old !== fn) try { await this.fdir.removeEntry(old); } catch(e){}
    }); },
    async all(s){
      if(s === 'files'){ const out = []; for(const id of this.ffile.keys()){ const f = await this.get('files', id); if(f) out.push(f); } return out; }
      return [...this.cache[s].values()];
    },
    async get(s, id){
      if(s !== 'files') return this.cache[s].get(id);
      const pend = this.fpend.get(id); if(pend) return {id, name: pend.name, type: pend.blob.type, size: pend.blob.size, data: await blobToDataUrl(pend.blob)};
      const fn = this.ffile.get(id); if(!fn) return undefined;
      const f = await (await this.fdir.getFileHandle(fn)).getFile();
      return {id, name: fn.slice(fn.indexOf('__') + 2), type: f.type, size: f.size, data: await blobToDataUrl(f)};
    },
    async put(s, o){ return this.putMany(s, [o]); },
    async putMany(s, arr){
      if(!arr.length) return;
      if(s === 'patients'){ for(const p of arr){ this.cache.patients.set(p.id, p); await this._writeP(p.id); } return; }
      if(s === 'files'){ for(const f of arr){ const blob = f.blob || await dataUrlToBlob(f.data); this.fpend.set(f.id, {name: f.name, blob: f.type && !blob.type ? new Blob([blob], {type: f.type}) : blob}); await this._writeF(f.id); } return; }
      for(const o of arr) this.cache[s].set(o.id, o);
      await this._writeC(s);
    },
    async del(s, id){
      if(s === 'patients'){ this.cache.patients.delete(id); const fn = this.pfile.get(id); this.pfile.delete(id); this.dirty.delete('p:' + id); if(fn) await this._trash(this.pdir, fn); return; }
      if(s === 'files'){ this.fpend.delete(id); this.dirty.delete('f:' + id); const fn = this.ffile.get(id); this.ffile.delete(id); if(fn) await this._trash(this.fdir, fn); return; }
      this.cache[s].delete(id); await this._writeC(s);
    },
    async clear(s){
      if(s === 'patients'){ for(const id of [...this.cache.patients.keys()]) await this.del('patients', id); return; }
      if(s === 'files'){ for(const id of [...this.ffile.keys(), ...this.fpend.keys()]) await this.del('files', id); return; }
      this.cache[s].clear(); await this._writeC(s);
    },
    async retry(){ for(const k of [...this.dirty]){ const [t, x] = [k.slice(0, 1), k.slice(2)]; if(t === 'p') await this._writeP(x); else if(t === 'c') await this._writeC(x); else if(t === 'f') await this._writeF(x); } },
    async backup(snap, keep = 60){
      const dir = await this.data.getDirectoryHandle('sao-luu', {create: true}), fn = 'sao-luu-' + todayISO() + '.json';
      await this._write(dir, fn, () => JSON.stringify(snap));
      const names = []; for await (const [n, h] of dir.entries()) if(h.kind === 'file' && /^sao-luu-\d{4}-\d\d-\d\d\.json$/.test(n)) names.push(n);
      names.sort(); for(const n of names.slice(0, Math.max(0, names.length - keep))) try { await dir.removeEntry(n); } catch(e){}
    },
  };
  return D.open();
}

async function dirPerm(h, ask){
  if(typeof h.queryPermission !== 'function') return true;
  const o = {mode: 'readwrite'};
  if(await h.queryPermission(o) === 'granted') return true;
  if(!ask) return false;
  const r = dirPerm.last = await h.requestPermission(o);
  if(r === 'granted' || await h.queryPermission(o) === 'granted') return true;
  // Một số trình duyệt nhân Chromium (vd. Cốc Cốc, mở bằng file://) trả về khác 'granted' dù đã bấm Cho phép -> thử ghi thật
  return canWrite(h);
}
async function canWrite(h){
  const fn = '.kiem-tra-quyen';
  try { const d = h.name === DIR_DATA ? h : await h.getDirectoryHandle(DIR_DATA, {create: true}); const w = await (await d.getFileHandle(fn, {create: true})).createWritable(); await w.write('ok'); await w.close(); await d.removeEntry(fn); return true; }
  catch(e){ console.warn('Không ghi thử được vào thư mục', e); dirPerm.err = e; return false; }
}

// Bản sao + hàng chờ: ở chế độ 'dir', mọi thay đổi (trừ tệp đính kèm) được chép thêm vào IndexedDB.
// Lần mở sau nếu trình duyệt chưa cấp quyền thư mục, app chạy ngay trên bản sao ('pend' != null), ghi tạm vào IndexedDB
// và nhớ khoá đã đổi trong kv 'pendsync'; khi bác sĩ bấm để cấp quyền thì syncPending() đẩy các thay đổi đó vào thư mục.
const Store = {
  mode: 'idb', dir: null, pend: null,
  get canDir(){ return typeof window.showDirectoryPicker === 'function' && IDB.mode === 'idb'; },
  get dirName(){ return this.dir ? this.dir.name + (this.dir.root === this.dir.data ? '' : '\\' + DIR_DATA) : ''; },
  async init(){ await IDB.init(); this.mode = IDB.mode; },
  _b(s, id){ return this.mode === 'dir' && !(s === 'kv' && LOCAL_KV.has(id)) ? this.dir : IDB; },
  _local(s, id){ return s === 'kv' && LOCAL_KV.has(id); },
  _mir(s, id, fn){ if(this.mode === 'dir' && s !== 'files' && !this._local(s, id)) fn().catch(e => console.warn('Không cập nhật được bản sao trong trình duyệt', e)); },
  _mark(s, id, op){ if(!this.pend || this._local(s, id)) return; this.pend.set(s + '\t' + id, op); IDB.put('kv', {id: 'pendsync', items: [...this.pend]}).catch(e => console.warn(e)); },
  all(s){ return this._b(s).all(s); },
  get(s, id){ return this._b(s, id).get(s, id); },
  async put(s, o){ this._mark(s, o.id, 'put'); await this._b(s, o.id).put(s, o); this._mir(s, o.id, () => IDB.put(s, o)); },
  async putMany(s, a){ a.forEach(o => this._mark(s, o.id, 'put')); await this._b(s).putMany(s, a); this._mir(s, null, () => IDB.putMany(s, a)); },
  async del(s, id){ this._mark(s, id, 'del'); await this._b(s, id).del(s, id); this._mir(s, id, () => IDB.del(s, id)); },
  async clear(s){ if(this.pend) (await this.all(s)).forEach(o => this._mark(s, o.id, 'del')); await this._b(s).clear(s); this._mir(s, null, () => IDB.clear(s)); },
  local: IDB,
  async useDir(d){ this.dir = d; this.mode = 'dir'; },
  // Chép toàn bộ dữ liệu thư mục sang IndexedDB (gọi mỗi lần mở thư mục thành công)
  async mirrorAll(){
    const d = this.dir; if(!d) return;
    for(const s of MIRROR_STORES){ await IDB.clear(s); await IDB.putMany(s, await d.all(s)); }
    const st = await d.get('kv', 'settings'); if(st) await IDB.put('kv', st);
    await IDB.clear('files');   // tệp đính kèm không giữ bản sao (đã đẩy hết vào thư mục)
    await IDB.put('kv', {id: 'mirror', name: d.root.name, at: new Date().toISOString()});
  },
  // Đẩy các thay đổi làm trong lúc chưa kết nối thư mục vào thư mục d
  async syncPending(d){
    const items = [...(this.pend || new Map())];
    for(const [k, op] of items){
      const i = k.indexOf('\t'), s = k.slice(0, i), id = k.slice(i + 1);
      if(op === 'del') await d.del(s, id);
      else { const o = await IDB.get(s, id); if(o) await d.put(s, o); }
    }
    return items.length;
  },
  async copyAll(src, dst){   // src/dst: IDB hoặc dir store
    for(const s of ['drugs', 'templates', 'patients', 'files']) await dst.putMany(s, await src.all(s));
    const st = await src.get('kv', 'settings'); if(st) await dst.put('kv', st);
  },
};

// ================= TRẠNG THÁI =================
const S = {
  patients: [], drugs: [], tpls: [], settings: {},
  view: {name: 'home'}, q: '', modal: null, editDrug: null, editTpl: null, newP: null, cmp: null,
  dq: '', mq: '', dfq: '', dg: '', fileHandle: null, fileNeedsPerm: false, gate: null, storeErr: null, otherTab: false,
};
const curP = () => S.patients.find(p => p.id === S.view.pid);
const curV = () => { const p = curP(); return p && p.visits.find(v => v.id === S.view.vid); };
const drugById = id => S.drugs.find(d => d.id === id);

// ================= Y KHOA: TÍNH TOÁN =================
function ageOf(p, at){
  at = at || todayISO();
  if(p.dob){ const [y,m,d] = p.dob.split('-').map(Number); const [Y,M,D] = at.split('-').map(Number); let a = Y - y; if(M < m || (M === m && D < d)) a--; return a; }
  if(num(p.birthYear)) return Number(at.slice(0,4)) - num(p.birthYear);
  return null;
}
const bmiOf = (w, h) => (num(w) && num(h)) ? num(w) / Math.pow(num(h) / 100, 2) : null;
function bmiClass(b){ if(b == null) return ''; if(b < 18.5) return 'Thiếu cân'; if(b < 23) return 'Bình thường'; if(b < 25) return 'Thừa cân'; if(b < 30) return 'Béo phì độ I'; return 'Béo phì độ II'; }
// CKD-EPI 2021 (không dùng hệ số chủng tộc)
function egfrCKDEPI(cr, age, sex){ const scr = cr / 88.4, f = sex === 'Nữ', k = f ? 0.7 : 0.9, a = f ? -0.241 : -0.302; return 142 * Math.pow(Math.min(scr/k, 1), a) * Math.pow(Math.max(scr/k, 1), -1.2) * Math.pow(0.9938, age) * (f ? 1.012 : 1); }
function crclCG(cr, age, w, sex){ const scr = cr / 88.4; return (140 - age) * w / (72 * scr) * (sex === 'Nữ' ? 0.85 : 1); }
const EGFR_LABEL = {G1: 'bình thường hoặc cao', G2: 'giảm nhẹ', G3a: 'giảm nhẹ – vừa', G3b: 'giảm vừa – nặng', G4: 'giảm nặng', G5: 'suy thận'};   // KDIGO
function ckdStage(e){ if(e == null) return ''; if(e >= 90) return 'G1'; if(e >= 60) return 'G2'; if(e >= 45) return 'G3a'; if(e >= 30) return 'G3b'; if(e >= 15) return 'G4'; return 'G5'; }
// Phân độ huyết áp phòng khám người trưởng thành — VNHA 2026 Bảng 3.2 (hai chỉ số khác mức → lấy mức cao hơn; không áp dụng cho thai phụ).
// ≥ 180 và/hoặc ≥ 110: đánh giá ngay tổn thương cơ quan đích cấp (Bảng 3.1).
function bpClass(s, d){ s = num(s); d = num(d); if(!s || !d) return '';
  const urg = s >= 180 || d >= 110 ? ' — ≥ 180/110: đánh giá ngay tổn thương cơ quan đích' : '';
  if(s >= 160 || d >= 100) return 'Tăng huyết áp độ 2' + (d < 90 ? ' (tâm thu đơn độc)' : '') + urg;
  if(s >= 140 || d >= 90) return 'Tăng huyết áp độ 1' + (s >= 140 && d < 90 ? ' (tâm thu đơn độc)' : '');
  if(s >= 130 || d >= 80) return 'Tiền tăng huyết áp';
  if(s >= 120) return 'Huyết áp bình thường cao';
  return 'Huyết áp bình thường'; }

function renalOf(p){
  const c = [];
  const rm = p.renalManual || {};
  if(num(rm.egfr) || num(rm.creat)) c.push({creat: num(rm.creat), egfrManual: num(rm.egfr), date: rm.date || '0000-00-00', src: 'Nhập tay'});
  for(const v of p.visits || []) for(const o of v.orders || []) if(o.key === 'creat' && num(o.value)) c.push({creat: num(o.value), date: v.date, src: (v.kind === 'old' ? 'Hồ sơ cũ ' : 'Lượt khám ') + fmtDate(v.date)});
  if(!c.length) return null;
  c.sort((a, b) => b.date.localeCompare(a.date));
  const r = c[0], a = ageOf(p, r.date === '0000-00-00' ? todayISO() : r.date), w = num(p.weight);
  let egfr = r.egfrManual, crcl = null;
  if(egfr == null && r.creat && a != null && p.sex) egfr = Math.round(egfrCKDEPI(r.creat, a, p.sex));
  if(r.creat && a != null && w && p.sex) crcl = Math.round(crclCG(r.creat, a, w, p.sex));
  return {...r, egfr, crcl, stage: ckdStage(egfr)};
}
function egfrFromOrder(p, v, o){ const a = ageOf(p, v.date); if(!num(o.value) || a == null || !p.sex) return null; return Math.round(egfrCKDEPI(num(o.value), a, p.sex)); }

const IMPLY = {vka:['anticoag'], doac:['anticoag'], acei:['raas'], arb:['raas'], clopidogrel:['antiplatelet'], aspirin:['antiplatelet'], ppi_2c19:['ppi'], ssri:['serotonergic','hyponat'], snri:['serotonergic','hyponat'], bzd:['cns_dep'], carbamazepine:['inducer','hyponat'], sulfonylurea:['antidiabetic'], metformin:['antidiabetic'], simvastatin:['statin','statin_3a4'], statin_3a4:['statin'], sucralfate:['polyvalent'], antacid:['polyvalent'], iron:['polyvalent']};
function expandTags(tags){ const s = new Set(tags || []); let added = true; while(added){ added = false; for(const t of [...s]) for(const x of IMPLY[t] || []) if(!s.has(x)){ s.add(x); added = true; } } return s; }
const MED_GROUPS = ['vka','doac','antiplatelet','nsaid','corticoid','ssri','acei','arb','diuretic','k_sparing','statin','metformin','sulfonylurea','beta_blocker','digoxin','amiodarone','levothyroxine','bzd'];

function resolveMed(m){
  const d = m.drugId ? drugById(m.drugId) : null;
  if(d) return {name: d.n + (m.dose ? ' – ' + m.dose : ''), short: d.n, tags: expandTags(d.tags), drug: d, cls: d.cls};
  if(!m.text) return null;
  const t = norm(m.text); let tags = [];
  const hit = S.drugs.find(x => { const h = norm((x.hc || '').split(',')[0]); return h.length > 3 && t.includes(h); });
  if(hit) tags = hit.tags.slice();
  if(m.grp) tags.push(m.grp);
  return {name: m.text + (m.dose ? ' – ' + m.dose : ''), short: m.text, tags: expandTags(tags), drug: hit || null, cls: hit ? hit.cls : null};
}

const DX_KEYWORDS = [['viem da day','peptic'],['loet da day','peptic'],['loet ta trang','peptic'],['xuat huyet tieu hoa','gi_bleed'],['tang huyet ap','htn'],['dai thao duong','diabetes'],['suy than','ckd'],['benh than man','ckd'],['suy tim','heart_failure'],['gut','gout'],['thoai hoa khop','oa'],['luong cuc','bipolar'],['sa sut tri tue','dementia'],['alzheimer','dementia'],['parkinson','parkinson'],['nghien ruou','alcohol_heavy'],['lo au','depression'],['xo gan','liver'],['benh gan man','liver'],['suy gan','liver'],['dong kinh','epilepsy'],['chan an tam than','anorexia'],['an vo do tam than','bulimia'],['mat ngu','insomnia'],['ha huyet ap tu the','orthostatic'],['roi loan tien dinh','vestibular'],['benh mach ngoai bien','pad'],['benh dong mach ngoai bien','pad'],['benh dong mach chi duoi','pad'],['suy dinh duong','malnutrition']];
function ctxOf(p, v){
  const a = ageOf(p, v ? v.date : null);
  const conds = new Set(p.conds || []);
  if(v && v.dx){
    dxCodes(v).forEach(c => { const it = ICD.find(x => x[0] === c); if(it) it[2].forEach(k => conds.add(k)); });
    const t = ' ' + norm((v.dx.main || '') + ' ' + (v.dx.secondary || '')) + ' ';
    DX_KEYWORDS.forEach(([kw, k]) => { if(t.includes(kw)) conds.add(k); });
  }
  if(a != null && a >= 65) conds.add('elderly');
  if(a != null && a < 18) conds.add('child');
  const alc = p.risk && p.risk.alcohol; if(alc === 'some' || alc === 'heavy') conds.add('alcohol'); if(alc === 'heavy') conds.add('alcohol_heavy');
  const bmi = bmiOf(p.weight, p.height); if(bmi != null && bmi >= 23) conds.add('obese');
  if((p.activity || 'sedentary') === 'sedentary') conds.add('sedentary');
  if(v && qtcLong(p, v)) conds.add('qt_long');
  if(v && ((v.mental || {}).sx || []).includes('sex_ed')) conds.add('erectile_dysf');   // khám tâm thần tích rối loạn cương dương
  if(v && ((v.mental || {}).sx || []).includes('sex_pe')) conds.add('premature_ejac');  // khám tâm thần tích xuất tinh sớm
  if(v && ((v.mental || {}).sx || []).some(k => k.startsWith('sex_'))) conds.add('sexual_dysf');   // khám tâm thần có rối loạn chức năng tình dục
  if(conds.has('sexual_dysf') && p.sex === 'Nữ') conds.add('sexual_dysf_f');   // điện tim mô tả QTc dài → cảnh báo mọi thuốc kéo dài QT
  const renal = renalOf(p);
  const longMeds = (p.meds || []).map(resolveMed).filter(Boolean);
  const longTags = new Set(); longMeds.forEach(m => m.tags.forEach(t => longTags.add(t)));
  return {age: a, sex: p.sex, conds, renal, egfr: renal ? renal.egfr : null, longMeds, longTags, allergies: p.allergies || [], allergyText: p.allergyText || '', bmi};
}
// Tự tích "Chuyển tuyến" (bác sĩ đặt 2026-11-07): có khám tâm thần (tích bất kỳ mục nào) VÀ
// bệnh sử ghi tự sát / tự hại / bạo lực / gây hại người khác / kích động nặng / không ăn uống, HOẶC
// khám lâm sàng ghi suy kiệt / dấu hiệu mất nước (+) / rối loạn định hướng, HOẶC tích bất kỳ mục loạn thần (nhóm 'psy')
function referReasons(p, v){
  const sx = ((v && v.mental) || {}).sx || [];
  if(!sx.length) return [];
  const r = [], hpi = v.hpi || '', ex = v.exam || '';
  // phủ định rộng hơn mentionsSymptom: "không có ý định tự sát" (phủ định cách ≤ 4 từ)
  const say = (txt, kw) => { const t = ' ' + norm(txt).replace(/[^a-z0-9]+/g, ' ') + ' '; let i = t.indexOf(' ' + kw + ' ');
    while(i >= 0){ if(!/\b(khong|ko|chua|het|phu nhan)\b(\s+\w+){0,4}\s*$/.test(t.slice(Math.max(0, i - 40), i))) return true; i = t.indexOf(' ' + kw + ' ', i + 1); } return false; };
  const H = [['tu sat', 'tự sát'], ['tu tu', 'tự sát'], ['tu hai', 'tự hại'], ['bao luc', 'bạo lực'], ['gay hai nguoi khac', 'gây hại người khác'], ['kich dong nang', 'kích động nặng'], ['khong an uong', 'không ăn uống']];
  H.forEach(([k, t]) => { if(say(hpi, k) && !r.includes('bệnh sử: ' + t)) r.push('bệnh sử: ' + t); });
  if(say(ex, 'suy kiet')) r.push('khám: suy kiệt');
  const exN = ' ' + norm(ex) + ' ';
  if(say(ex, 'mat nuoc') && !/mat nuoc\s*(\(\s*-\s*\)|-|am tinh|khong)/.test(exN)) r.push('khám: dấu hiệu mất nước (+)');
  if(say(ex, 'roi loan dinh huong')) r.push('khám: rối loạn định hướng');
  const psy = (MENTAL_SX.find(g => g.g === 'psy') || {items: []}).items.filter(([k]) => sx.includes(k)).map(([, l]) => l.toLowerCase());
  if(psy.length) r.push('loạn thần: ' + psy.join(', '));
  return r;
}
function condLabel(k){ const c = CONDS.find(x => x.k === k); return c ? c.t : (COND_EXTRA[k] || k); }

// ================= KIỂM TRA ĐƠN THUỐC =================
function drugChecks(d, ctx){
  const out = [], tags = expandTags(d.tags);
  const push = (lv, kind, m) => out.push({lv, kind, title: d.n, m});
  for(const k of ctx.allergies){ const def = ALLERGY.find(a => a.k === k); if(!def) continue; let best = 0; for(const t of tags) best = Math.max(best, def.hit[t] || 0); if(best) push(best, 'Dị ứng', best === 3 ? `Bệnh nhân dị ứng ${def.t}.` : `Bệnh nhân dị ứng ${def.t} — có thể dị ứng chéo, thận trọng.`); }
  if(ctx.allergyText){ const hay = norm(d.n + ' ' + d.hc); norm(ctx.allergyText).split(/[,;\n]+/).map(s => s.trim()).filter(s => s.length >= 4).forEach(tok => { if(hay.includes(tok)) push(3, 'Dị ứng', `Bệnh nhân có ghi nhận dị ứng: "${tok}".`); }); }
  if(ctx.egfr != null && d.renal && d.renal.length){ const r = d.renal.filter(x => num(x.lt) && ctx.egfr < num(x.lt)).sort((a, b) => num(a.lt) - num(b.lt))[0]; if(r) push(num(r.lv) || 2, 'Chức năng thận', `eGFR ≈ ${fmtN(ctx.egfr)}${ctx.renal && ctx.renal.crcl ? ` (CrCl ≈ ${fmtN(ctx.renal.crcl)})` : ''}: ${r.m}`); }
  else if(ctx.egfr == null && ctx.conds.has('ckd') && d.renal && d.renal.some(x => x.lv >= 2)) push(1, 'Chức năng thận', 'Bệnh nhân có bệnh thận nhưng chưa có creatinin/eGFR — cần đánh giá để chỉnh liều.');
  if(ctx.conds.has('liver') && d.hep && d.hep.m) push(num(d.hep.lv) || 2, 'Chức năng gan', d.hep.m);
  if(ctx.conds.has('elderly') && d.old && d.old.m) push(num(d.old.lv) || 1, 'Người cao tuổi', d.old.m);
  if(ctx.conds.has('pregnant')) push(d.preg && d.preg.m ? (num(d.preg.lv) || 2) : 1, 'Thai kỳ', d.preg && d.preg.m ? d.preg.m : 'Chưa có thông tin dùng khi mang thai trong danh mục — cần kiểm tra.');
  if(ctx.conds.has('breastfeeding')) push(d.lact && d.lact.m ? (num(d.lact.lv) || 1) : 1, 'Cho con bú', d.lact && d.lact.m ? d.lact.m : 'Chưa có thông tin dùng khi cho con bú trong danh mục — cần kiểm tra.');
  if(ctx.conds.has('child')) push(2, 'Trẻ em', 'Liều trong danh mục là liều người lớn — kiểm tra liều theo tuổi/cân nặng.');
  for(const [k, w] of Object.entries(d.cond || {})) if(ctx.conds.has(k) && w && w.m) out.push({lv: num(w.lv) || 2, kind: 'Bệnh kèm', title: `${d.n} — ${condLabel(k)}`, m: w.m});
  return out;
}

// ---- Quy tắc phòng khám của BS. Toàn cho SSRI/SNRI (bác sĩ đặt 2026-10-24) ----
// KHÔNG cho kê SSRI/SNRI khi: (1) khám tâm thần có rối loạn chức năng tình dục (hoặc chẩn đoán F52.x);
// (2) bệnh sử / lý do khám có buồn nôn, tiêu chảy; (3) thuốc dài hạn có NSAID, kháng đông, chống kết tập tiểu cầu
// (kể cả aspirin), cường giao cảm (kể cả salbutamol).
// Có tiền sử rối loạn lưỡng cực → chỉ CẢNH BÁO (Stahl: thận trọng nếu không kèm thuốc chỉnh khí sắc).
const isSsriSnri = d => !!d && (expandTags(d.tags).has('ssri') || expandTags(d.tags).has('snri') || ['SSRI', 'SNRI'].includes(d.cls));
const LONG_KW = {
  nsaid: ['ibuprofen', 'diclofenac', 'meloxicam', 'celecoxib', 'etoricoxib', 'naproxen', 'piroxicam', 'ketoprofen', 'indomethacin', 'aceclofenac', 'nimesulid'],
  anticoag: ['warfarin', 'acenocoumarol', 'sintrom', 'rivaroxaban', 'apixaban', 'dabigatran', 'edoxaban', 'heparin', 'enoxaparin', 'fondaparinux'],
  antiplatelet: ['aspirin', 'acetylsalicylic', 'clopidogrel', 'ticagrelor', 'prasugrel', 'cilostazol', 'dipyridamol'],
  sympathomimetic: ['pseudoephedrin', 'phenylephrin', 'ephedrin', 'epinephrin', 'adrenalin', 'noradrenalin', 'norepinephrin', 'methylphenidat', 'amphetamin', 'midodrin', 'salbutamol'],
};
const LONG_KW_LABEL = {nsaid: 'NSAID', anticoag: 'thuốc kháng đông', antiplatelet: 'thuốc chống kết tập tiểu cầu (kể cả aspirin)', sympathomimetic: 'thuốc cường giao cảm'};
// Có nhắc tới triệu chứng nhưng KHÔNG đứng sau từ phủ định gần đó ("không buồn nôn", "chưa tiêu chảy")
function mentionsSymptom(text, kw){
  const t = ' ' + norm(text || '').replace(/[^a-z0-9]+/g, ' ') + ' ';
  let i = t.indexOf(' ' + kw + ' ');
  while(i >= 0){ const before = t.slice(Math.max(0, i - 20), i); if(!/\b(khong|ko|chua|het)\b(\s+\w+){0,2}\s*$/.test(before)) return true; i = t.indexOf(' ' + kw + ' ', i + 1); }
  return false;
}
// Mã ICD của lượt khám: chẩn đoán chính (v.dx.icd) và chẩn đoán phụ (v.dx.icd2)
function dxCodes(v){ const d = (v && v.dx) || {}; return [d.icd, d.icd2].map(x => String(x || '').trim().split(' ')[0]).filter(Boolean); }
function ssriBlockReasons(p, v, ctx){
  ctx = ctx || ctxOf(p, v);
  const out = [], m = (v && v.mental) || {}, sx = m.sx || [];
  const sexItems = (MENTAL_SX.find(g => g.g === 'sex') || {items: []}).items.filter(([k]) => sx.includes(k)).map(([, l]) => l.toLowerCase());
  const icd = dxCodes(v).find(c => /^F52/.test(c)) || '';
  if(sexItems.length) out.push('khám tâm thần có rối loạn chức năng tình dục (' + sexItems.join(', ') + ')');
  else if(/^F52/.test(icd)) out.push('chẩn đoán rối loạn chức năng tình dục (' + icd.split(' ')[0] + ')');
  const gi = ['buon non', 'tieu chay', 'phan long'].filter(k => mentionsSymptom(((v && v.hpi) || '') + ' . ' + ((v && v.reason) || ''), k));
  if(gi.length) out.push('bệnh sử có ' + gi.map(k => ({'buon non': 'buồn nôn', 'tieu chay': 'tiêu chảy', 'phan long': 'phân lỏng'})[k]).join(', '));
  for(const [tag, kws] of Object.entries(LONG_KW)){
    const hit = ctx.longMeds.filter(lm => lm.tags.has(tag) || kws.some(k => norm(lm.name).includes(k))).map(lm => lm.short);
    if(hit.length) out.push(`đang dùng dài hạn ${LONG_KW_LABEL[tag]} (${[...new Set(hit)].join(', ')})`);
  }
  return out;
}
// ---- QTc dài trên điện tim → không kê citalopram / escitalopram (bác sĩ đặt 2026-10-25) ----
const isCitalopram = d => !!d && norm(d.hc || '').includes('citalopram');   // gồm cả escitalopram
// Mô tả điện tim có "QT(c) dài / kéo dài" hoặc "kéo dài (khoảng) QT(c)", trừ câu phủ định "QTc không dài", "không kéo dài QT"
function qtcLongText(text){
  const t = ' ' + norm(text || '').replace(/[^a-z0-9]+/g, ' ') + ' ';
  const pos = /\bqtc?\s+(keo\s+)?dai\b|\bkeo\s+dai\s+(khoang\s+)?qtc?\b/;
  const neg = /\bqtc?\s+(khong|ko|chua)\s+(keo\s+)?dai\b|\b(khong|ko|chua)\s+(co\s+)?keo\s+dai\s+(khoang\s+)?qtc?\b/g;
  return pos.test(t.replace(neg, ' '));
}
// Kết quả điện tim mới nhất (lượt khám hiện tại trước, rồi các lượt cũ theo ngày gần nhất)
function latestEcg(p, v){
  const visits = [v].concat((p.visits || []).filter(x => x !== v).sort((a, b) => String(b.date).localeCompare(String(a.date)))).filter(Boolean);
  for(const x of visits){ const o = (x.orders || []).find(o => o.key === 'ecg' && String(o.value || '').trim()); if(o) return {text: String(o.value) + ' ' + (o.note || ''), date: x.date, current: x === v}; }
  return null;
}
function qtcLong(p, v){ const e = latestEcg(p, v); return e && qtcLongText(e.text) ? e : null; }
// "Block / blốc nhĩ thất", "block AV", "AV block", "BAV (độ I/II/III)" — bỏ câu phủ định "không block nhĩ thất"
function avBlockText(text){
  const t = ' ' + norm(text || '').replace(/[^a-z0-9]+/g, ' ') + ' ';
  const neg = /\b(khong|ko|chua)\s+(co\s+)?(block|bloc|blok)\s+(nhi\s+that|av)\b/g;
  return /\b(block|bloc|blok)\s+(nhi\s+that|av)\b|\bav\s+(block|bloc)\b|\bbav\b/.test(t.replace(neg, ' '));
}
function avBlock(p, v){ const e = latestEcg(p, v); return e && avBlockText(e.text) ? e : null; }
// ---- Agomelatin: không kê khi AST/ALT > 3 lần giới hạn trên, hoặc đơn có ciprofloxacin (bác sĩ đặt 2026-10-25; SmPC) ----
const isAgomelatine = d => !!d && norm(d.hc || '').includes('agomelatin');
const upperRef = (ref, fallback) => { const m = String(ref || '').match(/<\s*([\d.,]+)/); return m ? num(m[1]) : fallback; };
// Kết quả số mới nhất của một xét nghiệm (lượt khám hiện tại trước, rồi các lượt cũ gần nhất)
function latestOrder(p, v, key){
  const visits = [v].concat((p.visits || []).filter(x => x !== v).sort((a, b) => String(b.date).localeCompare(String(a.date)))).filter(Boolean);
  for(const x of visits){ const o = (x.orders || []).find(o => o.key === key && num(o.value) != null && String(o.value).trim() !== ''); if(o) return {o, date: x.date, current: x === v}; }
  return null;
}
// β-hCG mới nhất: {text, date, current, pos} — pos true (> 5 hoặc "dương tính"), false (≤ 5, "< 5", "âm tính"), null (không đọc được)
function bhcgLatest(p, v){
  const visits = [v].concat((p.visits || []).filter(x => x !== v).sort((a, b) => String(b.date).localeCompare(String(a.date)))).filter(Boolean);
  for(const x of visits){
    const o = (x.orders || []).find(o => o.key === 'bhcg' && String(o.value ?? '').trim() !== ''); if(!o) continue;
    const raw = String(o.value), t = norm(raw), n = num(raw);
    const pos = /duong tinh|\(\+\)|^\+$/.test(t) ? true : /am tinh|\(-\)|^-$/.test(t) || /^\s*</.test(raw) ? false : n != null ? n > 5 : null;
    return {text: typeof o.value === 'number' ? fmtN(o.value) + ' mIU/mL' : raw.trim(), date: x.date, current: x === v, pos};
  }
  return null;
}
function transaminaseHigh(p, v){
  const out = [];
  for(const k of ['ast', 'alt']){
    const r = latestOrder(p, v, k); if(!r) continue;
    const lab = LABS.find(l => l[1] === k), uln = upperRef(r.o.ref, upperRef(lab && lab[4], 40)), val = num(r.o.value);
    if(uln && val > 3 * uln) out.push(`${k.toUpperCase()} ${fmtN(val)} U/L (> 3 × ${fmtN(uln)}${r.current ? '' : ', ngày ' + fmtDate(r.date)})`);
  }
  return out;
}
function cyp1a2InhNames(p, v, ctx){
  const kw = ['ciprofloxacin', 'fluvoxamin'], hit = d => d && kw.some(k => norm((d.hc || '') + ' ' + (d.n || '')).includes(k));
  const rx = (v.rx || []).map(l => drugById(l.drugId)).filter(hit).map(d => d.n + ' (trong đơn)');
  const lg = (ctx || ctxOf(p, v)).longMeds.filter(m => hit(m.drug) || kw.some(k => norm(m.name).includes(k))).map(m => m.short + ' (dài hạn)');
  return [...new Set(rx.concat(lg))];
}
// Đang cho con bú: ô bệnh nền "Đang cho con bú", hoặc phần tiền sử ghi "(đang) cho con bú", "nuôi con bằng sữa mẹ" (bỏ câu phủ định)
function breastfeeding(p, v, ctx){
  if(p.sex === 'Nam') return false;
  if((ctx || ctxOf(p, v)).conds.has('breastfeeding')) return true;
  // bỏ "đã / từng / trước đây / ngừng / cai … cho con bú" (sửa 2026-11-02 do chặn nhầm)
  const t = (' ' + norm((p.condNote || '') + ' . ' + ((v && v.hpi) || '')).replace(/[^a-z0-9]+/g, ' ') + ' ')
    .replace(/\b(da|tung|truoc|truoc day|ngung|ngung|thoi|cai sua|da cai sua)( \w+){0,2} (cho con bu|cho bu|nuoi con bang sua me)\b/g, ' ');
  if(/\b(da cai sua|cai sua roi|thoi cho con bu|ngung cho con bu)\b/.test(t)) return false;
  return ['cho con bu', 'dang cho bu', 'nuoi con bang sua me'].some(k => mentionsSymptom(t, k));
}
// Đang mang thai: β-hCG mới nhất dương tính (> 5) trong 280 ngày gần đây, ô bệnh nền "Đang mang thai",
// hoặc tiền sử / bệnh sử ghi "mang thai", "có thai" (bỏ câu phủ định). Trả về mô tả lý do hoặc ''.
// Câu tiền sử / bệnh sử có nói ĐANG mang thai không. Bỏ (sửa 2026-11-02 do chặn nhầm):
// tiền sử sản khoa ("đã / từng / trước / lần … mang thai", "mang thai 2 lần", "PARA"), dự định / phòng tránh ("tránh, dự định, kế hoạch, muốn … mang thai"),
// "sau mang thai", và phủ định (mentionsSymptom bỏ "không / chưa / hết …").
function pregnancyText(p, v){
  let t = ' ' + norm((p.condNote || '') + ' . ' + ((v && v.hpi) || '') + ' . ' + ((v && v.reason) || '')).replace(/[^a-z0-9]+/g, ' ') + ' ';
  const P = '(mang thai|co thai|co bau)';
  t = t.replace(new RegExp(`\\b(da|tung|truoc|lan|sau|tranh|phong tranh|du dinh|ke hoach|muon|chuan bi|neu)( \\w+){0,2} ${P}\\b`, 'g'), ' ')
       .replace(new RegExp(`\\b${P} \\d+ lan\\b`, 'g'), ' ');
  return ['mang thai', 'co thai', 'co bau'].some(k => mentionsSymptom(t, k));
}
// Đã kết thúc thai kỳ (sinh, sảy, phá thai) — để không lấy β-hCG dương tính cũ
function pregnancyEnded(p, v){
  const t = norm((p.condNote || '') + ' . ' + ((v && v.hpi) || '') + ' . ' + ((v && v.reason) || ''));
  return /\b(sau sinh|da sinh|sinh con|vua sinh|hau san|say thai|pha thai|dinh chi thai|nao hut thai|cho con bu|dang cho bu)\b/.test(t);
}
function pregnancyReason(p, v, ctx){
  if(p.sex === 'Nam') return '';
  if((ctx || ctxOf(p, v)).conds.has('pregnant')) return 'hồ sơ nền tích ô đang mang thai (hoặc chẩn đoán thai kỳ)';
  if(pregnancyText(p, v)) return 'tiền sử / bệnh sử ghi đang mang thai';
  const r = bhcgLatest(p, v);
  if(r && r.pos === true && (r.current || (v && v.date && r.date && daysBetween(r.date, v.date) <= 280 && !pregnancyEnded(p, v)))) return `β-hCG ${r.text}${r.current ? '' : ' (ngày ' + fmtDate(r.date) + ')'} > 5 mIU/mL`;
  return '';
}
// Rối loạn / lo ngại rối loạn tình dục: bệnh nền `sexual_dysf` (ô hồ sơ hoặc ICD F52.x), khám tâm thần nhóm `sex_*`,
// hoặc tiền sử / bệnh sử ghi các từ khoá (bỏ câu phủ định). Trả về mô tả lý do hoặc ''.
function sexualConcern(p, v, ctx){
  if((ctx || ctxOf(p, v)).conds.has('sexual_dysf')) return 'hồ sơ ghi rối loạn / lo ngại chức năng tình dục';
  const sx = ((v && v.mental && v.mental.sx) || []).filter(k => k.startsWith('sex_'));
  if(sx.length) return 'khám tâm thần có rối loạn chức năng tình dục';
  const t = (p.condNote || '') + ' . ' + ((v && v.hpi) || '') + ' . ' + ((v && v.reason) || '');
  const kw = ['roi loan tinh duc', 'roi loan chuc nang tinh duc', 'lo ngai tinh duc', 'roi loan cuong', 'xuat tinh som', 'giam ham muon', 'lanh cam', 'dau khi giao hop'];
  return kw.some(k => mentionsSymptom(t, k)) ? 'tiền sử / bệnh sử ghi rối loạn chức năng tình dục' : '';
}
// Fluoxetin (bác sĩ đặt 2026-10-26): buồn nôn, rối loạn tình dục, tiêu chảy, mất ngủ, tiền sử động kinh.
// Buồn nôn / tiêu chảy đã chặn chung SSRI (ssriBlockReasons) — ở đây chỉ thêm phần rộng hơn: lo ngại tình dục (sexualConcern),
// mất ngủ (ICD G47.0 / F51.0, chẩn đoán hoặc bệnh sử / tiền sử ghi "mất ngủ", "khó ngủ"), động kinh theo ICD / chữ (ô tích đã chặn mọi SSRI).
function fluoxBlockReasons(p, v, ctx){
  const C = (ctx || ctxOf(p, v)).conds, out = [];
  const s = sexualConcern(p, v, ctx); if(s) out.push(s);
  const t = ((v && v.hpi) || '') + ' . ' + ((v && v.reason) || '') + ' . ' + (p.condNote || '');
  if(C.has('insomnia') || ['mat ngu', 'kho ngu'].some(k => mentionsSymptom(t, k))) out.push('mất ngủ');
  if(C.has('epilepsy') && !(p.conds || []).includes('epilepsy')) out.push('tiền sử động kinh');
  return out;
}
// Đang hút thuốc lá (hồ sơ "Đang hút" hoặc tiền sử ghi "hút thuốc"; "đã bỏ" không tính) / béo phì (BMI ≥ 25, ICD E66, "béo phì")
function smokeObeseReasons(p, v){
  const out = [], r = p.risk || {}, note = norm((p.condNote || '') + ' . ' + (p.social || '')).replace(/\b(da|tung)\s+bo\s+(hut\s+)?thuoc(\s+la)?\b|\bbo\s+thuoc(\s+la)?\b/g, ' ');
  if(r.smoke === 'current' || (r.smoke !== 'former' && ['hut thuoc'].some(k => mentionsSymptom(note, k)))) out.push('đang hút thuốc lá');
  const vt = (v && v.vitals) || {}, b = bmiOf(num(vt.weight) || p.weight, num(vt.height) || p.height);
  const dxT = norm(((v && v.dx && (v.dx.main + ' ' + v.dx.secondary + ' ' + v.dx.icd + ' ' + (v.dx.icd2 || ''))) || '') + ' ' + (p.condNote || ''));
  if(b != null && b >= 25) out.push(`béo phì (BMI ${fmtN(b, 1)})`);
  else if(/\be66\b|beo phi/.test(dxT)) out.push('béo phì (ghi trong chẩn đoán / tiền sử)');
  return out;
}
// IMAO chống trầm cảm (không tính selegilin / rasagilin – ức chế MAO-B điều trị Parkinson)
const isMaoi = d => !!d && (/imao|maoi/.test(norm(d.cls || '')) || ['moclobemid', 'phenelzin', 'tranylcypromin', 'isocarboxazid'].some(k => norm(d.hc || '').includes(k)));
const isTca = d => !!d && (/3 vong|ba vong|tca/.test(norm(d.cls || '')) || ['amitriptylin', 'clomipramin', 'imipramin', 'nortriptylin', 'doxepin'].some(k => norm(d.hc || '').includes(k)));
const TCA_EPI_MAX = 150;   // mg/ngày — ngưỡng "liều cao" của TCA ở bệnh nhân động kinh (bác sĩ có thể đổi)
// Liều mg/ngày của một dòng đơn: (sáng + trưa + chiều + tối) × hàm lượng ghi trong tên thuốc ("… 25 mg")
function dailyMg(d, line){ const m = String(d.n || '').match(/(\d+(?:[.,]\d+)?)\s*mg/i); if(!m) return null; const per = num(m[1]); const n = ['s', 'tr', 'c', 't'].reduce((a, k) => a + (num(line[k]) || 0), 0); return per * n; }
// Mọi lý do chặn kê một thuốc theo quy tắc phòng khám (line: dòng đơn nếu đã có trong đơn — để xét liều)
function drugBlockReasons(p, v, d, ctx, line){
  if(!d || !v) return [];
  const out = [];
  // Valproat: bệnh nhân NỮ chưa có kết quả β-hCG (trong 7 ngày gần nhất) hoặc β-hCG > 5 mIU/mL → không kê (bác sĩ đặt 2026-10-25)
  const H = norm(d.hc || '') + ' ' + norm(d.n || ''), C = (ctx || ctxOf(p, v)).conds;
  // Bệnh gan mạn / xơ gan → không kê agomelatin, duloxetin, valproat, nefazodon (bác sĩ đặt 2026-10-25; độc gan)
  if(C.has('liver')){ const k = ['agomelatin', 'duloxetin', 'valpro', 'nefazodon'].find(x => H.includes(x)); if(k) out.push('bệnh nền bệnh gan mạn / xơ gan (thuốc có độc tính gan hoặc chống chỉ định khi bệnh gan)'); }
  // Động kinh → không kê bupropion, clomipramin; thuốc chống trầm cảm 3 vòng liều cao (> TCA_EPI_MAX mg/ngày) (bác sĩ đặt 2026-10-25; hạ ngưỡng co giật)
  // Chán ăn tâm thần (ICD F50.0 / F50.1) → không kê TCA, IMAO, bupropion (bác sĩ đặt 2026-10-26; LEC9: TCA độc tính tim ở người suy dinh dưỡng, bupropion chống chỉ định vì tăng co giật)
  if(C.has('anorexia')){
    if(isTca(d)) out.push('chán ăn tâm thần (thuốc chống trầm cảm 3 vòng: độc tính trên tim ở người suy dinh dưỡng)');
    else if(H.includes('bupropion')) out.push('chán ăn tâm thần (bupropion chống chỉ định ở rối loạn ăn uống: tăng nguy cơ co giật)');
    else if(isMaoi(d)) out.push('chán ăn tâm thần (thuốc ức chế MAO – IMAO)');
  }
  // Ăn vô độ tâm thần (ICD F50.2 / F50.3) → không kê bupropion (bác sĩ đặt 2026-10-26; LEC9: chống chỉ định ở rối loạn ăn uống vì tăng co giật)
  if(C.has('bulimia') && H.includes('bupropion')) out.push('ăn vô độ tâm thần (bupropion chống chỉ định ở rối loạn ăn uống: tăng nguy cơ co giật)');
  // Olanzapin (bác sĩ đặt 2026-10-26): QT kéo dài (ô hồ sơ hoặc điện tim mô tả QTc dài) / hạ huyết áp tư thế (I95.1, chẩn đoán hoặc tiền sử / bệnh sử ghi)
  if(H.includes('olanzapin')){
    const r = [];
    if(C.has('qt_long')) r.push('QT kéo dài');
    if(C.has('orthostatic') || mentionsSymptom((p.condNote || '') + ' . ' + ((v && v.hpi) || '') + ' . ' + ((v && v.reason) || ''), 'ha huyet ap tu the')) r.push('hạ huyết áp tư thế');
    if(r.length) out.push('olanzapin: ' + r.join('; ') + ' (olanzapin có thể kéo dài QT, gây hạ huyết áp tư thế)');
  }
  if(H.includes('fluoxetin')){ const r = fluoxBlockReasons(p, v, ctx); if(r.length) out.push('fluoxetin: ' + r.join('; ') + ' (fluoxetin gây kích hoạt, mất ngủ, buồn nôn, rối loạn tình dục; hạ ngưỡng co giật)'); }
  // Tiền sử (ô "Tiền sử bệnh, phẫu thuật, nhập viện") ghi đang dùng rượu → không kê benzodiazepin (bác sĩ đặt 2026-10-27; ức chế hô hấp, lệ thuộc)
  if(d.cls === 'Benzodiazepin' || expandTags(d.tags).has('bzd')){
    const kw = ['dang su dung ruou', 'dang dung ruou', 'dang uong ruou', 'dang nghien ruou'];
    if(kw.some(k => mentionsSymptom(p.condNote || '', k))) out.push('tiền sử ghi đang sử dụng rượu (benzodiazepin + rượu: ức chế hô hấp, an thần quá mức, lệ thuộc)');
    else if(['some', 'heavy'].includes((p.risk || {}).alcohol)) out.push(`hồ sơ ghi có uống rượu bia (${p.risk.alcohol === 'heavy' ? 'thường xuyên, nhiều' : 'thỉnh thoảng'}) (benzodiazepin + rượu: ức chế hô hấp, an thần quá mức, lệ thuộc)`);
  }
  // Pregabalin (viên chứa lactose): tiền sử ghi không dung nạp galactose / thiếu lactase Lapp / kém hấp thu glucose – galactose → không kê (bác sĩ đặt 2026-10-27)
  if(H.includes('pregabalin')){
    const kw = ['khong dung nap galactose', 'thieu lactase lapp', 'thieu lactase', 'kem hap thu glucose galactose'];
    if(kw.some(k => mentionsSymptom(p.condNote || '', k))) out.push('tiền sử ghi không dung nạp galactose / thiếu lactase Lapp / kém hấp thu glucose – galactose (viên pregabalin chứa lactose)');
  }
  // Propranolol (bác sĩ đặt 2026-10-27): bệnh nền hen / COPD, rung nhĩ / rối loạn nhịp, suy tim; tiền sử ghi bệnh mạch ngoại biên nặng → không kê
  if(H.includes('propranolol')){
    const r = [['asthma', 'hen / COPD (co thắt phế quản)'], ['af', 'rối loạn nhịp'], ['heart_failure', 'suy tim']].filter(([k]) => C.has(k)).map(([, t]) => t);
    if(['benh mach ngoai bien nang', 'benh dong mach ngoai bien nang', 'benh mach mau ngoai bien nang'].some(k => mentionsSymptom(p.condNote || '', k))) r.push('bệnh mạch ngoại biên nặng');
    if(r.length) out.push('propranolol: bệnh nền ' + r.join('; '));
  }
  // Methylphenidat (bác sĩ đặt 2026-11-05): tiền sử THA, rối loạn nhịp, động kinh, bệnh mạch ngoại biên, glôcôm góc đóng, tic, chóng mặt (ô tích hoặc ghi trong tiền sử)
  if(H.includes('methylphenidat')){
    const say = k => mentionsSymptom(p.condNote || '', k);
    const r = [['htn', 'tăng huyết áp', ['tang huyet ap']], ['af', 'rối loạn nhịp', ['roi loan nhip', 'rung nhi', 'ngoai tam thu']], ['epilepsy', 'động kinh', ['dong kinh']],
      ['pad', 'bệnh mạch ngoại biên', ['benh mach ngoai bien', 'benh dong mach ngoai bien', 'benh dong mach chi duoi']], ['glaucoma', 'glôcôm góc đóng', ['glocom', 'glaucoma', 'tang nhan ap']],
      ['', 'tic', ['tic', 'tourette']], ['', 'chóng mặt', ['chong mat']]]
      .filter(([k, , kws]) => (k && C.has(k)) || kws.some(say)).map(([, t]) => t);
    if(r.length) out.push('methylphenidat: tiền sử ' + r.join(', '));
  }
  // Ginkgo biloba (bác sĩ đặt 2026-11-07): ô tiền sử ghi đang dùng thuốc chống kết tập tiểu cầu / chống đông (hoặc thuốc dài hạn thuộc 2 nhóm này),
  // tai biến / đột quỵ / nhồi máu cơ tim trong ≤ 1 tháng (chữ có số ngày / tuần / tháng, hoặc mã ICD I21–I22, I60–I64 ở lượt khám ≤ 30 ngày), tâm thần phân liệt (chữ hoặc F20);
  // tích ô động kinh, viêm / loét dạ dày, hen / COPD, rối loạn cương dương
  if(norm(d.hc || '').includes('ginkgo')){
    const note = p.condNote || '', pcs = p.conds || [], r = [];
    const nt = ' ' + norm(note).replace(/[^a-z0-9]+/g, ' ') + ' ';
    const neg = s => /\b(khong|ko|chua|het|ngung|da ngung|da bo|bo)\b(\s+\w+){0,3}\s*$/.test(s);
    const hits = kw => { const o = []; let i = nt.indexOf(' ' + kw + ' '); while(i >= 0){ if(!neg(nt.slice(Math.max(0, i - 30), i))) o.push(i); i = nt.indexOf(' ' + kw + ' ', i + 1); } return o; };
    const ACP = ['chong ket tap tieu cau', 'chong dong', 'khang dong'].concat(LONG_KW.antiplatelet, LONG_KW.anticoag);
    const drugTxt = ACP.filter(k => hits(k).length);
    const longHit = ctxOf(p, v).longMeds.filter(lm => lm.tags.has('antiplatelet') || lm.tags.has('anticoag') || ACP.some(k => norm(lm.name).includes(k))).map(lm => lm.short);
    if(drugTxt.length || longHit.length) r.push('đang dùng thuốc chống kết tập tiểu cầu / chống đông' + (longHit.length ? ' (' + [...new Set(longHit)].join(', ') + ')' : ''));
    const within1m = kw => hits(kw).some(i => { const m = nt.slice(i, i + kw.length + 45).match(/\b(\d+)\s+(ngay|tuan|thang)\b/); return m && Number(m[1]) * {ngay: 1, tuan: 7, thang: 30}[m[2]] <= 30; });
    const ev = [['tai bien', 'tai biến'], ['dot quy', 'tai biến'], ['nhoi mau nao', 'tai biến'], ['xuat huyet nao', 'tai biến'], ['nhoi mau co tim', 'nhồi máu cơ tim']].filter(([k]) => within1m(k)).map(([, l]) => l);
    (p.visits || []).forEach(x => { if(x.date && v.date && daysBetween(x.date, v.date) >= 0 && daysBetween(x.date, v.date) <= 30) dxCodes(x).forEach(c => { if(/^I2[12]/.test(c)) ev.push('nhồi máu cơ tim'); if(/^I6[0-4]/.test(c)) ev.push('tai biến'); }); });
    if(ev.length) r.push([...new Set(ev)].join(', ') + ' trong ≤ 1 tháng');
    if(hits('tam than phan liet').length || dxCodes(v).some(c => /^F20/.test(c))) r.push('tâm thần phân liệt');
    [['epilepsy', 'động kinh'], ['peptic', 'viêm / loét dạ dày'], ['asthma', 'hen / COPD'], ['erectile_dysf', 'rối loạn cương dương']].forEach(([k, l]) => { if(pcs.includes(k)) r.push('tích ' + l); });
    if(r.length) out.push('ginkgo biloba: ' + r.join('; '));
  }
  // Cholin alfoscerat (bác sĩ đặt 2026-11-07): hồ sơ nền tích hen / COPD, rối loạn nhịp, viêm / loét dạ dày, mang thai, cho con bú (chỉ ô tích;
  // mang thai / cho con bú còn được quy tắc chung nhóm thần kinh – tâm thần bắt cả khi ghi chữ)
  if(norm(d.hc || '').includes('alfoscerat')){
    const pcs = p.conds || [];
    const r = [['asthma', 'hen / COPD'], ['af', 'rối loạn nhịp'], ['peptic', 'viêm / loét dạ dày']].filter(([k]) => pcs.includes(k)).map(([, l]) => l);   // mang thai / cho con bú: quy tắc chung nhóm neuro (không lặp)
    if(r.length) out.push('cholin alfoscerat: hồ sơ nền tích ' + r.join(', '));
  }
  // Citicolin (bác sĩ đặt 2026-11-07): tiền sử bệnh thận mạn, xơ gan, động kinh, trầm cảm — ô tích ở hồ sơ nền hoặc ghi trong ô tiền sử
  if(norm(d.hc || '').includes('citicolin')){
    const pcs = p.conds || [], say = k => mentionsSymptom(p.condNote || '', k);
    const r = [['ckd', 'bệnh thận mạn', ['benh than man', 'suy than']], ['liver', 'xơ gan', ['xo gan']], ['epilepsy', 'động kinh', ['dong kinh']], ['depression', 'trầm cảm', ['tram cam']]]
      .filter(([k, , kws]) => pcs.includes(k) || kws.some(say)).map(([, l]) => l);
    if(r.length) out.push('citicolin: tiền sử ' + r.join(', '));
  }
  // Cerebrolysin (bác sĩ đặt 2026-11-07): tích ô động kinh ở hồ sơ nền (chỉ ô tích), MLCT < 60 → không kê
  if(norm(d.hc || '').includes('cerebrolysin')){
    if((p.conds || []).includes('epilepsy')) out.push('cerebrolysin: hồ sơ nền tích động kinh');
    const rn = renalOf(p);
    if(rn && rn.egfr != null && rn.egfr < 60) out.push(`cerebrolysin: MLCT ≈ ${fmtN(rn.egfr)} mL/phút/1,73 m² (< 60)`);
  }
  // Memantin (bác sĩ đặt 2026-11-07): MLCT (eGFR CKD-EPI 2021, creatinin mới nhất hoặc nhập tay) < 60 → không kê
  if(norm(d.hc || '').includes('memantin')){
    const rn = renalOf(p);
    if(rn && rn.egfr != null && rn.egfr < 60) out.push(`memantin: MLCT ≈ ${fmtN(rn.egfr)} mL/phút/1,73 m² (< 60)`);
  }
  // Risperidon (bác sĩ đặt 2026-11-07, áp cho mọi risperidon): < 18 tuổi kèm cân nặng < 50 kg; ô tiền sử ghi điều trị paroxetin, furosemid, chẹn alpha giao cảm, levodopa
  // (hoặc thuốc dài hạn có các thuốc này); tích ô động kinh, uống rượu (mục nguy cơ), rối loạn / lo ngại chức năng tình dục, rối loạn cương; Parkinson, sa sút trí tuệ thể Lewy,
  // bệnh mạch ngoại biên (chữ hoặc ô tích). Mang thai / cho con bú: quy tắc chung nhóm neuro. Xơ gan, bệnh thận mạn → cảnh báo giảm liều ở checkAll (risperidonDoseWarn)
  if(norm(d.hc || '').includes('risperidon')){
    const r = [], pcs = p.conds || [], say = k => mentionsSymptom(p.condNote || '', k), a = ageOf(p, v.date);
    const vt = v.vitals || {}, w = num(vt.weight) || num(p.weight);
    if(a != null && a < 18 && w != null && w < 50) r.push(`${a} tuổi, cân nặng ${fmtN(w)} kg (< 18 tuổi và < 50 kg)`);
    const ALPHA = ['chen alpha', 'doxazosin', 'prazosin', 'terazosin', 'tamsulosin', 'alfuzosin', 'silodosin'];
    const DRUGS = [['paroxetin', ['paroxetin', 'paroxetine']], ['furosemid', ['furosemid', 'furosemide']], ['thuốc chẹn alpha giao cảm', ALPHA], ['levodopa', ['levodopa']]];
    const longN = ctxOf(p, v).longMeds.map(lm => norm(lm.name));
    DRUGS.forEach(([l, kws]) => { if(kws.some(say) || kws.some(k => longN.some(n => n.includes(k)))) r.push('đang điều trị ' + l); });
    if(pcs.includes('epilepsy')) r.push('tích ô động kinh');
    if(['some', 'heavy'].includes((p.risk || {}).alcohol)) r.push('có uống rượu bia');
    if(pcs.includes('sexual_dysf') || pcs.includes('erectile_dysf')) r.push('rối loạn / lo ngại chức năng tình dục');
    if(pcs.includes('parkinson') || say('parkinson')) r.push('Parkinson');
    if(say('lewy') || say('the lewy')) r.push('sa sút trí tuệ thể Lewy');
    if(pcs.includes('pad') || say('benh mach ngoai bien') || say('benh dong mach ngoai bien')) r.push('bệnh mạch ngoại biên');
    if(r.length) out.push('risperidon: ' + r.join('; '));
  }
  // Rivastigmin 1,5 mg (bác sĩ đặt 2026-11-07, chỉ bản 1,5 mg): BMI < 19 (cân nặng / chiều cao lượt khám, thiếu thì lấy hồ sơ) → không kê
  if(d.id === 'riva15' || /rivastigmin\s*1[,.]5\s*mg/i.test(d.n || '')){
    const vt = v.vitals || {}, b = bmiOf(num(vt.weight) || p.weight, num(vt.height) || p.height);
    if(b != null && b < 19) out.push(`rivastigmin: BMI ${fmtN(b, 1)} (< 19)`);
  }
  // Ức chế cholinesterase (bác sĩ đặt 2026-11-07): chỉ xét ô tích ở hồ sơ nền (p.conds) — trầm cảm / lo âu, hen / COPD, rối loạn tiền đình, rối loạn nhịp, loét dạ dày, động kinh
  if((d.tags || []).includes('ache_inh') || d.cls === 'Ức chế cholinesterase'){
    const pcs = p.conds || [];
    const r = [['depression', 'trầm cảm / lo âu'], ['asthma', 'hen / COPD'], ['vestibular', 'rối loạn tiền đình'], ['af', 'rối loạn nhịp'], ['peptic', 'viêm / loét dạ dày – tá tràng'], ['epilepsy', 'động kinh']]
      .filter(([k]) => pcs.includes(k)).map(([, t]) => t);
    if(r.length) out.push('ức chế cholinesterase: hồ sơ nền tích ' + r.join(', '));
  }
  // Atomoxetin (bác sĩ đặt 2026-11-05): tiền sử glôcôm góc đóng, u tuỷ thượng thận, THA, rối loạn nhịp, suy dinh dưỡng, phì đại tiền liệt tuyến, rối loạn tiền đình (ô tích hoặc chữ);
  // mang thai / cho con bú: quy tắc chung nhóm thần kinh – tâm thần (d.g === 'neuro')
  if(H.includes('atomoxetin')){
    const say = k => mentionsSymptom(p.condNote || '', k);
    const r = [['glaucoma', 'glôcôm góc đóng', ['glocom', 'glaucoma', 'tang nhan ap']], ['', 'u tuỷ thượng thận', ['u tuy thuong than', 'pheochromocytoma', 'u te bao uu crom', 'u tuy tuyen thuong than']],
      ['htn', 'tăng huyết áp', ['tang huyet ap']], ['af', 'rối loạn nhịp', ['roi loan nhip', 'rung nhi', 'ngoai tam thu']], ['malnutrition', 'suy dinh dưỡng', ['suy dinh duong']],
      ['bph', 'phì đại tiền liệt tuyến', ['phi dai tien liet tuyen', 'phi dai tuyen tien liet', 'tang san tien liet tuyen']], ['vestibular', 'rối loạn tiền đình', ['roi loan tien dinh']]]
      .filter(([k, , kws]) => (k && C.has(k)) || kws.some(say)).map(([, t]) => t);
    if(r.length) out.push('atomoxetin: tiền sử ' + r.join(', '));
  }
  // Clonidin (bác sĩ đặt 2026-11-05): tiền sử glôcôm góc đóng, u tuỷ thượng thận, THA, rối loạn nhịp, rối loạn tiền đình (ô tích hoặc chữ), xơ gan (chữ);
  // mang thai / cho con bú: quy tắc chung nhóm thần kinh – tâm thần
  if(H.includes('clonidin')){
    const say = k => mentionsSymptom(p.condNote || '', k);
    const r = [['glaucoma', 'glôcôm góc đóng', ['glocom', 'glaucoma', 'tang nhan ap']], ['', 'u tuỷ thượng thận', ['u tuy thuong than', 'pheochromocytoma', 'u te bao uu crom', 'u tuy tuyen thuong than']],
      ['htn', 'tăng huyết áp', ['tang huyet ap']], ['af', 'rối loạn nhịp', ['roi loan nhip', 'rung nhi', 'ngoai tam thu']], ['vestibular', 'rối loạn tiền đình', ['roi loan tien dinh']], ['', 'xơ gan', ['xo gan']]]
      .filter(([k, , kws]) => (k && C.has(k)) || kws.some(say)).map(([, t]) => t);
    if(r.length) out.push('clonidin: tiền sử ' + r.join(', '));
  }
  // Piracetam (bác sĩ đặt 2026-11-05; cập nhật 2026-11-07: thêm MLCT < 20, xuất huyết não chữ hoặc ICD I61–I62): CrCl < 20; tiền sử ghi xơ gan / đột quỵ; đang mang thai; đang cho con bú; rối loạn tiền đình (ô tích hoặc ghi trong tiền sử)
  if(H.includes('piracetam')){
    const r = [], C2 = (ctx || ctxOf(p, v)), say = k => mentionsSymptom(p.condNote || '', k), rn = renalOf(p);
    if(rn && rn.crcl != null && rn.crcl < 20) r.push(`CrCl ≈ ${fmtN(rn.crcl)} mL/phút (< 20)`);
    else if(rn && rn.egfr != null && rn.egfr < 20) r.push(`MLCT ≈ ${fmtN(rn.egfr)} mL/phút/1,73 m² (< 20)`);
    const hx = [];
    if(say('xo gan')) hx.push('xơ gan');
    if(say('xuat huyet nao') || say('chay mau nao') || dxCodes(v).some(c => /^I6[12]/.test(c))) hx.push('xuất huyết não');
    if(['dot quy', 'tai bien mach mau nao', 'nhoi mau nao'].some(say)) hx.push('đột quỵ');
    if(hx.length) r.push('tiền sử ghi ' + hx.join(', '));
    if(d.g !== 'neuro'){ const pr = pregnancyReason(p, v, C2); if(pr) r.push('đang mang thai: ' + pr); if(breastfeeding(p, v, C2)) r.push('đang cho con bú'); }
    if(C2.conds.has('vestibular') || say('roi loan tien dinh')) r.push('rối loạn tiền đình');
    if(r.length) out.push('piracetam: ' + r.join('; '));
  }
  // Sildenafil, tadalafil — nhóm ức chế PDE5 (bác sĩ đặt 2026-11-02; tadalafil cùng quy tắc): đang dùng nitroglycerin / isosorbid (nitrat — LEC6: chống chỉ định); tiền sử nhồi máu cơ tim, đột quỵ,
  // rối loạn nhịp, suy tim, bệnh mạch vành; HA < 90/50 hoặc > 170/100 (sinh hiệu lượt khám này)
  const pde5 = ['sildenafil', 'tadalafil'].find(x => H.includes(x)) || (expandTags(d.tags).has('pde5') ? norm(d.hc || 'pde5') : '');
  if(pde5){
    const r = [], C2 = (ctx || ctxOf(p, v)), say = k => mentionsSymptom((p.condNote || '') + ' . ' + ((v && v.hpi) || ''), k);
    const nitr = C2.longMeds.filter(m => m.tags.has('nitrate') || /nitroglycerin|isosorbid|nitrat|nitromint|imdur/.test(norm(m.name))).map(m => m.short)
      .concat((v.rx || []).map(l => drugById(l.drugId)).filter(x => x && (expandTags(x.tags).has('nitrate') || /nitroglycerin|isosorbid/.test(norm(x.hc || '')))).map(x => x.n));
    if(nitr.length || ['nitroglycerin', 'isosorbid', 'dang dung nitrat'].some(say)) r.push('đang dùng nitrat' + (nitr.length ? ` (${[...new Set(nitr)].join(', ')})` : '') + ' — tụt huyết áp đột ngột, có thể tử vong (LEC6)');
    const hx = [];
    if(['nhoi mau co tim', 'nmct'].some(say) || dxCodes(v).some(c => /^I2[12]/.test(c))) hx.push('nhồi máu cơ tim');
    if(['dot quy', 'tai bien mach mau nao', 'nhoi mau nao', 'xuat huyet nao'].some(say) || dxCodes(v).some(c => /^I6[0-4]/.test(c))) hx.push('đột quỵ');
    if(C2.conds.has('af') || ['roi loan nhip', 'rung nhi', 'ngoai tam thu', 'nhip nhanh'].some(say)) hx.push('rối loạn nhịp');
    if(C2.conds.has('heart_failure') || say('suy tim')) hx.push('suy tim');
    if(C2.conds.has('cvd') || ['benh mach vanh', 'dau that nguc', 'thieu mau co tim', 'dat stent'].some(say)) hx.push('bệnh mạch vành / đột quỵ');
    if(hx.length) r.push('tiền sử ' + [...new Set(hx)].join(', '));
    const s = num((v.vitals || {}).sbp), dd = num((v.vitals || {}).dbp);
    if((s != null && s < 90) || (dd != null && dd < 50)) r.push(`huyết áp thấp ${s ?? '?'}/${dd ?? '?'} (< 90/50)`);
    if((s != null && s > 170) || (dd != null && dd > 100)) r.push(`huyết áp cao ${s ?? '?'}/${dd ?? '?'} (> 170/100)`);
    // Bác sĩ đặt thêm 2026-11-02: giới nữ; eGFR hoặc CrCl < 30
    if(p.sex === 'Nữ') r.push('bệnh nhân nữ');
    if(C2.age != null && C2.age < 18) r.push(`bệnh nhân ${C2.age} tuổi (< 18)`);
    const rn = renalOf(p);
    if(rn && ((rn.egfr != null && rn.egfr < 30) || (rn.crcl != null && rn.crcl < 30))) r.push(`chức năng thận giảm nặng (${[rn.egfr != null ? 'eGFR ≈ ' + fmtN(rn.egfr) : '', rn.crcl != null ? 'CrCl ≈ ' + fmtN(rn.crcl) : ''].filter(Boolean).join(', ')} — < 30)`);
    if(r.length) out.push(pde5 + ': ' + r.join('; '));
  }
  // Thuốc tăng huyết áp nhóm A, B, C, D: chống chỉ định theo VNHA 2026 (bác sĩ đặt 2026-10-30)
  out.push(...htnBlockReasons(p, v, d, ctx));
  // Tích ô "Động kinh" ở hồ sơ nền → không kê SSRI (bác sĩ đặt 2026-10-25; chỉ theo ô tích, không theo ICD / chữ)
  if((p.conds || []).includes('epilepsy') && d && (d.cls === 'SSRI' || expandTags(d.tags).has('ssri'))) out.push('hồ sơ nền tích ô động kinh (SSRI có thể hạ ngưỡng co giật)');
  if(C.has('epilepsy')){
    if(H.includes('bupropion')) out.push('bệnh nền động kinh (bupropion hạ ngưỡng co giật rõ)');
    else if(H.includes('clomipramin')) out.push('bệnh nền động kinh (clomipramin hạ ngưỡng co giật mạnh nhất nhóm 3 vòng)');
    else if(isTca(d) && line){ const mg = dailyMg(d, line); if(mg != null && mg > TCA_EPI_MAX) out.push(`bệnh nền động kinh: thuốc chống trầm cảm 3 vòng liều cao ${fmtN(mg)} mg/ngày (> ${TCA_EPI_MAX} mg/ngày) — hạ ngưỡng co giật`); }
  }
  // Rối loạn / lo ngại rối loạn chức năng tình dục → không kê paroxetin (bác sĩ đặt 2026-10-25; paroxetin gây rối loạn tình dục nhiều nhất nhóm SSRI)
  if(H.includes('paroxetin')){ const s = sexualConcern(p, v, ctx); if(s) out.push(s + ' (paroxetin gây rối loạn chức năng tình dục nhiều nhất nhóm SSRI)'); }
  // Hút thuốc lá HOẶC béo phì (BMI ≥ 25) → không kê mirtazapin, paroxetin, olanzapin (bác sĩ đặt 2026-10-25; tăng cân, rối loạn chuyển hoá)
  if(['mirtazapin', 'paroxetin', 'olanzapin'].some(x => H.includes(x))){ const r = smokeObeseReasons(p, v); if(r.length) out.push(r.join('; ') + ' (thuốc gây tăng cân, rối loạn chuyển hoá)'); }
  // Mirtazapin: nghề nghiệp lái xe → không kê (bác sĩ đặt 2026-11-02; an thần, buồn ngủ ban ngày)
  if(H.includes('mirtazapin') && ['lai xe', 'tai xe', 'xe om', 'taxi', 'xe tai', 'xe khach', 'giao hang'].some(k => mentionsSymptom(p.job || '', k))) out.push(`nghề nghiệp lái xe (${p.job}) — mirtazapin gây an thần, buồn ngủ ban ngày`);
  // Venlafaxin: bệnh nền tăng huyết áp → không kê (bác sĩ đặt 2026-10-25; venlafaxin làm tăng huyết áp phụ thuộc liều)
  if(norm(d.hc || '').includes('venlafaxin') && (ctx || ctxOf(p, v)).conds.has('htn')) out.push('bệnh nền tăng huyết áp (venlafaxin làm tăng huyết áp phụ thuộc liều)');
  // Amitriptylin, imipramin (bác sĩ đặt 2026-11-02): tiền sử bệnh mạch vành, rối loạn nhịp, phì đại tiền liệt tuyến (ô tích hoặc ghi chữ) → không kê
  const tcaAI = ['amitriptylin', 'imipramin'].find(x => H.includes(x));
  if(tcaAI){
    const say = k => mentionsSymptom(p.condNote || '', k), r = [];
    if(C.has('cvd') || ['benh mach vanh', 'dau that nguc', 'thieu mau co tim', 'nhoi mau co tim', 'dat stent'].some(say)) r.push('bệnh mạch vành');
    if(C.has('af') || ['roi loan nhip', 'rung nhi', 'ngoai tam thu', 'nhip nhanh'].some(say)) r.push('rối loạn nhịp');
    if(C.has('bph') || ['phi dai tien liet tuyen', 'phi dai tuyen tien liet', 'tang san tien liet tuyen'].some(say)) r.push('phì đại tiền liệt tuyến (bí tiểu)');
    if(r.length) out.push(tcaAI + ': tiền sử ' + r.join('; '));
  }
  // Tuổi > 65 hoặc < 18 → không kê thuốc chống trầm cảm 3 vòng (TCA) và paroxetin (bác sĩ đặt 2026-10-25)
  //  > 65: kháng cholinergic mạnh — tiêu chí Beers; < 18: TCA độc tim, nguy hiểm khi quá liều; paroxetin tăng ý tưởng tự sát ở vị thành niên
  const ageNow = (ctx || ctxOf(p, v)).age;
  if(ageNow != null && (ageNow > 65 || ageNow < 18)){
    const tca = isTca(d);
    const old = ageNow > 65, who = `bệnh nhân ${ageNow} tuổi (${old ? '> 65' : '< 18'})`;
    if(tca) out.push(old ? `${who}: thuốc chống trầm cảm 3 vòng kháng cholinergic mạnh — lú lẫn, bí tiểu, té ngã, loạn nhịp (Beers)` : `${who}: thuốc chống trầm cảm 3 vòng độc tim, rất nguy hiểm khi quá liều ở trẻ em`);
    else if(d.cls === 'Benzodiazepin' || expandTags(d.tags).has('bzd')) out.push(old ? `${who}: benzodiazepin — té ngã, lú lẫn, suy giảm nhận thức (Beers)` : `${who}: benzodiazepin — quy tắc phòng khám không kê cho người dưới 18 tuổi`);
    else if(norm(d.hc || '').includes('paroxetin')) out.push(old ? `${who}: paroxetin kháng cholinergic, an thần, hạ huyết áp tư thế (Beers)` : `${who}: paroxetin không khuyến cáo ở trẻ em / vị thành niên (tăng ý tưởng tự sát, hiệu quả chưa chứng minh)`);
  }
  // Mang thai → không kê valproat, carbamazepin, paroxetin (bác sĩ đặt 2026-10-25; nguy cơ dị tật thai)
  const hc = norm(d.hc || ''), teratogen = ['valpro', 'carbamazepin', 'paroxetin'].find(k => hc.includes(k));
  const preg = teratogen ? pregnancyReason(p, v, ctx) : '';
  if(preg) out.push(`đang mang thai: ${preg} (${{valpro: 'valproat gây dị tật ống thần kinh, chậm phát triển', carbamazepin: 'carbamazepin gây dị tật ống thần kinh', paroxetin: 'paroxetin tăng nguy cơ dị tật tim thai'}[teratogen]})`);
  // Mang thai → không kê mọi thuốc nhóm thần kinh – tâm thần (g 'neuro'; bác sĩ đặt 2026-10-27, chọn cả gabapentin, ức chế cholinesterase)
  if(d.g === 'neuro' && !teratogen){ const pr = pregnancyReason(p, v, ctx); if(pr) out.push(`đang mang thai: ${pr} (quy tắc phòng khám: không kê thuốc nhóm thần kinh – tâm thần khi mang thai)`); }
  if(norm(d.hc || '').includes('valpro') && p.sex === 'Nữ' && !preg){
    const r = bhcgLatest(p, v), recent = r && (r.current || (v.date && r.date && daysBetween(r.date, v.date) <= 7));
    if(!recent) out.push('bệnh nhân nữ chưa có kết quả β-hCG' + (r ? ` gần đây (lần cuối ${fmtDate(r.date)})` : '') + ' — làm β-hCG trước khi kê valproat');
    else if(r.pos === true) out.push(`β-hCG ${r.text} (> 5 mIU/mL) — có thể đang mang thai, valproat gây dị tật thai`);
    else if(r.pos == null) out.push(`chưa đọc được kết quả β-hCG "${r.text}" — ghi số (mIU/mL) hoặc "âm tính"`);
  }
  // Fluoxetin: tiền sử ghi đang cho con bú (ô "Đang cho con bú" hoặc ghi trong "Tiền sử bệnh…") → không kê (bác sĩ đặt 2026-10-25;
  // fluoxetin và chất chuyển hoá có thời gian bán thải dài, tích luỹ ở trẻ bú mẹ)
  if(norm(d.hc || '').includes('fluoxetin') && breastfeeding(p, v, ctx)) out.push('tiền sử ghi đang cho con bú (fluoxetin bán thải dài, tích luỹ ở trẻ bú mẹ)');
  // Đang cho con bú → không kê mọi thuốc nhóm thần kinh – tâm thần (bác sĩ đặt 2026-10-27, cùng quy tắc mang thai)
  else if(d.g === 'neuro' && breastfeeding(p, v, ctx)) out.push('đang cho con bú (quy tắc phòng khám: không kê thuốc nhóm thần kinh – tâm thần khi cho con bú)');
  // Carbamazepin: điện tim có block nhĩ thất → không kê (bác sĩ đặt 2026-10-25; carbamazepin làm chậm dẫn truyền nhĩ thất)
  if(norm(d.hc || '').includes('carbamazepin')){
    const e = avBlock(p, v); if(e) out.push(`điện tim ${e.current ? 'lần khám này' : 'ngày ' + fmtDate(e.date)} có block nhĩ thất (carbamazepin làm chậm dẫn truyền nhĩ thất)`);
  }
  // Duloxetin: không kê khi AST/ALT > 3 lần giới hạn trên hoặc CrCl < 30 mL/phút (bác sĩ đặt 2026-10-25).
  // Chưa có cân nặng để tính CrCl thì dùng eGFR < 30 thay thế (ghi rõ trong lý do).
  if(norm(d.hc || '').includes('duloxetin')){
    const tx = transaminaseHigh(p, v); if(tx.length) out.push('men gan tăng > 3 lần: ' + tx.join(', '));
    const r = renalOf(p);
    if(r && r.crcl != null && r.crcl < 30) out.push(`CrCl ≈ ${fmtN(r.crcl)} mL/phút (< 30; ${r.src})`);
    else if(r && r.crcl == null && r.egfr != null && r.egfr < 30) out.push(`eGFR ≈ ${fmtN(r.egfr)} (< 30; chưa có cân nặng để tính CrCl; ${r.src})`);
    else if(r && r.egfr != null && r.egfr < 15) out.push(`eGFR ≈ ${fmtN(r.egfr)} (< 15; ${r.src})`);
    // Bác sĩ đặt 2026-10-27: hồ sơ nền phì đại tiền liệt tuyến (ô tích hoặc tiền sử ghi) → chặn (duloxetin gây bí tiểu);
    // bệnh gan mạn / suy gan ghi bằng chữ ở tiền sử (ô tích "liver" đã chặn ở quy tắc bệnh gan phía trên)
    const note = p.condNote || '';
    if(C.has('bph') || ['phi dai tien liet tuyen', 'phi dai tuyen tien liet', 'tang san tien liet tuyen'].some(k => mentionsSymptom(note, k))) out.push('hồ sơ nền phì đại tiền liệt tuyến (duloxetin có thể gây bí tiểu)');
    if(!C.has('liver') && ['benh gan man', 'suy gan', 'xo gan', 'viem gan man'].some(k => mentionsSymptom(note, k))) out.push('tiền sử ghi bệnh gan mạn / suy gan (duloxetin chống chỉ định khi bệnh gan)');
  }
  // Zolpidem (bác sĩ đặt 2026-11-02): tiền sử hoặc bệnh sử ghi chóng mặt; tiền sử ghi suy gan, nhược cơ, ngưng thở khi ngủ (hoặc ICD G47.3) → không kê
  if(norm(d.hc || '').includes('zolpidem')){
    const note = p.condNote || '', hx = note + ' . ' + ((v && v.hpi) || ''), r = [];
    if(['chong mat'].some(k => mentionsSymptom(hx, k))) r.push('tiền sử / bệnh sử ghi chóng mặt (nguy cơ té ngã)');
    if(['suy gan'].some(k => mentionsSymptom(note, k))) r.push('suy gan');
    if(['nhuoc co'].some(k => mentionsSymptom(note, k))) r.push('nhược cơ');
    if(['ngung tho khi ngu', 'ngung tho luc ngu'].some(k => mentionsSymptom(note, k)) || dxCodes(v).some(c => /^G47\.3/.test(c))) r.push('ngưng thở khi ngủ (ức chế hô hấp)');
    if(r.length) out.push('zolpidem: ' + r.join('; '));
  }
  // Zopiclon (bác sĩ đặt 2026-11-02): tiền sử hoặc bệnh sử ghi chóng mặt → không kê
  if(norm(d.hc || '').includes('zopiclon') && mentionsSymptom((p.condNote || '') + ' . ' + ((v && v.hpi) || ''), 'chong mat')) out.push('zopiclon: tiền sử / bệnh sử ghi chóng mặt (nguy cơ té ngã)');
  // Zaleplon (bác sĩ đặt 2026-11-02): tiền sử ghi suy gan → không kê
  if(norm(d.hc || '').includes('zaleplon') && mentionsSymptom(p.condNote || '', 'suy gan')) out.push('zaleplon: tiền sử suy gan');
  // Trazodon (bác sĩ đặt 2026-11-02): tiền sử bệnh mạch vành, rối loạn nhịp, suy gan; tuổi < 18 hoặc > 65 → không kê
  if(norm(d.hc || '').includes('trazodon')){
    const note = p.condNote || '', say = k => mentionsSymptom(note, k), r = [], a = ageOf(p, v.date);
    if(C.has('cvd') || ['benh mach vanh', 'dau that nguc', 'thieu mau co tim', 'nhoi mau co tim', 'dat stent'].some(say)) r.push('tiền sử bệnh mạch vành');
    if(C.has('af') || ['roi loan nhip', 'rung nhi', 'ngoai tam thu', 'nhip nhanh'].some(say)) r.push('tiền sử rối loạn nhịp');
    if(say('suy gan')) r.push('suy gan');
    if(a != null && a < 18) r.push(`${a} tuổi (< 18)`);
    if(a != null && a > 65) r.push(`${a} tuổi (> 65)`);
    if(r.length) out.push('trazodon: ' + r.join('; '));
  }
  if(isAgomelatine(d)){
    const tx = transaminaseHigh(p, v); if(tx.length) out.push('men gan tăng > 3 lần: ' + tx.join(', '));
    const ci = cyp1a2InhNames(p, v, ctx); if(ci.length) out.push('đang dùng thuốc ức chế mạnh CYP1A2: ' + ci.join(', '));
  }
  if(isSsriSnri(d)){ const r = ssriBlockReasons(p, v, ctx); if(r.length) out.push('nhóm SSRI/SNRI: ' + r.join('; ')); }
  if(isCitalopram(d)){ const e = qtcLong(p, v); if(e) out.push(`điện tim ${e.current ? 'lần khám này' : 'ngày ' + fmtDate(e.date)} mô tả QTc dài (citalopram/escitalopram kéo dài QT)`); }
  return out;
}
function bipolarHistory(p, v, ctx){
  ctx = ctx || ctxOf(p, v);
  const h = ((v && v.mental && v.mental.hist) || []);
  return ctx.conds.has('bipolar') || h.includes('mania') || h.includes('hypomania') || h.includes('mixed');
}

// entries: [{line:{id}, drug}] — mặc định lấy đơn thuốc của lượt khám
// Sertralin, fluvoxamin — cảnh báo giảm ½ liều (bác sĩ đặt 2026-10-27): chẩn đoán ICD trầm cảm (F32.x, F33.x, F34 / F34.1, F41.2,
// lưỡng cực giai đoạn trầm cảm F31.3–F31.5) VÀ (bệnh gan mạn / xơ gan HOẶC 6–12 tuổi). Chỉ cảnh báo, không chặn.
const DEP_ICD = /^(F32|F33|F34(\.1)?$|F41\.2|F31\.[345])/;
function halfDoseReasons(p, v, d, ctx){
  if(!d || !v || !['sertralin', 'fluvoxamin'].some(k => norm(d.hc || '').includes(k))) return [];
  if(!dxCodes(v).some(c => DEP_ICD.test(c))) return [];
  const out = [], a = ageOf(p, v.date);
  if((ctx || ctxOf(p, v)).conds.has('liver')) out.push('bệnh gan mạn / xơ gan');
  if(a != null && a >= 6 && a <= 12) out.push(`trẻ ${a} tuổi (6–12 tuổi)`);
  return out;
}
// Zolpidem — lưu ý khởi đầu 5 mg (bác sĩ đặt 2026-11-02): > 65 tuổi hoặc BMI < 19. Chỉ cảnh báo, không chặn.
function zolpidemLowStart(p, v, d){
  if(!d || !v || !norm(d.hc || '').includes('zolpidem')) return [];
  const out = [], a = ageOf(p, v.date), vt = v.vitals || {}, b = bmiOf(num(vt.weight) || p.weight, num(vt.height) || p.height);
  if(a != null && a > 65) out.push(`${a} tuổi (> 65)`);
  if(b != null && b < 19) out.push(`BMI ${fmtN(b, 1)} (< 19)`);
  return out;
}
// Zopiclon — giảm ½ liều (bác sĩ đặt 2026-11-02): người cao tuổi (> 65 tuổi) hoặc suy gan (ô bệnh gan / tiền sử ghi suy gan). Chỉ cảnh báo.
function zopicloneHalf(p, v, d, ctx){
  if(!d || !v || !norm(d.hc || '').includes('zopiclon')) return [];
  const out = [], a = ageOf(p, v.date);
  if(a != null && a > 65) out.push(`người cao tuổi (${a} tuổi)`);
  if((ctx || ctxOf(p, v)).conds.has('liver') || mentionsSymptom(p.condNote || '', 'suy gan')) out.push('suy gan');
  return out;
}
// Kết luận tổng điểm trắc nghiệm theo SCALE_BANDS; null nếu không có bảng hoặc chưa nhập / ngoài khoảng
function scaleResult(key, value){
  const b = SCALE_BANDS[key], n = num(value); if(!b || n == null || n < 0) return null;
  const r = b.find(x => n <= x[0]); return r ? {t: r[1], lv: r[2]} : null;
}
// ---- Thuốc tăng huyết áp nhóm A (ức chế men chuyển / chẹn thụ thể), B (chẹn beta), C (chẹn kênh canxi), D (lợi tiểu thiazid / giống thiazid)
// Chống chỉ định → chặn kê (bác sĩ đặt 2026-10-30); thận trọng → cảnh báo. Nguồn: Khuyến cáo VSH/VNHA 2026, Bảng 10.5 và mục 10.3, 15 (thai kỳ).
function htnGroup(d){
  if(!d) return ''; const tg = expandTags(d.tags), h = norm(d.hc || '');
  if(tg.has('acei') || tg.has('arb')) return 'A';
  if(tg.has('beta_blocker')) return 'B';
  if(tg.has('ccb') || /dipin|diltiazem|verapamil/.test(h)) return 'C';
  if(tg.has('thiazide') || /indapamid|thiazid|chlortalidon/.test(h)) return 'D';
  return '';
}
const HTN_GNAME = {A: 'nhóm A (ức chế men chuyển / chẹn thụ thể angiotensin)', B: 'nhóm B (chẹn beta)', C: 'nhóm C (chẹn kênh canxi)', D: 'nhóm D (lợi tiểu thiazid / giống thiazid)'};
function latestPulse(p, v){ const vs = [v].concat((p.visits || []).filter(x => x !== v).sort((a, b) => String(b.date).localeCompare(String(a.date)))).filter(Boolean); for(const x of vs){ const n = num((x.vitals || {}).pulse); if(n != null) return {n, current: x === v}; } return null; }
function htnText(p, v){ return (p.condNote || '') + ' . ' + (p.allergyText || '') + ' . ' + ((v && v.hpi) || ''); }
function htnBlockReasons(p, v, d, ctx){
  const g = htnGroup(d); if(!g || !v) return [];
  const C = (ctx || ctxOf(p, v)).conds, h = norm(d.hc || ''), t = htnText(p, v), out = [], say = k => mentionsSymptom(t, k);
  const preg = pregnancyReason(p, v, ctx) || (['du dinh mang thai', 'ke hoach mang thai', 'muon co thai'].some(say) ? 'dự định mang thai' : '');
  if(g === 'A'){
    if(preg) out.push(`đang / dự định mang thai: ${preg} (ức chế men chuyển, chẹn thụ thể độc với thai)`);
    if(['hep dong mach than 2 ben', 'hep dong mach than hai ben', 'than doc nhat', 'mot than', 'chi con mot than'].some(say)) out.push('hẹp động mạch thận 2 bên hoặc chỉ có 1 thận');
    if(expandTags(d.tags).has('acei')){
      if(['phu mach', 'phu quincke'].some(say)) out.push('tiền sử phù mạch (ức chế men chuyển)');
      if(['loc huyet tuong', 'loc mau qua mang dac biet', 'mang an69'].some(say)) out.push('lọc huyết tương / lọc máu qua màng đặc biệt (ức chế men chuyển)');
    }
  }
  if(g === 'B'){
    if(C.has('asthma') && /propranolol|carvedilol|labetalol|nadolol/.test(h)) out.push('hen phế quản / COPD (chẹn beta không chọn lọc, chẹn alpha-beta)');
    const pu = latestPulse(p, v);
    if((pu && pu.n < 50) || ['nhip cham nang', 'block nhi that do 2', 'block nhi that do 3', 'block nhi that cap 2', 'block nhi that cap 3', 'hoi chung nut xoang'].some(say)) out.push('nhịp chậm nặng' + (pu && pu.n < 50 ? ` (mạch ${fmtN(pu.n)} l/ph)` : ''));
    if(['u tuy thuong than', 'u te bao ua crom', 'pheochromocytoma'].some(say)) out.push('u tuỷ thượng thận chưa điều trị (không dùng chẹn beta đơn độc)');
  }
  if(g === 'C' && /diltiazem|verapamil/.test(h) && C.has('heart_failure')) out.push('suy tim (chẹn kênh canxi không DHP chống chỉ định trong suy tim phân suất tống máu giảm)');
  if(g === 'D'){
    if(preg) out.push(`đang / dự định mang thai: ${preg} (VNHA 2026: lợi tiểu chống chỉ định)`);
    const na = latestOrder(p, v, 'na'), k = latestOrder(p, v, 'k');
    if((na && num(na.o.value) < 130) || ['ha natri mau'].some(say)) out.push('hạ natri máu rõ rệt' + (na && num(na.o.value) < 130 ? ` (Na ${fmtN(num(na.o.value), 1)})` : ''));
    if((k && num(k.o.value) < 3) || ['ha kali mau'].some(say)) out.push('hạ kali máu rõ rệt' + (k && num(k.o.value) < 3 ? ` (K ${fmtN(num(k.o.value), 1)})` : ''));
  }
  return out.length ? [`${HTN_GNAME[g]} chống chỉ định khi ${out.join('; ')} (VNHA 2026)`] : [];
}
function htnCautions(p, v, d, ctx){
  const g = htnGroup(d); if(!g || !v) return [];
  const C = (ctx || ctxOf(p, v)).conds, h = norm(d.hc || ''), t = htnText(p, v), out = [], say = k => mentionsSymptom(t, k);
  if(g === 'A'){
    if(say('hep dong mach than') && !['hep dong mach than 2 ben', 'hep dong mach than hai ben'].some(say)) out.push('hẹp động mạch thận');
    const k = latestOrder(p, v, 'k'); if(k && num(k.o.value) > 5) out.push(`tăng kali máu (K ${fmtN(num(k.o.value), 1)})`);
    if(expandTags(d.tags).has('acei') && ['loc mau', 'chay than nhan tao'].some(say)) out.push('đang lọc máu — kiểm tra loại màng lọc (chống chỉ định với màng đặc biệt)');
  }
  if(g === 'B'){
    if(C.has('asthma') && !/propranolol|carvedilol|labetalol|nadolol/.test(h)) out.push('hen phế quản / COPD (chẹn beta chọn lọc β1: thận trọng)');
    if(C.has('diabetes')) out.push('rối loạn dung nạp glucose / đái tháo đường');
    const pu = latestPulse(p, v); if(pu && pu.n >= 50 && pu.n < 60) out.push(`mạch chậm ${fmtN(pu.n)} l/ph`);
  }
  if(g === 'C' && !/diltiazem|verapamil/.test(h)){
    if(C.has('heart_failure')) out.push('suy tim (thận trọng khi suy tim mất bù)');
    if(say('hep van dong mach chu')) out.push('hẹp van động mạch chủ nặng');
  }
  if(g === 'D'){
    if(C.has('gout')) out.push('bệnh gút');
    if(C.has('diabetes')) out.push('rối loạn dung nạp glucose / đái tháo đường');
  }
  return out;
}
// ---- Nguy cơ tim mạch (Khuyến cáo VSH/VNHA 2026, Phần VII) ----
// 1) Bảng kiểm phân tầng VNHA 2026 (Hình 7.2): mức HA (tiền THA / độ 1 / độ 2) × yếu tố nguy cơ (Bảng 7.1), tổn thương cơ quan đích,
//    hội chứng tim – thận – chuyển hoá (CKM). 2) SCORE2-Asia Pacific (Hình PL1): tra bảng % nguy cơ 10 năm, 40–69 tuổi.
function labVal(p, v, k){ const r = latestOrder(p, v, k); return r ? num(r.o.value) : null; }
function cvRisk(p, v){
  const ctx = ctxOf(p, v), C = ctx.conds, a = ctx.age, male = p.sex === 'Nam', vt = v.vitals || {};
  const s = num(vt.sbp), d = num(vt.dbp);
  const ldl = labVal(p, v, 'ldl'), hdl = labVal(p, v, 'hdl'), tc = labVal(p, v, 'chol'), tg = labVal(p, v, 'tg'), glu = labVal(p, v, 'glu'), a1c = labVal(p, v, 'hba1c'), acr = labVal(p, v, 'acr');
  const rn = renalOf(p), egfr = rn ? rn.egfr : null;
  const smoke = (p.risk || {}).smoke === 'current';
  const famT = norm(p.famNote || '');
  const famCvd = /nhoi mau co tim|benh mach vanh|dot quy|tai bien mach mau nao|dot tu|dat stent|bac cau/.test(famT);
  const rf = [];
  if(a != null && (male ? a >= 60 : a >= 65)) rf.push(`Tuổi cao (${a})`);
  if(male) rf.push('Giới nam');
  if(smoke) rf.push('Hút thuốc lá');
  if(ldl != null && ldl >= 3.4) rf.push(`LDL-C ${fmtN(ldl, 1)} mmol/L (≥ 3,4)`);
  if(hdl != null && hdl < 1.0) rf.push(`HDL-C ${fmtN(hdl, 1)} mmol/L (< 1,0)`);
  if(famCvd) rf.push('Tiền sử gia đình bệnh tim mạch (đối chiếu: nam < 55, nữ < 65 tuổi)');
  const hmod = [];
  const ecg = latestEcg ? latestEcg(p, v) : null, ecgT = norm((ecg && (ecg.text || '')) || '');
  if(/day that trai|phi dai that trai|lvh/.test(ecgT)) hmod.push('Phì đại thất trái trên điện tim');
  if(acr != null && acr >= 3 && acr <= 30) hmod.push(`Vi albumin niệu (ACR ${fmtN(acr, 1)} mg/mmol)`);
  if(egfr != null && egfr >= 30 && egfr < 60) hmod.push(`eGFR ${fmtN(egfr)} (30–59)`);
  const ckm12 = [], ckm3 = [];
  const bmi = ctx.bmi, waist = num(vt.waist) ?? num(p.waist);
  if((bmi != null && bmi >= 23) || (waist != null && waist >= (male ? 90 : 80))) ckm12.push('Thừa cân / béo phì hoặc béo trung tâm');
  if((glu != null && glu >= 5.6 && glu < 7) || (a1c != null && a1c >= 5.7 && a1c < 6.5)) ckm12.push('Rối loạn dung nạp glucose / tiền đái tháo đường');
  if(tg != null && tg >= 1.5) ckm12.push(`Triglycerid ${fmtN(tg, 1)} mmol/L (≥ 1,5)`);
  if(egfr != null && egfr < 30) ckm3.push(`Bệnh thận mạn nguy cơ rất cao (eGFR ${fmtN(egfr)} < 30)`);
  const est = ['cvd', 'heart_failure', 'af'].filter(k => C.has(k)).map(condLabel);
  const dm = C.has('diabetes');
  const bp = s && d ? (s >= 160 || d >= 100 ? 2 : s >= 140 || d >= 90 ? 1 : s >= 130 || d >= 80 ? 0 : -1) : null;
  const high = rf.length >= 3 || hmod.length || ckm3.length || dm || est.length;
  const mid = rf.length >= 1 || ckm12.length;
  let level = null;
  if(bp === 2) level = 'Cao'; else if(bp === 1) level = high ? 'Cao' : 'Trung bình'; else if(bp === 0) level = high ? 'Cao' : mid ? 'Trung bình' : 'Thấp';
  // SCORE2-AP
  let score = null, scoreNote = '';
  if(est.length || dm || (egfr != null && egfr < 60) || (acr != null && acr >= 3)) scoreNote = 'Đã có bệnh tim mạch / đái tháo đường / bệnh thận mạn (eGFR < 60 hoặc ACR ≥ 3 mg/mmol) → xếp ngay nguy cơ cao / rất cao, không cần tính SCORE2.';
  else if(a == null || a < 40 || a > 69) scoreNote = 'SCORE2-AP chỉ áp dụng 40–69 tuổi' + (a != null && a >= 70 ? ' (≥ 70 tuổi dùng SCORE2-OP — nút MDCalc bên dưới; chọn vùng nguy cơ cao).' : '.');
  else if(!s) scoreNote = 'Cần HA tâm thu.';
  else if(tc == null || hdl == null) scoreNote = 'Cần cholesterol toàn phần và HDL-C để tính non-HDL.';
  else {
    const nh = tc - hdl, ai = Math.min(5, Math.floor((a - 40) / 5)), si = s < 120 ? 0 : s < 140 ? 1 : s < 160 ? 2 : 3, ni = nh < 4 ? 0 : nh < 5 ? 1 : nh < 6 ? 2 : 3;
    score = SCORE2_AP[male ? 'M' : 'F'][smoke ? 1 : 0][ai][si][ni];
    if(s >= 180 || s < 100 || nh < 3 || nh >= 7) scoreNote = 'Giá trị ngoài khoảng của bảng — đã lấy ô gần nhất.';
    scoreNote = `non-HDL ${fmtN(nh, 1)} mmol/L. ` + scoreNote;
  }
  // Chỉ số để nhập PREVENT-CVD (30–79 tuổi): cholesterol, HDL đổi sang mg/dL
  const lm = ctx.longMeds || [], onTag = tg => lm.some(m => m.tags && m.tags.has(tg));
  const prevent = {age: a, sex: p.sex, sbp: s, tcMg: tc != null ? Math.round(tc * 38.67) : null, hdlMg: hdl != null ? Math.round(hdl * 38.67) : null, egfr, bmi: bmi != null ? Math.round(bmi * 10) / 10 : null,
    dm, smoke, statin: onTag('statin'), bpMed: lm.some(m => htnGroup(m.drug) || (m.tags && ['acei','arb','beta_blocker','ccb','diuretic','thiazide'].some(x => m.tags.has(x)))), acrMgG: acr != null ? Math.round(acr * 8.84) : null, a1c};
  const band = score == null ? '' : score < 5 ? '< 5%' : score < 10 ? '5–10%' : score < 20 ? '10–20%' : score < 30 ? '20–30%' : '≥ 30%';
  return {level, bp, rf, hmod, ckm12, ckm3, est, dm, score, band, scoreNote, prevent};
}
function checkAll(p, v, entries){
  const ctx = ctxOf(p, v);
  entries = entries || (v.rx || []).map(l => ({line: l, drug: drugById(l.drugId)}));
  const ents = entries.filter(x => x.drug).map(x => ({src: 'rx', id: x.line.id, line: x.line, name: x.drug.n, tags: expandTags(x.drug.tags), drug: x.drug, cls: x.drug.cls}))
    .concat(ctx.longMeds.map((m, i) => ({src: 'long', id: 'L' + i, name: m.short + ' (đang dùng)', tags: m.tags, drug: m.drug, cls: m.cls})));
  const items = [];
  for(const e of ents) if(e.src === 'rx') drugChecks(e.drug, ctx).forEach(w => items.push({...w, lines: [e.id]}));
  if(v){
    const bip = bipolarHistory(p, v, ctx);
    for(const e of ents) if(e.src === 'rx'){
      const block = drugBlockReasons(p, v, e.drug, ctx, e.line);
      if(block.length) items.push({lv: 3, kind: 'Quy tắc phòng khám', title: e.name, m: 'Không kê thuốc này vì ' + block.join('; ') + '. Chọn thuốc khác.', lines: [e.id]});
      const half = halfDoseReasons(p, v, e.drug, ctx);
      if(e.drug.dnote) items.push({lv: 2, kind: 'Liều (quy tắc phòng khám)', title: `${e.name} — chỉnh liều`, m: e.drug.dnote, lines: [e.id]});
      if(norm(e.drug.hc || '').includes('risperidon')){   // bác sĩ đặt 2026-11-07: xơ gan, bệnh thận mạn → cảnh báo giảm liều
        const pc = p.conds || [], sy = k => mentionsSymptom(p.condNote || '', k), why = [];
        if(pc.includes('liver') || sy('xo gan')) why.push('xơ gan'); if(pc.includes('ckd') || sy('benh than man') || sy('suy than')) why.push('bệnh thận mạn');
        if(why.length) items.push({lv: 2, kind: 'Liều (quy tắc phòng khám)', title: `${e.name} — giảm liều`, m: `Tiền sử ${why.join(', ')}: giảm liều (khởi đầu 0,5 mg × 2 lần/ngày, tăng chậm).`, lines: [e.id]});
      }
      const htnC = htnCautions(p, v, e.drug, ctx);
      if(htnC.length) items.push({lv: 2, kind: 'Thận trọng (VNHA 2026)', title: `${e.name} — ${HTN_GNAME[htnGroup(e.drug)]}`, m: 'Thận trọng: ' + htnC.join('; ') + '.', lines: [e.id]});
      const zl = zolpidemLowStart(p, v, e.drug);
      if(zl.length) items.push({lv: 2, kind: 'Liều (quy tắc phòng khám)', title: `${e.name} — khởi đầu 5 mg`, m: `${zl.join(', ')}: khởi đầu zolpidem 5 mg trước khi ngủ.`, lines: [e.id]});
      const zh = zopicloneHalf(p, v, e.drug, ctx);
      if(zh.length) items.push({lv: 2, kind: 'Liều (quy tắc phòng khám)', title: `${e.name} — giảm ½ liều`, m: `${zh.join(' và ')}: giảm ½ liều zopiclon (khởi đầu 3,75 mg trước khi ngủ).`, lines: [e.id]});
      if(half.length) items.push({lv: 2, kind: 'Liều (quy tắc phòng khám)', title: `${e.name} — giảm ½ liều`, m: `Chẩn đoán trầm cảm kèm ${half.join(' và ')}: dùng ½ liều thông thường.`, lines: [e.id]});
      if(!isSsriSnri(e.drug)) continue;
      if(bip && !(e.drug.cond && e.drug.cond.bipolar && ctx.conds.has('bipolar'))) items.push({lv: 2, kind: 'Bệnh kèm', title: `${e.name} — Rối loạn cảm xúc lưỡng cực`, m: 'Tiền sử rối loạn lưỡng cực / hưng cảm: SSRI/SNRI có thể gây chuyển pha hưng cảm — chỉ dùng kèm thuốc chỉnh khí sắc, theo dõi sát (Stahl).', lines: [e.id]});
    }
  }
  for(let i = 0; i < ents.length; i++) for(let j = i + 1; j < ents.length; j++){
    const A = ents[i], B = ents[j]; if(A.src === 'long' && B.src === 'long') continue;
    const lines = [A, B].filter(x => x.src === 'rx').map(x => x.id);
    const pairName = `${A.name} + ${B.name}`;
    if(A.drug && B.drug && (A.drug.id === B.drug.id || norm(A.drug.hc) === norm(B.drug.hc))){
      items.push({lv: 2, kind: 'Trùng thuốc', title: pairName, m: (A.src === 'long' || B.src === 'long') ? 'Bệnh nhân đang dùng thuốc này (cùng hoạt chất) dài hạn.' : 'Hai dòng cùng hoạt chất trong đơn.', lines});
      continue;
    }
    let matched = false;
    for(const r of RULES){
      const hit = r.a === r.b ? (A.tags.has(r.a) && B.tags.has(r.a)) : ((A.tags.has(r.a) && B.tags.has(r.b)) || (A.tags.has(r.b) && B.tags.has(r.a)));
      if(hit){ matched = true; items.push({lv: r.lv, kind: 'Tương tác', title: pairName, m: r.m, lines}); }
    }
    if(!matched && A.cls && A.cls === B.cls && A.cls !== 'Chống kết tập tiểu cầu') items.push({lv: 2, kind: 'Trùng nhóm', title: pairName, m: `Cùng nhóm ${A.cls}.`, lines});
  }
  const has = t => ents.filter(e => e.tags.has(t));
  const r1 = has('raas'), r2 = has('diuretic'), r3 = has('nsaid');
  if(r1.length && r2.length && r3.length){ const grp = [...r1, ...r2, ...r3]; if(grp.some(e => e.src === 'rx')) items.push({lv: 3, kind: 'Tương tác', title: 'Ức chế RAA + lợi tiểu + NSAID', m: '"Bộ ba" gây suy thận cấp: tránh phối hợp, nhất là ở người cao tuổi hoặc suy thận.', lines: grp.filter(e => e.src === 'rx').map(e => e.id)}); }
  const seen = new Set();
  const uniq = items.filter(x => { const k = x.kind + '|' + x.title + '|' + x.m + '|' + x.lines.join(','); if(seen.has(k)) return false; seen.add(k); return true; });
  uniq.sort((a, b) => b.lv - a.lv);
  return {items: uniq, ctx};
}

function rxQty(l){ const per = (num(l.s) || 0) + (num(l.tr) || 0) + (num(l.c) || 0) + (num(l.t) || 0); const days = num(l.days) || 0; return {per, days, total: per * days, give: Math.ceil(per * days)}; }
function rxCost(l){ const d = drugById(l.drugId); return d ? rxQty(l).give * (num(d.p) || 0) : 0; }

// ================= DINH DƯỠNG =================
const ACT_LV = {sedentary:{t:'Ít vận động (ít đi lại, ngồi nhiều)', f:1.2}, light:{t:'Nhẹ (đi bộ/tập nhẹ 1–3 buổi/tuần)', f:1.375}, moderate:{t:'Vừa (tập 3–5 buổi/tuần)', f:1.55}, active:{t:'Nhiều (lao động chân tay, tập 6–7 buổi/tuần)', f:1.725}};
const MEALS = [['Sáng',0.25],['Phụ sáng',0.10],['Trưa',0.30],['Phụ chiều',0.10],['Tối',0.25]];
function nutriCalc(p, v){
  const n = (v && v.nutrition) || {};
  const w = num(n.weight) ?? num(v && v.vitals && v.vitals.weight) ?? num(p.weight);
  const h = num(n.height) ?? num(v && v.vitals && v.vitals.height) ?? num(p.height);
  const a = ageOf(p, v ? v.date : null);
  if(!w || !h || a == null || !p.sex) return null;
  const bmi = bmiOf(w, h), ibw = 22 * Math.pow(h / 100, 2);
  const bmr = 10 * w + 6.25 * h - 5 * a + (p.sex === 'Nữ' ? -161 : 5);
  const actK = n.activity || p.activity || 'sedentary', fac = (ACT_LV[actK] || ACT_LV.sedentary).f, tdee = bmr * fac;
  const goal = n.goal || (bmi >= 23 ? 'lose' : bmi < 18.5 ? 'gain' : 'keep');
  const deficit = num(n.deficit) ?? 500;
  let target = goal === 'lose' ? tdee - deficit : goal === 'gain' ? tdee + 300 : tdee;
  const notes = [];
  const floor = p.sex === 'Nữ' ? 1200 : 1500;
  if(goal === 'lose' && target < floor){ target = floor; notes.push(`Mức tối thiểu khi giảm cân không giám sát chặt: ${fmtN(floor)} kcal/ngày — đã lấy mức này.`); }
  if(num(n.kcal)){ target = num(n.kcal); notes.push('Năng lượng do bác sĩ đặt.'); }
  const renal = renalOf(p), ckd = renal && renal.egfr != null && renal.egfr < 60;
  const wP = bmi >= 25 ? ibw + 0.25 * (w - ibw) : w;
  const gkg = num(n.proteinGkg) ?? (ckd ? 0.8 : 1.0);
  if(ckd && num(n.proteinGkg) == null) notes.push(`eGFR ≈ ${fmtN(renal.egfr)}: đạm 0,8 g/kg/ngày theo KDIGO cho bệnh thận mạn G3–G5 chưa lọc máu.`);
  if(bmi >= 25) notes.push(`Tính đạm theo cân nặng hiệu chỉnh ${fmtN(wP, 1)} kg (béo phì).`);
  const protG = gkg * wP, fatPct = num(n.fatPct) ?? 25, fatG = target * fatPct / 100 / 9;
  const carbKcal = Math.max(0, target - protG * 4 - fatG * 9), carbG = carbKcal / 4;
  return {w, h, a, bmi, bmiCls: bmiClass(bmi), ibw, wP, bmr, tdee, fac, actK, goal, deficit, target, gkg, protG, protPct: protG * 4 / target * 100, fatG, fatPct, carbG, carbPct: carbKcal / target * 100, notes, salt: (ckd || (p.conds || []).includes('htn')) ? '< 5 g muối/ngày' : '< 5 g muối/ngày', fiber: '25–30 g chất xơ/ngày'};
}

// ================= CẬN LÂM SÀNG TỰ CHỌN — TIỀN SỬ RỐI LOẠN NHẬN THỨC (bác sĩ đặt 2026-11-07) =================
// Tiền sử rối loạn nhận thức: ô bệnh nền "Sa sút trí tuệ"; ô tiền sử ghi sa sút trí tuệ / Alzheimer / rối loạn – suy giảm nhận thức;
// hoặc lượt khám trước có mã ICD gắn cond cog_dis (F00–F05, F06.7x)
const COG_BASE = ['ctm', 'glu', 'na', 'k', 'cl', 'ast', 'alt', 'ure', 'creat'];      // mỗi lần khám
const COG_3M = ['ldl', 'hdl', 'chol', 'tg', 'ecg'];                                 // 3 tháng / lần
const COG_TESTS = ['adl', 'iadl', 'gds', 'psqi'];                                    // trắc nghiệm tâm lý
function cogHistory(p, v){
  if((p.conds || []).includes('dementia')) return true;
  if(['sa sut tri tue', 'alzheimer', 'roi loan nhan thuc', 'suy giam nhan thuc', 'mat tri'].some(k => mentionsSymptom(p.condNote || '', k))) return true;
  return (p.visits || []).some(x => x !== v && dxCodes(x).some(c => { const it = ICD.find(r => r[0] === c); return it && it[2].includes('cog_dis'); }));
}
// Khoá cận lâm sàng nên tự chọn cho lượt khám v: nhóm 3 tháng chỉ chọn khi chưa có kết quả trong 90 ngày trước
function cogAutoOrderKeys(p, v){
  if(!cogHistory(p, v)) return [];
  const d = v.date || todayISO();
  const recent = k => (p.visits || []).some(x => x !== v && x.date && x.date <= d && daysBetween(x.date, d) < 90 && (x.orders || []).some(o => o.key === k && o.value != null && String(o.value).trim()));
  return COG_BASE.concat(COG_3M.filter(k => !recent(k)), COG_TESTS);
}

// ================= SÀNG LỌC & LỊCH HẸN =================
const ORDER_TO_SCREEN = {ns_dd:'gastric', ns_dt:'crc', hbsag:'hep', antihcv:'hep', glu:'dm', hba1c:['dm','a1c'], chol:'lipid', ldl:'lipid', creat:'kidney', acr:'kidney', inr:'inr', mmse:'cog', moca:'cog', minicog:'cog', clock:'cog', ecg:null};
function screenCtx(p){
  const ctx = ctxOf(p, null), r = p.risk || {};
  // Sàng lọc nhận thức: than phiền trí nhớ / đột quỵ ghi trong tiền sử, bệnh sử, lý do khám hoặc mã ICD đột quỵ (I60–I64, I69) ở các lượt khám
  const txt = [p.condNote || ''].concat((p.visits || []).map(v => (v.hpi || '') + ' . ' + (v.reason || ''))).join(' . ');
  const say = k => mentionsSymptom(txt, k);
  const memory = ['giam tri nho', 'suy giam tri nho', 'hay quen', 'mau quen', 'kem tri nho', 'quen nhieu', 'quen truoc quen sau'].some(say);
  const stroke = ['dot quy', 'tai bien mach mau nao', 'nhoi mau nao', 'xuat huyet nao', 'chay mau nao'].some(say)
    || (p.visits || []).some(v => { try { return dxCodes(v).some(c => /^I6[0-4]|^I69/.test(c)); } catch(e){ return false; } });
  return {memory, stroke, age: ctx.age ?? 0, sex: p.sex, bmi: ctx.bmi ?? 0, has: k => ctx.conds.has(k), fam: k => (p.fam || []).includes(k), smoke: r.smoke || 'never', packYears: num(r.packYears) || 0, quitYears: num(r.quitYear) ? (new Date().getFullYear() - num(r.quitYear)) : 0, menopause: !!r.menopause, longTag: t => ctx.longTags.has(t)};
}
function autoScreenDates(p){
  const out = {};
  for(const v of p.visits || []) for(const o of v.orders || []){
    if(!(num(o.value) != null || (o.value && String(o.value).trim()))) continue;
    let ids = ORDER_TO_SCREEN[o.key]; if(!ids) continue; if(!Array.isArray(ids)) ids = [ids];
    ids.forEach(id => { if(!out[id] || out[id] < v.date) out[id] = v.date; });
  }
  return out;
}
function screenList(p){
  if(ageOf(p) == null) return [];
  const c = screenCtx(p), auto = autoScreenDates(p), t = todayISO();
  return SCREEN.filter(r => { try { return r.when(c); } catch(e){ return false; } }).map(r => {
    const rec = (p.screen || {})[r.id] || {};
    const def = r.everyFn ? r.everyFn(c) : r.every;
    const every = num(rec.every) ?? def;
    let last = rec.last || '', src = 'tay';
    if(auto[r.id] && auto[r.id] > last){ last = auto[r.id]; src = 'auto'; }
    let due = null, st = 'never';
    if(last){ if(every > 0){ due = addMonths(last, every); st = due <= t ? 'due' : 'ok'; } else st = 'done'; }
    return {r, rec, every, def, last, src, due, st};
  });
}
function apptList(){
  const out = [];
  for(const p of S.patients){
    const vs = (p.visits || []).slice().sort((a, b) => a.date.localeCompare(b.date));
    const last = vs[vs.length - 1];
    if(last && last.plan && last.plan.followDate) out.push({p, date: last.plan.followDate, kind: 'Tái khám', note: last.plan.followReason || (last.dx && last.dx.main) || '', vid: last.id});
    for(const r of p.recalls || []) if(!r.done && r.due) out.push({p, date: r.due, kind: 'Nhắc hẹn', note: r.title});
    for(const s of screenList(p)) if(s.st === 'due') out.push({p, date: s.due, kind: 'Sàng lọc', note: s.r.t});
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}
function nextAppt(p){ const t = todayISO(); return apptList().filter(a => a.p === p && a.kind !== 'Sàng lọc').sort((a, b) => a.date.localeCompare(b.date))[0]; }

// ================= GỢI Ý CHẨN ĐOÁN TÂM THẦN =================
// Theo BYT 2020 (QĐ 2058/QĐ-BYT), Bài 18–23. Chỉ là gợi ý: liệt kê tiêu chuẩn đã thỏa / còn thiếu, bác sĩ quyết định.
const icdName = c => (ICD.find(x => x[0] === c) || [c, c])[1];
function hasMental(v){ const m = v && v.mental; return !!(m && ((m.sx || []).length || (m.hist || []).length || m.weeks != null || m.text || m.premorbid || m.trauma)); }
function orderNum(v, key){ const o = (v.orders || []).find(x => x.key === key); return o ? num(o.value) : null; }
function psyCounts(v){
  const sx = new Set(((v.mental || {}).sx) || []), n = g => MENTAL_SX.find(x => x.g === g).items.filter(([k]) => sx.has(k)).length;
  return {sx, core: n('dep_core'), common: n('dep_common'), som: n('dep_som'), manA: sx.has('man_mood'), manB: n('man_b'), psy: n('psy') > 0, mix: sx.has('mix_now')};
}
function psyDx(p, v){
  const m = v.mental || {}, c = psyCounts(v), sx = c.sx, hist = new Set(m.hist || []), excl = new Set(m.excl || []);
  const wk = num(m.weeks), imp = m.impair || '', out = [], alerts = [], todo = [];
  const exclMiss = [...(excl.has('subst') ? ['Có liên quan sử dụng chất tác động tâm thần → xem xét rối loạn do chất (F10–F19)'] : []), ...(excl.has('organic') ? ['Có bệnh cơ thể / thực tổn → xem xét rối loạn tâm thần thực tổn (F00–F09)'] : [])];
  const add = (code, src, met, miss, note) => out.push({code, name: icdName(code), src, met, miss: miss.concat(exclMiss), note});
  const i11x = {};   // ghi chú ICD-11 tính từ bảng kiểm, theo mã ICD-10 gợi ý (gộp vào s.i11 ở cuối hàm)
  const durTxt = wk == null ? 'Chưa nhập thời gian kéo dài' : `Thời gian kéo dài ${fmtN(wk)} tuần`;
  // --- Giai đoạn trầm cảm hiện tại (Bài 20) ---
  // Trầm cảm nặng (F32.2): 3/3 chính + ≥ 4 phổ biến VÀ "một số phải đặc biệt nặng" — bác sĩ xác nhận bằng ô m.severe
  // (có loạn thần thì đã là nặng – F32.3). Đủ số lượng mà chưa xác nhận → xếp mức vừa, kèm nhắc.
  const sevCount = c.core >= 3 && c.common >= 4, sevOk = sevCount && (!!m.severe || c.psy);
  const depLv = sevOk ? 'severe' : c.core >= 2 && c.common >= 3 ? 'mod' : c.core >= 2 && c.common >= 2 ? 'mild' : '';
  const depOk = depLv && wk != null && wk >= 2;
  const depCode = {mild: '0', mod: '1', severe: c.psy ? '3' : '2'}[depLv];
  const depMet = [`${c.core}/3 triệu chứng chính`, `${c.common}/7 triệu chứng phổ biến`].concat(wk != null && wk >= 2 ? [durTxt + ' (≥ 2 tuần)'] : []).concat(c.psy && depLv === 'severe' ? ['Có triệu chứng loạn thần'] : []).concat(m.severe && depLv === 'severe' ? ['Bác sĩ xác nhận một số triệu chứng đặc biệt nặng'] : []);
  const depMiss = (wk == null || wk < 2 ? [durTxt + ' — cần ≥ 2 tuần'] : []).concat(c.psy && depLv && depLv !== 'severe' ? ['Có loạn thần nhưng chưa đủ trầm cảm nặng (3/3 chính + ≥ 4 phổ biến): đánh giá lại'] : []);
  const somNote = c.som >= 4 ? `Có hội chứng cơ thể (${c.som}/8 triệu chứng cơ thể)` : '';
  const sevNote = sevCount && !sevOk ? 'Đủ số lượng triệu chứng của trầm cảm NẶNG (3/3 chính + ≥ 4 phổ biến) nhưng đang xếp mức VỪA vì chưa xác nhận "một số triệu chứng đặc biệt nặng" (BYT 2020 Bài 20). Nếu đúng, đánh dấu ô này ở mục Khám tâm thần (bước 1).' : '';
  // Đối chiếu tiêu chuẩn nghiên cứu ICD-10 (bản VN tr. 102–104): nhẹ ≥ 2 chính + tổng ≥ 4; vừa ≥ 2 chính + tổng ≥ 6; nặng 3 chính + tổng ≥ 8
  // (danh sách bổ sung C: tự tin, bị tội, tự sát, tập trung, tâm thần vận động, giấc ngủ, ăn uống). BYT 2020 (mô tả lâm sàng) dùng ngưỡng thấp hơn — app xếp mức theo BYT 2020.
  const dcrTot = ['dep_mood', 'dep_anhed', 'dep_energy', 'dep_esteem', 'dep_guilt', 'dep_suicide', 'dep_conc', 'som_psychomotor', 'dep_sleep', 'dep_appetite'].filter(k => sx.has(k)).length;
  const dcrLv = c.core >= 3 && dcrTot >= 8 ? 'severe' : c.core >= 2 && dcrTot >= 6 ? 'mod' : c.core >= 2 && dcrTot >= 4 ? 'mild' : '';
  const LVN = {mild: 'nhẹ', mod: 'vừa', severe: 'nặng', '': 'chưa đủ'};
  const dcrNote = depLv && dcrLv !== depLv ? `Theo tiêu chuẩn nghiên cứu ICD-10 (bản VN tr. 102–104): tổng ${dcrTot} triệu chứng → mức ${LVN[dcrLv]} (BYT 2020 xếp mức ${LVN[depLv]}).` : '';
  // ICD-11 (6A70): ≥ 5/10 triệu chứng, ≥ 1 thuộc nhóm cảm xúc; tự ti HOẶC bị tội tính là 1
  const i11Dep = ['dep_mood', 'dep_anhed', 'dep_conc', 'dep_pessim', 'dep_suicide', 'dep_sleep', 'dep_appetite', 'som_psychomotor', 'dep_energy'].filter(k => sx.has(k)).length + (sx.has('dep_esteem') || sx.has('dep_guilt') ? 1 : 0);
  const i11DepOk = i11Dep >= 5 && (sx.has('dep_mood') || sx.has('dep_anhed')) && wk != null && wk >= 2;
  const i11DepTxt = `Bảng kiểm: ${i11Dep}/10 triệu chứng → ${i11DepOk ? 'đủ' : 'CHƯA đủ'} giai đoạn trầm cảm theo ICD-11${i11DepOk ? '' : ' (cần ≥ 5, có khí sắc trầm hoặc mất hứng thú, ≥ 2 tuần)'}.`;
  const depNote = [somNote, sevNote, dcrNote].filter(Boolean).join(' ');
  // --- Giai đoạn hưng cảm hiện tại (Bài 18) ---
  const manSx = c.manA && c.manB >= 3;
  const manFull = manSx && wk != null && wk >= 1 && (imp === 'marked' || imp === 'hosp');
  const hypo = manSx && !manFull && imp === 'none';
  const manMet = ['Khí sắc tăng / dễ cáu bất thường', `${c.manB}/9 triệu chứng tiêu chuẩn B`].concat(manFull ? [durTxt + ' (≥ 1 tuần)', MENTAL_IMPAIR.find(x => x[0] === imp)[1]] : []);
  const pastAny = hist.has('mania') || hist.has('hypomania') || hist.has('mixed') || hist.has('dep') || hist.has('dep2');
  const pastMan = hist.has('mania') || hist.has('hypomania') || hist.has('mixed');
  const mood = manSx || c.mix || depLv;
  if(manSx){
    const cur = manFull ? (c.psy ? '2' : '1') : hypo ? '0' : null;
    const mMiss = manFull || hypo ? [] : ['Chưa xác định: kéo dài ≥ 1 tuần và suy giảm chức năng rõ rệt (hưng cảm) hay không suy giảm rõ rệt (hưng cảm nhẹ)'];
    // ICD-10 bản VN tr. 97: hưng cảm nhẹ kéo dài ≥ 4 ngày liên tiếp; hưng cảm cần ≥ 4 triệu chứng B nếu khí sắc chỉ dễ cáu
    if(hypo && (wk == null || wk < 4 / 7)) mMiss.push(durTxt + ' — hưng cảm nhẹ cần ≥ 4 ngày liên tiếp');
    const irrNote = c.manB === 3 && !hypo ? ' Nếu khí sắc chỉ dễ cáu kỉnh (không hưng phấn): ICD-10 cần ≥ 4 triệu chứng tiêu chuẩn B.' : '';
    const curCode = pastAny ? 'F31.' + (cur || '1') : 'F30.' + (cur || '1');
    i11x[curCode] = sx.has('man_act') ? '' : 'Bảng kiểm chưa có "Tăng hoạt động" — ICD-11 bắt buộc tăng hoạt động / năng lượng cùng với thay đổi khí sắc.';
    const hypoNote = cur === '0' ? 'Hưng cảm nhẹ (ICD-10 bản VN tr. 97): ≥ 4 ngày liên tiếp, ≥ 3/7 dấu hiệu (tăng hoạt động, nói nhiều, khó tập trung, giảm nhu cầu ngủ, tăng tình dục, tiêu pha / liều lĩnh, tăng giao tiếp), có ảnh hưởng hoạt động hằng ngày.' : '';
    if(pastAny) add(curCode, 'Bài 19', manMet.concat(['Tiền sử có giai đoạn rối loạn cảm xúc']), mMiss, hypoNote + irrNote);
    else add(curCode, 'Bài 18', manMet, mMiss, hypoNote + irrNote + (cur === '0' ? ' ' : '') + 'Giai đoạn hưng cảm đã loại trừ thực tổn và do chất được coi là giai đoạn đầu của rối loạn lưỡng cực.');
  } else if(c.manA && c.manB) add('F30.1', 'Bài 18', ['Khí sắc tăng / dễ cáu bất thường'], [`Mới có ${c.manB}/9 triệu chứng tiêu chuẩn B — cần ≥ 3`], '');
  if(c.mix && !manSx){
    // ICD-10 bản VN tr. 101: B — cả triệu chứng hưng và trầm nổi trội phần lớn thời gian ≥ 2 tuần; C — trước đây có ≥ 1 giai đoạn hưng cảm / hưng cảm nhẹ, trầm cảm hoặc hỗn hợp
    const mixMiss = (wk == null || wk < 2 ? [durTxt + ' — cần ≥ 2 tuần (ICD-10 F31.6 B)'] : []).concat(pastAny ? [] : ['Cần tiền sử ≥ 1 giai đoạn rối loạn cảm xúc (hưng cảm / hưng cảm nhẹ, trầm cảm hoặc hỗn hợp)']);
    add('F31.6', 'Bài 19; ICD-10 (bản VN) tr. 101', ['Pha trộn / thay đổi nhanh triệu chứng hưng – trầm'].concat(pastAny ? ['Tiền sử có giai đoạn rối loạn cảm xúc'] : []), mixMiss, '');
  }
  if(depLv && !manSx && !c.mix){
    if(pastMan){
      const code = depLv === 'severe' ? (c.psy ? 'F31.5' : 'F31.4') : 'F31.3';
      add(code, 'Bài 19', depMet.concat(['Tiền sử có giai đoạn hưng cảm / hưng cảm nhẹ']), depMiss, depNote);
    } else if(hist.has('dep') || hist.has('dep2')){
      add('F33.' + depCode, 'Bài 21', depMet.concat(['Tiền sử có giai đoạn trầm cảm, cách nhiều tháng ổn định']), depMiss, [depNote, 'Không có tiền sử giai đoạn hưng cảm / hưng cảm nhẹ độc lập.'].filter(Boolean).join(' '));
    } else {
      add('F32.' + depCode, 'Bài 20', depMet, depMiss, depNote);
    }
  } else if(!depLv && c.core >= 1 && !c.manA){
    add('F32.0', 'Bài 20', [`${c.core}/3 triệu chứng chính`, `${c.common}/7 triệu chứng phổ biến`], [`Chưa đủ: trầm cảm nhẹ cần ≥ 2/3 triệu chứng chính và ≥ 2/7 phổ biến`].concat(wk == null || wk < 2 ? [durTxt + ' — cần ≥ 2 tuần'] : []), '');
  }
  // --- Thuyên giảm ---
  if(!mood){
    // ICD-10 bản VN tr. 101: F31.7 B — ≥ 1 giai đoạn hưng cảm / hưng cảm nhẹ VÀ thêm ≥ 1 giai đoạn khác
    if(pastMan) add('F31.7', 'Bài 19; ICD-10 (bản VN) tr. 101', ['Hiện không có rối loạn cảm xúc đáng kể', 'Tiền sử có giai đoạn hưng cảm / hưng cảm nhẹ'],
      ['mania', 'hypomania', 'mixed', 'dep', 'dep2'].filter(k => hist.has(k)).length >= 2 || hist.has('dep2') ? [] : ['Cần thêm ≥ 1 giai đoạn rối loạn cảm xúc khác trong tiền sử (hưng cảm / hưng cảm nhẹ, trầm cảm, hỗn hợp)'], '');
    else if(hist.has('dep2')) add('F33.4', 'Bài 21', ['Hiện không đủ tiêu chuẩn giai đoạn trầm cảm', 'Trước đây đã đủ tiêu chuẩn trầm cảm tái diễn'], [], '');
  }
  // --- Lo âu (Bài 22, 23) ---
  const anxSx = ['anx_fear', 'anx_motor', 'anx_auto', 'anx_primary'].filter(k => sx.has(k));
  if(anxSx.length){
    const gadMiss = ['anx_fear', 'anx_motor', 'anx_auto', 'anx_primary'].filter(k => !sx.has(k)).map(k => 'Chưa có: ' + MENTAL_SX.find(x => x.g === 'anx').items.find(i => i[0] === k)[1].split(':')[0]);
    if(wk == null || wk < 26) gadMiss.push(durTxt + ' — thường kéo dài nhiều tuần, nhiều tháng (thường 6 tháng)');
    if(!depOk || gadMiss.length <= 1) add('F41.1', 'Bài 22', anxSx.map(k => MENTAL_SX.find(x => x.g === 'anx').items.find(i => i[0] === k)[1].split(':')[0]), gadMiss, 'Loại trừ cường giáp, rối loạn thực tổn, do chất (amphetamin, cai benzodiazepin).');
    const depSome = sx.has('dep_mood') || sx.has('dep_anhed');
    if(depSome && !depOk){
      const mm = []; if(!sx.has('anx_auto')) mm.push('Cần có triệu chứng thần kinh tự trị (run, đánh trống ngực, khô miệng, sôi bụng…)');
      if(excl.has('stress')) mm.push('Liên quan chặt chẽ sự kiện stress → chuyển sang rối loạn sự thích ứng');
      add('F41.2', 'Bài 23', ['Có khí sắc giảm / mất hứng thú', 'Có biểu hiện lo âu', 'Chưa đủ nặng để chẩn đoán riêng trầm cảm'], mm, 'Nếu cả trầm cảm và lo âu đều đủ nặng thì ưu tiên chẩn đoán trầm cảm.');
    }
  }
  // --- Rối loạn hoảng sợ, ám ảnh sợ, ám ảnh nghi thức, stress cấp / PTSD (ICD-10 WHO — BYT 2020 không có bài riêng) ---
  const has = k => sx.has(k), lab = (g, k) => MENTAL_SX.find(x => x.g === g).items.find(i => i[0] === k)[1].split(/[:;(]/)[0].trim();
  const need = (g, ks) => ks.filter(k => !has(k)).map(k => 'Chưa có: ' + lab(g, k));
  const phobAny = has('phob_agora') || has('phob_social') || has('phob_specific');
  if(has('pan_attacks')){
    const miss = need('panic', ['pan_sx', 'pan_excl']);
    if(phobAny) miss.push('Cơn hoảng sợ gắn với tình huống ám ảnh sợ → xem ám ảnh sợ khoảng trống có rối loạn hoảng sợ (F40.01)');
    if(depOk) miss.push('Đang đủ tiêu chuẩn trầm cảm — loại trừ cơn hoảng sợ do rối loạn khí sắc (F30–F39)');
    add('F41.0', 'ICD-10 (bản VN)', ['Cơn hoảng sợ tái diễn, tự phát, không dự đoán trước'].concat(['pan_sx', 'pan_excl'].filter(has).map(k => lab('panic', k))), miss, 'Mức độ: F41.00 trung bình — ≥ 4 cơn trong 4 tuần; F41.01 nặng — ≥ 4 cơn mỗi tuần trong 4 tuần. Loại trừ bệnh tim mạch, cường giáp, hạ đường huyết, do chất (cà phê, amphetamin, cai rượu / benzodiazepin).');
  }
  if(phobAny){
    const pk = ['phob_sx', 'phob_avoid', 'phob_insight', 'phob_excl'], base = need('phob', pk), pmet = pk.filter(has).map(k => lab('phob', k));
    if(has('phob_agora')) add('F40.0', 'ICD-10 (bản VN)', ['Sợ / né tránh ≥ 2 tình huống: đám đông, nơi công cộng, đi một mình, đi xa nhà'].concat(pmet), base, has('pan_attacks') ? 'Có kèm cơn hoảng sợ → F40.01 (có rối loạn hoảng sợ).' : 'Không có cơn hoảng sợ → F40.00.');
    if(has('phob_social')) add('F40.1', 'ICD-10 (bản VN)', ['Sợ / né tránh trở thành trung tâm chú ý, sợ bị sỉ nhục'].concat(pmet), base, '');
    if(has('phob_specific')) add('F40.2', 'ICD-10 (bản VN)', ['Sợ / né tránh đồ vật, tình huống cụ thể'].concat(pmet), base, 'Dưới nhóm: loài vật, hiện tượng thiên nhiên, tiêm – máu – bị thương, tình huống (thang máy, đường hầm), loại khác.');
  }
  if(has('ocd_obs') || has('ocd_comp')){
    const code = has('ocd_obs') && has('ocd_comp') ? 'F42.2' : has('ocd_obs') ? 'F42.0' : 'F42.1';
    const miss = need('ocd', ['ocd_2wk', 'ocd_own', 'ocd_impair']);
    if(depOk) miss.push('Đang đủ tiêu chuẩn trầm cảm — loại trừ ám ảnh / nghi thức là hậu quả của rối loạn khí sắc (F30–F39)');
    if(c.psy) miss.push('Có triệu chứng loạn thần — loại trừ tâm thần phân liệt và rối loạn liên quan (F20–F29)');
    add(code, 'ICD-10 (bản VN)', ['ocd_obs', 'ocd_comp', 'ocd_2wk', 'ocd_own', 'ocd_impair'].filter(has).map(k => lab('ocd', k)), miss, '');
  }
  if(has('ptsd_event')){
    if(has('ast_acute')) add('F43.0', 'ICD-10 (bản VN)', ['Tác nhân stress đặc biệt về tâm thần / cơ thể', lab('ptsd', 'ast_acute')], [], 'Mức độ: F43.00 nhẹ — có triệu chứng lo âu lan toả (B–D của F41.1); F43.01 trung bình — thêm 2 triệu chứng (cách ly xã hội, thu hẹp chú ý, rối loạn định hướng, cáu giận, tuyệt vọng, tăng hoạt động vô mục đích, buồn rầu quá mức); F43.02 nặng — thêm 4 triệu chứng hoặc sững sờ phân ly. Loại trừ: đang có rối loạn tâm thần khác (trừ F41.1, F60), hoặc giai đoạn rối loạn khác kết thúc < 3 tháng.');
    if(['ptsd_reexp', 'ptsd_avoid', 'ptsd_arousal'].some(has)){
      const miss = need('ptsd', ['ptsd_reexp', 'ptsd_avoid', 'ptsd_arousal', 'ptsd_6m']);
      add('F43.1', 'ICD-10 (bản VN); LEC4', ['Sự kiện đe doạ / thảm hoạ đặc biệt'].concat(['ptsd_reexp', 'ptsd_avoid', 'ptsd_arousal', 'ptsd_6m'].filter(has).map(k => lab('ptsd', k))), miss, 'Cần đủ B (hồi tưởng), C (né tránh), D (quên một phần hoặc ≥ 2 dấu hiệu tăng nhạy cảm) trong vòng 6 tháng. Trắc nghiệm hỗ trợ: PC-PTSD-5 (sàng lọc), PCL-5, CAPS-5 (phỏng vấn chẩn đoán), SPRINT-E.');
    }
  }
  // --- Chán ăn / ăn vô độ tâm thần (BYT 2020 Bài 26 theo ICD-10; LEC9 handout ICD-10 F50.2) ---
  const vw = num(((v.vitals || {}).weight)) ?? num(p.weight), vh = num(((v.vitals || {}).height)) ?? num(p.height), bmiNow = bmiOf(vw, vh);
  const anW = has('an_weight') || (bmiNow != null && bmiNow <= 17.5);
  const anKeys = ['an_self', 'an_body', 'an_endo'], anCnt = anKeys.filter(has).length + (anW ? 1 : 0);
  const anOk = anCnt === 4;
  if(anCnt >= 2 && (has('an_self') || has('an_body'))){
    const met = (anW ? [bmiNow != null && bmiNow <= 17.5 && !has('an_weight') ? `BMI ${fmtN(bmiNow, 1)} (≤ 17,5)` : 'Cân nặng thấp ≥ 15% so với phải có'] : []).concat(anKeys.filter(has).map(k => lab('ed', k)));
    const miss = (anW ? [] : ['Chưa có: cân nặng thấp ≥ 15% (BMI ≤ 17,5)' + (bmiNow != null ? ` — BMI hiện ${fmtN(bmiNow, 1)}` : '')]).concat(need('ed', anKeys));
    const sev = bmiNow != null && bmiNow < 17.5 ? (bmiNow < 15 ? 'trầm trọng' : bmiNow < 16 ? 'nặng' : bmiNow < 17 ? 'trung bình' : 'nhẹ') : '';
    add(anOk ? 'F50.0' : 'F50.1', 'BYT 2020 Bài 26', met, anOk ? [] : miss, (anOk ? '' : 'Thiếu một hoặc vài đặc điểm chính → chán ăn tâm thần không điển hình (F50.1). ') + (sev ? `Mức độ theo BMI (LEC9, DSM-5): ${sev}. ` : '') + 'Phân biệt: sút cân do bệnh cơ thể (Crohn, kém hấp thu, u não, ung thư), trầm cảm (không có ý tưởng méo mó về cơ thể).');
  }
  const bnKeys = ['bn_binge', 'bn_crave', 'bn_comp', 'bn_fat'], bnCnt = bnKeys.filter(has).length;
  if(has('bn_binge') && bnCnt >= 2){
    const miss = need('ed', bnKeys);
    if(anOk) miss.push('Đang đủ tiêu chuẩn chán ăn tâm thần → ưu tiên F50.0');
    add(bnCnt === 4 && !anOk ? 'F50.2' : 'F50.3', 'LEC9 (ICD-10 F50.2)', bnKeys.filter(has).map(k => lab('ed', k)), bnCnt === 4 && !anOk ? [] : miss, (bnCnt === 4 && !anOk ? '' : 'Thiếu đặc điểm chính → ăn vô độ tâm thần không điển hình (F50.3). ') + 'Kiểm tra kali máu, ECG khi có tự gây nôn / dùng thuốc tẩy, lợi tiểu.');
  }
  const scoffN = [...sx].filter(k => k.startsWith('scoff_')).length;
  if(scoffN >= 2 && anCnt < 2 && !has('bn_binge')) todo.push(`SCOFF = ${scoffN}/5: đánh giá mục "Chán ăn / ăn vô độ tâm thần" để định hướng F50.`);
  // --- Rối loạn chức năng tình dục F52 (LEC6: tiêu chuẩn chung a–d + nguyên tắc chỉ đạo từng thể) ---
  const SEX_CODES = [['sex_libido', 'F52.0', ''], ['sex_aversion', 'F52.10', 'Sự ghét sợ không phải hậu quả của lo âu do thất bại tình dục trước đó.'],
    ['sex_nopleasure', 'F52.11', 'Không có sợ hãi / lo âu dai dẳng khi hoạt động tình dục.'], ['sex_ed', 'F52.2', 'Nam: không cương đủ để giao hợp; nữ: không làm trơn âm đạo.'],
    ['sex_orgasm', 'F52.3', ''], ['sex_pe', 'F52.4', 'Phóng tinh trước hoặc trong vòng 15 giây từ khi bắt đầu giao hợp; không do lâu không hoạt động tình dục.'],
    ['sex_vaginismus', 'F52.5', ''], ['sex_pain', 'F52.6', 'Không do co thắt / khô âm đạo; đau có nguồn gốc thực tổn phân loại theo nguyên nhân.']];
  const sexGen = ['sxg_unable', 'sxg_freq', 'sxg_6m', 'sxg_excl'], sexMet = sexGen.filter(has).map(k => lab('sexdx', k)), sexMiss = need('sexdx', sexGen);
  const sexWarn = [];
  if(depLv) sexWarn.push('Có triệu chứng trầm cảm → rối loạn tình dục có thể là biểu hiện của trầm cảm (chẩn đoán phân biệt F32 — LEC6)');
  if(anxSx.length) sexWarn.push('Có lo âu → phân biệt F41 (LEC6)');
  const onDrug = ctxOf(p, v).longMeds.filter(lm => lm.tags.has('ssri') || lm.tags.has('snri')).map(lm => lm.short);
  if(onDrug.length) sexWarn.push('Đang dùng ' + onDrug.join(', ') + ' — có thể do thuốc (tiêu chuẩn d)');
  SEX_CODES.filter(([k]) => has(k)).forEach(([k, code, note]) => add(code, 'LEC6', [lab('sex', k)].concat(sexMet), sexMiss.concat(sexWarn), note));
  if(has('sxg_hyper')) add('F52.7', 'LEC6', ['Ham muốn tình dục tăng quá mức, cấp thiết'], manSx || c.mix ? ['Đang có triệu chứng hưng cảm / hỗn hợp → tăng tình dục là triệu chứng của rối loạn cảm xúc'] : [], 'Thường gặp trong rối loạn cảm xúc (trầm cảm, hưng cảm, hỗn hợp) — LEC6.');
  // ===== Nhóm bổ sung 2026-10-30: nhận thức, giấc ngủ, nghiện, hành vi, trẻ em, phân ly / cơ thể hoá =====
  // Nguồn: BYT 2020 (Bài 1, 2, 4, 7, 24, 25, 27–31) và ICD-10 bản tiếng Việt "tiêu chuẩn chẩn đoán dành cho nghiên cứu" (thư mục Tâm thần)
  const age = ageOf(p, v.date);
  // Sa sút trí tuệ — ICD-10 bản VN tr. 47–56 (G1–G4 chung; F00 A–B + F00.0 / F00.1; F01 G1–G4 + thể; F02.0–F02.8; F03); BYT 2020 Bài 1–3
  const pc = ctxOf(p, v).conds, dems = has('dem_mem') && has('dem_cog');
  if(dems){
    const miss = need('dem', ['dem_clear', 'dem_emo', 'dem_6m']);
    if(!has('dem_func')) miss.push('Chưa ảnh hưởng hoạt động hằng ngày → cân nhắc rối loạn nhận thức nhẹ (F06.7)');
    const met = ['dem_mem', 'dem_cog', 'dem_func', 'dem_clear', 'dem_emo', 'dem_6m'].filter(has).map(k => lab('dem', k));
    const notes = [];
    let code = 'F03', lewy = false;
    const LBD = ['dem_lbd_vh', 'dem_lbd_fl', 'dem_lbd_rbd', 'dem_lbd_pk'], nL = LBD.filter(has).length;
    const f02x = need('dem', ['dem_f02_excl']);
    if(has('dem_cjd')){ code = 'F02.1'; met.push(lab('dem', 'dem_cjd')); miss.push(...need('dem', ['dem_cjd_neuro'])); notes.push('Bộ 3: sa sút nặng tiến triển nhanh, rối loạn tháp – ngoại tháp, rung giật cơ. Điện não đồ sóng 3 pha (phức hợp nhọn chu kỳ); dịch não tuỷ protein tau > 1200 pg/mL, enolase tăng (BYT 2020 Bài 3); xác định bằng giải phẫu bệnh.'); }
    else if(has('dem_hd')){ code = 'F02.2'; met.push(lab('dem', 'dem_hd')); miss.push(...need('dem', ['dem_hd_fam'])); notes.push('Thường khởi phát 30–40 tuổi; múa giật xuất hiện trước giảm trí nhớ, sớm có trầm cảm, lo âu, hoang tưởng (BYT 2020 Bài 3).'); }
    else if(has('dem_hiv')){ code = 'F02.4'; met.push(lab('dem', 'dem_hiv')); miss.push(...f02x); notes.push('Tiến triển nhanh trong nhiều tuần – tháng; khám: run, mất điều hoà, tăng phản xạ, dấu giải phóng thuỳ trán (BYT 2020 Bài 3).'); }
    else if((has('dem_pd') || pc.has('parkinson')) && (has('dem_pd_1y') || nL < 2)){ code = 'F02.3'; met.push(has('dem_pd') ? lab('dem', 'dem_pd') : 'Bệnh nền Parkinson'); if(has('dem_pd_1y')) met.push(lab('dem', 'dem_pd_1y')); if(!has('dem_pd')) miss.push('Chưa xác nhận suy giảm nhận thức không do thuốc kháng Parkinson'); miss.push(...f02x); if(!has('dem_pd_1y')) notes.push('BYT 2020 Bài 3: suy giảm nhận thức thường xuất hiện ≥ 1 năm sau chẩn đoán Parkinson; nếu xuất hiện trước hoặc cùng lúc với triệu chứng vận động → nghĩ thể Lewy.'); notes.push('Nếu cũng đủ tiêu chuẩn Alzheimer khởi phát muộn → dùng F00.1 kèm G20.'); }
    else if(nL >= 2){ code = 'F02.8'; lewy = true; met.push(...LBD.filter(has).map(k => lab('dem', k))); if(has('dem_pd') || pc.has('parkinson')) miss.push('Có Parkinson nhưng nhận thức suy giảm chưa đủ 1 năm sau chẩn đoán → nghĩ thể Lewy; đánh dấu "≥ 1 năm" nếu là F02.3'); miss.push(...f02x); notes.push('Sa sút trí tuệ thể Lewy: ICD-10 F02.8 kèm G31.8; ICD-11 6D82 (cần ≥ 2: ảo thị tái diễn, lú lẫn từng đợt, rối loạn hành vi giấc ngủ REM, dấu parkinson). Rất nhạy cảm thuốc an thần kinh — tránh haloperidol.'); }
    else if(has('dem_front')){ code = 'F02.0'; met.push(lab('dem', 'dem_front')); miss.push(...need('dem', ['dem_front_mem'])); notes.push('Thường khởi phát 45–60 tuổi; biến đổi nhân cách, hành vi xã hội đi trước giảm trí nhớ (BYT 2020 Bài 3). ICD-11 ghi kèm 8A23.'); }
    else if(has('dem_vasc')){
      met.push(lab('dem', 'dem_vasc')); miss.push(...need('dem', ['dem_uneven', 'dem_focal']));
      ['dem_vasc_img', 'dem_vasc_3m'].filter(has).forEach(k => met.push(lab('dem', k)));
      if(!has('dem_vasc_img')) notes.push('BYT 2020 Bài 2: bệnh mạch máu não phải được khẳng định bằng CT / MRI.');
      if(has('dem_mixad')) code = 'F00.2';
      else if(has('dem_step')){ code = 'F01.0'; if(!has('dem_vasc_3m')) notes.push('Xác nhận khởi phát trong 3 tháng sau đột quỵ, không có sa sút trí tuệ trước đột quỵ (BYT 2020 Bài 2).'); }
      else if(has('dem_multi')) code = 'F01.1';
      else if(has('dem_subcort')){ code = 'F01.2'; if(!pc.has('htn')) miss.push('F01.2 cần tiền sử tăng huyết áp'); }
      else if(has('dem_mixcs')) code = 'F01.3';
      else { code = 'F01.9'; notes.push('Đánh dấu thể F01.0–F01.3 nếu xác định được.'); }
    }
    else if(has('dem_other')){ code = 'F02.8'; met.push(lab('dem', 'dem_other')); notes.push('Ghi thêm mã ICD-10 của bệnh gây ra.'); }
    else if(['dem_ad_excl', 'dem_early', 'dem_fast', 'dem_cortical', 'dem_slow', 'dem_mempred', 'dem_mixad'].some(has)){
      miss.push(...need('dem', ['dem_ad_excl']));
      if(has('dem_mixad')) code = 'F00.2';
      else if(has('dem_early')){ if(has('dem_fast') || has('dem_cortical')) code = 'F00.0'; else { code = 'F00.9'; notes.push('F00.0 cần thêm: khởi phát / tiến triển nhanh, hoặc vong ngôn, vong ký, vong đọc, vong tính, vong hành.'); } }
      else if(has('dem_slow') || has('dem_mempred')) code = 'F00.1';
      else { code = 'F00.9'; notes.push('F00.1 (≥ 65 tuổi) cần thêm: khởi phát từ từ, tiến triển rất chậm, hoặc ưu thế suy giảm trí nhớ.'); }
      met.push(...['dem_ad_excl', 'dem_early', 'dem_fast', 'dem_cortical', 'dem_slow', 'dem_mempred', 'dem_mixad'].filter(has).map(k => lab('dem', k)));
    }
    else { notes.push('Chưa xác định nguyên nhân → F03; đánh dấu đặc điểm Alzheimer, mạch máu hoặc bệnh khác để xếp thể. Do rượu → F10.73 (ICD-11 6D84.0); do thuốc an thần, gây ngủ → F13.73 (6D84.1).'); if(nL === 1) notes.push('Có 1 đặc điểm thể Lewy — cần ≥ 2 để nghĩ F02.8 thể Lewy.'); }
    if(code === 'F00.0' && age != null && age >= 75) notes.push(`Hiện ${age} tuổi — xem lại tuổi khởi phát.`);
    const x5 = ['dem_x1', 'dem_x2', 'dem_x3'].filter(has), d5 = x5.length > 1 ? 4 : x5.length ? Number(x5[0].slice(-1)) : 0;
    const d6 = has('dem_sev3') ? 2 : has('dem_sev2') ? 1 : has('dem_sev1') ? 0 : null;
    notes.push(`Chữ số thứ 5: ${d5} (${['không có triệu chứng phụ', 'chủ yếu hoang tưởng', 'chủ yếu ảo giác', 'chủ yếu trầm cảm', 'hỗn hợp'][d5]})` + (d6 != null ? `; chữ số thứ 6: ${d6} (${['nhẹ', 'trung bình', 'nặng'][d6]})` : '; đánh dấu mức độ để có chữ số thứ 6') + '.');
    const mm = orderNum(v, 'mmse'), mo = orderNum(v, 'moca');
    if(mm != null || mo != null) notes.push('Trắc nghiệm: ' + [mm != null ? `MMSE ${fmtN(mm)}/30` : '', mo != null ? `MoCA ${fmtN(mo)}/30` : ''].filter(Boolean).join(', ') + '.');
    else notes.push('Làm MMSE / MoCA.');
    notes.push('Phân biệt: trầm cảm (giả sa sút — làm GDS), sảng, hội chứng quên thực tổn, ngộ độc / thuốc (kháng cholin, an thần) (BYT 2020 Bài 1–3; LEC1).');
    notes.push('Cận lâm sàng (BYT 2020 Bài 1): công thức máu, máu lắng, chức năng gan thận, điện giải, glucose / HbA1c, canxi, phosphat, B12, folat, hormon tuyến giáp, mỡ máu, nước tiểu; CT / MRI sọ não; điện não đồ, điện tim; giang mai, HIV khi nghi ngờ.');
    add(code, 'ICD-10 (bản VN) tr. 47–56; BYT 2020 Bài 1–3', met, miss, notes.join(' '));
    const bpsd = [has('dem_x1') || has('dem_x2') ? '6D86.0 loạn thần' : '', has('dem_x3') ? '6D86.1 khí sắc' : ''].filter(Boolean);
    const SEV11 = ['XS5W', 'XS0T', 'XS25'], base11 = lewy ? '6D82' : ((icd11Of(code) || [])[1] || '6D8Z');
    const sev11 = d6 != null ? `; mức độ ${['nhẹ', 'trung bình', 'nặng'][d6]} → ${base11}&${SEV11[d6]}` : '; ghi mức độ: nhẹ XS5W / trung bình XS0T / nặng XS25 (nối sau mã bằng &)';
    i11x[code] = 'ICD-11: suy giảm rõ ≥ 2 lĩnh vực nhận thức so với trước (trí nhớ không bắt buộc), có test chuẩn hoá hoặc đánh giá định lượng, ảnh hưởng rõ tự lập' + (lewy ? '; thể Lewy → 6D82' : '') + sev11 + (bpsd.length ? '; ghi kèm rối loạn hành vi – tâm lý: ' + bpsd.join(', ') : '') + '.';
  } else if(has('dem_mem') || has('dem_cog')) todo.push('Có suy giảm nhận thức: đánh giá đủ mục "Sa sút trí tuệ" và làm MMSE / MoCA.');
  // Hội chứng quên thực tổn F04 — ICD-10 bản VN tr. 56–57
  if(['amn_recent', 'amn_past'].some(has)){
    const miss = need('amn', ['amn_recent', 'amn_past', 'amn_noimm', 'amn_clear', 'amn_noglobal', 'amn_cause']);
    if(dems) miss.push('Đã có tiêu chuẩn mất trí — hội chứng quên cần không suy giảm trí tuệ toàn thể');
    add('F04', 'ICD-10 (bản VN) tr. 56–57', ['amn_recent', 'amn_past', 'amn_noimm', 'amn_clear', 'amn_noglobal', 'amn_cause'].filter(has).map(k => lab('amn', k)), miss,
      'Do rượu → F10.6 (hội chứng Korsakoff). Bịa chuyện, vô cảm, thiếu sáng kiến, thiếu hiểu biết bệnh gợi ý chẩn đoán. Làm MRI sọ não, vitamin B1.');
  }
  // Rối loạn nhận thức nhẹ F06.7 — ICD-10 bản VN tr. 58, 61–62 (tạm thời); ICD-11 6D71
  const MCI_D = ['mci_mem', 'mci_att', 'mci_think', 'mci_lang', 'mci_vis'];
  if(['mci_f06', 'mci_2w', 'mci_test'].concat(MCI_D).some(has)){
    const mm = orderNum(v, 'mmse'), mo = orderNum(v, 'moca'), testLow = (mm != null && mm < 24) || (mo != null && mo < 26);
    const miss = need('mci', ['mci_f06', 'mci_2w']);
    if(!MCI_D.some(has)) miss.push('Cần ≥ 1 lĩnh vực suy giảm (trí nhớ, chú ý, suy nghĩ, ngôn ngữ, thị giác – không gian)');
    if(!has('mci_test') && !testLow) miss.push('Chưa có: ' + lab('mci', 'mci_test'));
    miss.push(...need('mci', ['mci_excl']));
    if(dems && has('dem_func')) miss.push('Đã ảnh hưởng hoạt động hằng ngày — xem xét sa sút trí tuệ (F00–F03)');
    const code = has('mci_sys') ? 'F06.71' : 'F06.70';
    add(code, 'ICD-10 (bản VN) tr. 61–62', ['mci_f06', 'mci_2w'].concat(MCI_D, ['mci_test', 'mci_excl', 'mci_sys']).filter(has).map(k => lab('mci', k))
      .concat(testLow ? [[mm != null && mm < 24 ? `MMSE ${fmtN(mm)} < 24` : '', mo != null && mo < 26 ? `MoCA ${fmtN(mo)} < 26` : ''].filter(Boolean).join(', ')] : []), miss,
      'Tiêu chuẩn ICD-10 cho mục này là tạm thời. Theo dõi định kỳ (MMSE / MoCA) vì có thể tiến triển thành sa sút trí tuệ.');
    i11x[code] = `ICD-11 6D71 không bắt buộc có bệnh thực tổn${has('mci_f06') ? '' : ' — nếu chưa có bằng chứng bệnh não vẫn có thể chẩn đoán theo ICD-11'}; cần bằng chứng khách quan và không ảnh hưởng đáng kể sinh hoạt.`;
  }
  // Sảng: A–D đủ + khởi phát nhanh
  if(['del_cons', 'del_cog', 'del_psymo', 'del_sleep'].some(has)){
    const miss = need('del', ['del_cons', 'del_cog', 'del_psymo', 'del_sleep', 'del_acute', 'del_cause']);
    add(dems || pc.has('dementia') ? 'F05.1' : 'F05.0', 'ICD-10 (bản VN) tr. 57–58; BYT 2020 Bài 4', ['del_cons', 'del_cog', 'del_psymo', 'del_sleep', 'del_acute', 'del_cause'].filter(has).map(k => lab('del', k)), miss, 'Sảng là cấp cứu: tìm nguyên nhân (nhiễm trùng, rối loạn điện giải, hạ đường huyết, thuốc kháng cholinergic, cai rượu / benzodiazepin). Sảng do rượu / chất → F10–F19.');
    if(has('del_cons')) alerts.push({lv: 3, t: 'Nghi sảng', m: 'Ý thức u ám, khởi phát cấp: đánh giá nguyên nhân thực tổn ngay (dấu sinh tồn, đường máu, điện giải, nhiễm trùng, thuốc); cân nhắc chuyển viện.'});
  }
  // Mất ngủ / ngủ nhiều không thực tổn
  if(has('ins_compl')){
    const miss = need('slp', ['ins_freq', 'slp_impair', 'slp_excl']);
    if(depLv || anxSx.length) miss.push('Có triệu chứng trầm cảm / lo âu: mất ngủ có thể là triệu chứng — chẩn đoán rối loạn chính trước');
    add('F51.0', 'BYT 2020 Bài 27; ICD-10', ['Khó vào giấc / khó duy trì / ngủ không ngon'].concat(['ins_freq', 'slp_impair', 'slp_excl'].filter(has).map(k => lab('slp', k))), miss, 'Đánh giá thêm PSQI, ISI; hỏi ngáy, ngưng thở (G47.3), chân không yên (G25.8).');
  }
  if(has('cir_mismatch')) add('F51.2', 'ICD-10 (bản VN) tr. 135', [lab('slp', 'cir_mismatch')].concat(['slp_impair', 'slp_excl'].filter(has).map(k => lab('slp', k))), need('slp', ['slp_impair', 'slp_excl']), 'Phân biệt rối loạn nhịp thức – ngủ thực tổn (G47.2): làm việc theo ca, lệch múi giờ, bệnh thần kinh.');
  if(has('sw_walk')) add('F51.3', 'ICD-10 (bản VN) tr. 135', [lab('slp', 'sw_walk')].concat(has('slp_excl') ? [lab('slp', 'slp_excl')] : []), need('slp', ['slp_excl']), 'Loại trừ rối loạn tâm thần thực tổn (mất trí), động kinh. Sau cơn không có rối loạn hoạt động tâm thần, có thể lú lẫn ngắn.');
  if(has('nt_terror')) add('F51.4', 'ICD-10 (bản VN) tr. 135–136', [lab('slp', 'nt_terror')].concat(has('slp_excl') ? [lab('slp', 'slp_excl')] : []), need('slp', ['slp_excl']), 'Phân biệt ác mộng (F51.5: tỉnh táo, nhớ rõ giấc mơ) và động kinh về đêm.');
  if(has('nm_dream')){
    const miss = need('slp', ['slp_impair', 'slp_excl']);
    if(has('ptsd_event')) miss.push('Có sự kiện sang chấn → ác mộng có thể là triệu chứng của rối loạn stress sau sang chấn (F43.1)');
    add('F51.5', 'ICD-10 (bản VN) tr. 136', [lab('slp', 'nm_dream')].concat(['slp_impair', 'slp_excl'].filter(has).map(k => lab('slp', k))), miss, '');
  }
  if(has('osa_snore') || has('osa_day')){
    const ahi = orderNum(v, 'ahi'), sym = has('osa_snore') || has('osa_day');
    const ok = ahi != null && (ahi >= 15 || (ahi >= 5 && sym));
    const sev = ahi == null ? '' : ahi < 15 ? 'nhẹ' : ahi <= 30 ? 'trung bình' : 'nặng';
    add('G47.3', 'LEC2 (DSM-5)', ['osa_snore', 'osa_day'].filter(has).map(k => lab('slp', k)).concat(ahi != null ? [`AHI ${fmtN(ahi, 1)} lần/giờ`] : []), ok ? [] : [ahi == null ? 'Cần đa ký giấc ngủ: AHI ≥ 5 kèm triệu chứng, hoặc AHI ≥ 15' : `AHI ${fmtN(ahi, 1)} < 5 — chưa đủ tiêu chuẩn`], (sev ? `Mức độ theo AHI: ${sev}. ` : '') + 'Sàng lọc STOP-BANG, đánh giá thang Epworth; ngưng thở trung ương cần ≥ 5 cơn trung ương / giờ trên đa ký.');
  }
  if(has('nar_attack')) add('G47.4', 'LEC2 (DSM-5)', [lab('slp', 'nar_attack')].concat(has('nar_cata') ? [lab('slp', 'nar_cata')] : []), has('nar_cata') ? [] : ['Cần có cơn mất trương lực đột ngột (cataplexy), hoặc thiếu hypocretin-1 trong dịch não tuỷ, hoặc đa ký giấc ngủ / MSLT điển hình'], 'Phân biệt ngủ nhiều không thực tổn (F51.1), ngưng thở khi ngủ (G47.3).');
  if(has('hyp_day')) add('F51.1', 'ICD-10', ['Buồn ngủ quá mức ban ngày'].concat(['hyp_nonarco', 'slp_impair', 'slp_excl'].filter(has).map(k => lab('slp', k))), need('slp', ['hyp_nonarco', 'slp_impair', 'slp_excl']), 'Có cơn ngủ rũ / mất trương lực đột ngột → G47.4; ngưng thở khi ngủ → G47.3.');
  // Nghiện rượu / thuốc lá: hội chứng nghiện F1x.2 (≥ 3/6 trong 12 tháng); sử dụng gây hại F1x.1
  const sudCore = ['sud_crave', 'sud_control', 'sud_withdraw', 'sud_toler', 'sud_neglect', 'sud_harm'], sudN = sudCore.filter(has).length;
  if(sudN){
    const risk = p.risk || {};
    const subs = [has('sud_alc') || (!has('sud_tob') && ['some', 'heavy'].includes(risk.alcohol)) ? 'F10' : null, has('sud_tob') || (!has('sud_alc') && risk.smoke === 'current') ? 'F17' : null].filter(Boolean);
    if(!subs.length) todo.push('Có biểu hiện nghiện: chọn chất (rượu bia / thuốc lá) ở mục "Nghiện rượu / thuốc lá".');
    subs.forEach(s => {
      const nm = s === 'F10' ? 'rượu' : 'thuốc lá';
      const met = [`${sudN}/6 tiêu chuẩn hội chứng nghiện (cần ≥ 3)`].concat(sudCore.filter(has).map(k => lab('sud', k)));
      if(sudN >= 3) add(s + '.2', 'ICD-10 F1x.2; LEC8', met, has('sud_12m') ? [] : ['Cần các biểu hiện cùng có ≥ 1 tháng hoặc lặp lại trong 12 tháng'], s === 'F10' ? 'Đánh giá AUDIT; có hội chứng cai → F10.3 (theo dõi CIWA-Ar), cai có sảng → F10.4 (cấp cứu). Bổ sung thiamin.' : 'Đánh giá mức độ lệ thuộc nicotin; tư vấn cai, liệu pháp thay thế nicotin.');
      else if(has('sud_harm')) add(s + '.1', 'ICD-10 F1x.1', ['Sử dụng ' + nm + ' gây tổn hại cơ thể / tâm thần'], [`Mới ${sudN}/6 tiêu chuẩn nghiện — chưa đủ hội chứng nghiện (≥ 3)`], 'Sử dụng gây hại: tổn hại rõ, kéo dài ≥ 1 tháng hoặc lặp lại trong 12 tháng.');
    });
  }
  // Nghiện hành vi
  if(['gam_2ep', 'gam_cont', 'gam_urge', 'gam_preocc'].some(has)) add('F63.0', 'ICD-10 F63.0', ['gam_2ep', 'gam_cont', 'gam_urge', 'gam_preocc'].filter(has).map(k => lab('gam', k)), need('gam', ['gam_2ep', 'gam_cont', 'gam_urge', 'gam_preocc']), 'Loại trừ đánh bạc trong giai đoạn hưng cảm, rối loạn nhân cách chống đối xã hội.');
  if(has('game_net')) add('F63.8', 'ICD-10 F63.8', [lab('gam', 'game_net')], [], 'ICD-10 xếp nghiện trò chơi điện tử / internet vào "rối loạn thói quen và xung động khác"; loại trừ hưng cảm, ADHD, trầm cảm đi kèm.');
  // Rối loạn hành vi (F91) / thách thức chống đối (F91.3) — ICD-10 bản VN tr. 177–181 (cập nhật 2026-11-07); khoá cũ cd_pattern / cd_aggr… vẫn tính
  const CDO = ['cd1', 'cd2', 'cd3', 'cd4', 'cd5', 'cd6', 'cd7', 'cd8'], CDC = Array.from({length: 15}, (_, i) => 'cd' + (i + 9));
  const cdSerious = ['cd_aggr', 'cd_destr', 'cd_theft', 'cd_rules'].filter(has);
  const cdO = CDO.filter(has).length + (has('cd_odd') ? 4 : 0), cdC = (has('cd_pattern') && cdSerious.length) ? Math.max(3, CDC.filter(has).length + cdSerious.length) : CDC.filter(has).length + cdSerious.length;   // khoá cũ: mô hình ≥ 6 tháng + hành vi nghiêm trọng = đủ nhóm 9–23
  const cdDur = has('cd_6m') || has('cd_pattern') || (wk != null && wk >= 26);
  const cdLab = k => lab('cond', k);
  const CD_OLD = {cd_pattern: 'Mô hình hành vi vi phạm kéo dài ≥ 6 tháng', cd_aggr: 'Gây hấn: đánh nhau, bắt nạt, vũ khí, tàn bạo', cd_destr: 'Phá hoại tài sản, châm lửa', cd_theft: 'Nói dối trục lợi, trộm cắp, đột nhập', cd_rules: 'Vi phạm nghiêm trọng quy tắc', cd_odd: 'Thách thức chống đối'};   // khoá cũ (bảng kiểm trước 2026-11-07)
  const cdMet = CDO.concat(CDC).filter(has).map(cdLab).concat(Object.keys(CD_OLD).filter(has).map(k => CD_OLD[k]));
  const cdFull = cdC >= 3 && (cdDur || has('cd_pattern'));
  if(cdC >= 3){
    const code = has('cd_family') ? 'F91.0' : has('cd_peer') ? 'F91.1' : 'F91.2';
    const miss = [];
    if(!cdDur) miss.push('C. ≥ 1 triệu chứng nhóm 9–23 kéo dài ≥ 6 tháng');
    miss.push(...need('cond', ['cd_excl']));
    if(age != null && age >= 18) miss.push('Bệnh nhân ≥ 18 tuổi → đánh giá rối loạn nhân cách chống đối xã hội (F60.2)');
    if(depLv) miss.push('Có triệu chứng trầm cảm đủ tiêu chuẩn → rối loạn hành vi trầm cảm (F92.0)');
    const early = has('cd_onset10') || (age != null && age < 10);
    add(code, 'ICD-10 (bản VN) tr. 177–181; LEC11', [`Nhóm 9–23: ${cdC} triệu chứng (cần ≥ 3)`].concat(cdMet).concat(['cd_6m', 'cd_excl', 'cd_family', 'cd_peer'].filter(has).map(cdLab)), miss,
      (early ? 'Loại khởi phát ở trẻ em (trước 10 tuổi). ' : 'Ghi loại khởi phát (trước / sau 10 tuổi). ') + (code === 'F91.2' ? 'F91.2 cần: rối loạn ở cả ngoài nhà và quan hệ bạn bè bình thường. ' : '') +
      (has('cd_sev3') ? 'Mức độ: nặng. ' : has('cd_sev2') ? 'Mức độ: trung bình. ' : has('cd_sev1') ? 'Mức độ: nhẹ. ' : 'Đánh dấu mức độ nhẹ / trung bình / nặng. ') + 'Có cả tăng động → F90.1.');
    i11x[code] = `ICD-11 6C91 rối loạn hành vi – chống đối xã hội: ${early ? '6C91.0 khởi phát thời thơ ấu' : '6C91.1 khởi phát tuổi vị thành niên'}; ghi kèm có / không cảm xúc hướng xã hội hạn chế.`;
  } else if(cdO + cdC >= 4 && cdO >= 1){
    const miss = need('cond', ['cd_odd_c']);
    if(!cdDur) miss.push('D. ≥ 4 triệu chứng kéo dài ≥ 6 tháng');
    miss.push(...need('cond', ['cd_excl']));
    add('F91.3', 'ICD-10 (bản VN) tr. 181; LEC11', [`${cdO + cdC} triệu chứng (cần ≥ 4), nhóm 9–23: ${cdC} (tối đa 2)`].concat(cdMet).concat(['cd_6m', 'cd_odd_c', 'cd_excl'].filter(has).map(cdLab)), miss,
      (has('odd_sev3') ? 'Mức độ: nặng (≥ 3 bối cảnh). ' : has('odd_sev2') ? 'Mức độ: trung bình (≥ 2 bối cảnh). ' : has('odd_sev1') ? 'Mức độ: nhẹ (1 bối cảnh). ' : 'Đánh dấu mức độ theo số bối cảnh (nhà, trường, nơi làm việc, bạn bè). ') + 'Thường gặp kèm ADHD; ≥ 3 triệu chứng nhóm 9–23 → F91.0–F91.2.');
    i11x['F91.3'] = 'ICD-11 6C90: ghi 6C90.0 nếu có cáu giận – dễ kích thích mạn tính, 6C90.1 nếu không; ' + (has('cd1') || has('cd6') || has('cd7') ? 'bảng kiểm có cáu giận / dễ tự ái → nghĩ 6C90.0.' : 'chưa đánh dấu cáu giận → nghĩ 6C90.1.');
  } else if(CDO.concat(CDC).some(has)) todo.push(`Rối loạn hành vi: ${cdO} triệu chứng nhóm 1–8, ${cdC} nhóm 9–23 — F91.3 cần ≥ 4 (≤ 2 thuộc 9–23), F91.0–F91.2 cần ≥ 3 thuộc 9–23.`);
  // Rối loạn bùng nổ từng giai đoạn — ICD-10 xếp F63.8 (không có tiêu chuẩn riêng); tiêu chuẩn theo ICD-11 6C73 (bác sĩ yêu cầu 2026-11-07)
  if(['ied_ep', 'ied_dispro', 'ied_3m', 'ied_imp'].some(has)){
    const miss = need('cond', ['ied_ep', 'ied_dispro', 'ied_3m', 'ied_imp', 'ied_excl', 'ied_impair']);
    if(age != null && age < 6) miss.push('Dưới 6 tuổi — chưa chẩn đoán');
    if(cdFull) miss.push('Đã đủ rối loạn hành vi F91 — bùng nổ cần không do rối loạn khác');
    add('F63.8', 'ICD-11 6C73; ICD-10 F63.8; LEC11', ['ied_ep', 'ied_dispro', 'ied_3m', 'ied_imp', 'ied_excl', 'ied_impair'].filter(has).map(cdLab), miss,
      (has('ied_sev2') ? 'Mức độ: A2 gây thiệt hại, thương tích. ' : has('ied_sev1') ? 'Mức độ: A1 không gây thương tích. ' : 'Đánh dấu mức độ A1 / A2. ') + 'Rối loạn bùng nổ từng giai đoạn: ICD-10 không có tiêu chuẩn riêng, xếp vào F63.8 "rối loạn thói quen và xung động khác"; tiêu chuẩn lấy theo ICD-11 6C73.');
    i11x['F63.8'] = 'ICD-11 6C73 rối loạn bùng nổ từng giai đoạn.' + (has('game_net') ? ' (Nghiện trò chơi điện tử: 6C51.)' : '');
  }
  // Cờ đỏ Alzheimer (bác sĩ đặt 2026-11-06): có bất kỳ dấu hiệu nào → cảnh báo cần đánh giá nhận thức
  const ADRF = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => 'ad_rf' + i).filter(has);
  if(ADRF.length) alerts.push({lv: 3, t: 'Cờ đỏ Alzheimer', m: ADRF.map(k => lab('dem', k).replace(/^⚑ Cờ đỏ: /, '')).join('; ') + ' — cần đánh giá nhận thức: làm MMSE / MoCA, đánh giá đủ tiêu chuẩn chung G1–G4 (mục "Sa sút trí tuệ"), loại trừ nguyên nhân có thể điều trị (suy giáp, thiếu B12, trầm cảm, thuốc).'});
  // Cờ đỏ tự kỷ (bác sĩ đặt 2026-11-04): có bất kỳ dấu hiệu nào → cảnh báo cần đánh giá phát triển ngay
  const RF = ['rf_babble', 'rf_gesture', 'rf_word', 'rf_phrase', 'rf_loss'].filter(has);
  if(RF.length) alerts.push({lv: 3, t: 'Cờ đỏ tự kỷ', m: RF.map(k => lab('asd', k).replace(/^⚑ Cờ đỏ: /, '')).join('; ') + ' — cần đánh giá phát triển ngay: sàng lọc M-CHAT-R (16–30 tháng), đo thính lực, đánh giá đủ tiêu chuẩn tự kỷ (mục "Tự kỷ"), chuyển khám chuyên khoa tâm thần nhi / phát triển.'});
  // Tự kỷ: đếm triệu chứng tiêu chuẩn B của F84.0 (ICD-10 bản VN tr. 167–168; BYT 2020 Bài 29) theo 3 nhóm.
  // Khoá cũ asd_social / asd_comm / asd_rrb (hồ sơ trước 2026-11-04) tính là 1 triệu chứng của nhóm đó.
  const asdCnt = (ks, oldK) => ks.filter(has).length || (has(oldK) ? 1 : 0);
  const ASD_S = ['asd_s1', 'asd_s2', 'asd_s3', 'asd_s4'], ASD_C = ['asd_c1', 'asd_c2', 'asd_c3', 'asd_c4'], ASD_R = ['asd_r1', 'asd_r2', 'asd_r3', 'asd_r4'];
  const nS = asdCnt(ASD_S, 'asd_social'), nC = asdCnt(ASD_C, 'asd_comm'), nR = asdCnt(ASD_R, 'asd_rrb'), asdAny = nS + nC + nR > 0;
  // Trẻ em: ADHD (G1–G6), tự kỷ, chậm phát triển tâm thần (IQ), đái dầm, ỉa bậy
  // ADHD — BYT 2020 Bài 30 (tiêu chuẩn ICD-10): giảm chú ý ≥ 6/9, tăng động ≥ 3/5, xung động ≥ 1/4; ≥ 6 tháng; trước 7 tuổi; nhiều hoàn cảnh; suy giảm chức năng; loại trừ
  // khoá cũ adhd_inatt / adhd_hyper / adhd_imp (hồ sơ trước 2026-11-04) = đã đủ ngưỡng nhóm
  const ADHD_I = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => 'adhd_i' + i), ADHD_H = [1, 2, 3, 4, 5].map(i => 'adhd_h' + i), ADHD_M = [1, 2, 3, 4].map(i => 'adhd_m' + i);
  const adOld = has('adhd_inatt') || has('adhd_hyper') || has('adhd_imp');
  const nAI = ADHD_I.filter(has).length || (has('adhd_inatt') ? 6 : 0), nAH = ADHD_H.filter(has).length || (has('adhd_hyper') ? 3 : 0), nAM = ADHD_M.filter(has).length || (has('adhd_imp') ? 1 : 0);
  const iqW = orderNum(v, 'wechsler');
  if(nAI + nAH + nAM > 0){
    const miss = [];
    if(nAI < 6) miss.push(`Giảm chú ý ${nAI}/9 — cần ≥ 6`);
    if(nAH < 3) miss.push(`Tăng động ${nAH}/5 — cần ≥ 3`);
    if(nAM < 1) miss.push('Xung động 0/4 — cần ≥ 1');
    if(wk != null && wk < 26) miss.push(durTxt + ' — cần ≥ 6 tháng');
    else if(!has('adhd_6m') && !adOld && wk == null) miss.push('Chưa có: ' + lab('adhd', 'adhd_6m'));
    miss.push(...need('adhd', ['adhd_7y', 'adhd_perv', 'adhd_impair', 'adhd_excl']));
    if(asdAny) miss.push('Có biểu hiện tự kỷ → ICD-10 không chẩn đoán tăng động khi có rối loạn phát triển lan toả (F84)');
    const met = ADHD_I.concat(ADHD_H, ADHD_M).filter(has).map(k => lab('adhd', k))
      .concat(['adhd_inatt', 'adhd_hyper', 'adhd_imp'].filter(has).map(k => ({adhd_inatt: 'Giảm chú ý ≥ 6/9', adhd_hyper: 'Tăng động ≥ 3/5', adhd_imp: 'Xung động ≥ 1/4'})[k]))
      .concat([`Giảm chú ý ${nAI}/9, tăng động ${nAH}/5, xung động ${nAM}/4`])
      .concat(['adhd_6m', 'adhd_7y', 'adhd_perv', 'adhd_impair', 'adhd_excl'].filter(has).map(k => lab('adhd', k)));
    const vb = (v.orders || []).find(x => x.key === 'vanderbilt');
    const f901 = cdFull;
    add(f901 ? 'F90.1' : 'F90.0', 'BYT 2020 Bài 30; ICD-10 F90', met, miss,
      (f901 ? 'Kèm rối loạn hành vi (F91) → F90.1. ' : '') +
      (vb && vb.value ? `Vanderbilt: ${vb.value}. ` : 'Trắc nghiệm hỗ trợ: Vanderbilt (cha mẹ và giáo viên). ') +
      (iqW != null && iqW < 70 ? `IQ = ${fmtN(iqW)} < 70 — chỉ chẩn đoán khi triệu chứng vượt mức so với trình độ trí tuệ. ` : 'Đánh giá IQ (Wechsler, Raven) để loại trừ chậm phát triển tâm thần. ') +
      (age != null && age >= 18 ? 'Người lớn: cần bằng chứng triệu chứng từ thơ ấu (hỏi gia đình, học bạ). ' : '') +
      'Phân biệt: rối loạn lưỡng cực, tâm thần phân liệt, tic, rối loạn hành vi chống đối. Điện tim trước khi dùng methylphenidat.');
    const aI = nAI >= 6, aHI = nAH + nAM >= 4;
    const pres = aI && aHI ? 'kết hợp (6A05.2)' : aI ? 'giảm chú ý ưu thế (6A05.0)' : aHI ? 'tăng động – xung động ưu thế (6A05.1)' : 'chưa rõ thể';
    i11x['F90.0'] = i11x['F90.1'] = `Bảng kiểm: giảm chú ý ${nAI}/9, tăng động – xung động ${nAH + nAM}/9 → thể ${pres} (lấy ngưỡng ICD-10 tham khảo; ICD-11 chỉ cần MỘT trong hai nhóm).` +
      (has('adhd_7y') || has('adhd_12y') ? '' : ' Cần khởi phát trước 12 tuổi.');
  }
  // Rett (F84.2), phân rã khác (F84.3), Asperger (F84.5) — ICD-10 bản VN tr. 170–173
  if(has('rett')) add('F84.2', 'ICD-10 (bản VN) tr. 170–171', [lab('asd', 'rett')], p.sex === 'Nam' ? ['Hội chứng Rett gần như chỉ gặp ở trẻ gái — xem lại chẩn đoán'] : [], 'Thường khởi phát 7–24 tháng tuổi. Làm xét nghiệm gen MECP2 nếu có điều kiện.');
  if(has('cdd')) add('F84.3', 'ICD-10 (bản VN) tr. 171', [lab('asd', 'cdd')].concat(ASD_S.concat(ASD_C, ASD_R).filter(has).map(k => lab('asd', k))), [nS, nC, nR].filter(n => n > 0).length >= 2 ? [] : ['Cần bất thường ở ≥ 2 lĩnh vực: tương tác xã hội, giao tiếp, hành vi thu hẹp – định hình'], '');
  if(asdAny && !has('rett') && !has('cdd')){
    // Tiêu chuẩn B của F84.0: tổng ≥ 6, trong đó xã hội ≥ 2, giao tiếp ≥ 1, hành vi ≥ 1
    const asdTot = nS + nC + nR, asdB = asdTot >= 6 && nS >= 2 && nC >= 1 && nR >= 1, asdA = has('asd_before3');
    const asdMet = ['asd_before3'].concat(ASD_S, ASD_C, ASD_R).filter(has).map(k => lab('asd', k))
      .concat([`Tổng ${asdTot} triệu chứng: xã hội ${nS}/4, giao tiếp ${nC}/4, hành vi ${nR}/4`]);
    const mc = orderNum(v, 'mchat'), cars = orderNum(v, 'cars');
    const asdId = iqW != null ? iqW < 70 : null, asdLang = has('asd_c1');
    const asd11 = asdId == null ? 'cần IQ để chọn mã' : asdId ? (asdLang ? '6A02.3 (6A02.5 nếu gần như không có ngôn ngữ chức năng)' : '6A02.1') : (asdLang ? '6A02.2' : '6A02.0');
    const asdIdTxt = asdId ? ` IQ = ${fmtN(iqW)} → chẩn đoán kèm chậm phát triển tâm thần (F70–F79).` : '';
    const testTxt = [mc != null ? `M-CHAT-R = ${fmtN(mc)} (${mc >= 8 ? 'nguy cơ cao' : mc >= 3 ? 'nguy cơ trung bình — làm phỏng vấn tiếp' : 'nguy cơ thấp'})` : '', cars != null ? `CARS = ${fmtN(cars)} (${cars >= 37 ? 'tự kỷ nặng' : cars >= 30 ? 'tự kỷ nhẹ – vừa' : 'không tự kỷ'})` : ''].filter(Boolean);
    const testNote = (testTxt.length ? 'Trắc nghiệm: ' + testTxt.join('; ') + '. ' : 'Trắc nghiệm hỗ trợ: M-CHAT-R (16–30 tháng), CARS, ADOS. ') + 'Khám thính lực; đánh giá IQ (chậm phát triển tâm thần thường đi kèm).' + asdIdTxt;
    const exM = need('asd', ['asd_excl']);
    if(has('asd_nodelay') && nS >= 2 && nR >= 1) add('F84.5', 'ICD-10 (bản VN) tr. 173', [lab('asd', 'asd_nodelay')].concat(asdMet), exM.concat(has('asd_c1') ? ['Đã đánh dấu chậm / không có ngôn ngữ nói — Asperger không chậm ngôn ngữ; nếu đúng có chậm nói → tự kỷ (F84.0)'] : []), testNote);
    else if(asdA && asdB) add('F84.0', 'BYT 2020 Bài 29; ICD-10 (bản VN) tr. 167–169', asdMet, exM, testNote);
    else {
      const bMiss = asdB ? '' : `Chưa đủ tiêu chuẩn B của tự kỷ điển hình: tổng ${asdTot}/6, xã hội ${nS}/2, giao tiếp ${nC}/1, hành vi ${nR}/1`;
      const sub = !asdA && asdB ? 'F84.10 — không điển hình về tuổi khởi phát (biểu hiện rõ từ 3 tuổi trở đi)' : asdA && !asdB ? 'F84.11 — không điển hình về triệu chứng' : 'F84.12 — không điển hình cả tuổi khởi phát và triệu chứng';
      add('F84.1', 'BYT 2020 Bài 29; ICD-10 (bản VN) tr. 169–170', asdMet, exM, `Mã chi tiết ${sub}. ${bMiss ? bMiss + ' (nếu bổ sung đủ → F84.0). ' : ''}${!asdA ? 'Chưa đánh dấu phát triển bất thường trước 3 tuổi. ' : ''}` + testNote);
    }
    i11x['F84.0'] = i11x['F84.1'] = i11x['F84.5'] = `Bảng kiểm: ${nS + nC >= 1 && nR >= 1 ? 'đủ' : 'CHƯA đủ'} 2 nhóm bắt buộc của ICD-11 (khiếm khuyết giao tiếp – tương tác xã hội VÀ hành vi, sở thích thu hẹp, lặp lại). Mã chi tiết theo trí tuệ × ngôn ngữ chức năng: ${asd11}.`;
  }
  // Rối loạn phát triển đặc hiệu lời nói / học tập / vận động (F80–F83) — ICD-10 bản VN tr. 162–167
  const devSp = has('dev_lk') ? 'F80.3' : has('dev_recep') ? 'F80.2' : has('dev_expr') ? 'F80.1' : has('dev_artic') ? 'F80.0' : '';
  const devSc = has('dev_math') && (has('dev_read') || has('dev_spell')) ? 'F81.3' : has('dev_read') ? 'F81.0' : has('dev_spell') ? 'F81.1' : has('dev_math') ? 'F81.2' : '';
  const devMo = has('dev_motor') ? 'F82' : '', iqV = orderNum(v, 'wechsler');
  if(devSp || devSc || devMo){
    const devMiss = k => {
      const r = need('dev', k === 'F80.3' ? [] : ['dev_iq', 'dev_excl'].concat(/^F8[12]/.test(k) ? ['dev_impair'] : []));
      if(iqV != null && iqV < 70) r.push(`IQ (Wechsler) = ${fmtN(iqV)} < 70 → xem chậm phát triển tâm thần (F70–F79)`);
      if(asdAny) r.push('Có biểu hiện tự kỷ — loại trừ rối loạn phát triển lan toả (F84)');
      return r;
    };
    const devKeys = {'F80.0': ['dev_artic'], 'F80.1': ['dev_expr'], 'F80.2': ['dev_recep'], 'F80.3': ['dev_lk'], 'F81.0': ['dev_read'], 'F81.1': ['dev_spell'], 'F81.2': ['dev_math'], 'F81.3': ['dev_math', 'dev_read', 'dev_spell'], 'F82': ['dev_motor']};
    const devNote = {'F80.2': 'Thường kèm rối loạn ngôn ngữ biểu hiện (rối loạn hỗn hợp tiếp nhận – biểu hiện).', 'F80.3': 'Cần điện não đồ; theo dõi động kinh. Phân biệt mất ngôn ngữ do tổn thương não, tự kỷ.', 'F81.3': 'Rối loạn cả tính toán và đọc / chính tả.', 'F82': 'Phân biệt bại não, bệnh thần kinh cơ.'};
    [devSp, devSc, devMo].filter(Boolean).forEach(k => add(k, 'ICD-10 (bản VN) tr. 162–167', devKeys[k].filter(has).map(x => lab('dev', x)).concat(['dev_iq', 'dev_impair', 'dev_excl'].filter(has).map(x => lab('dev', x))), devMiss(k), (devNote[k] ? devNote[k] + ' ' : '') + 'Cần trắc nghiệm chuẩn hoá (ngôn ngữ, học tập, vận động) và IQ; khám thính lực, thị lực.'));
    if([devSp, devSc, devMo].filter(Boolean).length >= 2) add('F83', 'ICD-10 (bản VN) tr. 167', ['Đáp ứng ≥ 2 nhóm rối loạn phát triển đặc hiệu (lời nói F80, học tập F81, vận động F82)'], devMiss('F83'), 'Chỉ dùng khi các rối loạn chồng lấp nhiều, không nhóm nào nổi trội.');
  }
  // Rối loạn cảm xúc khởi phát ở trẻ em (F93) và hoạt động xã hội (F94) — ICD-10 bản VN tr. 182–187
  const kemoEx = need('kemo', ['emo_excl']);
  if(has('sep_anx')) add('F93.0', 'ICD-10 (bản VN) tr. 182–183', [lab('kemo', 'sep_anx')].concat(['sep_6y', 'emo_4wk', 'emo_excl'].filter(has).map(k => lab('kemo', k))), need('kemo', ['sep_6y', 'emo_4wk']).concat(kemoEx, has('ch_gad') ? ['Có lo âu lan toả ở trẻ (F93.80) — F93.0 cần KHÔNG đủ tiêu chuẩn lo âu lan toả'] : []), 'Khởi phát sau 6 tuổi hoặc ở người lớn → xem rối loạn lo âu khác (F41).');
  if(has('ch_phob')) add('F93.1', 'ICD-10 (bản VN) tr. 183', [lab('kemo', 'ch_phob')].concat(['emo_4wk', 'emo_excl'].filter(has).map(k => lab('kemo', k))), need('kemo', ['emo_4wk']).concat(kemoEx), 'Sợ không đặc thù theo giai đoạn phát triển (vd. sợ khoảng trống) → ám ảnh sợ F40.');
  if(has('ch_social')) add('F93.2', 'ICD-10 (bản VN) tr. 184', [lab('kemo', 'ch_social')].concat(['emo_4wk', 'emo_excl'].filter(has).map(k => lab('kemo', k))), need('kemo', ['emo_4wk']).concat(kemoEx), 'Khởi phát muộn (vị thành niên) → ám ảnh sợ xã hội F40.1.');
  if(has('sib_riv')) add('F93.3', 'ICD-10 (bản VN) tr. 184–185', [lab('kemo', 'sib_riv')].concat(has('emo_4wk') ? [lab('kemo', 'emo_4wk')] : []), need('kemo', ['emo_4wk']), '');
  if(has('ch_gad')) add('F93.8', 'ICD-10 (bản VN) tr. 185–186 (F93.80)', [lab('kemo', 'ch_gad')].concat(has('emo_excl') ? [lab('kemo', 'emo_excl')] : []), kemoEx, 'Mã chi tiết F93.80 — rối loạn lo âu lan toả ở trẻ em. Loại trừ cường giáp, do thuốc / chất.');
  if(has('mut_sel')) add('F94.0', 'ICD-10 (bản VN) tr. 186', [lab('kemo', 'mut_sel')], asdAny ? ['Có biểu hiện tự kỷ — không chẩn đoán F94.0 khi có rối loạn lan toả sự phát triển (F84)'] : [], 'Loại trừ thiếu kiến thức ngôn ngữ nói ở môi trường đó (vd. trẻ mới chuyển vùng / ngôn ngữ).');
  if(has('rad')) add('F94.1', 'ICD-10 (bản VN) tr. 186–187', [lab('kemo', 'rad')], asdAny ? ['Có biểu hiện tự kỷ — loại trừ rối loạn lan toả sự phát triển (F84)'] : [], 'Thường liên quan bỏ bê, ngược đãi hoặc thay đổi người chăm sóc nhiều lần — đánh giá bảo vệ trẻ.');
  if(has('dis_att')) add('F94.2', 'ICD-10 (bản VN) tr. 187', [lab('kemo', 'dis_att')], [], 'Thường gặp ở trẻ nuôi trong cơ sở tập trung, thay đổi người chăm sóc nhiều lần. Phân biệt tăng động (F90).');
  // Tic (F95) — ICD-10 bản VN tr. 187–188
  if(has('tic_motor') || has('tic_vocal')){
    const both = has('tic_motor') && has('tic_vocal'), chronic = has('tic_12m');
    const code = chronic ? (both ? 'F95.2' : 'F95.1') : 'F95.0';
    add(code, 'ICD-10 (bản VN) tr. 187–188', ['tic_motor', 'tic_vocal', 'tic_daily', 'tic_12m', 'tic_18', 'tic_excl'].filter(has).map(k => lab('tic', k)), need('tic', ['tic_daily', 'tic_18', 'tic_excl']),
      code === 'F95.0' ? 'Tic nhất thời: kéo dài ≥ 4 tuần và ≤ 12 tháng. Có cả tic vận động và lời nói kéo dài > 1 năm → Tourette (F95.2).' : code === 'F95.1' ? 'Tic mạn tính chỉ một loại (vận động HOẶC lời nói), > 12 tháng.' : 'Tourette: nhiều loại tic vận động và ≥ 1 tic lời nói (không cần đồng thời). Hay kèm tăng động giảm chú ý, ám ảnh nghi thức.');
  }
  // Ăn uống ở trẻ, ăn bậy, động tác định hình, nói lắp, nói lúng búng (F98.2–F98.6) — BYT 2020 Bài 33–34; ICD-10 bản VN tr. 190–191
  const k2Ex = need('kid2', ['f98_excl']);
  if(has('feed_child')) add('F98.2', 'ICD-10 (bản VN) tr. 190', [lab('kid2', 'feed_child')], k2Ex.concat(age != null && age >= 6 ? [`Hiện ${age} tuổi — tiêu chuẩn cần khởi phát trước 6 tuổi`] : []), 'Loại trừ bệnh thực thể, chán ăn tâm thần (F50).');
  if(has('pica')) add('F98.3', 'ICD-10 (bản VN) tr. 190', [lab('kid2', 'pica')], k2Ex.concat(age != null && age < 2 ? [`Hiện ${age} tuổi — cần ≥ 2 tuổi`] : []), 'Xét nghiệm thiếu sắt (ferritin), chì máu, giun sán.');
  if(has('stereo')) add('F98.4', 'BYT 2020 Bài 33; ICD-10 (bản VN) tr. 190–191', [lab('kid2', 'stereo')].concat(has('stereo_self') ? [lab('kid2', 'stereo_self')] : []), k2Ex, (has('stereo_self') ? 'Mã chi tiết F98.41 — có tự làm tổn thương. ' : 'Mã chi tiết F98.40 — không tự làm tổn thương. ') + 'Hay gặp ở trẻ chậm phát triển tâm thần, tự kỷ.');
  if(has('stutter')) add('F98.5', 'BYT 2020 Bài 34; ICD-10 (bản VN) tr. 191', [lab('kid2', 'stutter')], [], 'Thường khởi phát 18 tháng – 9 tuổi. Loại trừ tic, rối loạn thần kinh.');
  if(has('clutter')) add('F98.6', 'ICD-10 (bản VN) tr. 191', [lab('kid2', 'clutter')], [], 'Phân biệt nói lắp (F98.5: có lặp lại, ngập ngừng).');
  // Chậm phát triển tâm thần — BYT 2020 Bài 28; ICD-10 F70–F79; ICD-11 6A00 (trí tuệ VÀ hành vi thích ứng)
  const ID_A = ['id_concept', 'id_social', 'id_practical', 'id_adapt'], ID_L = ['id_l1', 'id_l2', 'id_l3', 'id_l4'];
  const idKeys = ID_A.concat(ID_L, ['id_onset', 'id_behav', 'id_sensory', 'id_excl']);
  if((iqW != null && iqW < 70) || idKeys.some(has)){
    const lvIq = iqW == null || iqW >= 70 ? null : iqW >= 50 ? 'F70' : iqW >= 35 ? 'F71' : iqW >= 20 ? 'F72' : 'F73';
    const lvCl = ['F73', 'F72', 'F71', 'F70'][[3, 2, 1, 0].findIndex(i => has(ID_L[i]))] || null;
    const code = lvIq || (has('id_sensory') ? 'F78' : lvCl || 'F79');
    const adapt = ID_A.some(has), raven = (v.orders || []).find(x => x.key === 'raven'), denver = (v.orders || []).find(x => x.key === 'denver');
    const met = (iqW != null ? [`IQ (Wechsler) = ${fmtN(iqW)}`] : []).concat(raven && raven.value ? [`Raven: ${raven.value}`] : [], denver && denver.value ? [`Denver II: ${denver.value}`] : [])
      .concat(idKeys.filter(has).map(k => lab('id', k)));
    const miss = [];
    if(iqW != null && iqW >= 70) miss.push(`IQ = ${fmtN(iqW)} ≥ 70 — không phù hợp chậm phát triển tâm thần (70–79: ranh giới)`);
    if(iqW == null && !has('id_sensory')) miss.push('Chưa có trắc nghiệm trí tuệ chuẩn hoá — nhập IQ Wechsler (hoặc Raven, Denver) ở phần cận lâm sàng');
    if(!adapt) miss.push('Chưa đánh giá giảm hành vi thích ứng (khái niệm, xã hội, thực hành)');
    miss.push(...need('id', ['id_onset', 'id_excl']));
    const lvName = {F70: 'nhẹ', F71: 'trung bình', F72: 'nặng', F73: 'trầm trọng'};
    add(code, 'BYT 2020 Bài 28; ICD-10 F70–F79', met, miss,
      (lvIq && lvCl && lvIq !== lvCl ? `Mức theo IQ (${lvName[lvIq]}) khác mức theo lâm sàng (${lvName[lvCl]}) — xét cả trí tuệ và hành vi thích ứng. ` : '') +
      (code === 'F78' ? 'F78: khi khiếm khuyết giác quan / cơ thể / hành vi nặng làm không đánh giá được mức độ. ' : code === 'F79' ? 'F79: có bằng chứng nhưng chưa đủ thông tin xếp mức độ. ' : '') +
      `Ký tự thứ 4: ${code}.${has('id_behav') ? '1 — có suy giảm hành vi đáng kể cần chăm sóc / điều trị' : '0 nếu không / ít suy giảm hành vi; .1 nếu suy giảm hành vi đáng kể'}. ` +
      'Bảng ICD-10: nhẹ IQ 50–69 (tuổi tâm thần 9–< 12), trung bình 35–49 (6–< 9), nặng 20–34 (3–< 6), trầm trọng < 20 (< 3 tuổi). ' +
      'Cận lâm sàng (BYT): điện não đồ, CT / MRI sọ não; xét nghiệm chuyển hoá, di truyền khi nghi ngờ; đo thính lực, thị lực; sàng lọc rối loạn đi kèm (ADHD, tự kỷ, trầm cảm).');
    const prov = (age != null && age < 4) || has('id_sensory');
    i11x[code] = `Bảng kiểm: trí tuệ ${iqW != null ? (iqW < 70 ? 'thấp rõ' : 'không thấp') : 'chưa đo'}; hành vi thích ứng ${adapt ? 'giảm' : 'CHƯA đánh giá'} — ICD-11 bắt buộc CẢ HAI (≈ ≥ 2 độ lệch chuẩn dưới trung bình).` +
      (prov ? ` ${age != null && age < 4 ? `Trẻ ${age} tuổi (< 4)` : 'Không đánh giá được do khiếm khuyết'} → ICD-11 ghi chẩn đoán tạm thời 6A00.4.` : '');
  }
  // Đái dầm F98.0, ỉa bậy F98.1 — ICD-10 bản VN tr. 189–190 (BYT 2020 Bài 31 trích nguyên tiêu chuẩn này); khoá cũ elim_excl = loại trừ thực tổn cả hai
  const ENU = ['enu_age', 'enu_wet', 'enu_excl', 'enu_nopsy', 'enu_3m', 'enu_night', 'enu_day'], ENC = ['enc_soil', 'enc_age', 'enc_freq', 'enc_6m', 'enc_excl', 'enc_ctrl', 'enc_place', 'enc_overflow'];
  const elimOld = has('elim_excl') ? ['Không do bệnh thực thể (ghi nhận cũ)'] : [];
  const ageMiss = (min, k, g) => age != null && age < min ? [`Hiện ${age} tuổi — cần tuổi đời ≥ ${min}`] : has(k) ? [] : need(g, [k]);
  if(ENU.some(has)){
    const miss = need('kid', ['enu_wet']).concat(ageMiss(5, 'enu_age', 'kid'));
    if(!has('enu_excl') && !has('elim_excl')) miss.push('Chưa có: ' + lab('kid', 'enu_excl'));
    miss.push(...need('kid', ['enu_nopsy']));
    if(wk != null && wk < 13) miss.push(durTxt + ' — cần ≥ 3 tháng');
    else if(!has('enu_3m') && wk == null) miss.push('Chưa có: ' + lab('kid', 'enu_3m'));
    const sub = has('enu_night') && has('enu_day') ? 'F98.02 — cả ban đêm và ban ngày' : has('enu_day') ? 'F98.01 — chỉ ban ngày' : has('enu_night') ? 'F98.00 — chỉ ban đêm' : '';
    add('F98.0', 'ICD-10 (bản VN) tr. 189; BYT 2020 Bài 31', ENU.filter(has).map(k => lab('kid', k)).concat(elimOld), miss,
      (sub ? `Mã chi tiết ${sub}. ` : 'Đánh dấu ban đêm / ban ngày để chọn mã F98.00 / F98.01 / F98.02. ') +
      (iqW != null && iqW < 70 ? `IQ = ${fmtN(iqW)} — cần tuổi tâm thần ≥ 5. ` : '') +
      'Cận lâm sàng (BYT): tổng phân tích nước tiểu, đường máu, siêu âm hệ tiết niệu; điện não đồ khi nghi động kinh. Phân biệt: nhiễm khuẩn, tắc nghẽn, dị dạng tiết niệu, tật nứt đốt sống; đái tháo đường, đái tháo nhạt; mộng du; động kinh, nhiễm độc; tác dụng phụ thuốc chống loạn thần. Hay kèm ADHD, chậm phát triển tâm thần, ỉa bậy.');
    i11x['F98.0'] = 'ICD-11 chặt hơn về tần suất (vd. vài lần mỗi tuần trong nhiều tháng)' + (sub ? ` → ${has('enu_night') && has('enu_day') ? '6C00.2' : has('enu_day') ? '6C00.1' : '6C00.0'}.` : '.');
  }
  if(ENC.some(has)){
    const miss = need('kid', ['enc_soil']).concat(ageMiss(4, 'enc_age', 'kid'), need('kid', ['enc_freq']));
    if(wk != null && wk < 26) miss.push(durTxt + ' — cần ≥ 6 tháng');
    else if(!has('enc_6m') && wk == null) miss.push('Chưa có: ' + lab('kid', 'enc_6m'));
    if(!has('enc_excl') && !has('elim_excl')) miss.push('Chưa có: ' + lab('kid', 'enc_excl'));
    const sub = has('enc_overflow') ? 'F98.12 — ỉa bẩn kèm phân nhiều nước do táo bón' : has('enc_ctrl') ? 'F98.10 — không đạt kiểm soát sinh lý ruột' : has('enc_place') ? 'F98.11 — kiểm soát ruột bình thường, đi sai chỗ' : '';
    add('F98.1', 'ICD-10 (bản VN) tr. 189–190', ENC.filter(has).map(k => lab('kid', k)).concat(elimOld), miss,
      (sub ? `Mã chi tiết ${sub}. ` : 'Đánh dấu biệt định để chọn mã F98.10 / F98.11 / F98.12. ') +
      'Khám bụng, thăm trực tràng tìm u phân; hỏi tình trạng táo bón, né tránh đi vệ sinh. Hay kèm đái dầm.');
    i11x['F98.1'] = has('enc_overflow') ? 'Có táo bón kèm són phân tràn → 6C01.0.' : (has('enc_ctrl') || has('enc_place')) ? 'Không có táo bón kèm són phân tràn → 6C01.1.' : 'Ghi có / không táo bón kèm són phân tràn (6C01.0 / 6C01.1).';
  }
  // Phân ly (F44)
  if(has('dis_sx')) add('F44', 'BYT 2020 Bài 24; ICD-10 F44', [lab('diss', 'dis_sx')].concat(['dis_noorg', 'dis_time'].filter(has).map(k => lab('diss', k))), need('diss', ['dis_noorg', 'dis_time']), 'Chọn mã con theo biểu hiện: quên F44.0, trốn nhà F44.1, sững sờ F44.2, vận động F44.4, co giật F44.5, mất cảm giác F44.6, hỗn hợp F44.7.');
  // Rối loạn dạng cơ thể F45 — ICD-10 bản VN tr. 125–129; BYT 2020 Bài 25 (F45.0 theo ICD-10); ICD-11 6C20 / 6B23 / 6B21 (bác sĩ yêu cầu 2026-11-07)
  {
    const SL = k => lab('som', k), dur2y = has('som_2y') || (wk != null && wk >= 104), dur6m = dur2y || has('som_6m') || (wk != null && wk >= 26);
    if(['som_2y', 'som_6m', 'som_visits', 'som_refuse', 'som_6sx'].some(has)){
      const met = ['som_2y', 'som_6m', 'som_visits', 'som_refuse', 'som_6sx', 'som_excl'].filter(has).map(SL);
      if(dur2y && has('som_visits') && has('som_6sx')) add('F45.0', 'ICD-10 (bản VN) tr. 125–126; BYT 2020 Bài 25', met, need('som', ['som_refuse', 'som_excl']), 'Loại trừ trầm cảm, lo âu, hoảng sợ; ghi mức độ suy giảm hoạt động xã hội, gia đình.');
      else {
        const miss = need('som', ['som_refuse', 'som_excl']);
        if(!dur6m) miss.push('Thời gian tồn tại ≥ 6 tháng');
        add('F45.1', 'ICD-10 (bản VN) tr. 126', met, miss, 'F45.1: đủ A (≥ 6 tháng), C, E của F45.0 nhưng B và / hoặc D không đầy đủ. Đủ ≥ 2 năm + B + D → F45.0.');
      }
      i11x['F45.0'] = i11x['F45.1'] = 'ICD-11 6C20: cần chú ý quá mức tới triệu chứng (bận tâm hoặc đi khám nhiều) dai dẳng dù đã được khám, trấn an; thường ≥ vài tháng; ghi mức nhẹ / vừa / nặng.';
    }
    if(['hyp_a1', 'hyp_a2', 'hyp_b', 'hyp_c'].some(has)){
      const miss = need('som', ['hyp_b', 'hyp_c', 'hyp_excl']);
      if(!has('hyp_a1') && !has('hyp_a2')) miss.unshift('A. Tin tưởng có bệnh cơ thể nặng (A1) hoặc bận tâm biến dạng cơ thể (A2)');
      add('F45.2', 'ICD-10 (bản VN) tr. 126–127', ['hyp_a1', 'hyp_a2', 'hyp_b', 'hyp_c', 'hyp_excl'].filter(has).map(SL), miss, has('hyp_a2') ? 'Biến dạng cơ thể (dị dạng cơ thể) — ICD-10 vẫn xếp F45.2.' : '');
      i11x['F45.2'] = has('hyp_a2') && !has('hyp_a1') ? 'ICD-11 6B21 rối loạn dị dạng cơ thể: bận tâm khiếm khuyết ngoại hình + hành vi lặp lại (soi gương, so sánh), che giấu hoặc né tránh.' : 'ICD-11 6B23 nghi bệnh: bận tâm khả năng mắc bệnh nặng + hành vi lặp lại (kiểm tra, tìm trấn an) hoặc né tránh.';
    }
    const ORG = [['aut_cv', 'F45.30'], ['aut_ugi', 'F45.31'], ['aut_lgi', 'F45.32'], ['aut_resp', 'F45.33'], ['aut_gu', 'F45.34'], ['aut_other', 'F45.38']], org = ORG.filter(([k]) => has(k));
    if(['aut_a', 'aut_b', 'aut_c'].some(has) || org.length){
      const code = org.length === 1 ? org[0][1] : 'F45.3';
      add(code, 'ICD-10 (bản VN) tr. 127–128', ['aut_a', 'aut_b', 'aut_c', 'aut_d', 'aut_excl'].filter(has).map(SL).concat(org.map(([k]) => SL(k))), need('som', ['aut_a', 'aut_b', 'aut_c', 'aut_d', 'aut_excl']),
        org.length > 1 ? 'Nhiều cơ quan — chọn cơ quan bệnh nhân coi là nguồn gốc chính cho chữ số thứ 5 (F45.30–F45.38).' : org.length ? '' : 'Đánh dấu cơ quan bệnh nhân cho là nguồn gốc để có chữ số thứ 5.');
      i11x[code] = 'ICD-11 gộp vào rối loạn đau khổ cơ thể 6C20.';
    }
    if(has('pain_a')){
      const miss = need('som', ['pain_excl']);
      if(wk != null && wk < 26) miss.push('Thời gian < 6 tháng');
      add('F45.4', 'ICD-10 (bản VN) tr. 128–129', ['pain_a', 'pain_excl'].filter(has).map(SL), miss, 'Đau là trung tâm chú ý; loại trừ nguyên nhân thực tổn.');
      i11x['F45.4'] = 'ICD-11: 6C20 (đau là trọng tâm) hoặc đau mạn tính nguyên phát MG30.0 (chương 21).';
    }
  }
  // --- Rối loạn sự thích ứng (ICD-10 WHO F43.2; tài liệu BYT 2020 / LEC4 chỉ dẫn chẩn đoán theo ICD-10) ---
  const adjStress = sx.has('adj_stressor') || excl.has('stress');
  const aDep = sx.has('adj_dep'), aAnx = sx.has('adj_anx'), aEmo = sx.has('adj_emo'), aBeh = sx.has('adj_behav');
  if(adjStress && (aDep || aAnx || aEmo || aBeh)){
    const emo = aDep || aAnx || aEmo;
    const code = aBeh && emo ? 'F43.25' : aBeh ? 'F43.24' : aDep && aAnx ? 'F43.22' : aDep && !aEmo ? (wk != null && wk > 4 ? 'F43.21' : 'F43.20') : 'F43.23';
    const met = ['Có sự kiện / biến đổi lớn gây stress'].concat(sx.has('adj_onset') ? ['Khởi phát trong vòng 1 tháng sau sự kiện'] : [], sx.has('adj_impair') ? ['Đau khổ chủ quan, cản trở hoạt động xã hội / công việc'] : [],
      [aDep && 'trầm cảm', aAnx && 'lo âu', aEmo && 'cảm xúc khác', aBeh && 'hành vi'].filter(Boolean).length ? ['Ưu thế: ' + [aDep && 'trầm cảm', aAnx && 'lo âu', aEmo && 'cảm xúc khác', aBeh && 'hành vi'].filter(Boolean).join(', ')] : []);
    const miss = [];
    if(!sx.has('adj_onset')) miss.push('Cần khởi phát trong vòng 1 tháng sau sự kiện stress');
    if(!sx.has('adj_impair')) miss.push('Cần có đau khổ chủ quan / cản trở hoạt động xã hội, công việc');
    if(depOk) miss.push('Đã đủ tiêu chuẩn giai đoạn trầm cảm (F32) — ICD-10 ưu tiên chẩn đoán trầm cảm');
    if(code === 'F43.21' && wk > 104) miss.push(durTxt + ' — phản ứng trầm cảm kéo dài không quá 2 năm');
    else if(code !== 'F43.21' && wk != null && wk > 26) miss.push(durTxt + ' — thường không quá 6 tháng (trừ phản ứng trầm cảm kéo dài) → xem lại chẩn đoán');
    const note = code === 'F43.20' ? 'Phản ứng trầm cảm ngắn: không quá 1 tháng.' : code === 'F43.21' ? 'Phản ứng trầm cảm kéo dài: không quá 2 năm.' : 'Thường bắt đầu trong vòng 1 tháng sau sự kiện và không quá 6 tháng. Không đủ tiêu chuẩn một rối loạn cảm xúc / lo âu / hành vi riêng biệt.';
    add(code, 'ICD-10 (bản VN)', met, miss, note + ' Trắc nghiệm hỗ trợ (LEC4): ADNM-20, PSS-10, DASS-21.');
  } else if(adjStress && !mood && !anxSx.length) todo.push('Có sự kiện gây stress: đánh giá biểu hiện ưu thế (trầm cảm / lo âu / cảm xúc khác / hành vi) ở mục "Rối loạn sự thích ứng" để định hướng F43.2.');
  // --- Cảnh báo, việc cần làm ---
  if(sx.has('dep_suicide')) alerts.push({lv: 3, t: 'Có ý tưởng / hành vi tự sát', m: 'Đánh giá nguy cơ tự sát ngay trong buổi khám (C-SSRS); cân nhắc nhập viện hoặc chuyển chuyên khoa tâm thần, không để bệnh nhân một mình, báo người nhà.'});
  if(depLv && !manSx && !hist.size) todo.push('Hỏi tiền sử hưng cảm / hưng cảm nhẹ (MDQ, HCL-32) trước khi kết luận trầm cảm đơn cực.');
  const mdq = orderNum(v, 'mdq'), hcl = orderNum(v, 'hcl32');
  if((mdq != null && mdq >= 7) || (hcl != null && hcl >= 14)) alerts.push({lv: 2, t: 'Sàng lọc lưỡng cực dương tính', m: `${mdq != null && mdq >= 7 ? `MDQ = ${fmtN(mdq)} ` : ''}${hcl != null && hcl >= 14 ? `HCL-32 = ${fmtN(hcl)}` : ''} — khai thác kỹ tiền sử hưng cảm / hưng cảm nhẹ.`});
  const tsh = (v.orders || []).find(x => x.key === 'tsh'), tv = tsh ? num(tsh.value) : null;
  if(mood || anxSx.length){
    if(!tsh) todo.push('Xét nghiệm hormon tuyến giáp (TSH, FT4) để loại trừ suy giáp / cường giáp.');
    else if((tv != null && (tv < 0.4 || tv > 4)) || ['Cao', 'Thấp', 'BTh'].includes(tsh.flag)) alerts.push({lv: 2, t: 'TSH bất thường', m: 'Cần loại trừ rối loạn khí sắc / lo âu do bệnh tuyến giáp trước khi kết luận.'});
    if(manSx || c.psy) todo.push('Xét nghiệm nước tiểu tìm ma túy (loại trừ rối loạn do chất).');
  }
  // --- Đối chiếu ICD-11 (ICD11_MAP + ghi chú tính từ bảng kiểm) ---
  const vw2 = num(((v.vitals || {}).weight)) ?? num(p.weight), vh2 = num(((v.vitals || {}).height)) ?? num(p.height), bmi2 = bmiOf(vw2, vh2);
  out.forEach(s => {
    let x = i11x[s.code] || '';
    if(!x && depLv && /^(F32\.[0-3]|F33\.[0-3]|F31\.[345])/.test(s.code)) x = i11DepTxt;
    if(/^F43\.2/.test(s.code)) x = sx.has('adj_preocc') ? 'Có bận tâm về sự kiện (yêu cầu bắt buộc của ICD-11).' : 'Chưa đánh dấu "Bận tâm về sự kiện / hậu quả" — ICD-11 bắt buộc.';
    if(/^F50\.[01]/.test(s.code)){
      const lowW = (bmi2 != null && bmi2 < 18.5) || has('an_weight');
      const ok11 = lowW && has('an_self') && has('an_body');
      x = `${ok11 ? 'Đủ' : 'CHƯA đủ'} tiêu chuẩn ICD-11 (cân nặng thấp${bmi2 != null ? ` — BMI ${fmtN(bmi2, 1)}` : ''}, hành vi giảm cân, bận tâm cân nặng / hình thể; không cần rối loạn nội tiết)` + (ok11 && bmi2 != null ? ` → ${bmi2 < 14 ? '6B80.1 (BMI < 14)' : '6B80.0'}.` : '.');
    }
    if(/^F50\.[23]/.test(s.code) && has('bn_binge') && !has('bn_comp')) x = 'Không có hành vi bù trừ → ICD-11 xếp rối loạn ăn uống vô độ (6B82).';
    if(/^F1[07]\.[12]/.test(s.code)){
      const g = [has('sud_crave') || has('sud_control'), has('sud_neglect') || has('sud_harm'), has('sud_withdraw') || has('sud_toler')].filter(Boolean).length;
      x = `Bảng kiểm: ${g}/3 nhóm (kiểm soát; ưu tiên sử dụng; sinh lý) → ${g >= 2 ? 'đủ' : 'chưa đủ'} tiêu chuẩn nghiện ICD-11 (cần ≥ 2).`;
    }
    const m = icd11Of(s.code);
    s.i11 = m ? (m[1] !== '—' ? m[1] + ': ' : '') + m[2] + (x ? ' ' + x : '') : x;
  });
  out.forEach(s => { s.ok = !s.miss.length; });
  out.sort((a, b) => b.ok - a.ok);
  return {sugs: out, alerts, todo, c};
}
// Mục ICD11_MAP khớp tiền tố dài nhất với mã ICD-10
function icd11Of(code){
  return ICD11_MAP.filter(r => code.startsWith(r[0])).sort((a, b) => b[0].length - a[0].length)[0] || null;
}

// ================= MẪU =================
function tplMatches(t, ctx, rxTags){ return (t.tags || []).some(tag => tag.startsWith('tag:') ? (ctx.longTags.has(tag.slice(4)) || (rxTags && rxTags.has(tag.slice(4)))) : ctx.conds.has(tag)); }
