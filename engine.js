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
function bpClass(s, d){ s = num(s); d = num(d); if(!s || !d) return ''; if(s >= 180 || d >= 110) return 'Tăng huyết áp độ 3'; if(s >= 160 || d >= 100) return 'Tăng huyết áp độ 2'; if(s >= 140 || d >= 90) return 'Tăng huyết áp độ 1'; if(s >= 130 || d >= 85) return 'Bình thường cao'; return 'Bình thường'; }

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

const DX_KEYWORDS = [['viem da day','peptic'],['loet da day','peptic'],['loet ta trang','peptic'],['xuat huyet tieu hoa','gi_bleed'],['tang huyet ap','htn'],['dai thao duong','diabetes'],['suy than','ckd'],['benh than man','ckd'],['suy tim','heart_failure'],['gut','gout'],['thoai hoa khop','oa'],['luong cuc','bipolar'],['sa sut tri tue','dementia'],['alzheimer','dementia'],['parkinson','parkinson'],['nghien ruou','alcohol_heavy'],['lo au','depression'],['xo gan','liver'],['benh gan man','liver'],['suy gan','liver'],['dong kinh','epilepsy'],['chan an tam than','anorexia'],['an vo do tam than','bulimia'],['mat ngu','insomnia'],['ha huyet ap tu the','orthostatic']];
function ctxOf(p, v){
  const a = ageOf(p, v ? v.date : null);
  const conds = new Set(p.conds || []);
  if(v && v.dx){
    const it = ICD.find(x => x[0] === String(v.dx.icd || '').trim().split(' ')[0]); if(it) it[2].forEach(k => conds.add(k));
    const t = ' ' + norm((v.dx.main || '') + ' ' + (v.dx.secondary || '')) + ' ';
    DX_KEYWORDS.forEach(([kw, k]) => { if(t.includes(kw)) conds.add(k); });
  }
  if(a != null && a >= 65) conds.add('elderly');
  if(a != null && a < 18) conds.add('child');
  const alc = p.risk && p.risk.alcohol; if(alc === 'some' || alc === 'heavy') conds.add('alcohol'); if(alc === 'heavy') conds.add('alcohol_heavy');
  const bmi = bmiOf(p.weight, p.height); if(bmi != null && bmi >= 23) conds.add('obese');
  if((p.activity || 'sedentary') === 'sedentary') conds.add('sedentary');
  if(v && qtcLong(p, v)) conds.add('qt_long');   // điện tim mô tả QTc dài → cảnh báo mọi thuốc kéo dài QT
  const renal = renalOf(p);
  const longMeds = (p.meds || []).map(resolveMed).filter(Boolean);
  const longTags = new Set(); longMeds.forEach(m => m.tags.forEach(t => longTags.add(t)));
  return {age: a, sex: p.sex, conds, renal, egfr: renal ? renal.egfr : null, longMeds, longTags, allergies: p.allergies || [], allergyText: p.allergyText || '', bmi};
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
function ssriBlockReasons(p, v, ctx){
  ctx = ctx || ctxOf(p, v);
  const out = [], m = (v && v.mental) || {}, sx = m.sx || [];
  const sexItems = (MENTAL_SX.find(g => g.g === 'sex') || {items: []}).items.filter(([k]) => sx.includes(k)).map(([, l]) => l.toLowerCase());
  const icd = String((v && v.dx && v.dx.icd) || '').trim();
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
  if((ctx || ctxOf(p, v)).conds.has('breastfeeding')) return true;
  const t = (p.condNote || '') + ' . ' + ((v && v.hpi) || '');
  return ['cho con bu', 'dang cho bu', 'nuoi con bang sua me'].some(k => mentionsSymptom(t, k));
}
// Đang mang thai: β-hCG mới nhất dương tính (> 5) trong 280 ngày gần đây, ô bệnh nền "Đang mang thai",
// hoặc tiền sử / bệnh sử ghi "mang thai", "có thai" (bỏ câu phủ định). Trả về mô tả lý do hoặc ''.
function pregnancyReason(p, v, ctx){
  if((ctx || ctxOf(p, v)).conds.has('pregnant')) return 'tiền sử ghi đang mang thai';
  // bỏ "đã / từng mang thai (… lần)" — tiền sử sản khoa, không phải đang mang thai
  const t = norm((p.condNote || '') + ' . ' + ((v && v.hpi) || '') + ' . ' + ((v && v.reason) || '')).replace(/\b(da|tung)\s+(mang thai|co thai|co bau)\b/g, ' ');
  if(['mang thai', 'co thai', 'dang co bau', 'co bau'].some(k => mentionsSymptom(t, k))) return 'tiền sử / bệnh sử ghi mang thai';
  const r = bhcgLatest(p, v);
  if(r && r.pos === true && (r.current || (v && v.date && r.date && daysBetween(r.date, v.date) <= 280))) return `β-hCG ${r.text}${r.current ? '' : ' (ngày ' + fmtDate(r.date) + ')'} > 5 mIU/mL`;
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
  const dxT = norm(((v && v.dx && (v.dx.main + ' ' + v.dx.secondary + ' ' + v.dx.icd)) || '') + ' ' + (p.condNote || ''));
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
  // Venlafaxin: bệnh nền tăng huyết áp → không kê (bác sĩ đặt 2026-10-25; venlafaxin làm tăng huyết áp phụ thuộc liều)
  if(norm(d.hc || '').includes('venlafaxin') && (ctx || ctxOf(p, v)).conds.has('htn')) out.push('bệnh nền tăng huyết áp (venlafaxin làm tăng huyết áp phụ thuộc liều)');
  // Tuổi > 65 hoặc < 18 → không kê thuốc chống trầm cảm 3 vòng (TCA) và paroxetin (bác sĩ đặt 2026-10-25)
  //  > 65: kháng cholinergic mạnh — tiêu chí Beers; < 18: TCA độc tim, nguy hiểm khi quá liều; paroxetin tăng ý tưởng tự sát ở vị thành niên
  const ageNow = (ctx || ctxOf(p, v)).age;
  if(ageNow != null && (ageNow > 65 || ageNow < 18)){
    const tca = isTca(d);
    const old = ageNow > 65, who = `bệnh nhân ${ageNow} tuổi (${old ? '> 65' : '< 18'})`;
    if(tca) out.push(old ? `${who}: thuốc chống trầm cảm 3 vòng kháng cholinergic mạnh — lú lẫn, bí tiểu, té ngã, loạn nhịp (Beers)` : `${who}: thuốc chống trầm cảm 3 vòng độc tim, rất nguy hiểm khi quá liều ở trẻ em`);
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
  const code = String((v.dx && v.dx.icd) || '').trim().split(' ')[0];
  if(!DEP_ICD.test(code)) return [];
  const out = [], a = ageOf(p, v.date);
  if((ctx || ctxOf(p, v)).conds.has('liver')) out.push('bệnh gan mạn / xơ gan');
  if(a != null && a >= 6 && a <= 12) out.push(`trẻ ${a} tuổi (6–12 tuổi)`);
  return out;
}
// Kết luận tổng điểm trắc nghiệm theo SCALE_BANDS; null nếu không có bảng hoặc chưa nhập / ngoài khoảng
function scaleResult(key, value){
  const b = SCALE_BANDS[key], n = num(value); if(!b || n == null || n < 0) return null;
  const r = b.find(x => n <= x[0]); return r ? {t: r[1], lv: r[2]} : null;
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

// ================= SÀNG LỌC & LỊCH HẸN =================
const ORDER_TO_SCREEN = {ns_dd:'gastric', ns_dt:'crc', hbsag:'hep', antihcv:'hep', glu:'dm', hba1c:['dm','a1c'], chol:'lipid', ldl:'lipid', creat:'kidney', acr:'kidney', inr:'inr', ecg:null};
function screenCtx(p){
  const ctx = ctxOf(p, null), r = p.risk || {};
  return {age: ctx.age ?? 0, sex: p.sex, bmi: ctx.bmi ?? 0, has: k => ctx.conds.has(k), fam: k => (p.fam || []).includes(k), smoke: r.smoke || 'never', packYears: num(r.packYears) || 0, quitYears: num(r.quitYear) ? (new Date().getFullYear() - num(r.quitYear)) : 0, menopause: !!r.menopause, longTag: t => ctx.longTags.has(t)};
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
  const depNote = [somNote, sevNote].filter(Boolean).join(' ');
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
    if(pastAny) add('F31.' + (cur || '1'), 'Bài 19', manMet.concat(['Tiền sử có giai đoạn rối loạn cảm xúc']), mMiss, cur === '0' ? 'Hưng cảm nhẹ: anh đối chiếu thêm tiêu chuẩn chi tiết F30.0 của ICD-10 (BYT 2020 chỉ nêu phân mức).' : '');
    else add('F30.' + (cur || '1'), 'Bài 18', manMet, mMiss, (cur === '0' ? 'Hưng cảm nhẹ: anh đối chiếu thêm tiêu chuẩn chi tiết F30.0 của ICD-10 (BYT 2020 chỉ nêu phân mức). ' : '') + 'Giai đoạn hưng cảm đã loại trừ thực tổn và do chất được coi là giai đoạn đầu của rối loạn lưỡng cực.');
  } else if(c.manA && c.manB) add('F30.1', 'Bài 18', ['Khí sắc tăng / dễ cáu bất thường'], [`Mới có ${c.manB}/9 triệu chứng tiêu chuẩn B — cần ≥ 3`], '');
  if(c.mix && !manSx){
    if(pastMan) add('F31.6', 'Bài 19', ['Pha trộn / thay đổi nhanh triệu chứng hưng – trầm', 'Tiền sử có giai đoạn hưng cảm / hưng cảm nhẹ'], [], '');
    else add('F31.6', 'Bài 19', ['Pha trộn / thay đổi nhanh triệu chứng hưng – trầm'], ['Cần tiền sử có giai đoạn hưng cảm hoặc hưng cảm nhẹ'], '');
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
    if(pastMan) add('F31.7', 'Bài 19', ['Hiện không có rối loạn cảm xúc đáng kể', 'Tiền sử có giai đoạn hưng cảm / hưng cảm nhẹ'], [], '');
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
  out.forEach(s => { s.ok = !s.miss.length; });
  out.sort((a, b) => b.ok - a.ok);
  return {sugs: out, alerts, todo, c};
}

// ================= MẪU =================
function tplMatches(t, ctx, rxTags){ return (t.tags || []).some(tag => tag.startsWith('tag:') ? (ctx.longTags.has(tag.slice(4)) || (rxTags && rxTags.has(tag.slice(4)))) : ctx.conds.has(tag)); }
