'use strict';
// ================= ĐIỀU KHIỂN NHẬP LIỆU =================
// Ô tuổi: lưu vào trường năm sinh (birthYear = năm nay − tuổi), hiển thị lại tuổi
function AGE(path, by, o = {}){ const y = Number(todayISO().slice(0, 4)), a = num(by) ? y - num(by) : ''; return `<input type="text" data-b="${path}" data-t="age" inputmode="numeric" value="${esc(a)}"${o.ph != null ? ` placeholder="${esc(o.ph)}"` : ''}>`; }
function I(path, val, o = {}){ if(o.num && typeof val === 'number') val = String(val).replace('.', ','); return `<input type="${o.type || 'text'}" data-b="${path}"${o.num ? ' data-t="num" inputmode="decimal"' : ''} value="${esc(val ?? '')}"${o.ph != null ? ` placeholder="${esc(o.ph)}"` : ''}${o.list ? ` list="${o.list}"` : ''}${o.attr ? ' ' + o.attr : ''}>`; }
function U(path, val, unit, o = {}){ return `<div class="unitwrap">${I(path, val, {...o, num: true})}<span>${esc(unit)}</span></div>`; }
function T(path, val, o = {}){ return `<textarea data-b="${path}" rows="${o.rows || 3}"${o.ph ? ` placeholder="${esc(o.ph)}"` : ''}>${esc(val || '')}</textarea>`; }
function SEL(path, val, opts, o = {}){ return `<select data-b="${path}"${o.num ? ' data-t="num"' : ''}>${opts.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(val ?? '') ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`; }
function CB(path, on, label){ return `<label class="check"><input type="checkbox" data-b="${path}" data-t="bool"${on ? ' checked' : ''}> <span>${label}</span></label>`; }
function CL(path, arr, v, label){ return `<label class="check"><input type="checkbox" data-b="${path}" data-t="list" data-v="${esc(v)}"${(arr || []).includes(v) ? ' checked' : ''}> <span>${esc(label)}</span></label>`; }
function RAD(path, val, v, label){ return `<label class="check"><input type="radio" name="${path}" data-b="${path}" data-t="radio" value="${esc(v)}"${val === v ? ' checked' : ''}> <span>${esc(label)}</span></label>`; }
function F(label, ctrl, cls = ''){ return `<div class="field ${cls}"><label>${label}</label>${ctrl}</div>`; }
const chip = (t, c = '') => `<span class="chip ${c}">${esc(t)}</span>`;
const lvChip = lv => `<span class="lv l${lv}">${LV_LABEL[lv]}</span>`;
const originBadge = d => `<span class="badge ${d.o === 'Nội' ? 'noi' : 'ngoai'}">${esc(d.o)}</span>`;

// ================= LƯU =================
const timers = {};
let fileTimer = null;
function setSave(st){ const el = $('#savest'); if(!el) return;
  const err = st === 'error' || (Store.mode === 'dir' && S.storeErr);
  if(S.pendingDir && st !== 'saving'){ el.textContent = 'Chưa kết nối thư mục ' + S.pendingDir.name + ' – bấm để kết nối'; el.classList.add('err'); el.dataset.act = 'dirConnect'; return; }
  el.textContent = st === 'saving' ? 'Đang lưu…' : err ? (Store.mode === 'dir' ? 'Lỗi ghi thư mục – bấm để thử lại' : 'Lỗi lưu dữ liệu!') : Store.mode === 'dir' ? 'Đã lưu vào thư mục ' + Store.dir.name : (S.fileHandle && !S.fileNeedsPerm ? 'Đã lưu trong trình duyệt + file' : 'Đã lưu trong trình duyệt');
  el.classList.toggle('err', !!err); if(err && Store.mode === 'dir') el.dataset.act = 'dirRetry'; else delete el.dataset.act; }
function onStoreError(e){ S.storeErr = (e && e.message) || String(e); setSave('error'); }
function dailyBackup(){ if(Store.mode !== 'dir' || S._bk === todayISO()) return; S._bk = todayISO(); snapshot(false).then(d => Store.dir.backup(d)).catch(e => { S._bk = null; console.warn('Sao lưu ngày lỗi', e); }); }
function savePatient(p){ p.updatedAt = new Date().toISOString(); setSave('saving'); clearTimeout(timers[p.id]); timers[p.id] = setTimeout(() => doSave(p), 300); }
async function doSave(p){ delete timers[p.id]; try { await Store.put('patients', p); if(Store.mode === 'dir') S.storeErr = null; setSave('saved'); scheduleFileSave(); dailyBackup(); } catch(e){ console.error(e); setSave('error'); toast('Không lưu được: ' + e.message); } }
function flushSaves(){ const ps = []; for(const id of Object.keys(timers)){ clearTimeout(timers[id]); const p = S.patients.find(x => x.id === id); if(p) ps.push(doSave(p)); } return Promise.all(ps); }
async function saveSettings(){ await Store.put('kv', {...S.settings, id: 'settings'}); scheduleFileSave(); }
function toast(msg){ const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }

// ================= ĐƯỜNG DẪN DỮ LIỆU =================
function roots(){ return {p: curP(), v: curV(), s: S.settings, d: S.editDrug, t: S.editTpl, n: S.newP, c: S.cmp}; }
function step(o, s){ if(Array.isArray(o)) return s.startsWith('#') ? o.find(x => x.id === s.slice(1)) : o[Number(s)]; if(o[s] == null || typeof o[s] !== 'object') o[s] = {}; return o[s]; }
function resolve(path){ const g = path.split('.'); let o = roots()[g[0]]; for(let i = 1; i < g.length - 1; i++){ if(o == null) return null; o = step(o, g[i]); } return o == null ? null : {o, k: g[g.length - 1]}; }
function getVal(path){ const r = resolve(path); return r ? r.o[r.k] : undefined; }

function onBind(el){
  const path = el.dataset.b, r = resolve(path); if(!r) return;
  const t = el.dataset.t;
  if(t === 'list'){ let a = r.o[r.k]; if(!Array.isArray(a)) a = r.o[r.k] = []; const v = el.dataset.v, i = a.indexOf(v); if(el.checked && i < 0) a.push(v); if(!el.checked && i >= 0) a.splice(i, 1); }
  else if(t === 'bool') r.o[r.k] = el.checked;
  else if(t === 'radio'){ if(el.checked) r.o[r.k] = el.value; }
  else if(t === 'num') r.o[r.k] = el.value.trim() === '' ? null : num(el.value);
  else if(t === 'age'){ const a = num(el.value); r.o[r.k] = a == null || a < 0 ? null : Number(todayISO().slice(0, 4)) - Math.round(a); }
  else r.o[r.k] = el.value;
  afterChange(path, el);
}
function setDom(path, val){ const el = $(`[data-b="${path}"]`); if(el && el !== document.activeElement) el.value = val ?? ''; }
function afterChange(path){
  const root = path.split('.')[0];
  if(root === 'v' || root === 'p'){
    const p = curP(), v = curV();
    if(v){
      if(path === 'v.vitals.weight' && isLatestVisit(p, v) && num(v.vitals.weight)) p.weight = num(v.vitals.weight);
      if(path === 'v.vitals.height' && isLatestVisit(p, v) && num(v.vitals.height)) p.height = num(v.vitals.height);
      if((path === 'v.plan.followDays' || path === 'v.date') && num(v.plan.followDays) && v.date){ v.plan.followDate = addDays(v.date, num(v.plan.followDays)); setDom('v.plan.followDate', v.plan.followDate); }
      if(path === 'v.plan.followDate' && v.plan.followDate && v.date){ v.plan.followDays = daysBetween(v.date, v.plan.followDate); setDom('v.plan.followDays', v.plan.followDays); }
      if(path === 'v.dx.icd' || path === 'v.dx.icd2'){ const sec2 = path === 'v.dx.icd2', fld = sec2 ? 'secondary' : 'main';
        const m = String(v.dx[sec2 ? 'icd2' : 'icd'] || '').match(/^(\S+)\s+–\s+(.+)$/); if(m && !v.dx[fld]){ v.dx[fld] = m[2]; setDom('v.dx.' + fld, v.dx[fld]); }
        const it = m && ICD.find(x => x[0] === m[1]); const add = it ? it[2].filter(k => CHRONIC.includes(k) && !(p.conds || []).includes(k)) : [];
        if(add.length){ p.conds = (p.conds || []).concat(add); toast('Đã thêm vào bệnh nền: ' + add.map(condLabel).join(', ')); } }
    }
    if(p) savePatient(p);
    if(path === 'p.name' || path === 'p.phone') renderPlist();
  } else if(root === 's'){ saveSettings(); if(path === 's.doctor') $('#docname').textContent = '· ' + (S.settings.doctor || ''); }
  updateLive();
}
const CHRONIC = ['ckd','htn','diabetes','dyslipid','af','heart_failure','gout','oa','asthma','hbv','depression','liver','cvd','bipolar','dementia','parkinson','epilepsy','sexual_dysf'];
function isLatestVisit(p, v){ return !p.visits.some(x => x !== v && x.date > v.date); }

// ================= KHUNG CẬP NHẬT TỨC THỜI =================
let _chk = null;
function getChk(){ if(!_chk){ const p = curP(), v = curV(); _chk = p && v ? checkAll(p, v) : {items: [], ctx: p ? ctxOf(p, null) : null}; } return _chk; }
function updateLive(){ _chk = null; $$('[data-live]').forEach(el => { const f = LIVE[el.dataset.live]; if(f){ try { el.innerHTML = f(el); } catch(e){ console.error(e); el.innerHTML = '<span class="muted">—</span>'; } } }); }

const LIVE = {
  phead: () => pheadHTML(curP()),
  ctx: () => ctxHTML(),
  warn: () => warnHTML(),
  rxw: el => { const id = el.dataset.id, v = curV(), l = v.rx.find(x => x.id === id), d = l && drugById(l.drugId); if(!d) return ''; const ws = getChk().items.filter(w => w.lines.includes(id)); if(!ws.length) return '<span class="chip ok">Không có cảnh báo</span>'; return '<div class="wsum">' + ws.map(w => { let extra = ''; if(w.title.includes(' + ')) extra = ': ' + w.title.split(' + ').find(x => x !== d.n) ; return `<span class="chip r${w.lv}" title="${esc(w.m)}">${LV_LABEL[w.lv]} · ${esc(w.kind + extra)}</span>`; }).join('') + '</div>'; },
  rxqty: el => { const l = curV().rx.find(x => x.id === el.dataset.id); if(!l) return ''; const d = drugById(l.drugId), q = rxQty(l); return `<b>${fmtN(q.give)}</b> ${esc(d ? d.u : '')}`; },
  rxcost: el => { const l = curV().rx.find(x => x.id === el.dataset.id); return l ? money(rxCost(l)) : ''; },
  rxtotal: () => { const v = curV(); const t = (v.rx || []).reduce((a, l) => a + rxCost(l), 0); return `Tổng tiền thuốc (giá mẫu): <b>${money(t)}</b>`; },
  scale: el => { const o = curV().orders.find(x => x.id === el.dataset.id); if(!o) return ''; const r = scaleResult(o.key, o.value); return r ? chip(r.t, ['ok', 'r1', 'r2', 'r3'][r.lv]) : '<span class="small muted">Nhập tổng điểm để có kết luận.</span>'; },
  egfr: el => { const p = curP(), v = curV(), o = v.orders.find(x => x.id === el.dataset.id); if(!o) return '';
    if(!num(o.value)) return '<span class="small muted">Nhập kết quả creatinin để tính.</span>';
    const e = egfrFromOrder(p, v, o); if(e == null) return '<span class="small muted">Cần ngày sinh / tuổi và giới của bệnh nhân để tính.</span>';
    const w = num(v.vitals && v.vitals.weight) || num(p.weight); const cc = w ? crclCG(num(o.value), ageOf(p, v.date), w, p.sex) : null;
    return `<span class="chip ${e < 30 ? 'r3' : e < 60 ? 'r2' : 'ok'}"><b>${fmtN(e)}</b> mL/phút/1,73m² · ${ckdStage(e)} – ${EGFR_LABEL[ckdStage(e)]}</span>${cc ? ` <span class="small muted">· CrCl (Cockcroft-Gault) ≈ ${fmtN(cc)} mL/phút</span>` : ''}`; },
  bmiV: () => { const v = curV(), p = curP(); const b = bmiOf(v.vitals.weight || p.weight, v.vitals.height || p.height); const bp = bpClass(v.vitals.sbp, v.vitals.dbp); return [b ? chip(`BMI ${fmtN(b, 1)} – ${bmiClass(b)}`, b >= 25 ? 'r2' : b >= 23 ? 'r1' : 'ok') : '', bp ? chip('Huyết áp: ' + bp, bp.includes('180/110') ? 'r3' : bp.startsWith('Tăng') ? 'r2' : bp.startsWith('Tiền') ? 'r1' : 'ok') : ''].join(' '); },
  bmiP: () => { const p = curP(); const b = bmiOf(p.weight, p.height); return b ? chip(`BMI ${fmtN(b, 1)} – ${bmiClass(b)}`, b >= 25 ? 'r2' : b >= 23 ? 'r1' : 'ok') : '<span class="muted small">Nhập cân nặng, chiều cao để tính BMI</span>'; },
  renalP: () => { const r = renalOf(curP()); if(!r) return '<span class="muted small">Chưa có creatinin. Nhập ở đây hoặc trong kết quả xét nghiệm của lượt khám.</span>'; return `<div>${r.egfr != null ? `<b>eGFR ≈ ${fmtN(r.egfr)}</b> mL/phút/1,73m² — giai đoạn ${r.stage}` : ''}${r.crcl ? ` · CrCl (Cockcroft-Gault) ≈ ${fmtN(r.crcl)} mL/phút` : ''}</div><div class="tiny muted">Nguồn: ${esc(r.src)}${r.creat ? ` · creatinin ${fmtN(r.creat)} µmol/L` : ''} · Dùng để kiểm tra liều thuốc.</div>`; },
  nutri: () => nutriHTML(),
  act: () => { const p = curP(), v = curV(); const m = num(v.activity.minutes) ?? num(p.exerciseMin); if(m == null) return '<span class="muted small">Nhập số phút vận động mức vừa mỗi tuần để đánh giá.</span>'; return m >= 150 ? chip(`${fmtN(m)} phút/tuần — đạt khuyến cáo WHO (≥ 150)`, 'ok') : chip(`${fmtN(m)} phút/tuần — chưa đạt khuyến cáo WHO (≥ 150 phút/tuần mức vừa); mức độ hoạt động thể lực kém`, 'r2'); },
  mood: () => moodHTML(),
  mentalSum: () => mentalSumHTML(),
  rxgate: () => rxGateHTML(),
  dxsug: () => dxSugHTML(),
  tcmNote: () => { const ctx = getChk().ctx; const a = []; if(ctx.longTags.has('anticoag')) a.push('đang dùng thuốc chống đông (thận trọng châm cứu, giác hơi; tránh thảo dược ảnh hưởng đông máu)'); if(ctx.egfr != null && ctx.egfr < 60) a.push('chức năng thận giảm (không tự dùng thuốc nam, thảo dược)'); return a.length ? `<div class="w l2"><div class="wt">Lưu ý khi chỉ định YHCT</div><div>Bệnh nhân ${a.join('; ')}.</div></div>` : ''; },
  screenSum: () => { const l = screenList(curP()).filter(s => s.st === 'due' || s.st === 'never'); if(!l.length) return '<span class="chip ok">Không có mục sàng lọc đến hạn</span>'; return '<ul style="margin:0;padding-left:18px">' + l.map(s => `<li><b>${esc(s.r.t)}</b> — ${s.st === 'due' ? `<span class="chip r2">đến hạn ${fmtDate(s.due)}</span>` : '<span class="chip">chưa ghi nhận</span>'} <span class="muted small">${esc(s.r.how)}</span></li>`).join('') + '</ul>'; },
  screenSt: el => { const s = screenList(curP()).find(x => x.r.id === el.dataset.id); return s ? screenStatus(s) : ''; },
  print: () => sheetHTML(curP(), curV()),
  cmp: () => cmpHTML(),
  cmpCls: () => { const c = S.cmp, cl = [...new Set(S.drugs.filter(d => d.g === c.g).map(d => d.cls))]; if(c.cls && !cl.includes(c.cls)) c.cls = ''; return F('Phân nhóm', `<select data-b="c.cls">${[['', 'Tất cả phân nhóm'], ...cl.map(x => [x, x])].map(([v, l]) => `<option value="${esc(v)}"${v === (c.cls || '') ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`); },
  stepsBar: () => stepsBarHTML(),
};

// ================= KHUNG ỨNG DỤNG =================
const NAV = [['home','Trang chủ'],['appts','Lịch hẹn'],['drugs','Danh mục thuốc'],['tpls','Thư viện mẫu'],['settings','Cài đặt & sao lưu']];
function render(){
  $('#body').classList.toggle('gated', !!S.gate);
  if(S.gate){ $('#nav').innerHTML = ''; $('#side').innerHTML = ''; $('#main').innerHTML = gateView(); $('#modalRoot').innerHTML = ''; $('#savest').textContent = ''; return; }
  renderNav(); renderSide(); renderMain(); renderModal(); setSave('saved'); }
// Opera có hàm showDirectoryPicker nhưng chặn cửa sổ chọn thư mục -> bấm nút không thấy gì (Cốc Cốc thì dùng được)
const BAD_BROWSER = /\bOPR\/|\bOpera\b/i.test(navigator.userAgent);
const BROWSER_MSG = 'Trình duyệt này không cho chọn thư mục. Anh hãy mở file Ho-so-benh-nhan.html bằng Chrome hoặc Edge: chuột phải vào file → Open with → Google Chrome / Microsoft Edge.';
function gateView(){
  const g = S.gate;
  const warn = BAD_BROWSER ? `<div class="banner" style="margin-top:12px"><span><b>Không chọn được thư mục trên trình duyệt này.</b> ${esc(BROWSER_MSG)}</span></div>` : '';
  const how = `<ol class="small" style="margin:10px 0 0;padding-left:20px;line-height:1.7"><li>Bấm nút bên dưới, cửa sổ chọn thư mục hiện ra.</li><li>Tìm tới <b>Desktop → BS-TOAN</b> (hoặc thư mục anh muốn), bấm <b>Chọn thư mục</b> / <b>Select Folder</b>.</li><li>Trình duyệt hỏi quyền sửa file → bấm <b>Cho phép</b> / <b>Edit files</b>.</li></ol><div class="small muted" style="margin-top:8px">App sẽ tạo thư mục con <b>du-lieu</b> trong đó: mỗi bệnh nhân một file, ảnh/PDF đính kèm là file thật, tự sao lưu mỗi ngày.</div>`;
  if(g.kind === 'reconnect') return `<div class="page"><div class="card gate"><h2>Mở dữ liệu hồ sơ bệnh nhân</h2><div>Dữ liệu đang lưu trong thư mục <b>${esc(g.h.name)}</b> trên máy. Vì bảo mật, trình duyệt cần anh cho phép mỗi lần mở app.</div><div class="small muted" style="margin-top:6px">Mẹo: khi trình duyệt hỏi, chọn <b>"Cho phép mỗi lần truy cập"</b> (Allow on every visit) thì lần sau chỉ cần bấm một lần.</div>${warn}
    <div class="row" style="margin-top:16px"><button class="btn pri lg" data-act="gateReconnect">Mở thư mục ${esc(g.h.name)}</button><button class="btn" data-act="gatePick">Chọn thư mục khác</button></div></div></div>`;
  return `<div class="page"><div class="card gate"><h2>Chọn nơi lưu hồ sơ bệnh nhân</h2><div>Toàn bộ hồ sơ sẽ được lưu thành file trong một thư mục trên máy anh — không gửi lên mạng, có thể chép sang USB để sao lưu.</div>${warn}${how}
    <div class="row" style="margin-top:16px"><button class="btn pri lg" data-act="gatePick">Chọn thư mục lưu dữ liệu</button><button class="btn ghost sm" data-act="gateBrowser">Tạm lưu trong trình duyệt</button></div></div></div>`;
}
function renderNav(){ const n = S.view.name; $('#nav').innerHTML = NAV.map(([k, l]) => `<button class="${n === k ? 'on' : ''}" data-act="nav" data-to="${k}">${l}</button>`).join(''); $('#docname').textContent = '· ' + (S.settings.doctor || ''); }
function renderSide(){
  $('#side').innerHTML = `<div class="sh"><button class="btn pri" data-act="newP">+ Bệnh nhân mới</button><input type="search" id="pq" placeholder="Tìm tên, SĐT, mã bệnh nhân…" value="${esc(S.q)}" autocomplete="off"></div><div class="plist" id="plist"></div>`;
  renderPlist();
}
function renderPlist(){
  const q = norm(S.q), t = todayISO();
  const list = S.patients.filter(p => !q || norm(`${p.name} ${p.phone} ${p.code}`).includes(q)).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  const el = $('#plist'); if(!el) return;
  el.innerHTML = list.length ? list.map(p => {
    const a = ageOf(p), last = (p.visits || []).map(v => v.date).sort().pop(), nx = nextAppt(p);
    return `<div class="pitem ${S.view.pid === p.id ? 'on' : ''}" data-act="openP" data-id="${p.id}"><div class="nm">${esc(p.name || '(chưa có tên)')}</div><div class="meta"><span>${esc(p.code)}</span>${a != null ? `<span>${a} tuổi</span>` : ''}${p.sex ? `<span>${esc(p.sex)}</span>` : ''}${last ? `<span>khám ${fmtDate(last)}</span>` : ''}</div>${nx ? `<div class="meta">${chip(`${nx.kind} ${fmtDate(nx.date)} · ${relDays(nx.date)}`, nx.date < t ? 'r3' : nx.date <= addDays(t, 7) ? 'r2' : '')}</div>` : ''}</div>`;
  }).join('') : `<div class="empty small">${S.patients.length ? 'Không tìm thấy' : 'Chưa có bệnh nhân'}</div>`;
}
function renderMain(keepScroll){
  const m = $('#main'), sc = keepScroll ? m.scrollTop : 0;
  const n = S.view.name;
  let h = '';
  if(n === 'home') h = viewHome();
  else if(n === 'appts') h = viewAppts();
  else if(n === 'newp') h = viewNewP();
  else if(n === 'patient') h = curP() ? viewPatient() : viewHome();
  else if(n === 'visit') h = curV() ? viewVisit() : viewHome();
  else if(n === 'drugs') h = viewDrugs();
  else if(n === 'tpls') h = viewTpls();
  else if(n === 'settings') h = viewSettings();
  m.innerHTML = h;
  updateLive();
  m.scrollTop = sc;
}
function go(view){ flushSaves(); S.view = view; S.modal = null; $('#body').classList.remove('showside'); render(); }

// ================= TRANG CHỦ =================
function banners(){
  let h = '';
  if(S.pendingDir) h += `<div class="banner"><span><b>Chưa kết nối thư mục ${esc(S.pendingDir.name)}.</b> App đang mở bằng bản sao lần trước; thay đổi được giữ tạm trong trình duyệt${Store.pend && Store.pend.size ? ` (${Store.pend.size} mục chờ ghi)` : ''} và sẽ ghi vào thư mục khi anh cho phép. Ảnh/PDF đính kèm cũ chỉ mở được sau khi kết nối.</span><button class="btn sm pri" data-act="dirConnect">Kết nối thư mục</button></div>`;
  if(S.fileNeedsPerm) h += `<div class="banner info"><span>Tự động lưu ra file <b>${esc(S.fileHandle && S.fileHandle.name)}</b> đang tạm dừng (trình duyệt cần anh cho phép lại sau mỗi lần mở).</span><button class="btn sm" data-act="fileReconnect">Cho phép tiếp tục lưu</button></div>`;
  if(S.otherTab) h += `<div class="banner"><span>App đang mở ở một tab/cửa sổ khác. Chỉ dùng <b>một</b> tab để tránh ghi đè dữ liệu.</span></div>`;
  if(Store.mode === 'dir' && S.storeErr) h += `<div class="banner"><span><b>Chưa ghi được vào thư mục ${esc(Store.dir.name)}</b> (${esc(S.storeErr)}). Dữ liệu vẫn còn trong app — bấm để cấp quyền và ghi lại, đừng đóng app trước khi ghi xong.</span><button class="btn sm" data-act="dirRetry">Ghi lại ngay</button></div>`;
  if(Store.mode !== 'dir' && Store.canDir) h += `<div class="banner info"><span>Dữ liệu đang nằm trong trình duyệt. Nên chuyển sang lưu vào thư mục trên máy (vd. Desktop\\BS-TOAN).</span><button class="btn sm" data-act="dirPick">Chọn thư mục</button></div>`;
  const lb = S.settings.lastBackup, old = !lb || daysBetween(lb.slice(0, 10), todayISO()) > 7;
  if(Store.mode !== 'dir' && !S.fileHandle && old && S.patients.some(p => !p.demo)) h += `<div class="banner"><span>${lb ? `Lần sao lưu gần nhất: ${fmtDate(lb.slice(0, 10))}.` : 'Chưa sao lưu lần nào.'} Dữ liệu đang nằm trong trình duyệt — nên sao lưu ra file ít nhất mỗi tuần.</span><button class="btn sm" data-act="export">Sao lưu ngay</button></div>`;
  return h;
}
function apptRows(list, empty){
  const t = todayISO();
  if(!list.length) return `<div class="empty small">${empty || 'Không có lịch hẹn'}</div>`;
  return `<div class="tscroll"><table class="t"><thead><tr><th>Ngày</th><th>Bệnh nhân</th><th>Loại</th><th>Nội dung</th></tr></thead><tbody>${list.map(a => `<tr class="click" data-act="openP" data-id="${a.p.id}"><td class="nowrap"><b>${fmtDate(a.date)}</b><div class="tiny ${a.date < t ? '' : 'muted'}" ${a.date < t ? 'style="color:var(--r3)"' : ''}>${relDays(a.date)}</div></td><td><b>${esc(a.p.name)}</b><div class="tiny muted">${esc(a.p.code)}${a.p.phone ? ' · ' + esc(a.p.phone) : ''}</div></td><td>${chip(a.kind, a.kind === 'Tái khám' ? 'pri' : a.kind === 'Sàng lọc' ? 'r1' : '')}</td><td class="small">${esc(a.note)}</td></tr>`).join('')}</tbody></table></div>`;
}
function viewHome(){
  const ap = apptList(), t = todayISO();
  const over = ap.filter(a => a.date < t), today = ap.filter(a => a.date === t), soon = ap.filter(a => a.date > t && a.date <= addDays(t, 30));
  const wd = ['Chủ nhật','Thứ hai','Thứ ba','Thứ tư','Thứ năm','Thứ sáu','Thứ bảy'][new Date().getDay()];
  const demo = S.patients.find(p => p.demo);
  return `<div class="page stack">${banners()}
  <div class="row between"><div><h2>Xin chào ${esc(S.settings.doctor || 'bác sĩ')}</h2><div class="muted">${wd}, ${fmtDate(t)}</div></div><button class="btn pri" data-act="newP">+ Bệnh nhân mới</button></div>
  <div class="g4">
    <div class="card stat"><span class="muted small">Bệnh nhân</span><b>${S.patients.length}</b></div>
    <div class="card stat"><span class="muted small">Hẹn hôm nay</span><b>${today.length}</b></div>
    <div class="card stat"><span class="muted small">Quá hạn</span><b style="color:${over.length ? 'var(--r3)' : 'inherit'}">${over.length}</b></div>
    <div class="card stat"><span class="muted small">Trong 30 ngày tới</span><b>${soon.length}</b></div>
  </div>
  <div class="g2" style="align-items:start">
    <div class="card"><div class="ch"><h3>Việc cần làm</h3><button class="btn sm" data-act="nav" data-to="appts">Xem toàn bộ lịch hẹn</button></div>${apptRows([...over, ...today, ...soon].slice(0, 10), 'Không có lịch hẹn quá hạn hoặc trong 30 ngày tới')}</div>
    <div class="card"><h3>Luồng khám</h3>
      <ol style="margin:0 0 12px;padding-left:20px" class="small">
        <li><b>Tạo hồ sơ</b>: thông tin cá nhân, lý do đến khám.</li>
        <li><b>Khám & cận lâm sàng</b>: triệu chứng, chỉ định xét nghiệm, nhập kết quả (creatinin tự tính eGFR).</li>
        <li><b>Chẩn đoán & kê đơn</b>: tự cảnh báo tương tác, chỉnh liều theo thận/tuổi/thai kỳ, so sánh thuốc nội – ngoại theo giá.</li>
        <li><b>Kế hoạch theo dõi</b>: tái khám, nhắc hẹn dài hạn, sàng lọc theo tuổi/giới/nguy cơ.</li>
        <li><b>Liệu pháp không thuốc</b>: dinh dưỡng (kcal, đạm/béo/bột), vận động, PHCN, YHCT, tâm lý → in phiếu cho bệnh nhân.</li>
      </ol>
      ${demo ? `<button class="btn" data-act="openP" data-id="${demo.id}">Mở ca mẫu: ${esc(demo.name)}</button>` : ''}
      <div class="note" style="margin-top:12px">Cảnh báo thuốc dựa trên danh mục mẫu tổng hợp từ tờ hướng dẫn sử dụng, Dược thư và khuyến cáo (KDIGO, Beers, USPSTF…). Đây là công cụ hỗ trợ — quyết định cuối cùng thuộc về bác sĩ. Dữ liệu chỉ lưu trên máy này.</div>
    </div>
  </div></div>`;
}
function viewAppts(){
  const ap = apptList(), t = todayISO(), w = addDays(t, 7), m = addDays(t, 30);
  const g = [['Quá hạn', ap.filter(a => a.date < t)], ['Hôm nay', ap.filter(a => a.date === t)], ['7 ngày tới', ap.filter(a => a.date > t && a.date <= w)], ['8–30 ngày tới', ap.filter(a => a.date > w && a.date <= m)], ['Xa hơn', ap.filter(a => a.date > m)]];
  return `<div class="page stack">${banners()}<h2>Lịch hẹn & nhắc việc</h2><div class="muted small">Gồm: ngày tái khám của lượt khám gần nhất, nhắc hẹn dài hạn (vd. nội soi lại sau 3 năm), và sàng lọc đã đến hạn.</div>
  ${g.map(([k, l]) => `<div class="card"><div class="ch"><h3>${k} <span class="chip">${l.length}</span></h3></div>${apptRows(l, 'Không có')}</div>`).join('')}</div>`;
}

// ================= BỆNH NHÂN MỚI =================
function viewNewP(){
  const n = S.newP;
  return `<div class="page stack"><h2>Bệnh nhân mới</h2>
  <div class="card"><div class="g3">
    ${F('Họ và tên *', I('n.name', n.name, {attr: 'id="newName" autocomplete="off"'}), 'span2')}
    ${F('Giới', SEL('n.sex', n.sex, [['Nam','Nam'],['Nữ','Nữ']]))}
    ${F('Ngày sinh', I('n.dob', n.dob, {type: 'date'}))}
    ${F('hoặc Tuổi', AGE('n.birthYear', n.birthYear, {ph: 'vd. 62'}))}
    ${F('Số điện thoại', I('n.phone', n.phone, {type: 'tel'}))}
    ${F('Nghề nghiệp', I('n.job', n.job))}
    ${F('Địa chỉ', I('n.address', n.address), 'span2')}
    ${F('Lý do đến khám', T('n.reason', n.reason, {rows: 2, ph: 'vd. Đau bụng vùng thượng vị 2 tuần'}), 'spanall')}
  </div>
  <div class="row" style="margin-top:14px"><button class="btn pri" data-act="createP">Tạo hồ sơ và bắt đầu khám</button><button class="btn" data-act="createP" data-only="1">Chỉ tạo hồ sơ</button><button class="btn ghost" data-act="nav" data-to="home">Huỷ</button></div></div></div>`;
}
function newVisitObj(p, kind){
  return {id: uid('v'), date: todayISO(), kind, place: '', status: 'draft', reason: '', hpi: '', vitals: {weight: p.weight ?? null, height: p.height ?? null}, exam: '', orders: [], files: [],
    dx: {main: '', icd: '', secondary: '', disp: 'outpatient', note: ''}, rx: [], rxNote: '', plan: {followDays: null, followDate: '', followReason: '', returnSigns: '', notes: ''},
    nutrition: {}, activity: {}, rehab: {text: ''}, tcm: {text: ''}, psych: {text: ''}, mental: {sx: [], hist: [], excl: []},
    print: {reason: true, dx: true, labs: true, rx: true, ae: true, plan: true, ret: true, diet: true, act: true, rehab: true, tcm: true, psych: false, price: false}};
}
function nextCode(){ const n = S.patients.map(p => parseInt(String(p.code || '').replace(/\D/g, '')) || 0); return 'BN' + String(Math.max(0, ...n) + 1).padStart(4, '0'); }

// ================= HỒ SƠ BỆNH NHÂN =================
function pheadHTML(p){
  const a = ageOf(p), b = bmiOf(p.weight, p.height), r = renalOf(p), ctx = ctxOf(p, null);
  const al = (p.allergies || []).map(k => (ALLERGY.find(x => x.k === k) || {}).t).filter(Boolean).concat(p.allergyText ? [p.allergyText] : []);
  return `<div class="phead"><div class="who"><h2>${esc(p.name || '(chưa có tên)')} ${chip(p.code)}${p.demo ? chip('ca mẫu', 'r1') : ''}</h2>
  <div class="muted">${[a != null ? a + ' tuổi' : '', p.sex, p.job, p.phone].filter(Boolean).map(esc).join(' · ')}</div>
  <div class="facts">${b ? chip(`BMI ${fmtN(b, 1)} – ${bmiClass(b)}`, b >= 25 ? 'r2' : b >= 23 ? 'r1' : '') : ''}${r && r.egfr != null ? chip(`eGFR ${fmtN(r.egfr)} (${r.stage})`, r.egfr < 30 ? 'r3' : r.egfr < 60 ? 'r2' : '') : ''}
  ${al.length ? al.map(x => chip('Dị ứng: ' + x, 'r3')).join('') : p.noAllergy ? chip('Không dị ứng thuốc', 'ok') : chip('Chưa hỏi dị ứng', 'r2')}
  ${(p.conds || []).map(k => chip(condLabel(k), 'pri')).join('')}
  ${ctx.longMeds.map(m => chip('Đang dùng: ' + m.name)).join('')}</div></div>
  <div class="row"><button class="btn pri" data-act="newVisit" data-kind="clinic">+ Lượt khám mới</button><button class="btn" data-act="newVisit" data-kind="old">+ Nhập hồ sơ cũ</button></div></div>`;
}
function viewPatient(){
  const p = curP(), tab = S.view.tab || 'visits';
  const tabs = [['visits', `Lượt khám (${p.visits.length})`], ['profile', 'Hồ sơ nền'], ['screen', 'Sàng lọc & nhắc hẹn']];
  let body = tab === 'profile' ? tabProfile(p) : tab === 'screen' ? tabScreen(p) : tabVisits(p);
  return `<div class="page">${banners()}<div class="card" data-live="phead"></div>
  <div class="tabs" style="margin-top:16px">${tabs.map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-act="ptab" data-tab="${k}">${l}</button>`).join('')}</div>${body}</div>`;
}
function tabVisits(p){
  const vs = p.visits.slice().sort((a, b) => b.date.localeCompare(a.date));
  if(!vs.length) return `<div class="empty">Chưa có lượt khám. Bấm “+ Lượt khám mới”, hoặc “+ Nhập hồ sơ cũ” để ghi lại chẩn đoán, xét nghiệm, đơn thuốc trước đây.</div>`;
  return `<div class="tl">${vs.map(v => {
    const rx = v.rx.map(l => (drugById(l.drugId) || {}).n).filter(Boolean);
    return `<div class="v" data-act="openV" data-id="${v.id}"><div class="d">${fmtDate(v.date) || '—'}<small>${v.kind === 'old' ? 'Hồ sơ cũ' + (v.place ? ' · ' + esc(v.place) : '') : 'Khám tại phòng khám'}</small></div>
    <div><div><b>${esc(v.dx.main || v.reason || '(chưa có chẩn đoán)')}</b></div>${v.reason && v.dx.main ? `<div class="small muted">Lý do: ${esc(v.reason)}</div>` : ''}${rx.length ? `<div class="small">Đơn: ${esc(rx.join(', '))}</div>` : ''}${v.orders.length ? `<div class="small muted">CLS: ${esc(v.orders.map(o => o.name).join(', '))}</div>` : ''}</div>
    <div class="right">${chip(v.status === 'done' ? 'Hoàn tất' : 'Đang khám', v.status === 'done' ? 'ok' : 'r2')}${v.plan.followDate ? `<div class="small muted" style="margin-top:6px">Tái khám ${fmtDate(v.plan.followDate)}</div>` : ''}</div></div>`;
  }).join('')}</div>`;
}
function medsTable(p){
  const rows = (p.meds || []).map(m => {
    const d = m.drugId && drugById(m.drugId);
    return `<tr><td>${d ? `<b>${esc(d.n)}</b> ${originBadge(d)}<div class="tiny muted">${esc(d.hc)}</div>` : I(`p.meds.#${m.id}.text`, m.text, {ph: 'Tên thuốc (ngoài danh mục)'})}</td>
    <td>${d ? `<span class="small muted">${esc(d.cls)}</span>` : SEL(`p.meds.#${m.id}.grp`, m.grp, [['', '— nhóm thuốc (để kiểm tra tương tác) —'], ...MED_GROUPS.map(g => [g, TAGS[g]])])}</td>
    <td>${I(`p.meds.#${m.id}.dose`, m.dose, {ph: 'Liều, cách dùng'})}</td><td>${I(`p.meds.#${m.id}.note`, m.note, {ph: 'Chỉ định / ghi chú'})}</td>
    <td><button class="btn xs danger" data-act="medDel" data-id="${m.id}">Xoá</button></td></tr>`;
  }).join('');
  return `<div class="tscroll"><table class="t"><thead><tr><th>Thuốc</th><th>Nhóm</th><th>Liều dùng</th><th>Ghi chú</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="muted small">Chưa có thuốc dài hạn</td></tr>'}</tbody></table></div>
  <div class="row" style="margin-top:10px"><div class="dsearch" style="flex:1;min-width:240px"><input type="search" id="mq" placeholder="Thêm thuốc từ danh mục (gõ tên hoặc hoạt chất)…" autocomplete="off"><div class="dres" id="mres" hidden></div></div><button class="btn" data-act="medFree">+ Thuốc ngoài danh mục</button></div>`;
}
function tabProfile(p){
  const r = p.risk || {};
  return `<div class="stack">
  <div class="card"><h3>Thông tin hành chính</h3><div class="g4">
    ${F('Họ và tên', I('p.name', p.name), 'span2')}${F('Giới', SEL('p.sex', p.sex, [['Nam','Nam'],['Nữ','Nữ']]))}${F('Mã bệnh nhân', I('p.code', p.code))}
    ${F('Ngày sinh', I('p.dob', p.dob, {type: 'date'}))}${F('hoặc Tuổi', AGE('p.birthYear', p.birthYear))}${F('Số điện thoại', I('p.phone', p.phone, {type: 'tel'}))}${F('Nghề nghiệp', I('p.job', p.job))}
    ${F('Địa chỉ', I('p.address', p.address), 'span2')}${F('Số thẻ BHYT', I('p.insurance', p.insurance))}${F('Người liên hệ', I('p.contact', p.contact))}
  </div></div>
  <div class="card"><h3>Hoàn cảnh & mong muốn</h3>${T('p.social', p.social, {rows: 2, ph: 'Kinh tế (ưu tiên thuốc rẻ?), người chăm sóc, công việc, lo lắng/mong muốn của bệnh nhân…'})}</div>
  <div class="card"><div class="ch"><h3>Nhân trắc & vận động</h3><div data-live="bmiP"></div></div><div class="g4">
    ${F('Chiều cao', U('p.height', p.height, 'cm'))}${F('Cân nặng', U('p.weight', p.weight, 'kg'))}${F('Vòng eo', U('p.waist', p.waist, 'cm'))}${F('Vận động mức vừa', U('p.exerciseMin', p.exerciseMin, 'phút/tuần'))}
    ${F('Mức hoạt động hằng ngày', SEL('p.activity', p.activity || 'sedentary', Object.entries(ACT_LV).map(([k, x]) => [k, x.t])), 'span2')}
    ${F('Body fat (InBody)', U('p.bodyFat', p.bodyFat, '%'))}${F('Lean mass (InBody)', U('p.leanMass', p.leanMass, 'kg'))}
  </div></div>
  <div class="card"><h3>Bệnh nền, tiền sử</h3><div class="checks">${CONDS.filter(c => p.sex !== 'Nam' || !['pregnant','breastfeeding'].includes(c.k)).map(c => CL('p.conds', p.conds, c.k, c.t)).join('')}</div>
    <div style="margin-top:10px">${F('Tiền sử bệnh, phẫu thuật, nhập viện', T('p.condNote', p.condNote, {rows: 2}))}</div>
    <div style="margin-top:10px">${F('Tiền sử gia đình', T('p.famNote', p.famNote, {rows: 2, ph: 'Bệnh của bố mẹ, anh chị em, con (tâm thần, tim mạch, đái tháo đường, ung thư…), tuổi mắc / mất'}))}</div></div>
  <div class="card"><h3>Chức năng thận</h3><div class="g4">${F('Creatinin', U('p.renalManual.creat', (p.renalManual || {}).creat, 'µmol/L'))}${F('Ngày xét nghiệm', I('p.renalManual.date', (p.renalManual || {}).date, {type: 'date'}))}${F('hoặc eGFR có sẵn', U('p.renalManual.egfr', (p.renalManual || {}).egfr, 'mL/ph'))}<div></div></div><div style="margin-top:8px" data-live="renalP"></div></div>
  <div class="card"><h3>Dị ứng</h3><div class="checks">${ALLERGY.map(a => CL('p.allergies', p.allergies, a.k, a.t)).join('')}</div>
    <div class="g2" style="margin-top:10px">${F('Dị ứng khác (thuốc, thức ăn) — phân cách bằng dấu phẩy', I('p.allergyText', p.allergyText))}<div class="field"><label>&nbsp;</label>${CB('p.noAllergy', p.noAllergy, 'Đã hỏi — không dị ứng thuốc')}</div></div></div>
  <div class="card"><h3>Thuốc đang dùng dài hạn</h3><div class="small muted" style="margin-bottom:8px">Các thuốc này được tự động kiểm tra tương tác mỗi khi kê đơn mới.</div>${medsTable(p)}</div>
  <div class="card"><h3>Yếu tố nguy cơ</h3><div class="g4">
    ${F('Hút thuốc lá', SEL('p.risk.smoke', r.smoke || 'never', [['never','Không hút'],['current','Đang hút'],['former','Đã bỏ']]))}${F('Số bao-năm', I('p.risk.packYears', r.packYears, {num: true}))}${F('Năm bỏ thuốc', I('p.risk.quitYear', r.quitYear, {num: true}))}
    ${F('Rượu bia', SEL('p.risk.alcohol', r.alcohol || 'no', [['no','Không / hiếm'],['some','Thỉnh thoảng'],['heavy','Thường xuyên, nhiều']]))}
    ${p.sex === 'Nữ' ? `<div class="field"><label>&nbsp;</label>${CB('p.risk.menopause', r.menopause, 'Đã mãn kinh')}</div>` : ''}
  </div>
  <div class="lbl" style="margin-top:12px">Người thân (bố mẹ, anh chị em) bị ung thư</div><div class="checks">${Object.entries(FAM_CANCER).map(([k, l]) => CL('p.fam', p.fam, k, l)).join('')}</div></div>
  <div class="card"><div class="row between"><div><h3 style="margin:0">Xoá hồ sơ</h3><div class="small muted">Xoá vĩnh viễn bệnh nhân này và toàn bộ lượt khám.</div></div><button class="btn danger" data-act="delP">Xoá bệnh nhân</button></div></div>
  </div>`;
}
function screenStatus(s){
  if(s.st === 'due') return chip(`Đến hạn từ ${fmtDate(s.due)}`, 'r2');
  if(s.st === 'ok') return chip(`Còn hạn đến ${fmtDate(s.due)}`, 'ok');
  if(s.st === 'done') return chip('Đã làm', 'ok');
  return chip('Chưa ghi nhận', '');
}
const RECALL_PRESETS = [['Nội soi dạ dày kiểm tra lại', 36], ['Nội soi đại tràng kiểm tra lại', 60], ['Xét nghiệm máu kiểm tra lại', 3], ['Siêu âm bụng kiểm tra lại', 6], ['Đánh giá lại cân nặng, chế độ ăn', 1]];
function recallsHTML(p){
  const rows = (p.recalls || []).slice().sort((a, b) => (a.due || '').localeCompare(b.due || '')).map(r => `<tr><td>${I(`p.recalls.#${r.id}.title`, r.title)}</td><td style="width:160px">${I(`p.recalls.#${r.id}.due`, r.due, {type: 'date'})}</td><td>${I(`p.recalls.#${r.id}.note`, r.note, {ph: 'Ghi chú'})}</td><td class="nowrap">${CB(`p.recalls.#${r.id}.done`, r.done, 'Đã làm')}</td><td><button class="btn xs danger" data-act="recallDel" data-id="${r.id}">Xoá</button></td></tr>`).join('');
  return `<div class="tscroll"><table class="t"><thead><tr><th>Nội dung</th><th>Đến hạn</th><th>Ghi chú</th><th></th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="muted small">Chưa có nhắc hẹn dài hạn</td></tr>'}</tbody></table></div>
  <div class="row" style="margin-top:10px"><span class="small muted">Thêm nhanh:</span>${RECALL_PRESETS.map(([t, m]) => `<button class="btn sm" data-act="recallAdd" data-title="${esc(t)}" data-months="${m}">${esc(t)} (${m >= 12 ? m / 12 + ' năm' : m + ' tháng'})</button>`).join('')}<button class="btn sm" data-act="recallAdd">+ Khác</button></div>`;
}
function tabScreen(p){
  if(ageOf(p) == null) return `<div class="empty">Cần ngày sinh hoặc tuổi để gợi ý sàng lọc.</div>`;
  const l = screenList(p);
  return `<div class="stack"><div class="card"><div class="ch"><h3>Sàng lọc theo tuổi, giới, nguy cơ</h3><span class="small muted">Gợi ý tham khảo (USPSTF, ADA, KDIGO, thực hành châu Á) — tự cập nhật khi nhập kết quả trong lượt khám</span></div>
  <div class="tscroll"><table class="t"><thead><tr><th>Nội dung</th><th>Khuyến cáo</th><th>Lần gần nhất</th><th>Chu kỳ (tháng)</th><th>Trạng thái</th><th></th></tr></thead><tbody>
  ${l.map(s => `<tr><td><b>${esc(s.r.t)}</b></td><td class="small" style="max-width:360px">${esc(s.r.how)}</td><td style="width:160px">${I(`p.screen.${s.r.id}.last`, (s.rec || {}).last, {type: 'date'})}${s.src === 'auto' ? `<div class="tiny muted">Tự động: ${fmtDate(s.last)} (từ lượt khám)</div>` : ''}</td><td style="width:90px">${I(`p.screen.${s.r.id}.every`, (s.rec || {}).every, {num: true, ph: s.def ? String(s.def) : '1 lần'})}</td><td data-live="screenSt" data-id="${s.r.id}"></td><td><button class="btn xs" data-act="screenToday" data-id="${s.r.id}">Hôm nay</button></td></tr>`).join('')}
  </tbody></table></div></div>
  <div class="card"><h3>Nhắc hẹn dài hạn</h3>${recallsHTML(p)}</div></div>`;
}

// ================= LƯỢT KHÁM =================
const STEPS = [[1, 'Lý do & khám'], [2, 'Cận lâm sàng'], [3, 'Chẩn đoán & đơn thuốc'], [4, 'Kế hoạch theo dõi'], [5, 'Liệu pháp không thuốc'], [6, 'In phiếu']];
function stepHas(v, n){ return n === 1 ? !!(v.reason || v.hpi) : n === 2 ? v.orders.length > 0 : n === 3 ? !!(v.dx.main || v.rx.length) : n === 4 ? !!(v.plan.followDate || v.plan.returnSigns) : n === 5 ? !!(v.nutrition.text || v.activity.text || v.rehab.text || v.tcm.text || v.psych.text) : false; }
function stepsBarHTML(){ const v = curV(), st = S.view.step || 1; return STEPS.map(([n, l]) => `<button class="${st === n ? 'on' : ''} ${stepHas(v, n) ? 'has' : ''}" data-act="step" data-step="${n}"><span class="n">${n < 6 ? n : '⎙'}</span>${l}</button>`).join(''); }
function viewVisit(){
  const p = curP(), v = curV(), st = S.view.step || 1;
  const body = [null, step1, step2, step3, step4, step5, step6][st](p, v);
  return `<div class="page">
  <div class="row between" style="margin-bottom:12px"><button class="btn ghost" data-act="openP" data-id="${p.id}">← Hồ sơ ${esc(p.name)}</button>
    <div class="row" style="align-items:end">${F('Ngày khám', I('v.date', v.date, {type: 'date'}))}${F('Loại', SEL('v.kind', v.kind, [['clinic','Khám tại phòng khám'],['old','Hồ sơ cũ / nơi khác']]))}${v.kind === 'old' ? F('Nơi khám', I('v.place', v.place, {ph: 'vd. Bệnh viện tỉnh'})) : ''}${F('Trạng thái', SEL('v.status', v.status, [['draft','Đang khám'],['done','Hoàn tất']]))}<button class="btn danger sm" data-act="delV" style="margin-bottom:4px">Xoá lượt khám</button></div></div>
  <div class="steps" data-live="stepsBar"></div>
  <div class="vgrid"><div class="stack">${body}
    <div class="row between" style="margin-top:16px">${st > 1 ? `<button class="btn" data-act="step" data-step="${st - 1}">← ${STEPS[st - 2][1]}</button>` : '<span></span>'}${st < 6 ? `<button class="btn pri" data-act="step" data-step="${st + 1}">${STEPS[st][1]} →</button>` : `<button class="btn pri" data-act="finish">Hoàn tất lượt khám</button>`}</div>
  </div><aside class="ctx" data-live="ctx"></aside></div></div>`;
}
function ctxHTML(){
  const p = curP(), v = curV(), res = getChk(), ctx = res.ctx, b = bmiOf(p.weight, p.height);
  const prev = p.visits.filter(x => x !== v && x.date <= v.date).sort((a, b) => b.date.localeCompare(a.date))[0];
  const al = (p.allergies || []).map(k => (ALLERGY.find(x => x.k === k) || {}).t).filter(Boolean).concat(p.allergyText ? [p.allergyText] : []);
  const cnt = [3, 2, 1].map(lv => [lv, res.items.filter(w => w.lv === lv).length]).filter(x => x[1]);
  return `<div class="card"><h4>Bối cảnh bệnh nhân</h4>
  <div class="line"><b>${esc(p.name)}</b> · ${ctx.age ?? '?'} tuổi · ${esc(p.sex || '')}${p.job ? ' · ' + esc(p.job) : ''}</div>
  <div class="line">${b ? `BMI ${fmtN(b, 1)} (${bmiClass(b)}) · ${fmtN(num(p.weight), 1)} kg` : '<span class="muted">Chưa có cân nặng / chiều cao</span>'}</div>
  <div class="line">${ctx.renal && ctx.renal.egfr != null ? `eGFR ≈ <b>${fmtN(ctx.renal.egfr)}</b> (${ctx.renal.stage})${ctx.renal.crcl ? ` · CrCl ≈ ${fmtN(ctx.renal.crcl)}` : ''}<div class="tiny muted">${esc(ctx.renal.src)}</div>` : '<span class="muted">Chưa có creatinin / eGFR</span>'}</div>
  <h4>Bệnh nền</h4>${(p.conds || []).length ? (p.conds || []).map(k => chip(condLabel(k), 'pri')).join(' ') : '<span class="muted small">Chưa ghi nhận</span>'}
  <h4>Dị ứng</h4>${al.length ? al.map(x => chip(x, 'r3')).join(' ') : p.noAllergy ? chip('Không dị ứng thuốc', 'ok') : chip('Chưa hỏi', 'r2')}
  <h4>Thuốc đang dùng dài hạn</h4>${ctx.longMeds.length ? '<ul>' + ctx.longMeds.map(m => `<li>${esc(m.name)}</li>`).join('') + '</ul>' : '<span class="muted small">Không</span>'}
  ${p.social ? `<h4>Hoàn cảnh</h4><div class="line">${esc(p.social)}</div>` : ''}
  <h4>Lần khám trước</h4>${prev ? `<div class="line"><b>${fmtDate(prev.date)}</b>${prev.kind === 'old' && prev.place ? ' · ' + esc(prev.place) : ''}</div><div class="line">${esc(prev.dx.main || prev.reason || '—')}</div>${prev.rx.length ? `<div class="tiny muted">Đơn: ${esc(prev.rx.map(l => (drugById(l.drugId) || {}).n).filter(Boolean).join(', '))}</div>` : ''}<button class="btn xs" style="margin-top:6px" data-act="openV" data-id="${prev.id}">Xem lượt khám này</button>` : '<span class="muted small">Chưa có</span>'}
  </div>
  <div class="card"><h4>Cảnh báo đơn thuốc</h4>${!v.rx.length ? '<span class="muted small">Chưa kê thuốc</span>' : cnt.length ? '<div class="wsum">' + cnt.map(([lv, n]) => chip(`${n} ${LV_LABEL[lv].toLowerCase()}`, 'r' + lv)).join('') + `</div>${(S.view.step || 1) !== 3 ? '<button class="btn xs" style="margin-top:8px" data-act="step" data-step="3">Xem chi tiết</button>' : ''}` : chip('Không có cảnh báo', 'ok')}</div>`;
}

function step1(p, v){
  return `<div class="card"><h3>1. Lý do đến khám</h3>${T('v.reason', v.reason, {rows: 2, ph: 'vd. Đau bụng vùng thượng vị 2 tuần'})}</div>
  <div class="card"><h3>Bệnh sử – triệu chứng</h3>${T('v.hpi', v.hpi, {rows: 4, ph: 'Diễn biến, tính chất triệu chứng, thuốc đã tự dùng…'})}</div>
  <div class="card"><div class="ch"><h3>Sinh hiệu</h3><div data-live="bmiV"></div></div><div class="g4">
    ${F('HA tâm thu', U('v.vitals.sbp', v.vitals.sbp, 'mmHg'))}${F('HA tâm trương', U('v.vitals.dbp', v.vitals.dbp, 'mmHg'))}${F('Mạch', U('v.vitals.pulse', v.vitals.pulse, 'l/ph'))}${F('Nhiệt độ', U('v.vitals.temp', v.vitals.temp, '°C'))}
    ${F('SpO₂', U('v.vitals.spo2', v.vitals.spo2, '%'))}${F('Cân nặng', U('v.vitals.weight', v.vitals.weight, 'kg'))}${F('Chiều cao', U('v.vitals.height', v.vitals.height, 'cm'))}${F('Vòng eo', U('v.vitals.waist', v.vitals.waist, 'cm'))}
  </div></div>
  <div class="card"><h3>Khám lâm sàng</h3>${T('v.exam', v.exam, {rows: 4, ph: 'Khám bụng, tim phổi, khớp…'})}</div>
  ${mentalCard(p, v)}`;
}
// Khám tâm thần: thu gọn mặc định, tự mở khi chẩn đoán mã F, có bệnh nền trầm cảm/lo âu, hoặc đã từng khám tâm thần
function mentalOpen(p, v){ const o = (S.mOpen || {})[v.id]; if(o != null) return o; return hasMental(v) || /^F/i.test(v.dx.icd || '') || (p.conds || []).includes('depression') || p.visits.some(x => x !== v && hasMental(x)); }
function mentalCard(p, v){
  const open = mentalOpen(p, v), m = v.mental || {};
  const head = `<div class="ch"><h3>Khám tâm thần <span class="small muted">(không in lên phiếu bệnh nhân)</span></h3><button class="btn sm" data-act="mentalToggle">${open ? 'Thu gọn' : 'Mở bảng kiểm'}</button></div>`;
  if(!open) return `<div class="card">${head}<div class="small muted">Bảng kiểm triệu chứng trầm cảm, hưng cảm, lo âu theo BYT 2020 — dùng để gợi ý chẩn đoán ở bước 3.</div></div>`;
  const srcTxt = src => /^Bài/.test(src) ? 'BYT 2020, ' + src : src;
  const grp = (t, src, body) => `<div class="mgrp"><span class="lbl">${esc(t)} <span class="tiny muted">${esc(srcTxt(src))}</span></span><div class="checks">${body}</div></div>`;
  const OPEN_G = ['dep_core', 'dep_common', 'dep_som', 'man_a', 'man_b', 'mix', 'psy', 'anx'], sxSet = new Set(m.sx || []);
  const grpX = g => { const body = g.items.map(([k, l]) => CL('v.mental.sx', m.sx, k, l)).join('');
    if(OPEN_G.includes(g.g)) return grp(g.t, g.src, body);
    const n = g.items.filter(([k]) => sxSet.has(k)).length;
    return `<details class="mgrp mdet" data-g="${g.g}"${n ? ' open' : ''}><summary><span class="lbl">${esc(g.t)}${n ? ` <span class="chip pri">${n}</span>` : ''} <span class="tiny muted">${esc(srcTxt(g.src))}</span></span></summary><div class="checks">${body}</div></details>`; };
  return `<div class="card">${head}<div data-live="mentalSum"></div>
    ${MENTAL_SX.map(g => grpX(g) + (g.g === 'dep_som' ? `<div class="mgrp">${CB('v.mental.severe', m.severe, '<b>Một số triệu chứng đặc biệt nặng</b> <span class="tiny muted">— điều kiện của trầm cảm nặng (BYT 2020, Bài 20); bác sĩ đánh giá</span>')}</div>` : '')).join('')}
    <div class="g3 mgrp">${F('Thời gian kéo dài giai đoạn hiện tại', U('v.mental.weeks', m.weeks, 'tuần'))}<div class="field spanall"><label>Mức ảnh hưởng chức năng</label><div class="row">${MENTAL_IMPAIR.map(([k, l]) => RAD('v.mental.impair', m.impair, k, l)).join('')}</div></div></div>
    ${grp('Tiền sử giai đoạn khí sắc', 'Bài 19, 21', MENTAL_HIST.map(([k, l]) => CL('v.mental.hist', m.hist, k, l)).join(''))}
    ${grp('Yếu tố cần loại trừ', 'Bài 18–23', MENTAL_EXCL.map(([k, l]) => CL('v.mental.excl', m.excl, k, l)).join(''))}
    <div class="g2 mgrp">${F('Nhân cách tiền bệnh lý', T('v.mental.premorbid', m.premorbid, {rows: 2, ph: 'Tính cách, cách ứng xử, quan hệ xã hội, đối phó căng thẳng trước khi khởi bệnh…'}))}${F('Tiền sử sang chấn', T('v.mental.trauma', m.trauma, {rows: 2, ph: 'Sự kiện sang chấn (mất mát, bạo lực, tai nạn…), thời điểm, ảnh hưởng…'}))}</div>
    <div class="mgrp">${F('Mô tả thêm (ý thức, định hướng, tư duy, tri giác, hành vi…)', T('v.mental.text', m.text, {rows: 3}))}</div></div>`;
}
function mentalSumHTML(){
  const v = curV(), c = psyCounts(v);
  const out = [chip(`Trầm cảm: ${c.core}/3 chính · ${c.common}/7 phổ biến · ${c.som}/8 cơ thể`, c.core >= 2 ? 'r2' : ''), chip(`Hưng cảm: A ${c.manA ? 'có' : 'không'} · B ${c.manB}/9`, c.manA && c.manB >= 3 ? 'r2' : '')];
  const sc = [...c.sx].filter(k => k.startsWith('scoff_')).length;
  if(sc) out.push(chip(`SCOFF = ${sc}/5${sc >= 2 ? ': nghi rối loạn ăn uống — đánh giá thêm (EDE-Q 6.0, BMI, điện giải, ECG)' : ''}`, sc >= 2 ? 'r2' : ''));
  if(c.sx.has('dep_suicide')) out.push(`<div class="w l3" style="margin-top:6px"><div class="wt">Có ý tưởng / hành vi tự sát</div><div>Đánh giá nguy cơ tự sát ngay trong buổi khám (C-SSRS); cân nhắc nhập viện hoặc chuyển chuyên khoa tâm thần.</div></div>`);
  return out.join(' ');
}
function dxSugHTML(){
  const p = curP(), v = curV();
  if(!hasMental(v)) return '<div class="small muted">Điền mục <b>Khám tâm thần</b> ở bước 1 để nhận gợi ý.</div>';
  const r = psyDx(p, v), cur = String(v.dx.icd || '').split(' ')[0];
  let h = r.alerts.map(a => `<div class="w l${a.lv}"><div class="wt">${lvChip(a.lv)}${esc(a.t)}</div><div>${esc(a.m)}</div></div>`).join('');
  h += r.sugs.length ? r.sugs.map(s => `<div class="sug${s.ok ? ' ok' : ''}"><div class="wt"><span>${s.ok ? chip('Đủ tiêu chuẩn', 'ok') : chip('Chưa đủ', 'r1')} ${esc(s.code)} – ${esc(s.name)}</span>${cur === s.code ? chip('Đang chọn', 'pri') : `<button class="btn xs${s.ok ? ' pri' : ''}" data-act="dxPick" data-code="${esc(s.code)}">Chọn chẩn đoán này</button>`}</div>
    ${s.met.length ? `<div class="small"><b>Đã thỏa:</b> ${s.met.map(esc).join('; ')}</div>` : ''}${s.miss.length ? `<div class="small"><b>Còn thiếu / cần xem lại:</b><ul>${s.miss.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}${s.note ? `<div class="tiny muted">${esc(s.note)}</div>` : ''}<div class="tiny muted">Nguồn: BYT 2020 (QĐ 2058/QĐ-BYT), ${esc(s.src)}</div></div>`).join('')
    : '<div class="small muted">Các triệu chứng đã ghi chưa gợi ý rối loạn nào trong các nhóm đã có bảng kiểm (F00–F05, F10, F17, F30–F33, F40–F45, F50–F52, F63, F70–F73, F84, F90–F91, F98).</div>';
  if(r.todo.length) h += `<div class="w l1" style="margin-top:8px"><div class="wt">Nên làm thêm</div>${r.todo.map(t => `<div>• ${esc(t)}</div>`).join('')}</div>`;
  return h + '<div class="tiny muted" style="margin-top:6px">Gợi ý dựa trên bảng kiểm, không thay thế đánh giá lâm sàng của bác sĩ.</div>';
}
function step2(p, v){
  const inPanel = new Set(LAB_PANELS.flatMap(x => x.keys));
  const groups = {}; LABS.filter(l => !inPanel.has(l[1])).forEach(l => (groups[l[0]] = groups[l[0]] || []).push(l));
  const keys = new Set(v.orders.map(o => o.key));
  const ordered = `<div class="g3">${Object.entries(groups).map(([g, ls]) => `<div><div class="lbl">${esc(g)}</div>${LAB_PANELS.filter(x => x.g === g).map(x => `<label class="check"><input type="checkbox" data-act="ordPanel" data-id="${x.id}"${x.keys.every(k => keys.has(k)) ? ' checked' : ''}> <span><b>${esc(x.name)}</b></span></label>`).join('')}${ls.map(l => `<label class="check"><input type="checkbox" data-act="ord" data-key="${l[1]}"${keys.has(l[1]) ? ' checked' : ''}> <span>${esc(l[2])}</span></label>`).join('')}</div>`).join('')}</div>
  <div class="row" style="margin-top:10px"><input type="text" id="ordCustom" placeholder="Chỉ định khác (vd. Xquang khớp gối)…" style="max-width:420px"><button class="btn" data-act="ordCustom">+ Thêm</button></div>`;
  const seenPn = new Set(), list = [];
  v.orders.forEach(o => { const pn = LAB_PANELS.find(x => x.keys.includes(o.key)); if(!pn){ list.push(o); return; } if(seenPn.has(pn.id)) return; seenPn.add(pn.id);
    list.push({_hdr: pn.name}); pn.keys.forEach(k => v.orders.filter(x => x.key === k).forEach(x => list.push(x))); });
  const rows = list.map(o => o._hdr ? `<tr class="panel-hdr"><td colspan="5"><b>${esc(o._hdr)}</b></td></tr>` : o.type === 't'
    ? `<tr><td style="width:30%"><b>${esc(o.name)}</b>${o.ref ? `<div class="tiny muted">BT: ${esc(o.ref)}</div>` : ''}</td><td colspan="3">${T(`v.orders.#${o.id}.value`, o.value, {rows: 2, ph: 'Kết quả / mô tả'})}</td><td><button class="btn xs danger" data-act="ordDel" data-id="${o.id}">✕</button></td></tr>`
    : `<tr><td style="width:30%"><b>${esc(o.name)}</b>${o.ref ? `<div class="tiny muted">Tham chiếu: ${esc(o.ref)}</div>` : ''}</td><td style="width:150px">${U(`v.orders.#${o.id}.value`, o.value, o.unit || '')}</td><td style="width:140px">${SEL(`v.orders.#${o.id}.flag`, o.flag, [['', '— đánh giá —']].concat(FLAG_OPTS[o.key] ? FLAG_OPTS[o.key].map(x => [x, x]) : [['BT', 'Bình thường'], ['Cao', 'Cao'], ['Thấp', 'Thấp'], ['BTh', 'Bất thường']]))}</td><td>${I(`v.orders.#${o.id}.note`, o.note, {ph: 'Ghi chú'})}</td><td><button class="btn xs danger" data-act="ordDel" data-id="${o.id}">✕</button></td></tr>`
      + (SCALE_BANDS[o.key] ? `<tr class="scale-row"><td><b>Kết quả</b><div class="tiny muted">tự diễn giải theo tổng điểm</div></td><td colspan="3" data-live="scale" data-id="${o.id}"></td><td></td></tr>` : '')
      + (o.key === 'creat' ? `<tr class="egfr-row"><td><b>Mức lọc cầu thận (eGFR)</b><div class="tiny muted">CKD-EPI 2021 · tự tính từ creatinin, tuổi, giới</div></td><td colspan="3" data-live="egfr" data-id="${o.id}"></td><td></td></tr>` : '')).join('');
  return `<div class="card"><h3>2. Chỉ định cận lâm sàng</h3>${ordered}</div>
  <div class="card"><h3>Kết quả</h3>${v.orders.length ? `<div class="tscroll"><table class="t"><tbody>${rows}</tbody></table></div>` : '<div class="empty small">Chọn chỉ định ở trên, kết quả sẽ nhập tại đây.</div>'}</div>
  <div class="card"><div class="ch"><h3>Ảnh, file kết quả</h3><label class="btn sm">+ Đính kèm ảnh / PDF<input type="file" id="fileUp" accept="image/*,application/pdf" multiple hidden></label></div>
  ${(v.files || []).length ? `<div class="row">${v.files.map(f => `<span class="chip">${esc(f.name)} <button class="btn xs ghost" data-act="fileOpen" data-id="${f.id}">Mở</button><button class="btn xs ghost" data-act="fileDel" data-id="${f.id}">✕</button></span>`).join('')}</div>` : '<div class="small muted">Chụp phiếu kết quả, ảnh siêu âm, nội soi… (tối đa ' + (Store.mode === 'dir' ? 50 : 8) + ' MB mỗi file).</div>'}</div>`;
}
function tplChips(cat, path, ctx, rxTags){
  const all = S.tpls.filter(t => t.cat === cat);
  const sug = all.filter(t => tplMatches(t, ctx, rxTags)), other = all.filter(t => !sug.includes(t));
  return `<div class="tplchips">${sug.map(t => `<span class="chip pri click" data-act="tplIns" data-id="${t.id}" data-path="${path}" title="Chèn mẫu">★ ${esc(t.title)}</span>`).join('')}${other.length ? `<select class="tplsel" data-path="${path}" style="width:auto;padding:2px 8px;font-size:13px"><option value="">+ Chèn mẫu khác…</option>${other.map(t => `<option value="${t.id}">${esc(t.title)}</option>`).join('')}</select>` : ''}</div>`;
}
function rxTagsOf(v){ const s = new Set(); (v.rx || []).forEach(l => { const d = drugById(l.drugId); if(d) expandTags(d.tags).forEach(t => s.add(t)); }); return s; }
function step3(p, v){
  const ctx = getChk().ctx, rxt = rxTagsOf(v);
  const rows = v.rx.map(l => { const d = drugById(l.drugId); if(!d) return `<tr><td colspan="9" class="muted">Thuốc đã bị xoá khỏi danh mục <button class="btn xs danger" data-act="rxDel" data-id="${l.id}">Xoá dòng</button></td></tr>`;
    const b = k => `<td class="num" style="width:58px">${I(`v.rx.#${l.id}.${k}`, l[k], {num: true})}</td>`;
    return `<tr class="rxline"><td style="min-width:190px"><b>${esc(d.n)}</b> ${originBadge(d)}<div class="tiny muted">${esc(d.hc)} · ${money(d.p)}/${esc(d.u)}</div></td>${b('s')}${b('tr')}${b('c')}${b('t')}<td class="num" style="width:60px">${I(`v.rx.#${l.id}.days`, l.days, {num: true})}</td><td class="nowrap" data-live="rxqty" data-id="${l.id}"></td><td class="right nowrap" data-live="rxcost" data-id="${l.id}"></td><td class="nowrap right"><button class="btn xs" data-act="cmpOpen" data-line="${l.id}" title="So sánh với thuốc cùng nhóm">⇄ So sánh</button> <button class="btn xs danger" data-act="rxDel" data-id="${l.id}" title="Bỏ khỏi đơn">✕</button></td></tr>
    <tr class="rxwarn"><td colspan="9"><div class="rxsub"><div class="how">${I(`v.rx.#${l.id}.how`, l.how, {list: 'dlHow', ph: 'Cách dùng'})}</div><div data-live="rxw" data-id="${l.id}"></div></div></td></tr>`; }).join('');
  return `<div class="card"><h3>3. Chẩn đoán</h3><div class="g2">
    <div class="dxcol">${F('Mã ICD-10 chẩn đoán chính (gõ để chọn nhanh)', I('v.dx.icd', v.dx.icd, {list: 'dlIcd', ph: 'vd. K29.7 hoặc "viêm dạ dày"'}))}${F('Chẩn đoán chính', T('v.dx.main', v.dx.main, {rows: 2}))}</div>
    <div class="dxcol">${F('Mã ICD-10 chẩn đoán phụ', I('v.dx.icd2', v.dx.icd2, {list: 'dlIcd', ph: 'vd. I10 hoặc "tăng huyết áp"'}))}${F('Chẩn đoán phụ', T('v.dx.secondary', v.dx.secondary, {rows: 2}))}</div>
    <div class="field spanall"><label>Hướng xử trí</label><div class="row">${RAD('v.dx.disp', v.dx.disp, 'outpatient', 'Điều trị ngoại trú')}${RAD('v.dx.disp', v.dx.disp, 'admit', 'Nhập viện')}${RAD('v.dx.disp', v.dx.disp, 'refer', 'Chuyển tuyến')}</div></div>
  </div></div>
  ${hasMental(v) ? '<div class="card"><h3>Gợi ý chẩn đoán tâm thần</h3><div data-live="dxsug"></div></div>' : ''}
  <div class="card"><div class="ch"><h3>Đơn thuốc</h3><div class="row"><select id="cmpG" style="width:auto" title="Chọn nhóm: ô tên thuốc chỉ hiện thuốc của nhóm này">${[['', 'Tất cả nhóm thuốc'], ...Object.entries(GROUPS)].map(([k, l]) => `<option value="${k}"${k === (S.rxG || '') ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select><button class="btn sm" data-act="cmpOpen"${S.rxG ? '' : ' disabled title="Chọn một nhóm thuốc trước"'}>So sánh lựa chọn trong nhóm</button></div></div>
    <div class="dsearch"><input type="search" id="dq" placeholder="${S.rxG ? `Thuốc nhóm ${esc(GROUPS[S.rxG])} — bấm vào đây để xem cả nhóm, hoặc gõ để lọc…` : 'Gõ tên thuốc hoặc hoạt chất để thêm vào đơn (Enter để chọn)…'}" autocomplete="off"><div class="dres" id="dres" hidden></div></div>
    ${v.rx.length ? `<div class="tscroll" style="margin-top:12px"><table class="t"><thead><tr><th>Thuốc</th><th class="c">Sáng</th><th class="c">Trưa</th><th class="c">Chiều</th><th class="c">Tối</th><th class="c">Ngày</th><th>SL</th><th class="right">Thành tiền</th><th></th></tr></thead><tbody>${rows}</tbody></table></div><div class="right small" style="margin-top:8px" data-live="rxtotal"></div>` : '<div class="empty small" style="margin-top:12px">Chưa có thuốc. Mỗi thuốc thêm vào sẽ được kiểm tra với bệnh nền, chức năng thận, tuổi, dị ứng và thuốc đang dùng dài hạn.</div>'}
    <div style="margin-top:12px">${F('Lời dặn', T('v.rxNote', v.rxNote, {rows: 2}))}${tplChips('advice', 'v.rxNote', ctx, rxt)}</div></div>
  <div class="card" id="norxCard"><h3>Không kê đơn <span class="small muted">(chỉ chọn khi lượt khám này không có thuốc)</span></h3>
    <div class="row">${NO_RX.map(([k, l]) => RAD('v.noRx.reason', (v.noRx || {}).reason, k, l)).join('')}${(v.noRx || {}).reason ? '<button class="btn xs ghost" data-act="noRxClear">Bỏ chọn</button>' : ''}</div>
    <div style="margin-top:8px">${I('v.noRx.note', (v.noRx || {}).note, {ph: 'Ghi chú (bắt buộc khi chọn "Lý do khác"), vd. đang dùng đơn của BV tỉnh đến 30/10'})}</div>
    <div data-live="rxgate" style="margin-top:8px"></div></div>
  <div class="card"><h3>Kiểm tra an toàn đơn thuốc</h3><div data-live="warn"></div></div>`;
}
// Có chẩn đoán thì phải có thuốc trong đơn, hoặc chọn lý do không kê đơn, mới được sang bước 4 (hồ sơ cũ nơi khác được miễn)
const NO_RX = [['home', 'Bệnh nhân còn thuốc tại nhà'], ['none', 'Không có bệnh / không cần dùng thuốc'], ['consult', 'Chỉ khám và nghe tư vấn'], ['other', 'Lý do khác']];
function rxGate(v){
  if(!v || v.kind === 'old' || (v.rx || []).length) return '';
  const hasDx = String(v.dx.main || '').trim() || String(v.dx.icd || '').trim(), nr = v.noRx || {};
  if(!hasDx && !nr.reason) return '';
  if(!nr.reason) return 'Đã có chẩn đoán nhưng chưa có thuốc trong đơn. Anh kê thuốc, hoặc chọn một lý do ở mục "Không kê đơn".';
  if(nr.reason === 'other' && !String(nr.note || '').trim()) return 'Chọn "Lý do khác" thì cần ghi rõ lý do ở ô ghi chú.';
  return '';
}
function rxGateHTML(){
  const v = curV(), m = rxGate(v), nr = v.noRx || {};
  if(m) return `<div class="w l2"><div class="wt">Chưa thể sang bước 4 – Kế hoạch theo dõi</div><div>${esc(m)}</div></div>`;
  if(v.rx.length) return nr.reason ? '<span class="small muted">Đơn đã có thuốc — lựa chọn "Không kê đơn" sẽ không được dùng.</span>' : '';
  return nr.reason ? chip('Không kê đơn: ' + (NO_RX.find(x => x[0] === nr.reason) || ['', ''])[1], 'ok') : '';
}
function warnHTML(){
  const v = curV(), res = getChk();
  if(!v.rx.length) return '<div class="small muted">Chưa có thuốc trong đơn.</div>';
  if(!res.items.length) return '<div class="w l1"><div class="wt">Không phát hiện cảnh báo trong danh mục</div><div>Bác sĩ vẫn cần kiểm tra lại.</div></div>';
  return res.items.map(w => `<div class="w l${w.lv}"><div class="wt">${lvChip(w.lv)}${esc(w.kind)} · ${esc(w.title)}</div><div>${esc(w.m)}</div></div>`).join('');
}
function step4(p, v){
  const ctx = getChk().ctx, rxt = rxTagsOf(v);
  return `<div class="card"><h3>4. Tái khám</h3><div class="row" style="margin-bottom:10px">${[[3, '3 ngày'], [7, '1 tuần'], [14, '2 tuần'], [30, '1 tháng'], [90, '3 tháng']].map(([d, l]) => `<button class="btn sm ${num(v.plan.followDays) === d ? 'pri' : ''}" data-act="follow" data-days="${d}">${l}</button>`).join('')}</div>
    <div class="g3">${F('Tái khám sau (ngày)', I('v.plan.followDays', v.plan.followDays, {num: true}))}${F('Ngày tái khám', I('v.plan.followDate', v.plan.followDate, {type: 'date'}))}<div></div>
    ${F('Khi tái khám cần làm', T('v.plan.followReason', v.plan.followReason, {rows: 2, ph: 'vd. Đánh giá đáp ứng, kiểm tra INR'}), 'spanall')}</div></div>
  <div class="card"><h3>Dấu hiệu cần quay lại khám ngay</h3>${T('v.plan.returnSigns', v.plan.returnSigns, {rows: 3})}${tplChips('return', 'v.plan.returnSigns', ctx, rxt)}</div>
  <div class="card"><h3>Nhắc hẹn dài hạn <span class="small muted">(lưu vào hồ sơ bệnh nhân)</span></h3>${recallsHTML(p)}</div>
  <div class="card"><div class="ch"><h3>Sàng lọc theo tuổi, giới, nguy cơ</h3><button class="btn sm" data-act="openP" data-id="${p.id}" data-tab="screen">Mở bảng sàng lọc</button></div><div data-live="screenSum"></div></div>
  <div class="card"><h3>Ghi chú kế hoạch</h3>${T('v.plan.notes', v.plan.notes, {rows: 2})}</div>`;
}
function nutriHTML(){
  const p = curP(), v = curV(), n = nutriCalc(p, v);
  if(!n) return '<div class="small muted">Cần cân nặng, chiều cao, tuổi và giới để tính.</div>';
  const seg = (pct, c) => `<i style="width:${Math.max(0, pct)}%;background:${c}"></i>`;
  return `<div class="nout">
    <div class="nbox"><div class="k">BMI</div><div class="v">${fmtN(n.bmi, 1)}</div><div class="s">${n.bmiCls} · cân nặng lý tưởng ≈ ${fmtN(n.ibw, 1)} kg</div></div>
    <div class="nbox"><div class="k">Chuyển hoá cơ bản → nhu cầu</div><div class="v">${fmtN(n.tdee)} <small style="font-size:13px">kcal</small></div><div class="s">BMR ${fmtN(n.bmr)} × ${fmtN(n.fac, 3)} (Mifflin-St Jeor)</div></div>
    <div class="nbox" style="border-color:var(--pri);background:var(--priSoft)"><div class="k">Mục tiêu năng lượng</div><div class="v">${fmtN(n.target)} <small style="font-size:13px">kcal/ngày</small></div><div class="s">${n.goal === 'lose' ? 'Giảm cân' : n.goal === 'gain' ? 'Tăng cân' : 'Duy trì'}</div></div>
    <div class="nbox"><div class="k">Đạm</div><div class="v">${fmtN(n.protG)} <small style="font-size:13px">g/ngày</small></div><div class="s">${fmtN(n.gkg, 2)} g/kg × ${fmtN(n.wP, 1)} kg</div></div>
  </div>
  <div class="bar">${seg(n.carbPct, '#e0a84b')}${seg(n.protPct, '#0e6655')}${seg(n.fatPct, '#7a8fd6')}</div>
  <table class="t"><thead><tr><th>Thành phần</th><th class="right">g/ngày</th><th class="right">kcal</th><th class="right">% năng lượng</th></tr></thead><tbody>
    <tr><td><span class="chip" style="background:#fbecd2">Bột đường (carbohydrat)</span></td><td class="right">${fmtN(n.carbG)}</td><td class="right">${fmtN(n.carbG * 4)}</td><td class="right">${fmtN(n.carbPct)}%</td></tr>
    <tr><td><span class="chip pri">Đạm (protein)</span></td><td class="right">${fmtN(n.protG)}</td><td class="right">${fmtN(n.protG * 4)}</td><td class="right">${fmtN(n.protPct)}%</td></tr>
    <tr><td><span class="chip r1">Béo (lipid)</span></td><td class="right">${fmtN(n.fatG)}</td><td class="right">${fmtN(n.fatG * 9)}</td><td class="right">${fmtN(n.fatPct)}%</td></tr>
  </tbody></table>
  <div class="small" style="margin-top:8px"><b>Chia bữa:</b> ${MEALS.map(([m, f]) => `${m} ~${fmtN(Math.round(n.target * f / 10) * 10)} kcal`).join(' · ')}. ${n.salt}; ${n.fiber}.</div>
  ${n.notes.length ? `<div class="note" style="margin-top:8px">${n.notes.map(esc).join('<br>')}</div>` : ''}`;
}
function moodHTML(){
  const v = curV(), q = num(v.psych.phq9), g = num(v.psych.gad7), out = [];
  if(q != null){ const l = q >= 20 ? ['nặng', 'r3'] : q >= 15 ? ['vừa – nặng', 'r3'] : q >= 10 ? ['vừa', 'r2'] : q >= 5 ? ['nhẹ', 'r1'] : ['tối thiểu', 'ok']; out.push(chip(`PHQ-9 = ${q}: trầm cảm ${l[0]}`, l[1])); }
  if(g != null){ const l = g >= 15 ? ['nặng', 'r3'] : g >= 10 ? ['vừa', 'r2'] : g >= 5 ? ['nhẹ', 'r1'] : ['tối thiểu', 'ok']; out.push(chip(`GAD-7 = ${g}: lo âu ${l[0]}`, l[1])); }
  if(v.psych.item9) out.push(`<div class="w l3" style="margin-top:6px"><div class="wt">Có ý nghĩ tự hại (PHQ-9 câu 9 > 0)</div><div>Đánh giá nguy cơ tự sát ngay trong buổi khám; cân nhắc chuyển chuyên khoa tâm thần.</div></div>`);
  return out.join(' ') || '<span class="small muted">Nhập tổng điểm PHQ-9 / GAD-7 để phân loại.</span>';
}
function step5(p, v){
  const ctx = getChk().ctx, rxt = rxTagsOf(v), n = v.nutrition;
  const jointDefault = (p.conds || []).includes('oa');
  return `<div class="card"><h3>5. Dinh dưỡng</h3><div class="g4">
    ${F('Cân nặng', U('v.nutrition.weight', n.weight, 'kg', {ph: String(num(v.vitals.weight) ?? num(p.weight) ?? '')}))}${F('Chiều cao', U('v.nutrition.height', n.height, 'cm', {ph: String(num(v.vitals.height) ?? num(p.height) ?? '')}))}
    ${F('Mức hoạt động', SEL('v.nutrition.activity', n.activity || p.activity || 'sedentary', Object.entries(ACT_LV).map(([k, x]) => [k, x.t])), 'span2')}
    ${F('Mục tiêu', SEL('v.nutrition.goal', n.goal || '', [['', 'Tự động theo BMI'], ['lose', 'Giảm cân'], ['keep', 'Duy trì'], ['gain', 'Tăng cân']]))}${F('Thâm hụt khi giảm cân', U('v.nutrition.deficit', n.deficit, 'kcal', {ph: '500'}))}
    ${F('Đạm', U('v.nutrition.proteinGkg', n.proteinGkg, 'g/kg', {ph: 'tự động'}))}${F('Béo', U('v.nutrition.fatPct', n.fatPct, '%', {ph: '25'}))}
    ${F('Đặt năng lượng thủ công (nếu cần)', U('v.nutrition.kcal', n.kcal, 'kcal', {ph: 'để trống = tự tính'}), 'span2')}
  </div><div style="margin-top:12px" data-live="nutri"></div>
  <div style="margin-top:12px">${F('Chế độ ăn (in cho bệnh nhân)', T('v.nutrition.text', n.text, {rows: 4}))}${tplChips('diet', 'v.nutrition.text', ctx, rxt)}</div></div>
  <div class="card"><h3>Hoạt động thể lực</h3><div class="g3">${F('Vận động mức vừa hiện tại', U('v.activity.minutes', v.activity.minutes, 'phút/tuần', {ph: String(num(p.exerciseMin) ?? '')}))}<div class="field"><label>&nbsp;</label>${CB('v.activity.joint', v.activity.joint ?? jointDefault, 'Có đau khớp — tránh tải lực lên khớp')}</div></div>
    <div style="margin:10px 0" data-live="act"></div>${T('v.activity.text', v.activity.text, {rows: 4})}${tplChips('exercise', 'v.activity.text', ctx, rxt)}</div>
  <div class="card"><h3>Phục hồi chức năng</h3>${T('v.rehab.text', v.rehab.text, {rows: 4})}${tplChips('rehab', 'v.rehab.text', ctx, rxt)}</div>
  <div class="card"><h3>Y học cổ truyền</h3><div data-live="tcmNote" style="margin-bottom:8px"></div>${T('v.tcm.text', v.tcm.text, {rows: 4})}${tplChips('tcm', 'v.tcm.text', ctx, rxt)}</div>
  <div class="card"><h3>Tâm lý</h3><div class="g3">${F('PHQ-9 (0–27)', I('v.psych.phq9', v.psych.phq9, {num: true}))}${F('GAD-7 (0–21)', I('v.psych.gad7', v.psych.gad7, {num: true}))}<div class="field"><label>&nbsp;</label>${CB('v.psych.item9', v.psych.item9, 'PHQ-9 câu 9 > 0 (ý nghĩ tự hại)')}</div></div>
    <div style="margin:10px 0" data-live="mood"></div>${T('v.psych.text', v.psych.text, {rows: 4})}${tplChips('psych', 'v.psych.text', ctx, rxt)}</div>`;
}
const PRINT_OPTS = [['reason', 'Lý do khám'], ['dx', 'Chẩn đoán'], ['labs', 'Kết quả cận lâm sàng'], ['rx', 'Đơn thuốc'], ['ae', 'Tác dụng phụ hay gặp'], ['plan', 'Lịch tái khám'], ['ret', 'Dấu hiệu cần quay lại'], ['diet', 'Dinh dưỡng'], ['act', 'Vận động'], ['rehab', 'Phục hồi chức năng'], ['tcm', 'Y học cổ truyền'], ['psych', 'Tâm lý'], ['price', 'Hiện giá thuốc']];
function step6(p, v){
  return `<div class="card"><div class="ch"><h3>Phiếu cho bệnh nhân</h3><button class="btn pri" data-act="print">⎙ In phiếu</button></div><div class="checks">${PRINT_OPTS.map(([k, l]) => CB(`v.print.${k}`, v.print[k], l)).join('')}</div></div>
  <div style="overflow:auto"><div class="sheet ps" data-live="print"></div></div>`;
}

// ================= PHIẾU IN =================
function sheetHTML(p, v){
  const s = S.settings, o = v.print || {}, a = ageOf(p, v.date);
  const sec = (t, h) => `<h3>${t}</h3>${h}`;
  const pre = t => `<div class="pre">${esc(t)}</div>`;
  let h = `<div class="hdr"><div><b>${esc(s.clinic || '')}</b><div>${esc(s.address || '')}</div><div>${s.phone ? 'ĐT: ' + esc(s.phone) : ''}</div></div><div style="text-align:right"><div>Mã BN: <b>${esc(p.code)}</b></div><div>Ngày khám: ${fmtDate(v.date)}</div></div></div>
  <h1>PHIẾU KHÁM VÀ HƯỚNG DẪN ĐIỀU TRỊ</h1>
  <div class="grid2" style="margin-top:8px"><div>Họ tên: <b>${esc(p.name)}</b></div><div>Tuổi: ${a ?? ''} &nbsp; Giới: ${esc(p.sex || '')}</div><div>Nghề nghiệp: ${esc(p.job || '')}</div><div>Điện thoại: ${esc(p.phone || '')}</div><div style="grid-column:1/-1">Địa chỉ: ${esc(p.address || '')}</div></div>`;
  if(o.reason && v.reason) h += sec('Lý do đến khám', pre(v.reason));
  if(o.dx && (v.dx.main || v.dx.secondary || v.dx.icd2)){ const code = String(v.dx.icd || '').split(' ')[0]; h += sec('Chẩn đoán', `<div><b>${esc(v.dx.main)}</b>${code ? ` (${esc(code)})` : ''}</div>${v.dx.secondary || v.dx.icd2 ? `<div>Chẩn đoán phụ: ${esc(v.dx.secondary || '')}${String(v.dx.icd2 || '').split(' ')[0] ? ` (${esc(String(v.dx.icd2).split(' ')[0])})` : ''}</div>` : ''}<div>Hướng xử trí: ${{outpatient: 'Điều trị ngoại trú', admit: 'Nhập viện', refer: 'Chuyển tuyến'}[v.dx.disp] || ''}</div>`); }
  const labs = v.orders.filter(x => x.value != null && String(x.value).trim() !== '');
  if(o.labs && labs.length){ h += sec('Kết quả cận lâm sàng', `<table><tr><th>Xét nghiệm / thăm dò</th><th>Kết quả</th><th>Đơn vị</th><th>Tham chiếu</th></tr>${labs.map(x => { const e = x.key === 'creat' ? egfrFromOrder(p, v, x) : null; const fl = FLAG_OPTS[x.key] ? (x.flag ? ' (' + esc(x.flag) + ')' : '') : ({BT: '', Cao: ' ↑', Thấp: ' ↓', BTh: ' (bất thường)'}[x.flag] || ''); return x.type === 't' ? `<tr><td>${esc(x.name)}</td><td colspan="3" class="pre">${esc(x.value)}</td></tr>` : `<tr><td>${esc(x.name)}</td><td><b>${typeof x.value === 'number' ? fmtN(x.value, 2) : esc(x.value)}${fl}</b>${(r => r ? ' — ' + esc(r.t) : '')(scaleResult(x.key, x.value))}</td><td>${esc(x.unit || '')}</td><td>${esc(x.ref || '')}</td></tr>` + (e != null ? `<tr><td>Mức lọc cầu thận (eGFR, CKD-EPI 2021)</td><td><b>${fmtN(e)}</b> — ${ckdStage(e)}, ${EGFR_LABEL[ckdStage(e)]}</td><td>mL/phút/1,73m²</td><td>≥ 90</td></tr>` : ''); }).join('')}</table>`); }
  const rx = v.rx.map(l => ({l, d: drugById(l.drugId)})).filter(x => x.d);
  if(o.rx && rx.length){
    const tot = rx.reduce((a, x) => a + rxCost(x.l), 0);
    h += sec('Đơn thuốc', `<table><tr><th class="c">STT</th><th>Tên thuốc – hàm lượng</th><th class="c">Sáng</th><th class="c">Trưa</th><th class="c">Chiều</th><th class="c">Tối</th><th class="c">Số ngày</th><th class="c">Số lượng</th><th>Cách dùng</th>${o.price ? '<th>Thành tiền</th>' : ''}</tr>${rx.map(({l, d}, i) => `<tr><td class="c">${i + 1}</td><td><b>${esc(d.n)}</b><div style="font-size:11px">${esc(d.hc)}</div></td><td class="c">${frac(l.s)}</td><td class="c">${frac(l.tr)}</td><td class="c">${frac(l.c)}</td><td class="c">${frac(l.t)}</td><td class="c">${fmtN(num(l.days))}</td><td class="c">${fmtN(rxQty(l).give)} ${esc(d.u)}</td><td>${esc(l.how || '')}</td>${o.price ? `<td style="text-align:right">${money(rxCost(l))}</td>` : ''}</tr>`).join('')}${o.price ? `<tr><td colspan="9" style="text-align:right"><b>Tổng</b></td><td style="text-align:right"><b>${money(tot)}</b></td></tr>` : ''}</table>${v.rxNote ? `<div style="margin-top:4px"><b>Lời dặn:</b> <span class="pre">${esc(v.rxNote)}</span></div>` : ''}`);
    if(o.ae) h += sec('Tác dụng phụ hay gặp & khi nào cần báo bác sĩ', rx.map(({d}) => `<div style="margin-bottom:3px"><b>${esc(d.n)}:</b> ${esc(d.ae || '')}${d.warn && d.warn !== '—' ? ` <i>Báo bác sĩ khi:</i> ${esc(d.warn)}` : ''}</div>`).join(''));
  }
  const nr = v.noRx || {};
  if(o.rx && !rx.length && nr.reason) h += sec('Đơn thuốc', `<div>Lần khám này không kê đơn thuốc: <b>${esc((NO_RX.find(x => x[0] === nr.reason) || ['', ''])[1])}</b>${nr.note ? ' — ' + esc(nr.note) : ''}.</div>${v.rxNote ? `<div style="margin-top:4px"><b>Lời dặn:</b> <span class="pre">${esc(v.rxNote)}</span></div>` : ''}`);
  if(o.plan){
    const rec = (p.recalls || []).filter(r => !r.done && r.due && r.due > v.date);
    if(v.plan.followDate || rec.length) h += sec('Lịch hẹn', `<div class="box">${v.plan.followDate ? `<div style="font-size:14px">Tái khám: <b>${fmtDate(v.plan.followDate)}</b>${num(v.plan.followDays) ? ` (sau ${fmtN(num(v.plan.followDays))} ngày)` : ''}</div>${v.plan.followReason ? `<div>${esc(v.plan.followReason)}</div>` : ''}` : ''}${rec.map(r => `<div>${esc(r.title)}: khoảng tháng ${r.due.slice(5, 7)}/${r.due.slice(0, 4)}${r.note ? ' — ' + esc(r.note) : ''}</div>`).join('')}<div>Mang theo phiếu này và các kết quả xét nghiệm khi đến khám.</div></div>`);
  }
  if(o.ret && v.plan.returnSigns) h += sec('Đến cơ sở y tế ngay nếu có', `<div class="box pre">${esc(v.plan.returnSigns)}</div>`);
  if(o.diet){ const n = nutriCalc(p, v); if(n || v.nutrition.text) h += sec('Dinh dưỡng', `${n ? `<div>Cân nặng ${fmtN(n.w, 1)} kg · BMI ${fmtN(n.bmi, 1)} (${n.bmiCls}). Năng lượng khuyến nghị: <b>${fmtN(n.target)} kcal/ngày</b>${n.goal === 'lose' ? ' (giảm cân)' : ''}.</div><table style="margin:4px 0"><tr><th>Bột đường</th><th>Đạm</th><th>Béo</th><th>Muối</th></tr><tr><td>${fmtN(n.carbG)} g (${fmtN(n.carbPct)}%)</td><td>${fmtN(n.protG)} g (${fmtN(n.protPct)}%)</td><td>${fmtN(n.fatG)} g (${fmtN(n.fatPct)}%)</td><td>${n.salt}</td></tr></table><div>Chia bữa: ${MEALS.map(([m, f]) => `${m} ~${fmtN(Math.round(n.target * f / 10) * 10)} kcal`).join('; ')}.</div>` : ''}${v.nutrition.text ? pre(v.nutrition.text) : ''}`); }
  if(o.act && v.activity.text) h += sec('Hoạt động thể lực', pre(v.activity.text));
  if(o.rehab && v.rehab.text) h += sec('Phục hồi chức năng', pre(v.rehab.text));
  if(o.tcm && v.tcm.text) h += sec('Y học cổ truyền', pre(v.tcm.text));
  if(o.psych && v.psych.text) h += sec('Tâm lý', pre(v.psych.text));
  const d = parseISO(v.date);
  h += `<div class="sig"><div>Ngày ${d.getDate()} tháng ${d.getMonth() + 1} năm ${d.getFullYear()}<br><b>Bác sĩ khám bệnh</b><br><br><br><br><b>${esc(s.doctor || '')}</b></div></div>${s.footer ? `<div style="font-size:11px;margin-top:10px;border-top:1px solid #999;padding-top:4px">${esc(s.footer)}</div>` : ''}`;
  return h;
}

// ================= SO SÁNH THUỐC =================
function cmpList(){
  const p = curP(), v = curV(), c = S.cmp, days = num(c.days) || 7;
  const others = v.rx.filter(l => l.id !== c.line).map(l => ({line: l, drug: drugById(l.drugId)}));
  return S.drugs.filter(d => d.g === c.g && (!c.cls || d.cls === c.cls)).map(d => {
    const ws = checkAll(p, v, [...others, {line: {id: 'cand'}, drug: d}]).items.filter(w => w.lines.includes('cand'));
    const per = (d.dose || []).reduce((a, b) => a + (num(b) || 0), 0), price = num(d.p) || 0;
    const score = ws.reduce((a, w) => a + (w.lv === 3 ? 100 : w.lv === 2 ? 10 : 0), 0);
    return {d, ws, score, maxLv: ws.reduce((m, w) => Math.max(m, w.lv), 0), day: per * price, course: Math.ceil(per * days) * price, per};
  }).sort((a, b) => a.score - b.score || a.day - b.day);
}
function cmpHTML(){
  const c = S.cmp, list = cmpList(), cur = c.line && curV().rx.find(l => l.id === c.line);
  if(!list.length) return '<div class="empty">Nhóm này chưa có thuốc trong danh mục.</div>';
  return `<div class="tscroll"><table class="t cmp"><thead><tr><th>Thuốc</th><th>Chi phí</th><th>Cảnh báo với bệnh nhân này</th><th>Ưu / nhược điểm</th><th>Tác dụng phụ hay gặp</th></tr></thead><tbody>
  ${list.map((x, i) => { const d = x.d, isCur = cur && cur.drugId === d.id;
    return `<tr class="${i === 0 ? 'best' : ''}"><td style="min-width:170px"><b>${esc(d.n)}</b> ${originBadge(d)}<div class="tiny muted">${esc(d.hc)} · ${esc(d.cls)}</div>${i === 0 ? '<div style="margin-top:4px">' + chip('Ít cảnh báo nhất, rẻ nhất trong danh sách', 'ok') + '</div>' : ''}${isCur ? '<div style="margin-top:4px">' + chip('Đang trong đơn', 'pri') + '</div>' : `<div style="margin-top:8px"><button class="btn sm ${i === 0 ? 'pri' : ''}" data-act="cmpPick" data-id="${d.id}">${c.line ? 'Thay bằng thuốc này' : 'Thêm vào đơn'}</button></div>`}</td>
    <td class="nowrap small">${money(d.p)}/${esc(d.u)}<div>${money(x.day)}/ngày</div><div><b>${money(x.course)}</b>/${fmtN(num(c.days) || 7)} ngày</div><div class="tiny muted">${frac(d.dose[0]) || 0}-${frac(d.dose[1]) || 0}-${frac(d.dose[2]) || 0}-${frac(d.dose[3]) || 0}</div></td>
    <td style="min-width:240px">${x.ws.length ? x.ws.map(w => `<div style="margin-bottom:4px">${lvChip(w.lv)} <b class="small">${esc(w.kind)}</b> <span class="small">${esc(w.m)}</span></div>`).join('') : chip('Không có cảnh báo', 'ok')}</td>
    <td class="small" style="min-width:220px"><div><b style="color:var(--ok)">+</b> ${esc(d.pro)}</div><div style="margin-top:4px"><b style="color:var(--r3)">−</b> ${esc(d.con)}</div></td><td class="small" style="min-width:150px">${esc(d.ae)}</td></tr>`; }).join('')}
  </tbody></table></div><div class="small muted" style="margin-top:8px">Các thuốc trong cùng nhóm có thể khác chỉ định (vd. PPI khác antacid). Sắp xếp: ít cảnh báo (nguy cơ cao, thận trọng) trước, rồi giá thấp trước; mức “Lưu ý” chỉ để tham khảo.</div>`;
}

// ================= DANH MỤC THUỐC =================
function viewDrugs(){
  return `<div class="page stack"><div class="row between"><h2>Danh mục thuốc</h2><div class="row"><button class="btn" data-act="drugReset">Khôi phục danh mục mẫu</button><button class="btn pri" data-act="drugNew">+ Thêm thuốc</button></div></div>
  <div class="banner info">Giá trong danh mục là <b>giá ví dụ</b>. Anh cập nhật giá nhập/bán thực tế để phần so sánh chi phí chính xác. Thuốc mới chọn “Nhóm tương tác” sẽ tự được kiểm tra tương tác.</div>
  <div class="card"><div class="row" style="margin-bottom:10px"><input type="search" id="dfq" placeholder="Tìm thuốc…" value="${esc(S.dfq)}" style="max-width:320px"><select id="dg" style="max-width:340px"><option value="">Tất cả nhóm</option>${Object.entries(GROUPS).map(([k, l]) => `<option value="${k}"${S.dg === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div><div id="dtable">${drugTable()}</div></div></div>`;
}
function drugTable(){
  const q = norm(S.dfq);
  const l = S.drugs.filter(d => (!S.dg || d.g === S.dg) && (!q || norm(d.n + ' ' + d.hc + ' ' + d.cls).includes(q))).sort((a, b) => (a.g + a.n).localeCompare(b.g + b.n));
  return `<div class="tscroll"><table class="t"><thead><tr><th>Thuốc</th><th>Hoạt chất</th><th>Phân nhóm</th><th>Nguồn</th><th class="right">Giá/đơn vị</th><th>Liều thường dùng</th></tr></thead><tbody>${l.map(d => `<tr class="click" data-act="drugEdit" data-id="${d.id}"><td><b>${esc(d.n)}</b></td><td class="small">${esc(d.hc)}</td><td class="small">${esc(d.cls)}<div class="tiny muted">${esc(GROUPS[d.g] || '')}</div></td><td>${originBadge(d)}</td><td class="right nowrap">${money(d.p)}/${esc(d.u)}</td><td class="small">${(d.dose || []).map(x => frac(x) || '0').join(' - ')} · ${esc(d.how || '')}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Không có thuốc</td></tr>'}</tbody></table></div>`;
}
function drugModal(){
  const d = S.editDrug;
  const lvOpts = [[1, 'Lưu ý'], [2, 'Thận trọng'], [3, 'Nguy cơ cao / tránh']];
  const ex = (k, l) => `<div class="g4">${F(l + ' — mức', SEL(`d.${k}.lv`, d[k].lv, lvOpts, {num: true}))}${F('Nội dung', I(`d.${k}.m`, d[k].m), 'span3')}</div>`;
  return `<div class="modal-bg" data-act="modalBg"><div class="modal md"><div class="mh"><h3>${d._new ? 'Thêm thuốc' : 'Sửa thuốc'}</h3><button class="btn ghost" data-act="closeModal">✕</button></div><div class="mb stack">
  <div class="g4">${F('Tên thuốc – hàm lượng *', I('d.n', d.n), 'span2')}${F('Hoạt chất', I('d.hc', d.hc))}${F('Nguồn', SEL('d.o', d.o, [['Nội', 'Nội'], ['Ngoại', 'Ngoại']]))}
  ${F('Đơn vị', I('d.u', d.u))}${F('Giá/đơn vị (đ)', I('d.p', d.p, {num: true}))}${F('Phân nhóm', I('d.cls', d.cls))}${F('Nhóm so sánh', SEL('d.g', d.g, Object.entries(GROUPS)))}
  ${F('Sáng', I('d.dose.0', d.dose[0], {num: true}))}${F('Trưa', I('d.dose.1', d.dose[1], {num: true}))}${F('Chiều', I('d.dose.2', d.dose[2], {num: true}))}${F('Tối', I('d.dose.3', d.dose[3], {num: true}))}
  ${F('Cách dùng mặc định', I('d.how', d.how, {list: 'dlHow'}), 'spanall')}</div>
  ${F('Tác dụng phụ hay gặp (in cho bệnh nhân)', T('d.ae', d.ae, {rows: 2}))}${F('Khi nào cần báo bác sĩ (in cho bệnh nhân)', T('d.warn', d.warn, {rows: 2}))}
  <div class="g2">${F('Ưu điểm', T('d.pro', d.pro, {rows: 2}))}${F('Nhược điểm', T('d.con', d.con, {rows: 2}))}</div>
  <div><div class="lbl">Nhóm tương tác (dùng để tự kiểm tra tương tác)</div><div class="checks" style="max-height:180px;overflow:auto;border:1px solid var(--line2);border-radius:8px;padding:8px">${Object.entries(TAGS).map(([k, l]) => CL('d.tags', d.tags, k, l)).join('')}</div></div>
  <div><div class="lbl">Chỉnh liều theo thận (áp dụng khi eGFR dưới ngưỡng; ngưỡng thấp nhất phù hợp sẽ được dùng)</div>${d.renal.map((r, i) => `<div class="g4" style="margin-top:6px">${F('eGFR dưới', I(`d.renal.${i}.lt`, r.lt, {num: true}))}${F('Mức', SEL(`d.renal.${i}.lv`, r.lv, lvOpts, {num: true}))}${F('Nội dung', I(`d.renal.${i}.m`, r.m), 'span2')}</div>`).join('')}</div>
  ${ex('hep', 'Suy gan')}${ex('old', 'Người cao tuổi')}${ex('preg', 'Mang thai')}${ex('lact', 'Cho con bú')}
  ${Object.keys(d.cond || {}).length ? `<div><div class="lbl">Cảnh báo theo bệnh kèm (có sẵn)</div><ul class="small" style="margin:4px 0;padding-left:18px">${Object.entries(d.cond).map(([k, w]) => `<li>${esc(condLabel(k))}: ${esc(w.m)}</li>`).join('')}</ul></div>` : ''}
  </div><div class="mf">${d._new ? '' : '<button class="btn danger" data-act="drugDel" style="margin-right:auto">Xoá thuốc</button>'}<button class="btn" data-act="closeModal">Huỷ</button><button class="btn pri" data-act="drugSave">Lưu</button></div></div></div>`;
}
function editableDrug(d){
  const x = clone(d);
  x.dose = (x.dose || [0, 0, 0, 0]).concat([0, 0, 0, 0]).slice(0, 4); x.tags = x.tags || []; x.cond = x.cond || {};
  x.renal = (x.renal || []).concat([{}, {}, {}]).slice(0, Math.max(3, (x.renal || []).length));
  x.renal = x.renal.map(r => ({lt: r.lt ?? null, lv: r.lv ?? 2, m: r.m || ''}));
  for(const k of ['hep', 'old', 'preg', 'lact']) x[k] = {lv: (x[k] && x[k].lv) || 2, m: (x[k] && x[k].m) || ''};
  return x;
}
function cleanDrug(x){
  const d = clone(x); delete d._new;
  d.renal = d.renal.filter(r => num(r.lt) && r.m).map(r => ({lt: num(r.lt), lv: num(r.lv) || 2, m: r.m}));
  for(const k of ['hep', 'old', 'preg', 'lact']) if(!d[k].m) delete d[k]; else d[k].lv = num(d[k].lv) || 2;
  d.dose = d.dose.map(v => num(v) || 0); d.p = num(d.p) || 0;
  return d;
}

// ================= THƯ VIỆN MẪU =================
function viewTpls(){
  return `<div class="page stack"><div class="row between"><h2>Thư viện mẫu</h2><button class="btn pri" data-act="tplNew">+ Thêm mẫu</button></div>
  <div class="small muted">Mẫu được gợi ý (★) trong lượt khám khi khớp bệnh nền/chẩn đoán/thuốc của bệnh nhân. Anh có thể sửa nội dung theo cách tư vấn của mình.</div>
  ${Object.entries(TPL_CATS).map(([c, l]) => `<div class="card"><h3>${l}</h3><div class="tscroll"><table class="t"><tbody>${S.tpls.filter(t => t.cat === c).map(t => `<tr class="click" data-act="tplEdit" data-id="${t.id}"><td style="width:240px"><b>${esc(t.title)}</b><div>${(t.tags || []).map(k => chip(condLabel(k.startsWith('tag:') ? k : k), 'pri')).join(' ')}</div></td><td class="small muted">${esc(t.text.slice(0, 220))}${t.text.length > 220 ? '…' : ''}</td></tr>`).join('') || '<tr><td class="muted">Chưa có mẫu</td></tr>'}</tbody></table></div></div>`).join('')}</div>`;
}
function tplModal(){
  const t = S.editTpl;
  const tagOpts = [...CONDS.map(c => [c.k, c.t]), ...Object.entries(COND_EXTRA)];
  return `<div class="modal-bg" data-act="modalBg"><div class="modal md"><div class="mh"><h3>${t._new ? 'Thêm mẫu' : 'Sửa mẫu'}</h3><button class="btn ghost" data-act="closeModal">✕</button></div><div class="mb stack">
  <div class="g3">${F('Tiêu đề', I('t.title', t.title), 'span2')}${F('Loại', SEL('t.cat', t.cat, Object.entries(TPL_CATS)))}</div>
  ${F('Nội dung', T('t.text', t.text, {rows: 8}))}
  <div><div class="lbl">Gợi ý khi bệnh nhân có</div><div class="checks">${tagOpts.map(([k, l]) => CL('t.tags', t.tags, k, l)).join('')}</div></div>
  </div><div class="mf">${t._new ? '' : '<button class="btn danger" data-act="tplDel" style="margin-right:auto">Xoá mẫu</button>'}<button class="btn" data-act="closeModal">Huỷ</button><button class="btn pri" data-act="tplSave">Lưu</button></div></div></div>`;
}

// ================= CÀI ĐẶT & SAO LƯU =================
function viewSettings(){
  const s = S.settings;
  return `<div class="page stack">${banners()}<h2>Cài đặt & sao lưu</h2>
  <div class="card"><h3>Thông tin in trên phiếu</h3><div class="g2">${F('Tên phòng khám', I('s.clinic', s.clinic))}${F('Bác sĩ', I('s.doctor', s.doctor))}${F('Địa chỉ', I('s.address', s.address))}${F('Điện thoại', I('s.phone', s.phone))}${F('Dòng chú thích cuối phiếu', I('s.footer', s.footer), 'spanall')}</div></div>
  <div class="card"><h3>Nơi lưu dữ liệu</h3>${Store.mode === 'dir' ? `<div class="row" style="margin-bottom:8px"><span class="chip ok">Thư mục trên máy</span><b>${esc(Store.dirName)}</b></div>
    <div class="small" style="margin-bottom:10px;line-height:1.6"><b>benh-nhan</b>: mỗi bệnh nhân một file · <b>tep-dinh-kem</b>: ảnh/PDF kết quả · <b>danh-muc-thuoc.json</b>, <b>mau-tu-van.json</b>, <b>cai-dat.json</b> · <b>sao-luu</b>: bản sao lưu tự động mỗi ngày (60 ngày) · <b>da-xoa</b>: hồ sơ/file đã xoá.<br>Định kỳ chép cả thư mục sang USB hoặc ổ khác để phòng hỏng máy.</div>
    <div class="row"><button class="btn" data-act="dirPick">Chuyển sang thư mục khác</button></div>`
  : Store.canDir ? `<div class="small" style="margin-bottom:10px">Dữ liệu đang nằm <b>trong trình duyệt</b> — xoá dữ liệu duyệt web là mất. Nên chuyển sang lưu vào thư mục trên máy; dữ liệu hiện có sẽ được chép sang.</div><div class="row"><button class="btn pri" data-act="dirPick">Chọn thư mục lưu dữ liệu</button></div>`
  : `<div class="small muted">Dữ liệu đang nằm trong trình duyệt. Mở app bằng Chrome hoặc Edge để lưu được vào thư mục trên máy.</div>`}</div>
  <div class="card"><h3>Sao lưu / khôi phục bằng một file</h3><div class="small" style="margin-bottom:10px">Gói toàn bộ dữ liệu (kể cả file đính kèm) vào một file .json — dùng để chuyển sang máy khác hoặc cất giữ riêng.</div>
    <div class="row"><button class="btn pri" data-act="export">Tải file sao lưu (.json)</button><label class="btn">Khôi phục từ file sao lưu<input type="file" id="importFile" accept=".json,application/json" hidden></label><span class="small muted">${s.lastBackup ? 'Lần tải gần nhất: ' + fmtDate(s.lastBackup.slice(0, 10)) : ''}</span></div></div>
  ${Store.mode !== 'dir' && S.fileHandle ? `<div class="card"><h3>Tự động lưu ra file</h3><div class="row"><span class="chip ${S.fileNeedsPerm ? 'r2' : 'ok'}">${S.fileNeedsPerm ? 'Tạm dừng' : 'Đang tự lưu'}: ${esc(S.fileHandle.name)}</span>${S.fileNeedsPerm ? '<button class="btn sm" data-act="fileReconnect">Cho phép tiếp tục</button>' : '<button class="btn sm" data-act="fileWriteNow">Lưu ngay</button>'}<button class="btn sm danger" data-act="fileUnlink">Ngừng tự lưu</button></div></div>` : ''}
  <div class="card"><h3>Dữ liệu</h3><div class="small" style="margin-bottom:10px">${S.patients.length} bệnh nhân · ${S.patients.reduce((a, p) => a + p.visits.length, 0)} lượt khám · ${S.drugs.length} thuốc · ${S.tpls.length} mẫu · lưu ${Store.mode === 'dir' ? 'trong thư mục ' + esc(Store.dirName) : 'trong trình duyệt'}</div>
    <div class="row">${S.patients.some(p => p.demo) ? '<button class="btn" data-act="clearDemo">Xoá ca mẫu</button>' : '<button class="btn" data-act="addDemo">Thêm lại ca mẫu</button>'}<button class="btn danger" data-act="wipeAll">Xoá toàn bộ dữ liệu</button></div></div>
  <div class="card"><h3>Về công cụ hỗ trợ quyết định</h3><div class="small">Cảnh báo tương tác, chỉnh liều theo thận, người cao tuổi, thai kỳ và gợi ý sàng lọc được tổng hợp từ tờ hướng dẫn sử dụng, Dược thư, KDIGO, tiêu chí Beers, USPSTF/ADA. Danh mục chỉ bao phủ các thuốc đã nhập — thuốc ngoài danh mục cần được kiểm tra riêng. Kết quả là gợi ý; bác sĩ chịu trách nhiệm quyết định điều trị.</div></div></div>`;
}

// ================= MODAL =================
function renderModal(){
  const r = $('#modalRoot');
  if(S.modal === 'cmp'){
    const v = curV(), cur = S.cmp.line && v.rx.find(l => l.id === S.cmp.line), d = cur && drugById(cur.drugId);
    r.innerHTML = `<div class="modal-bg" data-act="modalBg"><div class="modal"><div class="mh"><div><h3>So sánh lựa chọn thuốc</h3><div class="small muted">${d ? 'Thay thế cho: <b>' + esc(d.n) + '</b>' : 'Thêm vào đơn'} · cảnh báo tính riêng cho ${esc(curP().name)} (bệnh nền, eGFR, tuổi, dị ứng, thuốc đang dùng)</div></div><button class="btn ghost" data-act="closeModal">✕</button></div>
    <div class="mb"><div class="row" style="margin-bottom:12px;align-items:end">${F('Nhóm thuốc', SEL('c.g', S.cmp.g, Object.entries(GROUPS)))}<div data-live="cmpCls"></div>${F('Số ngày điều trị', I('c.days', S.cmp.days, {num: true, attr: 'style="width:90px"'}))}</div><div data-live="cmp"></div></div>
    <div class="mf"><span class="small muted" style="margin-right:auto">Giá là giá mẫu — cập nhật giá thực tế trong Danh mục thuốc.</span><button class="btn" data-act="closeModal">Đóng</button></div></div></div>`;
  } else if(S.modal === 'drug') r.innerHTML = drugModal();
  else if(S.modal === 'tpl') r.innerHTML = tplModal();
  else r.innerHTML = '';
  if(S.modal) updateLive();
}
function closeModal(){ S.modal = null; S.cmp = null; S.editDrug = null; S.editTpl = null; renderModal(); }

// ================= TÌM THUỐC =================
// g: chỉ tìm trong một nhóm GROUPS; khi đã chọn nhóm mà chưa gõ gì thì liệt kê cả nhóm (theo phân nhóm, tên)
function drugSearch(q, forMeds, g){
  q = norm(q).trim(); const pool = g ? S.drugs.filter(d => d.g === g) : S.drugs;
  if(!q) return g ? pool.slice().sort((a, b) => a.cls.localeCompare(b.cls, 'vi') || a.n.localeCompare(b.n, 'vi') || a.o.localeCompare(b.o, 'vi')) : [];
  const rank = d => { const n = norm(d.n), h = norm(d.hc); return n.startsWith(q) || h.startsWith(q) ? 0 : (' ' + n + ' ' + h).includes(' ' + q) ? 1 : 2; };
  return pool.filter(d => norm(d.n + ' ' + d.hc + ' ' + d.cls).includes(q)).sort((a, b) => rank(a) - rank(b) || a.n.localeCompare(b.n)).slice(0, g ? 60 : 12);
}
function renderDres(){
  const box = $('#dres'), q = $('#dq').value; S.dq = q;
  const l = drugSearch(q, false, S.rxG); if(!l.length){ box.innerHTML = S.rxG && q.trim() ? `<div class="muted small" style="padding:8px 10px">Không có thuốc "${esc(q)}" trong nhóm ${esc(GROUPS[S.rxG])}</div>` : ''; box.hidden = !box.innerHTML; return; }
  const p = curP(), v = curV(), others = v.rx.map(x => ({line: x, drug: drugById(x.drugId)}));
  box.innerHTML = l.map((d, i) => { const ws = checkAll(p, v, [...others, {line: {id: 'cand'}, drug: d}]).items.filter(w => w.lines.includes('cand')); const mx = ws.reduce((m, w) => Math.max(m, w.lv), 0);
    const blk = ws.some(w => w.kind === 'Quy tắc phòng khám');
    return `<div class="it ${i === 0 ? 'hl' : ''}" data-act="rxAdd" data-id="${d.id}"${blk ? ' style="opacity:.55"' : ''}><div class="l"><span><b>${esc(d.n)}</b> ${originBadge(d)}</span><small>${esc(d.hc)} · ${esc(d.cls)} · ${money(d.p)}/${esc(d.u)}</small></div>${blk ? `<span title="${esc((ws.find(w => w.kind === 'Quy tắc phòng khám') || {}).m || '')}">${chip('Không kê được', 'r3')}</span>` : mx ? chip(`${ws.length} cảnh báo · ${LV_LABEL[mx].toLowerCase()}`, 'r' + mx) : chip('Không cảnh báo', 'ok')}</div>`; }).join('');
  box.hidden = false;
}
function renderMres(){
  const box = $('#mres'), l = drugSearch($('#mq').value);
  if(!l.length){ box.hidden = true; return; }
  box.innerHTML = l.map((d, i) => `<div class="it ${i === 0 ? 'hl' : ''}" data-act="medPick" data-id="${d.id}"><div class="l"><span><b>${esc(d.n)}</b> ${originBadge(d)}</span><small>${esc(d.hc)} · ${esc(d.cls)}</small></div></div>`).join('');
  box.hidden = false;
}

// ================= HÀNH ĐỘNG =================
const ACT = {
  nav: a => go({name: a.dataset.to}),
  sidetoggle: () => $('#body').classList.toggle('showside'),
  newP: () => { S.newP = {name: '', sex: 'Nam', dob: '', birthYear: null, phone: '', job: '', address: '', reason: ''}; go({name: 'newp'}); setTimeout(() => $('#newName') && $('#newName').focus(), 30); },
  createP: async a => {
    const n = S.newP; if(!n.name || !n.name.trim()){ toast('Cần nhập họ tên'); return; }
    const p = {id: uid('p'), code: nextCode(), createdAt: new Date().toISOString(), name: n.name.trim(), sex: n.sex, dob: n.dob, birthYear: n.birthYear, phone: n.phone, job: n.job, address: n.address,
      conds: [], allergies: [], meds: [], risk: {smoke: 'never', alcohol: 'no'}, fam: [], screen: {}, recalls: [], visits: [], activity: 'sedentary'};
    S.patients.push(p);
    if(a.dataset.only){ savePatient(p); go({name: 'patient', pid: p.id, tab: 'profile'}); return; }
    const v = newVisitObj(p, 'clinic'); v.reason = n.reason || ''; p.visits.push(v); savePatient(p);
    go({name: 'visit', pid: p.id, vid: v.id, step: 1});
  },
  openP: a => go({name: 'patient', pid: a.dataset.id, tab: a.dataset.tab || 'visits'}),
  ptab: a => { S.view.tab = a.dataset.tab; renderMain(); },
  newVisit: a => { const p = curP(), v = newVisitObj(p, a.dataset.kind); if(a.dataset.kind === 'old'){ v.status = 'done'; v.print.reason = false; } p.visits.push(v); savePatient(p); go({name: 'visit', pid: p.id, vid: v.id, step: 1}); if(a.dataset.kind === 'old') toast('Nhập ngày khám, nơi khám, chẩn đoán, xét nghiệm, đơn thuốc cũ'); },
  openV: a => go({name: 'visit', pid: S.view.pid, vid: a.dataset.id, step: 1}),
  step: a => { const n = Number(a.dataset.step), m = n >= 4 && rxGate(curV());
    if(m){ toast(m); if((S.view.step || 1) !== 3){ S.view.step = 3; renderMain(); } updateLive(); const c = $('#norxCard'); if(c) c.scrollIntoView({block: 'center', behavior: 'smooth'}); return; }
    flushSaves(); S.view.step = n; renderMain(); $('#main').scrollTop = 0; },
  noRxClear: () => { const v = curV(); v.noRx = {}; savePatient(curP()); renderMain(true); },
  finish: () => { const v = curV(); if(rxGate(v)) return ACT.step({dataset: {step: 4}}); v.status = 'done'; savePatient(curP()); toast('Đã hoàn tất lượt khám'); go({name: 'patient', pid: S.view.pid, tab: 'visits'}); },
  delV: () => { if(!confirm('Xoá lượt khám này?')) return; const p = curP(); p.visits = p.visits.filter(v => v.id !== S.view.vid); savePatient(p); go({name: 'patient', pid: p.id, tab: 'visits'}); },
  delP: async () => { const p = curP(); if(!confirm(`Xoá vĩnh viễn hồ sơ ${p.name}?`)) return; if(!confirm(Store.mode === 'dir' ? 'File hồ sơ sẽ được chuyển vào du-lieu\\da-xoa. Chắc chắn xoá?' : 'Thao tác không hoàn tác được. Chắc chắn xoá?')) return; clearTimeout(timers[p.id]); delete timers[p.id]; for(const v of p.visits) for(const f of v.files || []) await Store.del('files', f.id); await Store.del('patients', p.id); S.patients = S.patients.filter(x => x !== p); scheduleFileSave(); go({name: 'home'}); toast('Đã xoá hồ sơ'); },
  ord: a => { const v = curV(), k = a.dataset.key, ex = v.orders.find(o => o.key === k);
    if(ex){ if((ex.value && String(ex.value).trim()) && !confirm('Chỉ định này đã có kết quả. Bỏ chỉ định và xoá kết quả?')){ a.checked = true; return; } v.orders = v.orders.filter(o => o !== ex); }
    else { const l = LABS.find(x => x[1] === k); v.orders.push({id: uid('o'), key: k, name: l[2], unit: l[3], ref: l[4], type: l[5], value: '', flag: '', note: ''}); }
    savePatient(curP()); renderMain(true); },
  ordPanel: a => { const v = curV(), pn = LAB_PANELS.find(x => x.id === a.dataset.id); if(!pn) return;
    if(pn.keys.every(k => v.orders.some(o => o.key === k))){
      const ex = v.orders.filter(o => pn.keys.includes(o.key));
      if(ex.some(o => o.value != null && String(o.value).trim()) && !confirm('Bộ chỉ định này đã có kết quả. Bỏ chỉ định và xoá kết quả?')){ a.checked = true; return; }
      v.orders = v.orders.filter(o => !pn.keys.includes(o.key));
    } else pn.keys.filter(k => !v.orders.some(o => o.key === k)).forEach(k => { const l = LABS.find(x => x[1] === k); v.orders.push({id: uid('o'), key: k, name: l[2], unit: l[3], ref: l[4], type: l[5], value: '', flag: '', note: ''}); });
    savePatient(curP()); renderMain(true); },
  ordCustom: () => { const el = $('#ordCustom'), t = el.value.trim(); if(!t) return; curV().orders.push({id: uid('o'), key: 'custom', name: t, unit: '', ref: '', type: 't', value: '', flag: '', note: ''}); savePatient(curP()); renderMain(true); },
  ordDel: a => { const v = curV(); v.orders = v.orders.filter(o => o.id !== a.dataset.id); savePatient(curP()); renderMain(true); },
  dirConnect: () => connectPending(),
  fileOpen: async a => { const f = await Store.get('files', a.dataset.id); if(!f) return toast(S.pendingDir ? 'Cần kết nối thư mục để mở file này' : 'Không tìm thấy file'); const b = await (await fetch(f.data)).blob(); window.open(URL.createObjectURL(b), '_blank'); },
  fileDel: async a => { if(!confirm('Xoá file đính kèm?')) return; const v = curV(); await Store.del('files', a.dataset.id); v.files = v.files.filter(f => f.id !== a.dataset.id); savePatient(curP()); renderMain(true); },
  rxAdd: a => addRx(a.dataset.id),
  rxDel: a => { const v = curV(); v.rx = v.rx.filter(l => l.id !== a.dataset.id); savePatient(curP()); renderMain(true); },
  cmpOpen: a => { const v = curV(), line = a.dataset.line && v.rx.find(l => l.id === a.dataset.line); const ld = line && drugById(line.drugId); S.cmp = {g: ld ? ld.g : ($('#cmpG') ? $('#cmpG').value : 'acid'), cls: ld ? ld.cls : '', line: line ? line.id : null, days: line ? (num(line.days) || 7) : (num(v.plan.followDays) || 7)}; S.modal = 'cmp'; renderModal(); },
  cmpPick: a => { const v = curV(), d = drugById(a.dataset.id); if(rxBlocked(d)) return;
    if(S.cmp.line){ const l = v.rx.find(x => x.id === S.cmp.line); Object.assign(l, {drugId: d.id, s: d.dose[0], tr: d.dose[1], c: d.dose[2], t: d.dose[3], how: d.how}); toast('Đã thay bằng ' + d.n); }
    else { v.rx.push(rxLine(d, v)); toast('Đã thêm ' + d.n); }
    savePatient(curP()); closeModal(); renderMain(true); },
  modalBg: (a, e) => { if(e.target === a) closeModal(); },
  closeModal: () => closeModal(),
  follow: a => { const v = curV(), d = Number(a.dataset.days); v.plan.followDays = d; v.plan.followDate = addDays(v.date, d); savePatient(curP()); renderMain(true); },
  recallAdd: a => { const p = curP(), v = S.view.name === 'visit' ? curV() : null, base = v ? v.date : todayISO(); p.recalls = p.recalls || []; p.recalls.push({id: uid('r'), title: a.dataset.title || '', due: a.dataset.months ? addMonths(base, Number(a.dataset.months)) : '', note: '', done: false, created: todayISO()}); savePatient(p); renderMain(true); },
  recallDel: a => { const p = curP(); p.recalls = p.recalls.filter(r => r.id !== a.dataset.id); savePatient(p); renderMain(true); },
  screenToday: a => { const p = curP(); p.screen = p.screen || {}; p.screen[a.dataset.id] = {...(p.screen[a.dataset.id] || {}), last: todayISO()}; savePatient(p); renderMain(true); },
  medPick: a => { const p = curP(), d = drugById(a.dataset.id); p.meds = p.meds || []; p.meds.push({id: uid('m'), drugId: d.id, text: '', grp: '', dose: '', note: ''}); savePatient(p); renderMain(true); },
  medFree: () => { const p = curP(); p.meds = p.meds || []; p.meds.push({id: uid('m'), drugId: null, text: '', grp: '', dose: '', note: ''}); savePatient(p); renderMain(true); },
  medDel: a => { const p = curP(); p.meds = p.meds.filter(m => m.id !== a.dataset.id); savePatient(p); renderMain(true); },
  tplIns: a => insertTpl(a.dataset.id, a.dataset.path),
  print: () => { $('#printRoot').innerHTML = `<div class="sheet ps">${sheetHTML(curP(), curV())}</div>`; window.print(); },
  drugNew: () => { S.editDrug = editableDrug({id: uid('dr'), n: '', hc: '', o: 'Nội', u: 'viên', p: 0, cls: '', g: 'other', tags: [], dose: [1, 0, 0, 0], how: '', ae: '', warn: '', pro: '', con: '', renal: []}); S.editDrug._new = true; S.modal = 'drug'; renderModal(); },
  mentalToggle: () => { const p = curP(), v = curV(); S.mOpen = S.mOpen || {}; S.mOpen[v.id] = !mentalOpen(p, v); renderMain(true); },
  dxPick: a => { const v = curV(), c = a.dataset.code, old = String(v.dx.icd || '').split(' ')[0];
    if(v.dx.main && old && v.dx.main === icdName(old)) v.dx.main = '';   // chẩn đoán chính đang là tên mã cũ -> thay theo mã mới
    v.dx.icd = c + ' – ' + icdName(c); afterChange('v.dx.icd'); renderMain(true); toast('Đã chọn chẩn đoán ' + c); },
  drugEdit: a => { S.editDrug = editableDrug(drugById(a.dataset.id)); S.modal = 'drug'; renderModal(); },
  drugSave: async () => { const d = cleanDrug(S.editDrug); if(!d.n.trim()) return toast('Cần tên thuốc'); const i = S.drugs.findIndex(x => x.id === d.id); if(i >= 0) S.drugs[i] = d; else S.drugs.push(d); await Store.put('drugs', d); scheduleFileSave(); closeModal(); renderMain(true); toast('Đã lưu thuốc'); },
  drugDel: async () => { const d = S.editDrug; if(!confirm(`Xoá ${d.n} khỏi danh mục? (Đơn cũ có thuốc này sẽ không hiển thị được tên)`)) return; S.drugs = S.drugs.filter(x => x.id !== d.id); await Store.del('drugs', d.id); scheduleFileSave(); closeModal(); renderMain(true); },
  drugReset: async () => { if(!confirm('Khôi phục các thuốc mẫu về nội dung gốc? (Thuốc anh tự thêm vẫn được giữ; giá đã sửa của thuốc mẫu sẽ bị ghi đè)')) return; const seed = clone(DRUGS_SEED); await Store.putMany('drugs', seed); const ids = new Set(seed.map(d => d.id)); S.drugs = S.drugs.filter(d => !ids.has(d.id)).concat(seed); scheduleFileSave(); renderMain(true); toast('Đã khôi phục danh mục mẫu'); },
  tplNew: () => { S.editTpl = {id: uid('t'), cat: 'diet', title: '', tags: [], text: '', _new: true}; S.modal = 'tpl'; renderModal(); },
  tplEdit: a => { S.editTpl = clone(S.tpls.find(t => t.id === a.dataset.id)); S.modal = 'tpl'; renderModal(); },
  tplSave: async () => { const t = clone(S.editTpl); delete t._new; if(!t.title.trim()) return toast('Cần tiêu đề'); const i = S.tpls.findIndex(x => x.id === t.id); if(i >= 0) S.tpls[i] = t; else S.tpls.push(t); await Store.put('templates', t); scheduleFileSave(); closeModal(); renderMain(true); },
  tplDel: async () => { const t = S.editTpl; if(!confirm('Xoá mẫu này?')) return; S.tpls = S.tpls.filter(x => x.id !== t.id); await Store.del('templates', t.id); scheduleFileSave(); closeModal(); renderMain(true); },
  export: () => exportAll(),
  gatePick: () => pickDir(),
  dirPick: () => pickDir(),
  gateReconnect: async () => { const h = S.gate.h;
    try { dirPerm.last = dirPerm.err = null;
      if(await dirPerm(h, true)) await startDir(h);
      else { const e = dirPerm.err, gone = e && e.name === 'NotFoundError';
        alert(gone ? `Không tìm thấy thư mục "${h.name}" cũ (có thể đã bị di chuyển, đổi tên hoặc xoá). Anh bấm "Chọn thư mục khác" rồi chọn Desktop → BS-TOAN.`
          : `Trình duyệt chưa cấp quyền sửa file trong thư mục "${h.name}". Anh bấm "Chọn thư mục khác" rồi chọn lại Desktop → BS-TOAN, khi trình duyệt hỏi thì bấm "Cho phép".\n\nChi tiết: quyền = ${dirPerm.last || '?'}${e ? `; ${e.name}: ${e.message}` : ''}`); } }
    catch(e){ console.error(e); alert(`Không mở được thư mục "${h.name}" (có thể đã bị đổi tên hoặc di chuyển). Anh bấm "Chọn thư mục khác" rồi chọn lại.\n\nChi tiết lỗi: ${e.name}: ${e.message}`); } },
  gateBrowser: async () => { if(!confirm('Lưu trong trình duyệt: nếu xoá dữ liệu duyệt web sẽ mất hồ sơ. Vẫn tạm dùng cách này? (Có thể chuyển sang thư mục sau trong Cài đặt)')) return; await IDB.put('kv', {id: 'pref', browserOnly: true}); await startBrowser(); },
  dirRetry: async () => { if(Store.mode !== 'dir') return; try { if(!(await dirPerm(Store.dir.root, true))) return toast('Chưa được cấp quyền'); flushSaves(); await Store.dir.retry(); S.storeErr = null; setSave('saved'); renderMain(true); toast('Đã ghi dữ liệu vào thư mục'); } catch(e){ toast('Vẫn chưa ghi được: ' + e.message); } },
  fileLink: () => fileLink(),
  fileReconnect: () => fileReconnect(),
  fileUnlink: async () => { S.fileHandle = null; S.fileNeedsPerm = false; await Store.del('kv', 'fh'); renderMain(true); setSave('saved'); },
  fileWriteNow: async () => { await writeFileNow(); toast('Đã ghi ra file'); renderMain(true); },
  clearDemo: async () => { if(!confirm('Xoá ca mẫu?')) return; for(const p of S.patients.filter(p => p.demo)) await Store.del('patients', p.id); S.patients = S.patients.filter(p => !p.demo); S.settings.demoCleared = true; await saveSettings(); render(); },
  addDemo: async () => { const p = demoPatient(); S.patients.push(p); await Store.put('patients', p); render(); },
  wipeAll: async () => { if(!confirm('XOÁ TOÀN BỘ bệnh nhân, danh mục, mẫu?' + (Store.mode === 'dir' ? ' (Các file sẽ được chuyển vào du-lieu\\da-xoa)' : ''))) return; if(!confirm('Anh đã sao lưu chưa? Thao tác không hoàn tác được.')) return; for(const s of ['patients', 'drugs', 'templates', 'files', 'kv']) await Store.clear(s); await seedAll(false); S.view = {name: 'home'}; render(); toast('Đã xoá toàn bộ dữ liệu'); },
};
function rxLine(d, v){ return {id: uid('r'), drugId: d.id, s: d.dose[0], tr: d.dose[1], c: d.dose[2], t: d.dose[3], days: num(v.plan.followDays) || 7, how: d.how || '', note: ''}; }
// Quy tắc phòng khám: không cho thêm SSRI/SNRI khi có lý do chặn (ssriBlockReasons); trả về true nếu bị chặn
function rxBlocked(d){ const r = drugBlockReasons(curP(), curV(), d); if(!r.length) return false;
  alert(`Không kê được ${d.n} vì:\n- ${r.join('\n- ')}\n\nQuy tắc phòng khám — anh chọn thuốc khác.`); return true; }
function addRx(id){ const v = curV(), d = drugById(id); if(!d || rxBlocked(d)) return; v.rx.push(rxLine(d, v)); savePatient(curP()); S.dq = ''; renderMain(true); setTimeout(() => { const el = $('#dq'); if(el) el.focus(); }, 20); }
function insertTpl(id, path){
  const t = S.tpls.find(x => x.id === id); if(!t) return;
  const cur = getVal(path) || '';
  if(cur.includes(t.text)){ toast('Mẫu này đã có trong ô'); return; }
  const r = resolve(path); r.o[r.k] = cur ? cur.replace(/\s+$/, '') + '\n' + t.text : t.text;
  const el = $(`[data-b="${path}"]`); if(el) el.value = r.o[r.k];
  afterChange(path);
}

// ================= SAO LƯU, FILE =================
async function snapshot(withFiles = true){ const s = {...S.settings}; return {app: 'ho-so-benh-nhan', ver: 1, exportedAt: new Date().toISOString(), settings: s, patients: S.patients, drugs: S.drugs, tpls: S.tpls, files: withFiles ? await Store.all('files') : []}; }
async function exportAll(){
  flushSaves();
  const data = await snapshot();
  const b = new Blob([JSON.stringify(data)], {type: 'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `sao-luu-ho-so-benh-nhan-${todayISO()}.json`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  S.settings.lastBackup = new Date().toISOString(); await saveSettings(); renderMain(true); toast('Đã tải file sao lưu');
}
async function importAll(file){
  let d; try { d = JSON.parse(await file.text()); } catch(e){ return toast('File không đọc được'); }
  if(d.app !== 'ho-so-benh-nhan' || !Array.isArray(d.patients)) return toast('Không phải file sao lưu của app này');
  if(!confirm(`Khôi phục ${d.patients.length} bệnh nhân từ file (${d.exportedAt ? new Date(d.exportedAt).toLocaleString('vi-VN') : ''})? Dữ liệu hiện tại trên máy sẽ được THAY THẾ.`)) return;
  for(const s of ['patients', 'drugs', 'templates', 'files']) await Store.clear(s);
  await Store.putMany('patients', d.patients); await Store.putMany('drugs', d.drugs || clone(DRUGS_SEED)); await Store.putMany('templates', d.tpls || clone(TEMPLATES_SEED)); if(d.files && d.files.length) await Store.putMany('files', d.files);
  S.settings = {...S.settings, ...(d.settings || {}), id: 'settings'}; await saveSettings();
  await loadAll(); S.view = {name: 'home'}; render(); toast('Đã khôi phục dữ liệu');
}
async function fileLink(){
  try {
    const h = await window.showSaveFilePicker({suggestedName: 'du-lieu-ho-so-benh-nhan.json', types: [{description: 'Dữ liệu JSON', accept: {'application/json': ['.json']}}]});
    S.fileHandle = h; S.fileNeedsPerm = false;
    try { await Store.put('kv', {id: 'fh', h}); } catch(e){ console.warn('Không lưu được liên kết file', e); }
    await writeFileNow(); renderMain(true); toast('Đã bật tự động lưu ra file');
  } catch(e){ if(e.name !== 'AbortError') toast('Không bật được: ' + e.message); }
}
async function fileReconnect(){ try { const r = await S.fileHandle.requestPermission({mode: 'readwrite'}); if(r === 'granted'){ S.fileNeedsPerm = false; await writeFileNow(); render(); toast('Đã tiếp tục tự động lưu'); } } catch(e){ toast('Không cấp quyền được: ' + e.message); } }
function scheduleFileSave(){ if(!S.fileHandle || S.fileNeedsPerm) return; clearTimeout(fileTimer); fileTimer = setTimeout(writeFileNow, 2500); }
async function writeFileNow(){
  if(!S.fileHandle) return;
  try {
    const perm = await S.fileHandle.queryPermission({mode: 'readwrite'});
    if(perm !== 'granted'){ S.fileNeedsPerm = true; setSave('saved'); return; }
    const w = await S.fileHandle.createWritable(); await w.write(JSON.stringify(await snapshot())); await w.close();
    S.settings.lastFileSave = new Date().toISOString(); await Store.put('kv', {...S.settings, id: 'settings'}); setSave('saved');
  } catch(e){ console.error(e); toast('Không ghi được file: ' + e.message); }
}

// ================= CA MẪU =================
function demoPatient(){
  const pid = 'p_demoA';
  const ord = (key, value, flag = '') => { const l = LABS.find(x => x[1] === key); return {id: uid('o'), key, name: l[2], unit: l[3], ref: l[4], type: l[5], value, flag, note: ''}; };
  const p = {id: pid, demo: true, code: 'BN0001', createdAt: new Date().toISOString(), name: 'Nguyễn Văn A', sex: 'Nam', dob: '1964-05-10', phone: '0912 345 678', job: 'Lái xe (đã nghỉ hưu)', address: '',
    height: 168, weight: 78, waist: 98, activity: 'sedentary', exerciseMin: 30,
    conds: ['ckd', 'htn', 'af', 'oa'], condNote: 'Rung nhĩ phát hiện 2023, dùng Sintrom. Bệnh thận mạn theo dõi tại bệnh viện tỉnh. Đau khớp gối 2 bên khoảng 2 năm.',
    allergies: [], allergyText: '', noAllergy: true,
    meds: [{id: 'm1', drugId: 'aceno4', dose: '½ viên buổi chiều, chỉnh theo INR', note: 'Rung nhĩ'}, {id: 'm2', drugId: 'amlo5', dose: '1 viên buổi sáng', note: 'Tăng huyết áp'}],
    risk: {smoke: 'former', packYears: 15, quitYear: 2018, alcohol: 'some'}, fam: ['stomach'], famNote: 'Bố mất vì ung thư dạ dày lúc 70 tuổi.',
    social: 'Sống với vợ; lương hưu thấp, mong thuốc giá vừa phải. Lo lắng vì bố từng bị ung thư dạ dày.',
    screen: {bp: {last: '2026-10-21'}}, recalls: [{id: 'rc1', title: 'Nội soi dạ dày kiểm tra lại', due: '2029-10-21', note: 'Nếu không có tổn thương nghi ngờ; có tiền sử gia đình ung thư dạ dày', done: false}],
    visits: []};
  const old = newVisitObj(p, 'old');
  Object.assign(old, {id: 'v_demo_old', date: '2025-11-12', place: 'Bệnh viện tỉnh', status: 'done', reason: 'Khám định kỳ tăng huyết áp, bệnh thận',
    dx: {main: 'Tăng huyết áp; Bệnh thận mạn G3a; Rung nhĩ', icd: 'I10 – Tăng huyết áp vô căn', secondary: '', disp: 'outpatient', note: ''},
    orders: [ord('creat', 140, 'Cao'), ord('inr', 2.3, 'BT'), ord('k', 4.6, 'BT')],
    rx: [{id: 'ro1', drugId: 'amlo5', s: 1, tr: 0, c: 0, t: 0, days: 30, how: 'Uống buổi sáng', note: ''}, {id: 'ro2', drugId: 'aceno4', s: 0, tr: 0, c: 0.5, t: 0, days: 30, how: 'Uống cùng giờ mỗi ngày; liều chỉnh theo INR', note: ''}]});
  const v = newVisitObj(p, 'clinic');
  Object.assign(v, {id: 'v_demo_now', date: '2026-10-21', status: 'done', reason: 'Đau bụng vùng thượng vị 2 tuần',
    hpi: 'Đau âm ỉ vùng thượng vị, tăng khi đói và sau ăn đồ cay; kèm ợ hơi, ợ chua. Không nôn, không đi ngoài phân đen. Gần đây tự mua thuốc giảm đau khớp (không rõ tên) uống vài lần.',
    vitals: {sbp: 145, dbp: 85, pulse: 82, temp: 36.8, spo2: 97, weight: 78, height: 168, waist: 98},
    exam: 'Bụng mềm, ấn đau nhẹ vùng thượng vị, không phản ứng thành bụng. Gan lách không sờ thấy. Tim loạn nhịp hoàn toàn, tần số ~80 l/ph. Khớp gối 2 bên lạo xạo, không sưng nóng.',
    orders: [ord('ctm', 128, 'Thấp'), ord('creat', 155, 'Cao'), ord('ast', 28, 'BT'), ord('alt', 32, 'BT'), ord('inr', 2.4, 'BT'), ord('k', 4.8, 'BT'),
      ord('sa_bung', 'Gan nhiễm mỡ độ I. Hai thận kích thước bình thường, nhu mô tăng âm nhẹ. Không có dịch ổ bụng.'),
      ord('ns_dd', 'Viêm sung huyết niêm mạc hang vị, không loét, không chảy máu. Test urease (CLO test) âm tính.')],
    dx: {main: 'Viêm dạ dày (viêm sung huyết hang vị), H. pylori âm tính', icd: 'K29.7 – Viêm dạ dày, không đặc hiệu', secondary: 'Tăng huyết áp; Rung nhĩ đang dùng kháng vitamin K; Bệnh thận mạn G3b; Thoái hoá khớp gối 2 bên; Béo phì độ I', disp: 'outpatient', note: ''},
    rx: [{id: 'rn1', drugId: 'panto40f', s: 1, tr: 0, c: 0, t: 0, days: 7, how: 'Uống trước ăn sáng 30 phút', note: ''}, {id: 'rn2', drugId: 'para500', s: 1, tr: 0, c: 1, t: 0, days: 7, how: 'Uống khi đau khớp; tối đa 4 viên/ngày', note: ''}],
    rxNote: 'Không tự mua thuốc giảm đau kháng viêm (ibuprofen, diclofenac, meloxicam…), thuốc nam, thực phẩm chức năng khi chưa hỏi bác sĩ. Tiếp tục Sintrom và amlodipin như cũ.',
    plan: {followDays: 7, followDate: '2026-10-28', followReason: 'Đánh giá đáp ứng điều trị; kiểm tra INR do mới dùng thêm thuốc.', returnSigns: TEMPLATES_SEED.find(t => t.id === 'ret_peptic').text + '\n' + TEMPLATES_SEED.find(t => t.id === 'ret_anticoag').text, notes: ''},
    nutrition: {goal: 'lose', text: TEMPLATES_SEED.find(t => t.id === 'd_peptic').text + '\n' + TEMPLATES_SEED.find(t => t.id === 'd_ckd').text},
    activity: {minutes: 30, joint: true, text: TEMPLATES_SEED.find(t => t.id === 'e_oa').text},
    rehab: {text: TEMPLATES_SEED.find(t => t.id === 'r_knee').text}, tcm: {text: TEMPLATES_SEED.find(t => t.id === 't_epi').text},
    psych: {phq9: 6, gad7: 9, text: TEMPLATES_SEED.find(t => t.id === 'p_gut').text + '\n' + TEMPLATES_SEED.find(t => t.id === 'p_cbt').text}});
  v.print.psych = true;
  p.visits = [old, v];
  p.updatedAt = new Date().toISOString();
  return p;
}

// ================= KHỞI ĐỘNG =================
async function seedAll(withDemo){
  S.settings = {id: 'settings', clinic: 'Phòng khám Nội tổng quát', doctor: 'BS. Toàn', address: '', phone: '', footer: 'Phiếu dùng để tư vấn và theo dõi điều trị. Vui lòng mang theo khi tái khám.', lastBackup: null, created: new Date().toISOString()};
  await Store.put('kv', S.settings);
  await Store.putMany('drugs', clone(DRUGS_SEED));
  await Store.putMany('templates', clone(TEMPLATES_SEED));
  if(withDemo) await Store.put('patients', demoPatient());
  await loadAll();
}
async function loadAll(){
  S.patients = (await Store.all('patients')) || [];
  S.patients.forEach(p => { p.visits = p.visits || []; p.conds = p.conds || []; p.recalls = p.recalls || []; p.meds = p.meds || []; });
  S.drugs = (await Store.all('drugs')) || [];
  S.tpls = (await Store.all('templates')) || [];
  const st = await Store.get('kv', 'settings'); if(st) S.settings = st;
  await addNewSeedDrugs();
  await updateSeedDrugs();
  await addNewSeedTpls();
  await updateSeedTpls();
}
// Mẫu lời dặn bổ sung sau khi phát hành: chỉ thêm id chưa có, mỗi id đúng một lần (BS đã xoá thì không thêm lại)
const TPL_ADDED = ['adv_psych'];
// Sửa nội dung mẫu đã phát hành: thay đoạn `from` bằng `to` một lần (nhớ ở settings.tplUpdated); mẫu bác sĩ đã sửa đoạn đó thì giữ nguyên
const TPL_UPDATES = [{ver: 'psych-mang-thai-2026-10-28', id: 'adv_psych', from: 'không tự ý ngừng thuốc. Báo bác sĩ', to: 'không tự ý ngừng thuốc. Tránh mang thai trong thời gian sử dụng thuốc. Báo bác sĩ'}];
async function updateSeedTpls(){
  const done = S.settings.tplUpdated || [], todo = TPL_UPDATES.filter(u => !done.includes(u.ver));
  if(!todo.length) return;
  for(const u of todo){ const t = S.tpls.find(x => x.id === u.id); if(t && t.text.includes(u.from) && !t.text.includes(u.to)){ t.text = t.text.replace(u.from, u.to); await Store.put('templates', t); } }
  S.settings.tplUpdated = done.concat(todo.map(u => u.ver)); await saveSettings();
}
async function addNewSeedTpls(){
  const done = S.settings.tplAdded || [], todo = TPL_ADDED.filter(id => !done.includes(id));
  if(!todo.length) return;
  for(const id of todo){ const t = TEMPLATES_SEED.find(x => x.id === id); if(t && !S.tpls.some(x => x.id === id)){ const c = clone(t); S.tpls.push(c); await Store.put('templates', c); } }
  S.settings.tplAdded = done.concat(todo); await saveSettings();
}
// Thuốc mẫu bổ sung sau khi phát hành: chỉ thêm id chưa có, không ghi đè; mỗi id thêm đúng một lần (BS đã xoá thì không thêm lại)
const SEED_ADDED = ['gavis10',
  // thuốc tâm thần theo BYT 2020 (2026-10)
  'sert50f','escit10n','fluox20n','fluox20f','parox20n','parox20f','venla75n','venla75f','dulox30n','dulox30f','mirta30n','mirta30f','tiane12','sulpi50',
  'broma6','loraz1','alpra05n','alpra05f','clona2','etifo50','zopi7n','zopi7f','olan10n','olan10f','quet100n','quet100f','risp2n','risp2f','arip10n','arip10f','amis200',
  'valp500n','valp500f','carba200n','carba200f','oxca300','lamo50n','lamo50f','gaba300n','gaba300f','done5n','done5f','riva3','gala8',
  'agome25', 'fluvo100', 'pregab75', 'propra40', 'piracetam', 'ginkgo', 'vinpocetin', 'cholalf', 'nicergolin', 'silymarin',
  // thuốc tăng huyết áp nhóm A, B, C, D theo VNHA 2026 (2026-10-30)
  'lisi10', 'rami5', 'capto25', 'telmi40', 'valsa80', 'irbe150', 'meto50', 'nebi5', 'carve625', 'ateno50', 'nife30', 'lerca10', 'felo5', 'dilti60', 'hctz25'];
async function addNewSeedDrugs(){
  const done = S.settings.seedAdded || [], todo = SEED_ADDED.filter(id => !done.includes(id));
  if(!todo.length) return;
  for(const id of todo){ const d = DRUGS_SEED.find(x => x.id === id); if(d && !S.drugs.some(x => x.id === id)){ const c = clone(d); S.drugs.push(c); await Store.put('drugs', c); } }
  S.settings.seedAdded = done.concat(todo); await saveSettings();
}
// Cập nhật nội dung lâm sàng của thuốc mẫu đã phát hành (một lần mỗi đợt), GIỮ NGUYÊN tên, giá, đơn vị bác sĩ đã sửa
const SEED_UPDATES = [{ver: 'stahl-2026-10', ids: SEED_ADDED.slice(1)},   // 44 thuốc tâm thần, đối chiếu Stahl's Prescriber's Guide
  {ver: 'moi-2026-10', ids: SEED_ADDED.slice(1)},
  {ver: 'tha-abcd-2026-10-30', ids: ['amlo5', 'inda15']}];                          // ưu tiên khuyến cáo mới hơn Stahl 2004 (LactMed, FDA/EMA, SmPC)
const SEED_CLIN = ['tags', 'how', 'ae', 'warn', 'pro', 'con', 'renal', 'hep', 'old', 'preg', 'lact', 'cond'];
async function updateSeedDrugs(){
  const done = S.settings.seedUpdated || [], todo = SEED_UPDATES.filter(u => !done.includes(u.ver));
  if(!todo.length) return;
  for(const u of todo) for(const id of u.ids){
    const d = S.drugs.find(x => x.id === id), s = DRUGS_SEED.find(x => x.id === id); if(!d || !s) continue;
    SEED_CLIN.forEach(k => { if(s[k] === undefined) delete d[k]; else d[k] = clone(s[k]); });
    await Store.put('drugs', d);
  }
  S.settings.seedUpdated = done.concat(todo.map(u => u.ver)); await saveSettings();
}
function bindEvents(){
  document.addEventListener('click', e => { const a = e.target.closest('[data-act]'); if(a){ const f = ACT[a.dataset.act]; if(f) f(a, e); }
    if(!e.target.closest('.dsearch')) $$('.dres').forEach(x => x.hidden = true); });
  document.addEventListener('input', e => {
    const el = e.target;
    if(el.matches('[data-b]')) return onBind(el);
    if(el.id === 'pq'){ S.q = el.value; renderPlist(); }
    else if(el.id === 'dq') renderDres();
    else if(el.id === 'cmpG'){ S.rxG = el.value; renderMain(true); const q = $('#dq'); if(q && S.rxG){ q.focus(); renderDres(); } }
    else if(el.id === 'mq') renderMres();
    else if(el.id === 'dfq'){ S.dfq = el.value; $('#dtable').innerHTML = drugTable(); }
    else if(el.id === 'dg'){ S.dg = el.value; $('#dtable').innerHTML = drugTable(); }
    else if(el.matches('.tplsel')){ if(el.value) insertTpl(el.value, el.dataset.path); el.value = ''; }
  });
  document.addEventListener('focusin', e => { if(e.target.id === 'dq' && S.rxG) renderDres(); });
  document.addEventListener('keydown', e => {
    if((e.target.id === 'dq' || e.target.id === 'mq') && e.key === 'Enter'){ e.preventDefault(); const box = $(e.target.id === 'dq' ? '#dres' : '#mres'); const it = box && !box.hidden && box.querySelector('.it.hl'); if(it) ACT[it.dataset.act](it); }
    if((e.target.id === 'dq' || e.target.id === 'mq') && (e.key === 'ArrowDown' || e.key === 'ArrowUp')){ e.preventDefault(); const box = $(e.target.id === 'dq' ? '#dres' : '#mres'); const its = $$('.it', box); const i = its.findIndex(x => x.classList.contains('hl')); const j = Math.max(0, Math.min(its.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))); its.forEach((x, k) => x.classList.toggle('hl', k === j)); its[j] && its[j].scrollIntoView({block: 'nearest'}); }
    if(e.target.id === 'ordCustom' && e.key === 'Enter'){ e.preventDefault(); ACT.ordCustom(); }
    if(e.key === 'Escape' && S.modal) closeModal();
  });
  document.addEventListener('change', async e => {
    const el = e.target;
    if(el.id === 'fileUp'){ const v = curV(), p = curP(); const lim = Store.mode === 'dir' ? 50 : 8; for(const f of el.files){ if(f.size > lim * 1024 * 1024){ toast(f.name + ' quá ' + lim + ' MB'); continue; } const id = uid('f'); try { if(Store.mode === 'dir') await Store.put('files', {id, name: f.name, type: f.type, size: f.size, blob: f}); else await Store.put('files', {id, name: f.name, type: f.type, size: f.size, data: await blobToDataUrl(f)}); } catch(e){ toast('Không lưu được ' + f.name + ': ' + e.message); continue; } v.files = v.files || []; v.files.push({id, name: f.name, type: f.type, size: f.size}); } savePatient(p); renderMain(true); }
    if(el.id === 'importFile' && el.files[0]) importAll(el.files[0]);
  });
  window.addEventListener('pagehide', flushSaves);
  document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'hidden') flushSaves(); });
  window.addEventListener('afterprint', () => { $('#printRoot').innerHTML = ''; });
}
async function pickDir(){
  if(!Store.canDir) return toast('Trình duyệt này không hỗ trợ. Hãy mở app bằng Chrome hoặc Edge.');
  const t0 = Date.now();
  let h; try { h = await window.showDirectoryPicker({id: 'hsbn-data', mode: 'readwrite', startIn: 'desktop'}); } catch(e){
    // AbortError ngay lập tức (không kịp hiện cửa sổ) = trình duyệt chặn, không phải người dùng bấm Huỷ
    if(e.name !== 'AbortError') toast('Không chọn được thư mục: ' + e.message);
    else if(BAD_BROWSER || Date.now() - t0 < 300) alert(BROWSER_MSG);
    return; }
  if(Store.mode === 'dir' && await Store.dir.root.isSameEntry(h)) return toast('App đang dùng chính thư mục này');
  await startDir(h, true);
}
async function startDir(h, picked){
  flushSaves();
  let d; try { d = await makeDirStore(h); } catch(e){ console.error(e); alert(`Không mở được thư mục "${h.name}".\n\nChi tiết lỗi: ${e.name}: ${e.message}`); return false; }
  const src = Store.mode === 'dir' ? Store.dir : ((await IDB.get('kv', 'settings')) ? IDB : null);
  if(d.hasData()){
    if(picked && Store.mode === 'dir' && !confirm(`Thư mục "${h.name}" đã có ${d.cache.patients.size} hồ sơ. Mở dữ liệu trong thư mục đó? (Dữ liệu ở thư mục cũ vẫn giữ nguyên)`)) return false;
  } else if(src){
    const n = (await src.all('patients')).filter(p => !p.demo).length;
    if(n && confirm(`Thư mục "${h.name}" chưa có dữ liệu. Chép ${n} hồ sơ hiện có (cùng danh mục thuốc, mẫu, cài đặt) vào thư mục này?`)){ try { await Store.copyAll(src, d); } catch(e){ console.error(e); toast('Chép dữ liệu lỗi: ' + e.message); return false; } }
  }
  await Store.useDir(d);
  try { await IDB.put('kv', {id: 'dirh', h}); await IDB.del('kv', 'pref'); } catch(e){ console.warn('Không nhớ được liên kết thư mục', e); }
  S.fileHandle = null; S.fileNeedsPerm = false; S.storeErr = null; S._bk = null;
  Store.pend = null; S.pendingDir = null;
  if(!d.hasData()) await seedAll(!(await IDB.get('kv', 'settings'))?.demoCleared); else await loadAll();
  try { await Store.mirrorAll(); } catch(e){ console.warn('Không tạo được bản sao trong trình duyệt', e); }
  if(S.gate || picked){ S.gate = null; S.view = {name: 'home'}; }
  render(); dailyBackup();
  if(picked) toast('Đang lưu dữ liệu vào thư mục ' + h.name);
  return true;
}
async function startBrowser(){
  Store.mode = IDB.mode; S.gate = null;
  const st = await IDB.get('kv', 'settings');
  if(!st) await seedAll(true); else await loadAll();
  try { const fh = await IDB.get('kv', 'fh'); if(fh && fh.h){ S.fileHandle = fh.h; S.fileNeedsPerm = (await fh.h.queryPermission({mode: 'readwrite'})) !== 'granted'; } } catch(e){ console.warn(e); }
  render();
}
// Mở app bằng bản sao trong trình duyệt khi chưa có quyền thư mục; ghi tạm vào IndexedDB và nhớ hàng chờ
async function startPending(h){
  Store.mode = IDB.mode; Store.dir = null; S.gate = null; S.pendingDir = h;
  const ps = await IDB.get('kv', 'pendsync').catch(() => null); Store.pend = new Map((ps && ps.items) || []);
  await loadAll(); render();
  // Lần bấm/chạm đầu tiên (thao tác của người dùng) mới được phép hiện hộp xin quyền
  document.addEventListener('pointerdown', () => { if(S.pendingDir) connectPending(true); }, {capture: true, once: true});
}
async function connectPending(auto){
  const h = S.pendingDir; if(!h || S._connecting) return; S._connecting = true;
  try {
    dirPerm.last = dirPerm.err = null;
    let ok = false; try { ok = await dirPerm(h, true); } catch(e){ dirPerm.err = e; }
    if(!ok){ if(!auto) alert(`Chưa kết nối được thư mục "${h.name}". Thay đổi vẫn được giữ tạm trong trình duyệt.\n\nAnh bấm "Kết nối thư mục" và chọn "Cho phép"${dirPerm.err ? `\n\nChi tiết: ${dirPerm.err.name}: ${dirPerm.err.message}` : ''}`); return; }
    await flushSaves();
    let d; try { d = await makeDirStore(h); } catch(e){ alert(`Không mở được thư mục "${h.name}" (có thể đã bị đổi tên hoặc di chuyển). Thay đổi vẫn được giữ tạm trong trình duyệt.\n\nChi tiết: ${e.name}: ${e.message}`); return; }
    const n = await Store.syncPending(d);
    await IDB.del('kv', 'pendsync');
    const view = S.view;
    if(await startDir(h)){ S.view = view; render(); if(n) toast(`Đã ghi ${n} thay đổi vào thư mục ${h.name}`); }
  } catch(e){ console.error(e); alert('Ghi vào thư mục bị lỗi, thay đổi vẫn được giữ tạm trong trình duyệt.\n\nChi tiết: ' + e.message); }
  finally { S._connecting = false; }
}
async function boot(){
  if(Store.canDir){
    let h = null; try { const r = await IDB.get('kv', 'dirh'); h = r && r.h; } catch(e){}
    if(h){ let ok = false; try { ok = await dirPerm(h, false); } catch(e){} if(ok && await startDir(h)) return;
      // Chưa có quyền: nếu đã có bản sao của đúng thư mục này thì mở app ngay, xin quyền ở lần bấm đầu tiên
      const mir = await IDB.get('kv', 'mirror').catch(() => null);
      if(mir && mir.name === h.name && (await IDB.get('kv', 'settings').catch(() => null))) return startPending(h);
      S.gate = {kind: 'reconnect', h}; return render(); }
    const pref = await IDB.get('kv', 'pref');
    if(!(pref && pref.browserOnly)){ S.gate = {kind: 'setup'}; return render(); }
  }
  await startBrowser();
}
async function init(){
  $('#dlHow').innerHTML = HOWTO.map(h => `<option value="${esc(h)}">`).join('');
  $('#dlIcd').innerHTML = ICD.map(([c, n]) => `<option value="${esc(c + ' – ' + n)}">`).join('');
  await Store.init();
  bindEvents();
  try { const bc = new BroadcastChannel('hsbn'); bc.onmessage = e => { if(e.data === 'hi') bc.postMessage('here'); else if(e.data === 'here' && !S.otherTab){ S.otherTab = true; if(!S.gate) renderMain(true); } }; bc.postMessage('hi'); } catch(e){}
  await boot();
}
init();
