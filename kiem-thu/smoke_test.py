"""Kiểm thử nhanh toàn bộ luồng chính bằng trình duyệt thật (Chromium headless).

Cài một lần:   pip install playwright  &&  python -m playwright install chromium
Chạy:          python kiem-thu/smoke_test.py          (từ thư mục ma-nguon)

Script tự build app ra thư mục tạm, chạy web server cục bộ, và thay cửa sổ "chọn thư mục"
(showDirectoryPicker) bằng thư mục ảo OPFS của trình duyệt — nên KHÔNG đụng tới dữ liệu thật.
Mọi lỗi JavaScript trên trang hoặc kết quả sai đều làm script dừng với AssertionError.
"""
import json, pathlib, subprocess, sys, tempfile, time
from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
SRC = HERE.parent
TMP = pathlib.Path(tempfile.mkdtemp(prefix='hsbn-test-'))
PORT = 8799
URL = f'http://localhost:{PORT}/app.html'

# showDirectoryPicker giả: trả về thư mục "BS-TOAN" trong OPFS (Origin Private File System)
FAKE_PICKER = """window.showDirectoryPicker = async () =>
  (await navigator.storage.getDirectory()).getDirectoryHandle('BS-TOAN', {create: true});"""
LIST = """async () => { const out = []; async function walk(d, pre){ for await (const [n, h] of d.entries()){
  if(h.kind === 'directory') await walk(h, pre + n + '/'); else out.push(pre + n); } }
  await walk(await navigator.storage.getDirectory(), ''); return out.sort(); }"""
READ = """async (path) => { let d = await navigator.storage.getDirectory(); const parts = path.split('/');
  for(const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p);
  return await (await (await d.getFileHandle(parts.at(-1))).getFile()).text(); }"""


def main():
    subprocess.run([sys.executable, str(SRC / 'build.py'), str(TMP / 'app.html')], check=True)
    (TMP / 'ket-qua.pdf').write_bytes(b'%PDF-1.4 smoke test')
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '-d', str(TMP)],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
    errs = []
    try:
        with sync_playwright() as pw:
            b = pw.chromium.launch()
            ctx = b.new_context(viewport={'width': 1280, 'height': 850})
            ctx.add_init_script(FAKE_PICKER)
            # giả lập trình duyệt chưa cấp quyền khi mở lại (bật bằng sessionStorage.fakePrompt)
            ctx.add_init_script("""{ const P = FileSystemHandle.prototype; window.__qp = P.queryPermission; window.__rp = P.requestPermission;
              if(sessionStorage.getItem('fakePrompt')){ P.queryPermission = async () => 'prompt'; P.requestPermission = async () => 'granted'; } }""")
            pg = ctx.new_page()
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.on('dialog', lambda d: d.accept())          # tự bấm OK mọi confirm()

            # 1. Lần đầu mở: màn hình chọn nơi lưu
            pg.goto(URL); pg.wait_for_function('typeof S !== "undefined" && !!S.gate', timeout=10000)
            assert pg.evaluate('S.gate && S.gate.kind') == 'setup', 'phải hiện màn hình chọn thư mục'

            # 1b. Trình duyệt chặn cửa sổ chọn thư mục (Opera, Cốc Cốc) -> phải báo, không im lặng
            msgs = []
            pg.on('dialog', lambda d: msgs.append(d.message))
            pg.evaluate("""() => { window.__sdp = window.showDirectoryPicker;
                window.showDirectoryPicker = () => Promise.reject(new DOMException('blocked', 'AbortError')); }""")
            pg.click('[data-act="gatePick"]'); pg.wait_for_timeout(300)
            assert any('Chrome hoặc Edge' in m for m in msgs), msgs
            pg.evaluate('() => { window.showDirectoryPicker = window.__sdp; }')
            assert pg.evaluate('S.gate && S.gate.kind') == 'setup'

            # 2. Tạm dùng trình duyệt, thêm 1 bệnh nhân, rồi chuyển sang thư mục -> dữ liệu được chép sang
            pg.click('[data-act="gateBrowser"]'); pg.wait_for_timeout(500)
            assert pg.evaluate('Store.mode') == 'idb'
            pg.evaluate("""async () => { const p = {...demoPatient(), id: 'p_test1', demo: false, code: 'BN0002', name: 'Trần Thị Bình'};
                           S.patients.push(p); await Store.put('patients', p); render(); }""")
            pg.click('.banner [data-act="dirPick"]'); pg.wait_for_timeout(1500)
            assert pg.evaluate('Store.mode') == 'dir'
            files = pg.evaluate(LIST)
            for need in ['BS-TOAN/du-lieu/cai-dat.json', 'BS-TOAN/du-lieu/danh-muc-thuoc.json',
                         'BS-TOAN/du-lieu/mau-tu-van.json', 'BS-TOAN/du-lieu/DOC-TRUOC.txt']:
                assert need in files, f'thiếu {need}'
            assert any(f.startswith('BS-TOAN/du-lieu/benh-nhan/tran-thi-binh_') for f in files)
            assert any(f.startswith('BS-TOAN/du-lieu/sao-luu/sao-luu-') for f in files)

            # 3. Sửa hồ sơ -> file đổi tên theo tên mới và nội dung cập nhật
            pg.evaluate("go({name: 'patient', pid: 'p_test1'})")
            pg.evaluate("() => { const p = curP(); p.phone = '0988 000 111'; p.name = 'Trần Thị Bình An'; savePatient(p); }")
            pg.wait_for_timeout(1200)
            pf = [f for f in pg.evaluate(LIST) if '/benh-nhan/tran-thi-binh' in f]
            assert len(pf) == 1 and 'tran-thi-binh-an_' in pf[0], pf
            assert json.loads(pg.evaluate(READ, pf[0]))['phone'] == '0988 000 111'
            # 3a. Ô "Tuổi" ở hồ sơ nền: nhập 45 -> birthYear = năm nay − 45
            pg.evaluate("go({name: 'patient', pid: 'p_test1', tab: 'profile'})"); pg.wait_for_timeout(300)
            dob0 = pg.evaluate("() => curP().dob || ''"); pg.evaluate("() => { curP().dob = ''; renderMain(true); }"); pg.wait_for_timeout(200)
            pg.fill('input[data-b="p.birthYear"][data-t="age"]', '45'); pg.wait_for_timeout(200)
            assert pg.evaluate("() => curP().birthYear") == pg.evaluate("() => Number(todayISO().slice(0, 4)) - 45"), 'ô Tuổi phải lưu thành năm sinh'
            pg.evaluate("(d) => { curP().dob = d; }", dob0)
            # 3a2. Ô "Tiền sử gia đình" nằm ngay dưới ô tiền sử bệnh (cùng thẻ Bệnh nền, tiền sử) và lưu vào p.famNote
            assert pg.evaluate("() => { const a = document.querySelector('[data-b=\"p.condNote\"]'), b = document.querySelector('[data-b=\"p.famNote\"]'); return !!a && !!b && a.closest('.card') === b.closest('.card') && !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING); }"), 'ô tiền sử gia đình phải ngay dưới ô tiền sử bệnh'
            pg.fill('textarea[data-b="p.famNote"]', 'Mẹ trầm cảm'); pg.wait_for_timeout(200)
            assert pg.evaluate("() => curP().famNote") == 'Mẹ trầm cảm'
            # 3b. Nhân trắc: ô InBody (body fat %, lean mass kg) lưu vào hồ sơ
            pg.evaluate("go({name: 'patient', pid: 'p_test1', tab: 'profile'})"); pg.wait_for_timeout(300)
            pg.fill('input[data-b="p.bodyFat"]', '28.5'); pg.fill('input[data-b="p.leanMass"]', '52'); pg.wait_for_timeout(200)
            assert pg.evaluate("[curP().bodyFat, curP().leanMass]") == [28.5, 52], 'ô InBody phải lưu số vào hồ sơ'

            # 4. Đính kèm file -> nằm trong tep-dinh-kem và đọc lại được
            pg.evaluate("go({name: 'visit', pid: 'p_test1', vid: 'v_demo_now', step: 2})"); pg.wait_for_timeout(300)
            pg.set_input_files('#fileUp', str(TMP / 'ket-qua.pdf')); pg.wait_for_timeout(1200)
            assert any('/tep-dinh-kem/' in f and f.endswith('__ket-qua.pdf') for f in pg.evaluate(LIST))
            got = pg.evaluate("async () => (await Store.get('files', curV().files[0].id)).data.slice(0, 20)")
            assert got.startswith('data:'), got

            # 5. Tải lại trang -> tự mở lại thư mục, dữ liệu còn nguyên
            pg.reload(); pg.wait_for_timeout(1500)
            assert pg.evaluate('Store.mode') == 'dir' and not pg.evaluate('S.gate')
            assert 'Trần Thị Bình An' in pg.evaluate('S.patients.map(p => p.name)')

            # 5b. Mở lại khi trình duyệt chưa cấp quyền thư mục -> vào giao diện ngay bằng bản sao,
            #     thay đổi giữ tạm, lần bấm đầu tiên xin quyền và ghi vào thư mục
            pg.evaluate("sessionStorage.setItem('fakePrompt', '1')")
            pg.reload(); pg.wait_for_function('typeof S !== "undefined" && (S.gate || S.pendingDir || Store.mode === "dir")', timeout=10000)
            pg.wait_for_timeout(500)
            assert pg.evaluate('!!S.pendingDir && !S.gate && Store.mode !== "dir"'), pg.evaluate('[!!S.pendingDir, S.gate && S.gate.kind, Store.mode]')
            assert 'Trần Thị Bình An' in pg.evaluate('S.patients.map(p => p.name)'), 'bản sao phải có dữ liệu'
            assert 'kết nối' in pg.inner_text('#savest')
            pg.evaluate("() => { const p = S.patients.find(x => x.id === 'p_test1'); p.phone = '0909 111 222'; savePatient(p); }")
            pg.wait_for_timeout(700)
            pf = [f for f in pg.evaluate(LIST) if '/benh-nhan/tran-thi-binh-an_' in f][0]
            assert json.loads(pg.evaluate(READ, pf))['phone'] == '0988 000 111', 'chưa kết nối thì chưa được ghi vào thư mục'
            assert pg.evaluate('Store.pend.size') >= 1
            pg.mouse.click(640, 600); pg.wait_for_timeout(1500)   # lần bấm đầu tiên -> xin quyền -> đồng bộ
            assert pg.evaluate('Store.mode === "dir" && !S.pendingDir'), 'phải kết nối thư mục sau lần bấm đầu tiên'
            assert json.loads(pg.evaluate(READ, pf))['phone'] == '0909 111 222', 'thay đổi lúc chưa kết nối phải được ghi vào thư mục'
            pg.evaluate("() => { sessionStorage.removeItem('fakePrompt'); const P = FileSystemHandle.prototype; P.queryPermission = window.__qp; P.requestPermission = window.__rp; }")

            # 6. Kê đơn: thêm ibuprofen cho BN đang dùng Sintrom -> phải có cảnh báo mức 3
            pg.evaluate("go({name: 'visit', pid: 'p_demoA', vid: 'v_demo_now', step: 3})"); pg.wait_for_timeout(300)
            ibu = pg.evaluate("S.drugs.find(d => /ibuprofen/i.test(d.n)).id")
            pg.evaluate(f"addRx('{ibu}')"); pg.wait_for_timeout(300)
            assert pg.evaluate("checkAll(curP(), curV()).items.some(w => w.lv === 3 && /xuất huyết/i.test(w.m))")
            pg.evaluate("() => { const v = curV(); v.rx = v.rx.filter(l => l.drugId !== '%s'); savePatient(curP()); }" % ibu)

            # 6a. Trình duyệt trả về khác 'granted' dù đã bấm Cho phép (Cốc Cốc, file://) -> vẫn mở được nếu ghi thử được
            assert pg.evaluate("""async () => { const P = FileSystemHandle.prototype, q = P.queryPermission, r = P.requestPermission;
                P.queryPermission = async () => 'prompt'; P.requestPermission = async () => 'prompt';
                try { return await dirPerm(Store.dir.root, true); } finally { P.queryPermission = q; P.requestPermission = r; } }""")
            assert '.kiem-tra-quyen' not in ' '.join(pg.evaluate(LIST)), 'file ghi thử phải được xoá'

            # 6b. Thuốc mẫu bổ sung (Gaviscon): có trong danh mục, chỉ thêm một lần, không thêm lại khi BS đã xoá
            CNT = "S.drugs.filter(d => d.id === 'gavis10').length"
            DISK = "async () => JSON.parse(await (%s)('BS-TOAN/du-lieu/danh-muc-thuoc.json')).filter(d => d.id === 'gavis10').length" % READ
            assert pg.evaluate(CNT) == 1 and pg.evaluate(DISK) == 1, 'Gaviscon phải có đúng 1 lần sau khi khởi tạo'
            assert pg.evaluate("S.drugs.find(d => d.id === 'gavis10').g") == 'acid'
            pg.evaluate("""async () => { await Store.del('drugs', 'gavis10'); delete S.settings.seedAdded; await saveSettings(); await loadAll(); await loadAll(); }""")
            pg.wait_for_timeout(800)
            assert pg.evaluate(CNT) == 1 and pg.evaluate(DISK) == 1, 'Gaviscon phải được thêm đúng 1 lần cho dữ liệu cũ'
            assert pg.evaluate("S.settings.seedAdded.filter(x => x === 'gavis10').length") == 1
            pg.evaluate("""async () => { const d = S.drugs.find(d => d.id === 'gavis10'); d.p = 7777; await Store.put('drugs', d); await loadAll(); }""")
            assert pg.evaluate("S.drugs.find(d => d.id === 'gavis10').p") == 7777
            pg.evaluate("async () => { await Store.del('drugs', 'gavis10'); await loadAll(); }"); pg.wait_for_timeout(800)
            assert pg.evaluate(CNT) == 0 and pg.evaluate(DISK) == 0, 'Gaviscon đã xoá không được tự thêm lại'

            # 6d. Thuốc tâm thần BYT 2020: có trong danh mục, tương tác và bệnh nền được cảnh báo
            assert pg.evaluate("['olan10n','valp500n','lamo50n','carba200n','fluox20n','arip10n','done5n'].every(id => S.drugs.some(d => d.id === id))")
            CHK = """(ids) => { const p = curP(), v = curV(); const lines = ids.map((id, i) => ({line: {id: 'x' + i}, drug: drugById(id)}));
                       return checkAll(p, v, lines).items.filter(w => w.lines.length >= 1).map(w => w.lv + '|' + w.m); }"""
            pg.evaluate("go({name: 'visit', pid: 'p_demoA', vid: 'v_demo_now', step: 3})"); pg.wait_for_timeout(200)
            assert any(x.startswith('2|') and 'lamotrigin' in x for x in pg.evaluate(CHK, ['valp500n', 'lamo50n'])), 'valproat + lamotrigin: DTQG ghi hiệu chỉnh liều — mức 2'
            assert any('CYP2D6' in x for x in pg.evaluate(CHK, ['fluox20n', 'arip10n'])), 'fluoxetin + aripiprazol phải cảnh báo CYP2D6'
            assert any(x.startswith('2|') and 'carbamazepin' in x for x in pg.evaluate(CHK, ['carba200n', 'clari500'])), 'carbamazepin + clarithromycin: DTQG ghi chỉnh liều — mức 2'
            assert any('an thần' in x for x in pg.evaluate(CHK, ['alpra05n', 'zopi7n'])), 'hai thuốc an thần phải cảnh báo'
            assert any('cholinergic' in x for x in pg.evaluate(CHK, ['done5n', 'parox20n'])), 'donepezil + paroxetin phải cảnh báo đối kháng'
            assert any(x.startswith('3|') and 'serotonin' in x for x in pg.evaluate(CHK, ['seleg5', 'sert50'])), 'selegilin + sertralin phải cảnh báo mức 3'
            assert any('chảy máu' in x for x in pg.evaluate(CHK, ['omega1000', 'aceno4'])), 'omega-3 + kháng đông phải cảnh báo'
            r = pg.evaluate("""() => { const p = curP(), c = p.conds; p.conds = c.concat(['dementia']);
                       const out = checkAll(p, curV(), [{line: {id: 'y'}, drug: drugById('olan10n')}]).items.some(w => w.lv === 3 && /đột quỵ/.test(w.m)); p.conds = c; return out; }""")
            assert r, 'olanzapin ở bệnh nhân sa sút trí tuệ phải cảnh báo mức 3'

            # 6e. Đơn thuốc: chọn nhóm -> ô tên thuốc chỉ hiện thuốc của nhóm đó
            pg.select_option('#cmpG', 'neuro'); pg.wait_for_timeout(300)
            ids = pg.eval_on_selector_all('#dres .it', 'els => els.map(e => e.dataset.id)')
            assert len(ids) >= 40 and pg.evaluate("(ids) => ids.every(id => drugById(id).g === 'neuro')", ids), ids
            pg.fill('#dq', 'omep'); pg.wait_for_timeout(200)
            assert pg.eval_on_selector_all('#dres .it', 'els => els.length') == 0, 'thuốc tiêu hoá không được hiện khi đang chọn nhóm tâm thần'
            pg.select_option('#cmpG', 'acid'); pg.wait_for_timeout(300)
            pg.fill('#dq', ''); pg.click('#dq'); pg.wait_for_timeout(200)
            ids = pg.eval_on_selector_all('#dres .it', 'els => els.map(e => e.dataset.id)')
            assert 'omep20n' in ids and pg.evaluate("(ids) => ids.every(id => drugById(id).g === 'acid')", ids), ids
            pg.select_option('#cmpG', ''); pg.wait_for_timeout(200)
            pg.fill('#dq', 'sert'); pg.wait_for_timeout(200)
            assert 'sert50' in pg.eval_on_selector_all('#dres .it', 'els => els.map(e => e.dataset.id)')
            pg.fill('#dq', '')

            # 6f. Cập nhật nội dung lâm sàng thuốc mẫu (đợt Stahl) một lần, giữ giá bác sĩ đã sửa
            r = pg.evaluate("""async () => { const d = S.drugs.find(x => x.id === 'tiane12'); d.p = 9999; delete d.preg; d.warn = 'cũ';
                await Store.put('drugs', d); S.settings.seedUpdated = []; await saveSettings(); await loadAll();
                const e = S.drugs.find(x => x.id === 'tiane12'); return {p: e.p, preg: e.preg && e.preg.lv, warn: e.warn, ver: S.settings.seedUpdated}; }""")
            assert r['p'] == 9999 and r['preg'] == 3 and r['warn'] != 'cũ' and r['ver'] == ['stahl-2026-10', 'moi-2026-10', 'tha-abcd-2026-10-30', 'zolpidem-2026-11-02', 'trazodon-2026-11-02', 'mirtazapin-2026-11-02', 'tca-2026-11-02', 'diazepam-2026-11-02', 'piracetam-2026-11-05', 'donepezil-2026-11-07', 'piracetam400-2026-11-07', 'amitriptylin-2026-11-09', 'alprazolam-bo-05-2026-11-09', 'fluoxetin-bo-20-2026-11-12', 'tuong-tac-tam-than-2026-11-09'], r
            assert pg.evaluate("S.drugs.find(x => x.id === 'quet100n').lact.lv") == 1, 'quetiapin cho con bú phải theo LactMed (mức lưu ý)'
            # Methylphenidat (bác sĩ đặt 2026-11-05): chặn theo tiền sử; cách dùng chọn sẵn; lưu ý chỉnh liều
            MB = "([id, o]) => { const p = JSON.parse(JSON.stringify(curP())), v = JSON.parse(JSON.stringify(curV())); Object.assign(p, o); v.hpi = ''; v.dx = {icd: '', text: ''}; p.meds = []; return drugBlockReasons(p, v, drugById(id)).join(' | '); }"
            for mid in ['mph5', 'mph18er', 'mph20la']:
                assert pg.evaluate(MB, [mid, {'conds': [], 'condNote': ''}]) == '', (mid, pg.evaluate(MB, [mid, {'conds': [], 'condNote': ''}]))
            for cd, word in [('htn', 'tăng huyết áp'), ('af', 'rối loạn nhịp'), ('epilepsy', 'động kinh'), ('pad', 'bệnh mạch ngoại biên'), ('glaucoma', 'glôcôm')]:
                assert word in pg.evaluate(MB, ['mph5', {'conds': [cd], 'condNote': ''}]), cd
            assert 'tic' in pg.evaluate(MB, ['mph18er', {'conds': [], 'condNote': 'Tic vận động từ 8 tuổi'}])
            assert 'chóng mặt' in pg.evaluate(MB, ['mph20la', {'conds': [], 'condNote': 'Hay chóng mặt'}])
            assert pg.evaluate(MB, ['mph20la', {'conds': [], 'condNote': 'Không chóng mặt, thể tích bình thường'}]) == ''
            assert pg.evaluate("() => ['mph5', 'mph18er', 'mph20la'].map(id => drugById(id).howOpts[0]).join('|')") == 'Dùng mỗi lần 1 viên, ngày 2 lần sau ăn sáng, trưa|Dùng mỗi lần 1 viên, nuốt nguyên viên, không nhai, ngày 1 lần sau ăn sáng, không dùng tối do mất ngủ|Dùng mỗi lần 1 viên, ngày 1 lần sau ăn sáng'
            r = pg.evaluate("() => { const p = JSON.parse(JSON.stringify(curP())), v = JSON.parse(JSON.stringify(curV())); p.conds = []; p.condNote = ''; p.meds = []; v.dx = {icd: '', text: ''}; v.rx = [{id: 'r_mph', drugId: 'mph18er', name: 'Concerta', dose: [1, 0, 0, 0], days: 30, how: ''}]; return checkAll(p, v).items.map(i => i.kind + ': ' + i.m); }")
            assert any(x.startswith('Liều (quy tắc phòng khám): Tăng 18 mg mỗi tuần') for x in r), r
            assert pg.evaluate("() => drugById('mph18er').dnote.includes('18–72 mg/ngày') && drugById('mph5').dnote === 'Tăng 5–10 mg mỗi tuần, tối đa 60 mg/ngày.'")
            # Tự tích nhập viện (bác sĩ đặt 2026-11-09)
            AD = "(h) => admitReasons({hpi: h}).join(' | ')"
            for h, w in [('Có ý tưởng tự hại', 'tự hại'), ('Tự gây thương tích ở tay', 'tự gây thương tích'), ('Ý định tự sát', 'tự sát'), ('Muốn tự tử', 'tự sát'), ('Kích động về đêm', 'kích động')]:
                assert w in pg.evaluate(AD, h), h
            assert pg.evaluate(AD, 'Không có ý định tự sát') == '' and pg.evaluate(AD, 'Không kích động') == '' and pg.evaluate(AD, 'Đau đầu') == ''
            st = pg.evaluate("""() => { const v = curV(), p = curP(), h0 = v.hpi; const dx0 = JSON.stringify(v.dx || {}), m0 = v.mental; v.mental = {sx: []}; v.dx = Object.assign(v.dx || {}, {disp: 'outpatient', dispManual: false, dispAuto: false});
              v.hpi = 'Có ý tưởng tự sát'; autoRefer(v, p); const a = v.dx.disp; v.mental = {sx: ['psy_delus']}; autoRefer(v, p); const b = v.dx.disp; v.hpi = ''; autoRefer(v, p); const c = v.dx.disp; v.mental = {sx: []}; autoRefer(v, p); const d = v.dx.disp;
              v.dx.dispManual = true; v.dx.disp = 'refer'; v.hpi = 'Kích động'; autoRefer(v, p); const e = v.dx.disp; v.hpi = h0; v.dx = JSON.parse(dx0); v.mental = m0; return [a, b, c, d, e]; }""")
            assert st == ['admit', 'admit', 'refer', 'outpatient', 'refer'], st
            # Chán ăn tâm thần -> nhập viện (bác sĩ đặt 2026-11-09)
            AN = "(o) => { const p = Object.assign(JSON.parse(JSON.stringify(curP())), {conds: [], condNote: '', bodyFat: null, weight: 50, height: 160}, o.p || {}), v = {id: 'x', date: '2026-11-09', hpi: o.hpi || '', exam: '', vitals: o.v || {}, orders: o.ord || [], dx: {icd: o.icd === undefined ? 'F50.0 – Chán ăn tâm thần' : o.icd, main: ''}, mental: {sx: []}}; return admitReasons(v, p).join(' | '); }"
            assert pg.evaluate(AN, {}) == '', pg.evaluate(AN, {})
            for o, w in [({'v': {'pulse': 45}}, 'mạch'), ({'v': {'sbp': 85}}, 'HA tâm thu'), ({'v': {'temp': 35.2}}, 'nhiệt độ'), ({'p': {'weight': 30}}, 'BMI'), ({'p': {'bodyFat': 8}}, 'body fat'), ({'hpi': 'Từ chối ăn 3 ngày'}, 'từ chối ăn'), ({'p': {'conds': ['af']}}, 'rối loạn nhịp'), ({'ord': [{'key': 'ecg', 'value': 'Rung nhĩ đáp ứng thất nhanh'}]}, 'rối loạn nhịp')]:
                assert w in pg.evaluate(AN, o), o
            assert pg.evaluate(AN, {'v': {'pulse': 50, 'sbp': 90, 'temp': 35.6}, 'p': {'bodyFat': 10}}) == '', 'đúng ngưỡng chưa tính'
            assert pg.evaluate(AN, {'hpi': 'Không từ chối ăn'}) == ''
            assert pg.evaluate(AN, {'icd': 'F32.1 – x', 'v': {'pulse': 45}}) == '', 'chỉ áp cho chán ăn tâm thần'
            # Ăn vô độ tâm thần -> nhập viện (bác sĩ đặt 2026-11-09)
            BN = lambda o: pg.evaluate(AN, dict({'icd': 'F50.2 – Ăn vô độ tâm thần'}, **o))
            assert BN({}) == '', BN({})
            for o, w in [({'ord': [{'key': 'k', 'value': '3,1'}]}, 'kali'), ({'ord': [{'key': 'cl', 'value': 85}]}, 'clo'), ({'p': {'conds': ['af']}}, 'rối loạn nhịp'), ({'v': {'temp': 35.2}}, 'nhiệt độ'), ({'hpi': 'Có cơn ngất'}, 'ngất'), ({'hpi': 'Nôn liên tục 2 ngày'}, 'nôn liên tục'), ({'hpi': 'Nôn ra máu'}, 'nôn máu'), ({'hpi': 'Nôn máu'}, 'nôn máu'), ({'hpi': 'Có ý định tự sát'}, 'tự sát')]:
                assert w in BN(o), o
            assert BN({'ord': [{'key': 'k', 'value': 3.2}, {'key': 'cl', 'value': 88}], 'v': {'temp': 35.6}}) == '', 'đúng ngưỡng chưa tính'
            assert BN({'hpi': 'Không ngất, không nôn máu'}) == '' and BN({'hpi': 'Khó thở, ngạt mũi'}) == ''
            assert pg.evaluate(AN, {'icd': 'F32.1 – x', 'ord': [{'key': 'k', 'value': 3}]}) == '', 'chỉ áp cho ăn vô độ'
            # Tự tích chuyển tuyến (bác sĩ đặt 2026-11-07)
            RR = "(o) => { const v = JSON.parse(JSON.stringify(curV())); v.mental = {sx: o.sx || []}; v.hpi = o.hpi || ''; v.exam = o.exam || ''; return referReasons(curP(), v).join(' | '); }"
            assert pg.evaluate(RR, {'sx': [], 'hpi': 'Có ý định tự sát'}) == '', 'chưa khám tâm thần thì không gợi ý'
            assert pg.evaluate(RR, {'sx': ['dep_mood']}) == ''
            for h, w in [('Có ý định tự sát', 'tự sát'), ('Hay tự hại', 'tự hại'), ('Có hành vi bạo lực', 'bạo lực'), ('Đe doạ gây hại người khác', 'gây hại người khác'), ('Kích động nặng về đêm', 'kích động nặng'), ('3 ngày nay không ăn uống', 'không ăn uống')]:
                assert w in pg.evaluate(RR, {'sx': ['dep_mood'], 'hpi': h}), h
            _r = pg.evaluate(RR, {'sx': ['dep_mood'], 'hpi': 'Không có ý định tự sát'}); assert _r == '', _r
            for ex, w in [('Thể trạng suy kiệt', 'suy kiệt'), ('Dấu hiệu mất nước (+)', 'mất nước'), ('Rối loạn định hướng thời gian', 'định hướng')]:
                assert w in pg.evaluate(RR, {'sx': ['dep_mood'], 'exam': ex}), ex
            assert pg.evaluate(RR, {'sx': ['dep_mood'], 'exam': 'Dấu hiệu mất nước (-)'}) == ''
            assert pg.evaluate(RR, {'sx': ['dep_mood'], 'exam': 'Không có dấu hiệu mất nước'}) == ''
            assert 'hoang tưởng' in pg.evaluate(RR, {'sx': ['psy_delus']})
            st = pg.evaluate("""() => { const v = curV(), p = curP(); v.mental = {sx: ['psy_halluc']}; v.dx = Object.assign(v.dx || {}, {disp: 'outpatient', dispManual: false, dispAuto: false});
              autoRefer(v, p); const a = v.dx.disp; v.mental.sx = []; autoRefer(v, p); const b = v.dx.disp;
              v.dx.dispManual = true; v.dx.disp = 'admit'; v.mental.sx = ['psy_halluc']; autoRefer(v, p); const c = v.dx.disp;
              v.dx = Object.assign(v.dx, {disp: '', dispManual: false, dispAuto: false}); v.mental = {sx: []}; return [a, b, c]; }""")
            assert st == ['refer', 'outpatient', 'admit'], st
            # Sàng lọc rối loạn nhận thức (bác sĩ đặt 2026-11-06), chu kỳ 6 tháng
            CG = "(o) => { const p = Object.assign(JSON.parse(JSON.stringify(curP())), {conds: [], condNote: '', visits: [], dob: ''}, o); const r = screenList(p).find(x => x.r.id === 'cog'); return r ? r.every : 0; }"
            def yob(a): return str(int(pg.evaluate("() => todayISO().slice(0,4)")) - a) + '-01-01'
            assert pg.evaluate(CG, {'dob': yob(70)}) == 0
            assert pg.evaluate(CG, {'dob': yob(70), 'condNote': 'Hay quên, giảm trí nhớ 1 năm'}) == 6
            assert pg.evaluate(CG, {'dob': yob(55), 'condNote': 'Hay quên'}) == 0
            assert pg.evaluate(CG, {'dob': yob(55), 'condNote': 'Đột quỵ nhồi máu não 2024'}) == 6
            assert pg.evaluate(CG, {'dob': yob(50), 'conds': ['parkinson']}) == 6
            assert pg.evaluate(CG, {'dob': yob(50), 'conds': ['diabetes']}) == 6
            assert pg.evaluate(CG, {'dob': yob(62), 'conds': ['depression']}) == 6
            assert pg.evaluate(CG, {'dob': yob(40), 'conds': ['depression']}) == 0
            assert pg.evaluate(CG, {'dob': yob(70), 'conds': ['dementia', 'diabetes']}) == 0
            # Ức chế cholinesterase (bác sĩ đặt 2026-11-07)
            assert pg.evaluate("() => { const d = drugById('mema5'); return d && d.how === '' && d.howOpts[0] === 'Ngày uống 1 viên cùng bữa ăn sáng' && d.dnote.includes('10 mg × 2 lần (liều đích)') && d.dose.join() === '1,0,0,0'; }")
            RB2 = "([id, o]) => { const p = JSON.parse(JSON.stringify(curP())), v = JSON.parse(JSON.stringify(curV())); Object.assign(p, o); v.vitals = {}; v.hpi = ''; v.dx = {icd: '', text: ''}; p.meds = []; return drugBlockReasons(p, v, drugById(id)).join(' | '); }"
            assert pg.evaluate("() => ['cbcl', 'cbcl_tot', 'cbcl_int', 'cbcl_ext'].every(k => LABS.some(x => x[1] === k)) && scaleResult('cbcl_tot', 58).lv === 0 && scaleResult('cbcl_tot', 62).lv === 1 && scaleResult('cbcl_ext', 70).lv === 3")
            # Cận lâm sàng tự chọn khi tiền sử rối loạn nhận thức (bác sĩ đặt 2026-11-07)
            assert pg.evaluate("() => ['adl', 'iadl', 'gds', 'psqi'].every(k => LABS.some(x => x[1] === k)) && scaleResult('adl', 2).lv === 3 && scaleResult('adl', 6).lv === 0")
            CO = """(o) => { const p = Object.assign(JSON.parse(JSON.stringify(curP())), {conds: [], condNote: ''}, o.p || {}); p.visits = o.visits || [];
              const v = {id: 'vnew', date: '2026-11-07', orders: [], dx: {}}; p.visits.push(v); const n = autoCogOrders(p, v); return v.orders.map(x => x.key).join(','); }"""
            assert pg.evaluate(CO, {}) == ''
            full = 'ctm,glu,na,k,cl,ast,alt,ure,creat,ldl,hdl,chol,tg,ecg,adl,iadl,gds,psqi'
            assert pg.evaluate(CO, {'p': {'conds': ['dementia']}}) == full
            assert pg.evaluate(CO, {'p': {'condNote': 'Alzheimer 2 năm'}}) == full
            assert pg.evaluate(CO, {'visits': [{'id': 'v1', 'date': '2026-05-01', 'dx': {'icd': 'F06.70 – x'}, 'orders': []}]}) == full
            recent = [{'id': 'v1', 'date': '2026-10-01', 'dx': {'icd': 'F03 – x'}, 'orders': [{'key': 'ldl', 'value': '2,5'}, {'key': 'ecg', 'value': 'Nhịp xoang'}]}]
            assert pg.evaluate(CO, {'visits': recent}) == 'ctm,glu,na,k,cl,ast,alt,ure,creat,hdl,chol,tg,adl,iadl,gds,psqi', pg.evaluate(CO, {'visits': recent})
            # Lời dặn rối loạn hành vi (bác sĩ soạn 2026-11-07)
            assert pg.evaluate("() => { const t = TEMPLATES_SEED.find(x => x.id === 'adv_behav'); return t && t.text.startsWith('Tái khám sau 2 tuần') && t.text.split(String.fromCharCode(10)).length === 5 && t.text.includes('Không đánh. Làm điều khác') && ['F91.3', 'F91.2', 'F92.0', 'F63.8'].every(c => ICD.find(r => r[0] === c)[2].includes('behav_dis')) && TPL_ADDED.includes('adv_behav'); }")
            # Lời dặn rối loạn nhận thức (bác sĩ soạn 2026-11-07)
            assert pg.evaluate("() => { const t = TEMPLATES_SEED.find(x => x.id === 'adv_cog'); return t && t.text.split(String.fromCharCode(10)).length === 5 && t.text.includes('MIND') && t.text.includes('dán nhãn đồ vật') && t.text.endsWith('người xung quanh.') && ['F00.1', 'F01.9', 'F03', 'F04', 'F05.1', 'F06.70'].every(c => ICD.find(r => r[0] === c)[2].includes('cog_dis')) && TPL_ADDED.includes('adv_cog'); }")
            # Alprazolam: bỏ 0,5 mg, thay 0,25 mg (bác sĩ đặt 2026-11-09)
            assert pg.evaluate("() => ['alpra025n', 'alpra025f'].every(id => { const d = drugById(id); return d && !d.off && d.how === '' && d.howOpts[0] === 'Uống mỗi lần 1 viên, ngày uống 2 lần sau ăn sáng, tối' && d.dnote.includes('0,25 mg/ngày') && d.p === 0 && d.dose.join() === '1,0,0,1'; })")
            assert pg.evaluate("() => { const n = drugSearch('alprazolam', false).map(d => d.id); return !n.includes('alpra05n') && !n.includes('alpra05f') && n.includes('alpra025n') && !!drugById('alpra05n') && drugById('alpra05n').off === true; }"), 'bản 0,5 mg phải ẩn nhưng đơn cũ vẫn tra được'
            AL = AM_TPL = "(o) => { const p = Object.assign(JSON.parse(JSON.stringify(curP())), {conds: [], condNote: '', visits: [], job: '', dob: '', birthYear: Number(todayISO().slice(0, 4)) - 40, risk: {smoke: 'never', alcohol: 'no'}}, o), v = JSON.parse(JSON.stringify(curV())); v.hpi = ''; v.reason = ''; v.vitals = {}; v.dx = {icd: '', text: ''}; v.orders = []; p.meds = []; return drugBlockReasons(p, v, drugById('alpra025n')).join(' | '); }"
            assert pg.evaluate(AL, {}) == '', pg.evaluate(AL, {})
            for cd, w in [('liver', 'xơ gan'), ('glaucoma', 'glôcôm'), ('asthma', 'hen'), ('sexual_dysf', 'tình dục')]:
                assert w in pg.evaluate(AL, {'conds': [cd]}), cd
            assert 'lái xe' in pg.evaluate(AL, {'job': 'Tài xế taxi'})
            # Benzodiazepin chỉ kê < 9 ngày (bác sĩ đặt 2026-11-09)
            r = pg.evaluate("""() => { const v = curV(), p = curP(), f0 = v.plan.followDays, rx0 = v.rx; v.plan.followDays = 30; const a = rxLine(drugById('alpra025n'), v).days, b = rxLine(drugById('sert50'), v).days;
              const l = {id: 'bz1', drugId: 'diaz5', s: 1, tr: 0, c: 0, t: 0, days: 14, how: '', note: ''}; v.rx = [l];
              afterChange('v.rx.#bz1.days'); const c = l.days; l.days = 20; const w = checkAll(p, v).items.some(i => i.lv === 3 && /dưới 9 ngày/.test(i.m));
              l.days = 8; afterChange('v.rx.#bz1.days'); const d = l.days; const w2 = checkAll(p, v).items.some(i => /dưới 9 ngày/.test(i.m)); const z = isBzd(drugById('zopi7n'));
              v.rx = rx0; v.plan.followDays = f0; return [a, b, c, w, d, w2, z]; }""")
            assert r == [8, 30, 8, True, 8, False, False], r
            # Chặn kê cùng lúc thuốc tâm thần — tương tác mức 3 (bác sĩ đặt 2026-11-09)
            PB2 = "([rx, id, o]) => { const p = Object.assign(JSON.parse(JSON.stringify(curP())), {conds: [], meds: []}, o || {}), v = JSON.parse(JSON.stringify(curV())); v.rx = rx.map(x => ({drugId: x})); return pairBlockReasons(p, v, drugById(id)).join(' | '); }"
            assert 'serotonin' in pg.evaluate(PB2, [['seleg5'], 'sert50', {}]), 'selegilin + SSRI phải chặn'
            assert 'liệt ruột' in pg.evaluate(PB2, [['amitri25'], 'olan10n', {}]), 'TCA + kháng cholinergic phải chặn'
            assert 'olanzapin' in pg.evaluate(PB2, [['olan10n'], 'alpra025n', {}]), 'alprazolam + olanzapin phải chặn'
            assert 'zolpidem' in pg.evaluate(PB2, [['zolpi10'], 'fluvo100', {}]), 'zolpidem + fluvoxamin phải chặn'
            assert 'cholinesterase' in pg.evaluate(PB2, [['done5n'], 'riva3', {}])
            assert 'QT' in pg.evaluate(PB2, [['amitri25'], pg.evaluate("() => DRUGS_SEED.find(d => d.hc === 'hydroxyzin').id"), {}])
            assert pg.evaluate(PB2, [['sert50'], 'alpra025n', {}]) == '', 'mức 2 không chặn'
            assert pg.evaluate(PB2, [['valp500n'], 'lamo50n', {}]) == '', 'valproat + lamotrigin không chặn'
            assert pg.evaluate(PB2, [['aceno4'], 'aceno4', {}]) == ''
            assert 'suy tim' in pg.evaluate(PB2, [['fluox20n'], pg.evaluate("() => DRUGS_SEED.find(d => d.hc === 'metoprolol').id"), {'conds': ['heart_failure']}])
            assert pg.evaluate(PB2, [['fluox20n'], pg.evaluate("() => DRUGS_SEED.find(d => d.hc === 'metoprolol').id"), {}]) == '', 'chỉ chặn khi suy tim'
            assert 'serotonin' in pg.evaluate(PB2, [[], 'sert50', {'meds': [{'id': 'm1', 'drugId': 'seleg5'}]}]), 'thuốc dài hạn cũng chặn'
            assert pg.evaluate("() => drugById('amitri25').tags.includes('tca') && TAGS.tca && !!RULES.find(r => r.a === 'tca' && r.b === 'anticholinergic' && r.lv === 3)")
            # Amitriptylin (bác sĩ đặt 2026-11-09)
            AM = "(o) => { const p = Object.assign(JSON.parse(JSON.stringify(curP())), {conds: [], condNote: '', visits: [], job: '', dob: '', birthYear: Number(todayISO().slice(0, 4)) - 40, risk: {smoke: 'never', alcohol: 'no'}}, o), v = JSON.parse(JSON.stringify(curV())); v.hpi = ''; v.reason = ''; v.vitals = {}; v.dx = {icd: '', text: ''}; v.orders = []; p.meds = []; return drugBlockReasons(p, v, drugById('amitri25')).join(' | '); }"
            assert pg.evaluate(AM, {}) == '', pg.evaluate(AM, {})
            for cd, w in [('sexual_dysf', 'tình dục'), ('heart_failure', 'suy tim'), ('liver', 'xơ gan'), ('bipolar', 'lưỡng cực'), ('epilepsy', 'động kinh'), ('af', 'rối loạn nhịp'), ('cvd', 'mạch vành'), ('bph', 'phì đại')]:
                assert w in pg.evaluate(AM, {'conds': [cd]}), cd
            assert 'mang thai' in pg.evaluate(AM, {'conds': ['pregnant'], 'sex': 'Nữ'}) and 'cho con bú' in pg.evaluate(AM, {'conds': ['breastfeeding'], 'sex': 'Nữ'})
            assert 'lái xe' in pg.evaluate(AM, {'job': 'Lái xe tải'})
            assert pg.evaluate(AM, {'birthYear': int(pg.evaluate("() => todayISO().slice(0,4)")) - 10}) != '', '< 12 tuổi phải chặn'
            # 13 thuốc theo Long Châu (2026-11-07)
            NEW13 = ['vinpo5', 'nicer10', 'aminol200', 'sily140', 'boganicf', 'vite400', 'seleg5', 'coq10_30', 'omega1000', 'vitb1_250', 'b12_500', 'folic5', 'vit3b']
            assert pg.evaluate("(ids) => ids.every(id => { const d = drugById(id); return d && d.how === '' && (d.howOpts || []).length === 1 && d.dnote; })", NEW13)
            assert pg.evaluate("() => RULES.some(r => r.a === 'maob' && r.b === 'serotonergic' && r.lv === 3) && TAGS.maob && TAGS.bleed_supp")
            # Cholin alfoscerat 400 mg (bác sĩ đặt 2026-11-07)
            CA = lambda o: pg.evaluate(RB2, ['cholalf400', dict({'conds': [], 'condNote': '', 'visits': []}, **o)])
            assert pg.evaluate("() => { const d = drugById('cholalf400'); return d && d.how === '' && d.howOpts[0] === 'Uống mỗi lần 1 viên, ngày uống 2 viên sau ăn sáng, tối' && d.dnote.startsWith('Loại 800 mg'); }")
            assert CA({}) == '', CA({})
            for cd in ['asthma', 'af', 'peptic']:
                assert 'cholin alfoscerat' in CA({'conds': [cd]}), cd
            assert 'mang thai' in CA({'conds': ['pregnant'], 'sex': 'Nữ'}) and 'cho con bú' in CA({'conds': ['breastfeeding'], 'sex': 'Nữ'})
            # Risperdal 1 mg (bác sĩ đặt 2026-11-07)
            RS = lambda o: pg.evaluate(RB2, ['risperdal1', dict({'conds': [], 'condNote': '', 'visits': [], 'risk': {'smoke': 'never', 'alcohol': 'no'}}, **o)])
            assert pg.evaluate("() => { const d = drugById('risperdal1'); return d && d.how === '' && d.howOpts[0] === 'Uống mỗi lần 1 viên, ngày uống 2 lần sau ăn sáng, tối' && d.dnote.startsWith('Khởi đầu 2 mg/ngày'); }")
            assert RS({}) == '', RS({})
            yb = int(pg.evaluate("() => todayISO().slice(0,4)"))
            assert '< 50 kg' in RS({'dob': '', 'birthYear': yb - 15, 'weight': 45})
            assert RS({'dob': '', 'birthYear': yb - 15, 'weight': 55}) == ''
            for note, w in [('Đang điều trị paroxetin 20 mg', 'paroxetin'), ('Dùng furosemid', 'furosemid'), ('Uống tamsulosin vì phì đại tiền liệt tuyến', 'chẹn alpha'), ('Levodopa 250 mg', 'levodopa'), ('Parkinson 3 năm', 'Parkinson'), ('Sa sút trí tuệ thể Lewy', 'Lewy'), ('Bệnh mạch ngoại biên', 'mạch ngoại biên')]:
                assert w in RS({'condNote': note}), note
            for cd, w in [('epilepsy', 'động kinh'), ('sexual_dysf', 'tình dục')]:
                assert w in RS({'conds': [cd]}), cd
            assert 'rượu' in RS({'risk': {'smoke': 'never', 'alcohol': 'some'}})
            assert 'mang thai' in RS({'conds': ['pregnant'], 'sex': 'Nữ'})
            w = pg.evaluate("() => { const p = curP(), o = p.conds; p.conds = ['liver']; const r = checkAll(p, curV(), [{line: {id: 'x'}, drug: drugById('risperdal1')}]).items.some(i => i.title.includes('giảm liều') && i.m.includes('xơ gan')); p.conds = o; return r; }")
            assert w, 'xơ gan phải cảnh báo giảm liều risperidon'
            # Citicolin 200 mg (bác sĩ đặt 2026-11-07)
            CI = lambda o: pg.evaluate(RB2, ['citi200', dict({'conds': [], 'condNote': '', 'visits': []}, **o)])
            assert pg.evaluate("() => { const d = drugById('citi200'); return d && d.how === '' && d.howOpts[0] === 'Mỗi lần uống 1 viên, ngày uống 3 lần sau ăn sáng, trưa, tối' && d.dnote.startsWith('Thời gian điều trị: 9 – 12 tháng'); }")
            assert CI({}) == '', CI({})
            for cd, w in [('ckd', 'thận'), ('liver', 'xơ gan'), ('epilepsy', 'động kinh'), ('depression', 'trầm cảm')]:
                assert w in CI({'conds': [cd]}), cd
            assert 'xơ gan' in CI({'condNote': 'Xơ gan do rượu'}) and 'trầm cảm' in CI({'condNote': 'Trầm cảm 2022'})
            assert CI({'condNote': 'Không động kinh'}) == ''
            # Ginkgo biloba 40 mg (bác sĩ đặt 2026-11-07)
            G = lambda o: pg.evaluate(RB2, ['ginkgo40', dict({'conds': [], 'condNote': '', 'visits': []}, **o)])
            assert pg.evaluate("() => { const d = drugById('ginkgo40'); return d && d.how === '' && d.howOpts[0] === 'Ngày uống 2 viên trong hoặc sau bữa ăn'; }")
            assert G({}) == '', G({})
            assert 'chống đông' in G({'condNote': 'Đang dùng aspirin 81 mg'})
            assert 'chống đông' in G({'condNote': 'Đang uống thuốc chống đông'})
            assert G({'condNote': 'Đã ngừng aspirin'}) == ''
            assert 'tai biến' in G({'condNote': 'Tai biến nhồi máu não cách 2 tuần'})
            assert 'nhồi máu cơ tim' in G({'condNote': 'Nhồi máu cơ tim 20 ngày trước'})
            assert G({'condNote': 'Nhồi máu cơ tim cách 3 tháng'}) == ''
            assert 'tâm thần phân liệt' in G({'condNote': 'Tâm thần phân liệt 5 năm'})
            for cd in ['epilepsy', 'peptic', 'asthma', 'erectile_dysf']:
                assert 'tích' in G({'conds': [cd]}), cd
            assert pg.evaluate("() => CONDS.some(c => c.k === 'erectile_dysf')")
            assert pg.evaluate("() => { const d = drugById('cere10'); return d && d.how === '' && d.howOpts.length === 2 && d.howOpts[1] === 'Tiêm tĩnh mạch chậm 1 ống' && d.u === 'ống' && d.dnote.startsWith('1 liệu trình 10–20 ngày'); }")
            assert pg.evaluate(RB2, ['cere10', {'conds': [], 'condNote': '', 'visits': [], 'renalManual': {'egfr': 90, 'date': '2026-11-01'}}]) == ''
            assert 'động kinh' in pg.evaluate(RB2, ['cere10', {'conds': ['epilepsy'], 'condNote': '', 'visits': [], 'renalManual': {'egfr': 90, 'date': '2026-11-01'}}])
            assert 'động kinh' not in pg.evaluate(RB2, ['cere10', {'conds': [], 'condNote': 'Động kinh', 'visits': [], 'renalManual': {'egfr': 90, 'date': '2026-11-01'}}]), 'chỉ ô tích'
            assert 'MLCT' in pg.evaluate(RB2, ['cere10', {'conds': [], 'condNote': '', 'visits': [], 'renalManual': {'egfr': 50, 'date': '2026-11-01'}}])
            assert 'MLCT' in pg.evaluate(RB2, ['mema5', {'conds': [], 'condNote': '', 'visits': [], 'renalManual': {'egfr': 45, 'date': '2026-11-01'}}])
            assert 'MLCT' not in pg.evaluate(RB2, ['mema5', {'conds': [], 'condNote': '', 'visits': [], 'renalManual': {'egfr': 75, 'date': '2026-11-01'}}])
            assert pg.evaluate("() => { const d = drugById('gala4'); return d && d.how === '' && d.howOpts[0] === 'Uống mỗi lần 1 viên, ngày uống 2 viên buổi sáng, tối cùng bữa ăn' && d.dnote.endsWith('Dừng thuốc không cần giảm dần.') && d.dose.join() === '1,0,1,0' && d.tags.includes('ache_inh'); }")
            assert 'cholinesterase' in pg.evaluate(MB, ['gala4', {'conds': ['epilepsy'], 'condNote': ''}])
            assert pg.evaluate("() => { const d = drugById('riva15'); return d && d.how === '' && d.howOpts[0] === 'Uống mỗi lần 1 viên, ngày uống 2 viên buổi sáng, tối sau ăn' && d.dnote.includes('12 mg/ngày') && d.dose.join() === '1,0,1,0'; }")
            RB = "([id, o]) => { const p = JSON.parse(JSON.stringify(curP())), v = JSON.parse(JSON.stringify(curV())); Object.assign(p, o); v.vitals = {}; v.hpi = ''; v.dx = {icd: '', text: ''}; p.meds = []; return drugBlockReasons(p, v, drugById(id)).join(' | '); }"
            assert 'BMI' in pg.evaluate(RB, ['riva15', {'conds': [], 'condNote': '', 'weight': 45, 'height': 160}])
            assert 'BMI' not in pg.evaluate(RB, ['riva3', {'conds': [], 'condNote': '', 'weight': 45, 'height': 160}])
            assert 'BMI' not in pg.evaluate(RB, ['riva15', {'conds': [], 'condNote': '', 'weight': 60, 'height': 160}])
            assert pg.evaluate("() => ['done5n', 'done5f'].every(id => { const d = drugById(id); return d.how === '' && d.howOpts[0].startsWith('Ngày uống 1 viên buổi tối sau ăn') && d.dnote.includes('23 mg') && d.dnote.endsWith('hội chứng cai.'); })")
            for mid in ['done5n', 'riva3', 'gala8']:
                _r = pg.evaluate(MB, [mid, {'conds': [], 'condNote': ''}]); assert 'cholinesterase' not in _r, (mid, _r)
            for cd in ['depression', 'asthma', 'vestibular', 'af', 'peptic', 'epilepsy']:
                assert 'cholinesterase' in pg.evaluate(MB, ['done5n', {'conds': [cd], 'condNote': ''}]), cd
            assert 'cholinesterase' not in pg.evaluate(MB, ['riva3', {'conds': [], 'condNote': 'Trầm cảm 2020'}]), 'chỉ xét ô tích'
            # Atomoxetin (bác sĩ đặt 2026-11-05)
            assert pg.evaluate("() => CONDS.some(c => c.k === 'malnutrition')"), 'thiếu ô suy dinh dưỡng'
            assert pg.evaluate(MB, ['atomox', {'conds': [], 'condNote': ''}]) == ''
            for cd, word in [('glaucoma', 'glôcôm'), ('htn', 'tăng huyết áp'), ('af', 'rối loạn nhịp'), ('malnutrition', 'suy dinh dưỡng'), ('bph', 'phì đại tiền liệt tuyến'), ('vestibular', 'rối loạn tiền đình')]:
                assert word in pg.evaluate(MB, ['atomox', {'conds': [cd], 'condNote': ''}]), cd
            assert 'u tuỷ thượng thận' in pg.evaluate(MB, ['atomox', {'conds': [], 'condNote': 'U tủy thượng thận đã mổ'}])
            assert 'suy dinh dưỡng' in pg.evaluate(MB, ['atomox', {'conds': [], 'condNote': 'Suy dinh dưỡng thể thấp còi'}])
            assert 'mang thai' in pg.evaluate(MB, ['atomox', {'conds': ['pregnant'], 'condNote': '', 'sex': 'Nữ'}])
            assert 'cho con bú' in pg.evaluate(MB, ['atomox', {'conds': ['breastfeeding'], 'condNote': '', 'sex': 'Nữ'}])
            assert pg.evaluate("() => drugById('atomox').how === '' && drugById('atomox').dnote.endsWith('Xơ gan vừa giảm còn 25% liều.')")
            # Clonidin (bác sĩ đặt 2026-11-05)
            assert pg.evaluate(MB, ['clon025', {'conds': [], 'condNote': ''}]) == '', pg.evaluate(MB, ['clon025', {'conds': [], 'condNote': ''}])
            for cd, word in [('glaucoma', 'glôcôm'), ('htn', 'tăng huyết áp'), ('af', 'rối loạn nhịp'), ('vestibular', 'rối loạn tiền đình')]:
                assert word in pg.evaluate(MB, ['clon025', {'conds': [cd], 'condNote': ''}]), cd
            assert 'u tuỷ thượng thận' in pg.evaluate(MB, ['clon025', {'conds': [], 'condNote': 'Pheochromocytoma'}])
            assert 'xơ gan' in pg.evaluate(MB, ['clon025', {'conds': [], 'condNote': 'Xơ gan do rượu'}])
            assert 'mang thai' in pg.evaluate(MB, ['clon025', {'conds': ['pregnant'], 'condNote': '', 'sex': 'Nữ'}])
            assert 'cho con bú' in pg.evaluate(MB, ['clon025', {'conds': ['breastfeeding'], 'condNote': '', 'sex': 'Nữ'}])
            assert pg.evaluate("() => { const d = drugById('clon025'); return d.how === '' && d.howOpts[0] === 'Dùng mỗi lần 1 viên, ngày 2 lần sau ăn sáng, tối' && d.dnote === 'Trung bình 0,1–0,25 mg/ngày, tăng 0,025–0,05 mg mỗi 3–7 ngày.'; }")
            # Piracetam (bác sĩ đặt 2026-11-05): chặn CrCl < 20, tiền sử xơ gan / đột quỵ, rối loạn tiền đình; lưu ý liều theo Clcr; ô bệnh nền mới
            assert pg.evaluate("() => ['vestibular', 'pad'].every(k => CONDS.some(c => c.k === k))"), 'thiếu ô tiền sử rối loạn tiền đình / bệnh mạch ngoại biên'
            PB = "(o) => { const p = JSON.parse(JSON.stringify(curP())), v = JSON.parse(JSON.stringify(curV())); Object.assign(p, o); v.hpi = ''; return drugBlockReasons(p, v, drugById('pirac400')).join(' | '); }"
            assert pg.evaluate(PB, {'conds': [], 'condNote': ''}) == '', pg.evaluate(PB, {'conds': [], 'condNote': ''})
            assert 'rối loạn tiền đình' in pg.evaluate(PB, {'conds': ['vestibular'], 'condNote': ''})
            assert 'xơ gan' in pg.evaluate(PB, {'conds': [], 'condNote': 'Xơ gan Child B'})
            assert 'đột quỵ' in pg.evaluate(PB, {'conds': [], 'condNote': 'Nhồi máu não 2024'})
            assert 'đột quỵ' not in pg.evaluate(PB, {'conds': [], 'condNote': 'Không có đột quỵ'})
            assert 'mang thai' in pg.evaluate(PB, {'conds': ['pregnant'], 'condNote': '', 'sex': 'Nữ'})
            assert pg.evaluate("() => { const d = drugById('pirac400'); return d.howOpts[0] === 'Uống mỗi lần 1 viên, ngày 3 lần sau ăn sáng, trưa, tối' && d.dose.join() === '1,1,0,1' && d.dnote.startsWith('30–160 mg/kg/ngày') && d.dnote.includes('24 g/ngày') && d.renal.map(r => r.lt).join() === '80,50,30,20' && d.renal[3].lv === 3; }")
            assert 'xuất huyết não' in pg.evaluate(PB, {'conds': [], 'condNote': 'Xuất huyết não 2023'})
            assert 'MLCT' in pg.evaluate(PB, {'conds': [], 'condNote': '', 'weight': None, 'visits': [], 'renalManual': {'egfr': 15, 'date': '2026-11-01'}})

            # 6g. Có chẩn đoán mà chưa có thuốc -> không sang được bước 4, trừ khi chọn lý do "Không kê đơn"
            pg.evaluate("go({name: 'visit', pid: 'p_demoA', vid: 'v_demo_now', step: 3})"); pg.wait_for_timeout(200)
            saved = pg.evaluate("() => { const v = curV(); const s = JSON.stringify({rx: v.rx, noRx: v.noRx || null}); v.rx = []; v.noRx = {}; return s; }")
            pg.evaluate("renderMain(true)"); pg.wait_for_timeout(200)
            assert pg.evaluate("!!curV().dx.main"), 'ca mẫu phải có chẩn đoán'
            pg.click('[data-act="step"][data-step="4"]'); pg.wait_for_timeout(300)
            assert pg.evaluate('S.view.step') == 3, 'chưa có thuốc thì không được sang bước 4'
            assert 'Chưa thể sang bước 4' in pg.inner_text('[data-live="rxgate"]')
            pg.check('input[name="v.noRx.reason"][value="other"]'); pg.wait_for_timeout(200)
            pg.click('[data-act="step"][data-step="4"]'); pg.wait_for_timeout(300)
            assert pg.evaluate('S.view.step') == 3, '"Lý do khác" phải có ghi chú'
            pg.fill('input[data-b="v.noRx.note"]', 'Đang dùng đơn BV tỉnh'); pg.wait_for_timeout(200)
            pg.click('[data-act="step"][data-step="4"]'); pg.wait_for_timeout(300)
            assert pg.evaluate('S.view.step') == 4, 'có lý do không kê đơn thì được sang bước 4'
            assert 'không kê đơn thuốc' in pg.evaluate("sheetHTML(curP(), curV())")
            pg.evaluate("(s) => { const v = curV(), o = JSON.parse(s); v.rx = o.rx; v.noRx = o.noRx || {}; savePatient(curP()); }", saved)

            # 6h. Quy tắc phòng khám: chặn SSRI/SNRI; cảnh báo khi có tiền sử lưỡng cực
            pg.evaluate("go({name: 'visit', pid: 'p_demoA', vid: 'v_demo_now', step: 3})"); pg.wait_for_timeout(200)
            st = pg.evaluate("() => { const p = curP(), v = curV(); return JSON.stringify({meds: p.meds, conds: p.conds, hpi: v.hpi, reason: v.reason, mental: v.mental || null, rx: v.rx}); }")
            R = "() => ssriBlockReasons(curP(), curV())"
            # ca mẫu đang dùng Sintrom dài hạn -> bị chặn vì kháng đông
            assert any('kháng đông' in r for r in pg.evaluate(R)), pg.evaluate(R)
            pg.evaluate("() => { const p = curP(), v = curV(); p.meds = []; v.hpi = 'Đau thượng vị, không buồn nôn, không tiêu chảy'; v.reason = ''; v.mental = {sx: [], hist: [], excl: []}; v.rx = []; }")
            assert pg.evaluate(R) == [], 'phủ định "không buồn nôn" không được tính là có triệu chứng'
            pg.evaluate("() => { curV().hpi = 'Buồn nôn và tiêu chảy 3 ngày'; }")
            assert any('buồn nôn' in r and 'tiêu chảy' in r for r in pg.evaluate(R))
            pg.evaluate("() => { const v = curV(); v.hpi = ''; v.mental.sx = ['sex_ed']; }")
            assert any('cương dương' in r for r in pg.evaluate(R))
            pg.evaluate("() => { const v = curV(); v.mental.sx = []; curP().meds = [{id: 'm_t1', drugId: 'ibu400', dose: ''}]; }")
            assert any('NSAID' in r for r in pg.evaluate(R))
            pg.evaluate("() => { curP().meds = [{id: 'm_t2', text: 'Pseudoephedrin 60 mg', dose: ''}]; }")
            assert any('cường giao cảm' in r for r in pg.evaluate(R))
            pg.evaluate("() => { curP().meds = [{id: 'm_t3', text: 'Salbutamol xịt', dose: ''}]; }")
            assert any('cường giao cảm' in r for r in pg.evaluate(R)), 'salbutamol phải bị tính là cường giao cảm'
            pg.evaluate("() => { curP().meds = [{id: 'm_t4', drugId: 'asp81', dose: ''}]; }")
            assert any('kết tập' in r for r in pg.evaluate(R)), 'aspirin phải bị chặn'
            pg.evaluate("() => { curP().meds = [{id: 'm_t5', drugId: 'clopi75', dose: ''}]; }")
            assert any('kết tập' in r for r in pg.evaluate(R)), 'clopidogrel phải bị chặn'
            # bấm thêm SSRI khi bị chặn -> không vào đơn; thuốc khác vẫn thêm được
            pg.evaluate("addRx('sert50')"); pg.wait_for_timeout(200)
            assert pg.evaluate("curV().rx.length") == 0, 'SSRI bị chặn không được vào đơn'
            pg.evaluate("addRx('tiane12')"); pg.wait_for_timeout(200)
            assert pg.evaluate("curV().rx.map(l => l.drugId)") == ['tiane12'], 'thuốc ngoài SSRI/SNRI vẫn kê được'
            # hết lý do chặn -> kê được; tiền sử hưng cảm nhẹ -> cảnh báo lưỡng cực
            pg.evaluate("() => { const p = curP(), v = curV(); p.meds = []; v.rx = []; v.mental.hist = ['hypomania']; }")
            pg.evaluate("addRx('escit10')"); pg.wait_for_timeout(200)
            assert pg.evaluate("curV().rx.length") == 1
            assert pg.evaluate("checkAll(curP(), curV()).items.some(w => /lưỡng cực/.test(w.title) && w.lv === 2)"), 'phải cảnh báo lưỡng cực'
            # QTc dài trên điện tim -> không kê citalopram/escitalopram; sertralin vẫn kê được
            Q = "(t) => qtcLongText(t)"
            assert pg.evaluate(Q, 'Nhịp xoang 72 l/ph, QTc dài 490 ms') and pg.evaluate(Q, 'Kéo dài khoảng QT') and pg.evaluate(Q, 'QT kéo dài')
            assert not pg.evaluate(Q, 'QTc không dài, nhịp xoang') and not pg.evaluate(Q, 'Không kéo dài QTc') and not pg.evaluate(Q, 'Nhịp xoang, trục trung gian')
            pg.evaluate("() => { const v = curV(); v.rx = []; v.mental.hist = []; v.orders = (v.orders || []).filter(o => o.key !== 'ecg').concat([{id: 'o_ecg_t', key: 'ecg', name: 'Điện tim (ECG)', type: 't', value: 'Nhịp xoang, QTc dài 500 ms', note: ''}]); }")
            pg.evaluate("addRx('escit10')"); pg.wait_for_timeout(200)
            assert pg.evaluate("curV().rx.length") == 0, 'escitalopram phải bị chặn khi QTc dài'
            assert any('QTc dài' in r for r in pg.evaluate("() => drugBlockReasons(curP(), curV(), drugById('escit10n'))"))
            pg.evaluate("addRx('sert50')"); pg.wait_for_timeout(200)
            assert pg.evaluate("curV().rx.length") == 0, 'sertralin bị chặn khi QTc dài (bác sĩ đặt 2026-11-12)'
            assert pg.evaluate("checkAll(curP(), curV()).ctx.conds.has('qt_long')"), 'QTc dài phải được tính là bệnh kèm QT kéo dài'
            pg.evaluate("(s) => { const p = curP(), v = curV(), o = JSON.parse(s); p.meds = o.meds; p.conds = o.conds; v.hpi = o.hpi; v.reason = o.reason; v.mental = o.mental || {sx: [], hist: [], excl: []}; v.rx = o.rx; v.orders = v.orders.filter(x => x.id !== 'o_ecg_t'); savePatient(p); }", st)

            # 6i. Dòng eGFR (CKD-EPI 2021) ngay dưới creatinin; agomelatin bị chặn khi AST/ALT > 3 lần hoặc có ciprofloxacin
            pg.evaluate("go({name: 'visit', pid: 'p_demoA', vid: 'v_demo_now', step: 2})"); pg.wait_for_timeout(300)
            assert pg.evaluate("curV().orders.some(o => o.key === 'creat')"), 'ca mẫu phải có creatinin'
            t = pg.inner_text('tr.egfr-row')
            assert 'CKD-EPI 2021' in t and 'mL/phút/1,73m²' in t, t
            pg.evaluate("go({name: 'visit', pid: 'p_demoA', vid: 'v_demo_now', step: 3})"); pg.wait_for_timeout(200)
            st2 = pg.evaluate("() => JSON.stringify({rx: curV().rx, orders: curV().orders, meds: curP().meds})")
            pg.evaluate("() => { const v = curV(); v.rx = []; curP().meds = []; v.orders = v.orders.filter(o => o.key !== 'ast' && o.key !== 'alt').concat([{id: 'o_ast_t', key: 'ast', name: 'AST', unit: 'U/L', ref: '< 40', type: 'n', value: 150, flag: 'Cao', note: ''}]); }")
            assert any('men gan' in r for r in pg.evaluate("() => drugBlockReasons(curP(), curV(), drugById('agome25'))"))
            pg.evaluate("addRx('agome25')"); pg.wait_for_timeout(200)
            assert pg.evaluate("curV().rx.length") == 0, 'agomelatin phải bị chặn khi AST > 3 lần'
            pg.evaluate("() => { const v = curV(); v.orders.find(o => o.id === 'o_ast_t').value = 100; }")   # 2,5 lần -> không chặn
            assert pg.evaluate("() => drugBlockReasons(curP(), curV(), drugById('agome25'))") == []
            pg.evaluate("addRx('cipro500')"); pg.wait_for_timeout(200)
            pg.evaluate("addRx('agome25')"); pg.wait_for_timeout(200)
            assert pg.evaluate("curV().rx.map(l => l.drugId)") == ['cipro500'], 'agomelatin phải bị chặn khi đơn có ciprofloxacin'
            # duloxetin: chặn khi AST/ALT > 3 lần hoặc CrCl < 30
            DB = "() => drugBlockReasons(curP(), curV(), drugById('dulox30n')).join(' | ')"
            pg.evaluate("() => { const v = curV(); v.rx = []; v.orders.find(o => o.id === 'o_ast_t').value = 150; }")
            assert 'men gan' in pg.evaluate(DB)
            pg.evaluate("() => { curV().orders.find(o => o.id === 'o_ast_t').value = 30; }")
            assert pg.evaluate(DB) == '', 'ca mẫu CrCl ≈ 48 và men gan bình thường thì duloxetin kê được'
            pg.evaluate("() => { curV().orders.find(o => o.key === 'creat').value = 300; }")   # CrCl ~ 23
            assert 'CrCl' in pg.evaluate(DB), pg.evaluate(DB)
            pg.evaluate("addRx('dulox30n')"); pg.wait_for_timeout(200)
            assert pg.evaluate("curV().rx.length") == 0, 'duloxetin phải bị chặn khi CrCl < 30'
            # valproat: nữ chưa có β-hCG hoặc β-hCG > 5 -> chặn; nam không bị chặn
            VB = "() => drugBlockReasons(curP(), curV(), drugById('valp500n')).join(' | ')"
            sex0 = pg.evaluate("curP().sex")
            pg.evaluate("() => { const v = curV(); v.rx = []; v.orders = v.orders.filter(o => o.key !== 'bhcg'); }")
            assert pg.evaluate(VB) == '', 'nam không bị chặn valproat'
            pg.evaluate("() => { curP().sex = 'Nữ'; }")
            assert 'chưa có kết quả β-hCG' in pg.evaluate(VB)
            pg.evaluate("addRx('valp500n')"); pg.wait_for_timeout(200)
            assert pg.evaluate("curV().rx.length") == 0, 'valproat phải bị chặn khi nữ chưa có β-hCG'
            for val, blocked in [(12, True), (3, False), ('< 5', False), ('Âm tính', False), ('Dương tính', True)]:
                pg.evaluate("(x) => { const v = curV(); v.orders = v.orders.filter(o => o.key !== 'bhcg').concat([{id: 'o_hcg', key: 'bhcg', name: 'β-hCG', unit: 'mIU/mL', ref: '< 5', type: 'n', value: x, flag: '', note: ''}]); }", val)
                assert (pg.evaluate(VB) != '') == blocked, (val, pg.evaluate(VB))
            pg.evaluate("(s) => { curP().sex = s; }", sex0)
            # fluoxetin: tiền sử đang cho con bú -> chặn (ô bệnh nền hoặc ghi chữ); từ 2026-10-27 sertralin cũng bị chặn (mọi thuốc thần kinh – tâm thần)
            FB = "(id) => drugBlockReasons(curP(), curV(), drugById(id)).filter(r => /cho con bú/.test(r)).length"
            nb = pg.evaluate("() => JSON.stringify({conds: curP().conds, note: curP().condNote})")
            pg.evaluate("() => { const p = curP(); p.sex = 'Nữ'; p.conds = (p.conds || []).filter(k => k !== 'breastfeeding'); p.condNote = 'Sinh con 3 tháng, không cho con bú'; }")
            assert pg.evaluate(FB, 'fluox20n') == 0, 'câu phủ định không được tính'
            pg.evaluate("() => { curP().condNote = 'Sinh con 3 tháng, đang cho con bú'; }")
            assert pg.evaluate(FB, 'fluox20n') == 1 and pg.evaluate(FB, 'sert50') == 0 and pg.evaluate(FB, 'parox20n') == 0 and pg.evaluate(FB, 'mirta30n') == 1, 'sertralin, paroxetin được kê khi cho con bú (2026-11-12)'
            pg.evaluate("() => { const p = curP(); p.condNote = ''; p.conds = p.conds.concat(['breastfeeding']); }")
            assert pg.evaluate(FB, 'fluox20f') == 1, 'ô "Đang cho con bú" phải chặn fluoxetin'
            pg.evaluate("([s, sx]) => { const p = curP(), o = JSON.parse(s); p.conds = o.conds; p.condNote = o.note; p.sex = sx; }", [nb, sex0])
            # mang thai (β-hCG > 5 hoặc tiền sử ghi mang thai) -> chặn valproat, carbamazepin, paroxetin; từ 2026-10-27 mọi thuốc thần kinh – tâm thần cũng bị chặn
            PB = "(id) => drugBlockReasons(curP(), curV(), drugById(id)).filter(r => /mang thai/.test(r)).length"
            pg.evaluate("() => { const p = curP(), v = curV(); p.sex = 'Nữ'; p.conds = (p.conds || []).filter(k => k !== 'pregnant'); p.condNote = 'Không mang thai'; v.hpi = ''; v.reason = ''; v.orders = v.orders.filter(o => o.key !== 'bhcg'); }")
            assert [pg.evaluate(PB, i) for i in ['valp500n', 'carba200n', 'parox20n']] == [0, 0, 0], 'phủ định "không mang thai" không được chặn'
            pg.evaluate("() => { curP().condNote = 'PARA 2002, đã mang thai 2 lần, sinh thường'; }")
            assert pg.evaluate(PB, 'parox20n') == 0, 'tiền sử "đã mang thai" không phải đang mang thai'
            pg.evaluate("() => { curP().condNote = 'Đang mang thai 10 tuần'; }")
            assert [pg.evaluate(PB, i) for i in ['valp500n', 'carba200n', 'parox20n', 'sert50']] == [1, 1, 1, 1]
            pg.evaluate("() => { const v = curV(); curP().condNote = ''; v.orders = v.orders.concat([{id: 'o_hcg2', key: 'bhcg', name: 'β-hCG', unit: 'mIU/mL', ref: '< 5', type: 'n', value: 1200, flag: '', note: ''}]); }")
            assert [pg.evaluate(PB, i) for i in ['valp500f', 'carba200f', 'parox20f']] == [1, 1, 1], 'β-hCG > 5 phải chặn'
            pg.evaluate("addRx('carba200n')"); pg.wait_for_timeout(200)
            assert pg.evaluate("curV().rx.filter(l => l.drugId === 'carba200n').length") == 0
            pg.evaluate("([s, sx]) => { const p = curP(), v = curV(), o = JSON.parse(s); p.conds = o.conds; p.condNote = o.note; p.sex = sx; v.orders = v.orders.filter(x => x.id !== 'o_hcg2'); }", [nb, sex0])
            # tuổi > 65 -> chặn TCA (amitriptylin) và paroxetin; 65 tuổi chưa chặn; sertralin không bị chặn vì tuổi
            AB = "(id) => drugBlockReasons(curP(), curV(), drugById(id)).filter(r => /> 65/.test(r)).length"
            dob0 = pg.evaluate("() => JSON.stringify({dob: curP().dob || null, by: curP().birthYear || null})")
            pg.evaluate("() => { const p = curP(); p.dob = ''; p.birthYear = Number(curV().date.slice(0, 4)) - 70; }")
            assert [pg.evaluate(AB, i) for i in ['amitri25', 'parox20n', 'parox20f', 'sert50']] == [1, 1, 1, 0]
            pg.evaluate("() => { const p = curP(); p.birthYear = null; const d = curV().date; p.dob = (Number(d.slice(0, 4)) - 65) + d.slice(4); }")
            assert pg.evaluate(AB, 'amitri25') == 0, 'đúng 65 tuổi chưa chặn (quy tắc > 65)'
            CB = "(id) => drugBlockReasons(curP(), curV(), drugById(id)).filter(r => /< 18/.test(r)).length"
            pg.evaluate("() => { const p = curP(); p.dob = ''; p.birthYear = Number(curV().date.slice(0, 4)) - 15; }")
            assert [pg.evaluate(CB, i) for i in ['amitri25', 'parox20n', 'sert50']] == [1, 1, 0], 'trẻ < 18: chặn TCA, paroxetin'
            pg.evaluate("() => { const p = curP(); p.birthYear = Number(curV().date.slice(0, 4)) - 30; }")
            assert pg.evaluate(CB, 'amitri25') == 0 and pg.evaluate(AB, 'amitri25') == 0
            pg.evaluate("(s) => { const p = curP(), o = JSON.parse(s); p.dob = o.dob || ''; p.birthYear = o.by; }", dob0)
            # bệnh gan mạn / xơ gan -> chặn agomelatin, duloxetin, valproat; động kinh -> clomipramin, bupropion, TCA > 150 mg/ngày
            LB = "(id) => drugBlockReasons(curP(), curV(), drugById(id)).filter(r => /gan mạn/.test(r)).length"
            pg.evaluate("() => { curP().conds = curP().conds.filter(k => k !== 'liver' && k !== 'epilepsy'); }")
            assert [pg.evaluate(LB, i) for i in ['agome25', 'dulox30n', 'valp500n', 'sert50']] == [0, 0, 0, 0]
            pg.evaluate("() => { curP().conds.push('liver'); }")
            assert [pg.evaluate(LB, i) for i in ['agome25', 'dulox30n', 'valp500n', 'valp500f', 'sert50']] == [1, 1, 1, 1, 0]
            assert pg.evaluate("() => drugBlockReasons(curP(), curV(), {id: 'x', n: 'Nefazodon 100 mg', hc: 'nefazodon', tags: []}).length") == 1
            pg.evaluate("() => { curP().conds = curP().conds.filter(k => k !== 'liver').concat(['epilepsy']); }")
            assert pg.evaluate("() => drugBlockReasons(curP(), curV(), {id: 'y', n: 'Clomipramin 25 mg', hc: 'clomipramin', cls: 'Chống trầm cảm 3 vòng', tags: []}).filter(r => /động kinh/.test(r)).length") >= 1
            assert pg.evaluate("() => drugBlockReasons(curP(), curV(), {id: 'z', n: 'Bupropion 150 mg', hc: 'bupropion', tags: []}).length") == 1
            ami = "(n) => checkAll(curP(), curV(), [{line: {id: 'L', s: 0, tr: 0, c: 0, t: n}, drug: drugById('amitri25')}]).items.some(w => w.kind === 'Quy tắc phòng khám' && /liều cao/.test(w.m))"
            assert not pg.evaluate(ami, 2) and pg.evaluate(ami, 8), 'amitriptylin 50 mg/ngày được; 200 mg/ngày phải bị chặn ở động kinh'
            pg.evaluate("() => { curP().conds = curP().conds.filter(k => k !== 'epilepsy'); }")
            # hút thuốc lá hoặc béo phì (BMI ≥ 25) -> chặn mirtazapin, paroxetin, olanzapin
            SB = "(id) => drugBlockReasons(curP(), curV(), drugById(id)).filter(r => /tăng cân/.test(r)).length"
            so0 = pg.evaluate("() => JSON.stringify({risk: curP().risk || {}, note: curP().condNote, w: curP().weight, h: curP().height, vt: curV().vitals, dx: curV().dx})")
            pg.evaluate("() => { const p = curP(), v = curV(); p.risk = {...(p.risk || {}), smoke: 'former'}; p.condNote = 'Đã bỏ thuốc lá 5 năm'; p.weight = 60; p.height = 170; v.vitals = {...v.vitals, weight: 60, height: 170}; v.dx = {...v.dx, main: 'Viêm dạ dày', secondary: '', icd: ''}; }")
            assert [pg.evaluate(SB, i) for i in ['mirta30n', 'parox20n', 'olan10n']] == [0, 0, 0], 'đã bỏ thuốc, BMI 20,8 -> không chặn'
            pg.evaluate("() => { curP().risk.smoke = 'current'; }")
            assert [pg.evaluate(SB, i) for i in ['mirta30n', 'parox20n', 'olan10n', 'sert50']] == [1, 1, 1, 0], 'đang hút thuốc -> chặn'
            pg.evaluate("() => { const p = curP(), v = curV(); p.risk.smoke = 'never'; p.weight = 80; v.vitals.weight = 80; }")   # BMI 27,7
            assert [pg.evaluate(SB, i) for i in ['mirta30f', 'olan10f']] == [1, 1], 'BMI ≥ 25 -> chặn'
            pg.evaluate("(s) => { const p = curP(), v = curV(), o = JSON.parse(s); p.risk = o.risk; p.condNote = o.note; p.weight = o.w; p.height = o.h; v.vitals = o.vt; v.dx = o.dx; }", so0)
            # tích ô động kinh -> chặn SSRI (không chặn SNRI); chẩn đoán G40.9 không có ô tích -> không chặn
            EB = "(id) => drugBlockReasons(curP(), curV(), drugById(id)).filter(r => /tích ô động kinh/.test(r)).length"
            ep0 = pg.evaluate("() => JSON.stringify(curP().conds)")
            pg.evaluate("() => { const p = curP(); p.conds = p.conds.filter(k => k !== 'epilepsy'); }")
            assert pg.evaluate(EB, 'sert50') == 0
            pg.evaluate("() => { curP().conds.push('epilepsy'); }")
            assert pg.evaluate(EB, 'sert50') == 1 and pg.evaluate(EB, 'escit10') == 1, 'tích ô động kinh phải chặn SSRI'
            assert pg.evaluate(EB, 'venla75n') == 0 and pg.evaluate(EB, 'tiane12') == 0
            pg.evaluate("(s) => { curP().conds = JSON.parse(s); }", ep0)
            # chán ăn tâm thần (ICD F50.0) -> chặn TCA, IMAO, bupropion; F50.2 không chặn; SSRI không bị quy tắc này chặn
            AB = "(id) => drugBlockReasons(curP(), curV(), drugById(id)).filter(r => /^chán ăn tâm thần/.test(r)).length"
            an0 = pg.evaluate("() => JSON.stringify(curV().dx)")
            pg.evaluate("() => { curV().dx = {...curV().dx, main: 'Ăn vô độ tâm thần', secondary: '', icd: 'F50.2 – Ăn vô độ tâm thần (bulimia)'}; }")
            assert pg.evaluate(AB, 'amitri25') == 0
            assert pg.evaluate("() => drugBlockReasons(curP(), curV(), {hc: 'bupropion', n: 'Bupropion 150 mg'}).filter(r => /^ăn vô độ tâm thần/.test(r)).length") == 1, 'F50.2 phải chặn bupropion'
            pg.evaluate("() => { curV().dx = {...curV().dx, main: 'Chán ăn tâm thần', icd: 'F50.0 – Chán ăn tâm thần'}; }")
            assert pg.evaluate(AB, 'amitri25') == 1, 'ICD F50.0 phải chặn TCA'
            assert pg.evaluate(AB, 'sert50') == 0
            assert pg.evaluate("() => [{hc: 'bupropion', n: 'Bupropion 150 mg'}, {hc: 'moclobemid', n: 'Moclobemid 150 mg'}].map(d => drugBlockReasons(curP(), curV(), d).filter(r => /^chán ăn tâm thần/.test(r)).length)") == [1, 1], 'phải chặn bupropion và IMAO'
            pg.evaluate("(s) => { curV().dx = JSON.parse(s); }", an0)
            # danh mục: ICD và cận lâm sàng rối loạn ăn uống
            assert pg.evaluate("() => ['F50.3','F50.5','F50.8','F50.9','F98.2','F98.3'].every(c => ICD.some(x => x[0] === c))")
            assert pg.evaluate("() => ['F40.8','F40.9','F41.3','F41.8','F06.4','F93.1','F93.2'].every(c => ICD.some(x => x[0] === c))"), 'thiếu mã ICD rối loạn lo âu'
            assert pg.evaluate("() => ['F43.8','F43.9','F43.22','F44.5','F45.3','F48.0','F62.0'].every(c => ICD.some(x => x[0] === c))"), 'thiếu mã ICD rối loạn liên quan stress'
            assert pg.evaluate("() => ['cortisol','acth'].every(k => LABS.some(x => x[0] === 'Máu' && x[1] === k))"), 'thiếu cortisol / ACTH'
            assert pg.evaluate("() => ['progest','fsh','lh','prl','sa_tc'].every(k => LABS.some(x => x[1] === k)) && LABS.find(x => x[1] === 'testo')[3] === 'ng/dL'"), 'thiếu hormon sinh dục / siêu âm tử cung'
            assert pg.evaluate("() => ['bssc_m','bssc_f','scs_m','scs_f','asex','sdq_sex'].every(k => LABS.some(x => x[1] === k))"), 'thiếu test tình dục BSSC / SCS / ASEX / SDQ'
            assert pg.evaluate("() => ['zolpi10','melato3','doxep10','trazo50','hydro25'].every(id => { const d = drugById(id); return d && d.g === 'neuro' && /\\d/.test(d.how); })"), 'thiếu thuốc rối loạn giấc ngủ / liều'
            assert pg.evaluate("() => isTca(drugById('doxep10'))"), 'doxepin phải được nhận là thuốc 3 vòng'
            zr = pg.evaluate("""() => { const z = drugById('zolpi10'), p0 = {sex:'Nam', condNote:''}, v0 = {date:'2026-11-02', hpi:'', dx:{}, rx:[]};
              const B = (p, v) => drugBlockReasons(p, v, z, ctxOf(p, v)).length > 0;
              return [B(p0, v0), B(p0, {...v0, hpi:'chóng mặt khi đứng'}), B(p0, {...v0, hpi:'không chóng mặt'}), B({...p0, condNote:'suy gan'}, v0),
                B({...p0, condNote:'nhược cơ'}, v0), B({...p0, condNote:'ngưng thở khi ngủ'}, v0), B(p0, {...v0, dx:{icd:'G47.3'}}),
                zolpidemLowStart({...p0, birthYear:1950}, v0, z).length > 0, zolpidemLowStart({...p0, weight:45, height:160}, v0, z).length > 0,
                zolpidemLowStart({...p0, weight:60, height:160}, v0, z).length > 0]; }""")
            assert zr == [False, True, False, True, True, True, True, True, True, False], 'quy tắc zolpidem sai: ' + str(zr)
            zc = pg.evaluate("""() => { const z = drugById('zopi7n'), p0 = {sex:'Nam', condNote:''}, v0 = {date:'2026-11-02', hpi:'', dx:{}, rx:[]};
              const B = (p, v) => drugBlockReasons(p, v, z, ctxOf(p, v)).length > 0;
              return [B(p0, v0), B({...p0, condNote:'hay chóng mặt'}, v0), B(p0, {...v0, hpi:'chóng mặt'}), B(p0, {...v0, hpi:'không chóng mặt'}),
                zopicloneHalf(p0, v0, z).length, zopicloneHalf({...p0, birthYear:1950}, v0, z).length, zopicloneHalf({...p0, condNote:'suy gan', birthYear:1950}, v0, z).length]; }""")
            assert zc == [False, True, True, False, 0, 1, 2], 'quy tắc zopiclon sai: ' + str(zc)
            zp = pg.evaluate("""() => { const z = drugById('zale10'), v0 = {date:'2026-11-02', hpi:'', dx:{}, rx:[]}, B = p => drugBlockReasons(p, v0, z, ctxOf(p, v0)).length > 0;
              return [!!z && z.g === 'neuro', B({sex:'Nam', condNote:''}), B({sex:'Nam', condNote:'suy gan do rượu'}), B({sex:'Nam', condNote:'không suy gan'})]; }""")
            assert zp == [True, False, True, False], 'quy tắc zaleplon sai: ' + str(zp)
            tz = pg.evaluate("""() => { const z = drugById('trazo50'), v0 = {date:'2026-11-02', hpi:'', dx:{}, rx:[]}, B = p => drugBlockReasons({sex:'Nam', condNote:'', birthYear:1980, ...p}, v0, z, ctxOf({sex:'Nam', condNote:'', birthYear:1980, ...p}, v0)).length > 0;
              return [B({}), B({condNote:'bệnh mạch vành đặt stent'}), B({condNote:'rung nhĩ'}), B({condNote:'suy gan'}), B({birthYear:2012}), B({birthYear:1955}), B({conds:['cvd']}),
                TEMPLATES_SEED.some(t => t.id === 'adv_trazo' && t.tags.includes('tag:trazodone') && /rối loạn cương dương/.test(t.text))]; }""")
            assert tz == [False, True, True, True, True, True, True, True], 'quy tắc trazodon sai: ' + str(tz)
            mz = pg.evaluate("""() => { const z = drugById('mirta30f'), v0 = {date:'2026-11-02', hpi:'', dx:{}, rx:[], vitals:{}}, B = p => { const q = {sex:'Nam', condNote:'', job:'', ...p}; return drugBlockReasons(q, v0, z, ctxOf(q, v0)).length > 0; };
              return [B({}), B({job:'Tài xế taxi'}), B({job:'Giáo viên'}), B({weight:70, height:165}), /7,5–15 mg/.test(z.how)]; }""")
            assert mz == [False, True, False, True, True], 'quy tắc mirtazapin sai: ' + str(mz)
            sa = pg.evaluate("""() => { const t = TEMPLATES_SEED.find(x => x.id === 'adv_sleep'); if(!t) return null;
              const M = icd => tplMatches(t, ctxOf({sex:'Nam', condNote:''}, {date:'2026-11-02', dx:{icd}, rx:[]}));
              return [M('F51.0'), M('G47.3'), M('F51.5'), M('F32.1'), /20 phút/.test(t.text)]; }""")
            assert sa == [True, True, True, False, True], 'lời dặn rối loạn giấc ngủ sai: ' + str(sa)
            cp = pg.evaluate("""() => { const t = TEMPLATES_SEED.find(x => x.id === 'adv_child_psy'); if(!t) return null;
              const M = icd => tplMatches(t, ctxOf({sex:'Nam', condNote:''}, {date:'2026-11-05', dx:{icd}, rx:[]}));
              return [M('F90.0'), M('F84.0'), M('F70'), M('F98.0'), M('F32.1'), M('F99'), /Gia đình cần phối hợp/.test(t.text) && t.text.includes('(MBI)')]; }""")
            assert cp == [True, True, True, True, False, False, True], 'lời dặn rối loạn tâm thần trẻ em sai: ' + str(cp)
            # bản đã cài trước 2026-11-05 (chưa có đoạn theo dõi) được bổ sung một lần qua TPL_UPDATES
            assert pg.evaluate("""async () => { const t = S.tpls.find(x => x.id === 'adv_child_psy'); t.text = t.text.split(String.fromCharCode(10) + 'Theo dõi phát triển')[0];
              S.settings.tplUpdated = (S.settings.tplUpdated || []).filter(v => v !== 'tre-em-theo-doi-2026-11-05'); await updateSeedTpls();
              const x = S.tpls.find(y => y.id === 'adv_child_psy').text; return x.endsWith('Tái khám sau 2 tuần.') && x.split('Theo dõi phát triển').length === 2; }"""), 'chưa bổ sung đoạn theo dõi vào mẫu trẻ em'
            ap = pg.evaluate("""() => { const t = TEMPLATES_SEED.find(x => x.id === 'adv_asd'); if(!t) return null;
              const M = icd => tplMatches(t, ctxOf({sex:'Nam', condNote:''}, {date:'2026-11-05', dx:{icd}, rx:[]}));
              return [M('F84.0'), M('F84.1'), M('F84.5'), M('F90.0'), /trung tâm cho trẻ khuyết tật/.test(t.text)]; }""")
            assert ap == [True, True, True, False, True], 'lời dặn tự kỷ sai: ' + str(ap)
            st = pg.evaluate("""() => { const t = TEMPLATES_SEED.find(x => x.id === 'adv_stutter'); if(!t) return null;
              const M = icd => tplMatches(t, ctxOf({sex:'Nam', condNote:''}, {date:'2026-11-05', dx:{icd}, rx:[]}));
              return [M('F98.5'), M('F98.6'), M('F84.0'), /ngón tay/.test(t.text)]; }""")
            assert st == [True, False, False, True], 'lời dặn nói lắp sai: ' + str(st)
            assert pg.evaluate("() => ['amitri25','amitri25f'].every(id => { const d = drugById(id); return d && isTca(d) && d.how === '' && d.howOpts[0] === 'Uống mỗi lần 1 viên, ngày uống 3 lần sau ăn sáng, trưa, tối' && d.dnote.startsWith('Có thể dùng liều 1 ngày vào buổi tối') && d.dose.join() === '1,1,0,1'; }) && isTca(drugById('imipr25')) && /25–300 mg/.test(drugById('imipr25').how)"), 'thiếu amitriptylin / imipramin'
            ai = pg.evaluate("""() => { const v0 = {date:'2026-11-02', hpi:'', dx:{}, rx:[]};
              const B = (id, p) => { const q = {sex:'Nam', condNote:'', birthYear:1980, ...p}; return drugBlockReasons(q, v0, drugById(id), ctxOf(q, v0)).length > 0; };
              return [B('amitri25', {}), B('imipr25', {}), B('amitri25f', {condNote:'bệnh mạch vành'}), B('imipr25', {condNote:'rung nhĩ'}), B('imipr25', {conds:['bph']}),
                B('amitri25', {condNote:'phì đại tiền liệt tuyến'}), B('imipr25', {birthYear:1955}), B('amitri25', {birthYear:1955})]; }""")
            assert ai == [False, False, True, True, True, True, True, True], 'quy tắc amitriptylin / imipramin sai: ' + str(ai)
            assert pg.evaluate("() => ['diaz5','diaz5f'].every(id => { const d = drugById(id); return d && expandTags(d.tags).has('bzd') && /5–20 mg/.test(d.how); }) && drugById('diaz5f').o === 'Ngoại'"), 'thiếu diazepam Ngoại / liều'
            assert pg.evaluate("() => [[118, 78], [125, 78], [135, 82], [150, 85], [165, 102], [185, 95]].map(([s, d]) => bpClass(s, d))") == ['Huyết áp bình thường', 'Huyết áp bình thường cao', 'Tiền tăng huyết áp', 'Tăng huyết áp độ 1 (tâm thu đơn độc)', 'Tăng huyết áp độ 2', 'Tăng huyết áp độ 2 — ≥ 180/110: đánh giá ngay tổn thương cơ quan đích'], 'phân độ huyết áp theo VNHA 2026'
            assert pg.evaluate("() => [['pss', 20], ['pcptsd5', 4]].map(([k, v]) => scaleResult(k, v).t)") == ['Stress cảm nhận vừa', 'Dương tính — đánh giá thêm bằng PCL-5 / CAPS-5']
            assert pg.evaluate("() => [['gad7', 12], ['gad2', 3], ['phq4_d', 1], ['phq9', 20], ['mmse', 23], ['moca', 27]].map(([k, v]) => (scaleResult(k, v) || {}).t)") == ['Lo âu vừa', 'Dương tính — làm GAD-7', 'Âm tính', 'Trầm cảm nặng', 'Nhẹ', 'Bình thường']
            assert pg.evaluate("() => [30, 24, 23, 19, 18, 10, 9, 0].map(x => scaleResult('mmse', x).t).join()") == 'Bình thường,Bình thường,Nhẹ,Nhẹ,Vừa,Vừa,Nặng,Nặng'
            assert pg.evaluate("() => Object.keys(SCALE_BANDS).every(k => LABS.some(x => x[1] === k))"), 'SCALE_BANDS có key không có trong LABS'
            # bộ chỉ định "Điện giải đồ (Na, K, Clo)": tích -> thêm 3 dòng Na, K, Clo; bỏ tích -> bỏ cả 3
            pg.evaluate("go({name: 'visit', pid: curP().id, vid: curV().id, step: 2})"); pg.wait_for_timeout(300)
            od0 = pg.evaluate("() => JSON.stringify(curV().orders)")
            pg.evaluate("() => { curV().orders = curV().orders.filter(o => !['na','k','cl'].includes(o.key)); renderMain(true); }"); pg.wait_for_timeout(200)
            pg.click('input[data-act="ordPanel"][data-id="dgd"]'); pg.wait_for_timeout(300)
            assert sorted(pg.evaluate("curV().orders.filter(o => ['na','k','cl'].includes(o.key)).map(o => o.key)")) == ['cl', 'k', 'na']
            assert pg.is_checked('input[data-act="ordPanel"][data-id="dgd"]')
            assert pg.locator('input[data-act="ord"][data-key="k"]').count() == 0, 'Na, K, Clo không còn ô chọn riêng'
            assert 'Điện giải đồ (Na, K, Clo)' in pg.inner_text('tr.panel-hdr')
            pg.click('input[data-act="ordPanel"][data-id="dgd"]'); pg.wait_for_timeout(300)
            assert pg.evaluate("curV().orders.filter(o => ['na','k','cl'].includes(o.key)).length") == 0
            pg.evaluate("(s) => { curV().orders = JSON.parse(s); renderMain(true); }", od0)
            assert pg.evaluate("() => [20, 44, 45, 59, 60, 69, 70, 80].map(x => scaleResult('zung_d', x).t).join('|')") == 'Bình thường hoặc tối thiểu|Bình thường hoặc tối thiểu|Nhẹ|Nhẹ|Vừa|Vừa|Nặng|Nặng', 'ngưỡng Zung SDS'
            assert pg.evaluate("() => [0, 4, 5, 7, 8, 9, 10, 15].map(x => scaleResult('gds', x).t).join('|')") == 'Bình thường|Bình thường|Nhẹ|Nhẹ|Vừa|Vừa|Nặng|Nặng', 'ngưỡng GDS-15'
            assert pg.evaluate("() => [0, 9, 10, 12, 13, 30].map(x => scaleResult('epds', x).t).join('|')") == 'Nguy cơ thấp|Nguy cơ thấp|Theo dõi|Theo dõi|Nguy cơ cao|Nguy cơ cao', 'ngưỡng EPDS'
            # Zung SAS: ô đánh giá chỉ có Bình thường / Nhẹ – vừa / Nặng / Rất nặng
            pg.click('input[data-act="ord"][data-key="zung_a"]'); pg.wait_for_timeout(300)
            zid = pg.evaluate("curV().orders.find(o => o.key === 'zung_a').id")
            opts = pg.evaluate("(id) => [...document.querySelectorAll(`select[data-b=\"v.orders.#${id}.flag\"] option`)].map(o => o.textContent)", zid)
            assert opts == ['— đánh giá —', 'Bình thường', 'Nhẹ – vừa', 'Nặng', 'Rất nặng'], opts
            pg.evaluate("(id) => { curV().orders = curV().orders.filter(o => o.id !== id); renderMain(true); }", zid); pg.wait_for_timeout(200)
            # DASS-21 (trầm cảm, lo âu, stress): ô đánh giá 5 mức; tự diễn giải theo điểm đã × 2
            for dk in ['dass_d', 'dass_a', 'dass_s']:
                pg.click(f'input[data-act="ord"][data-key="{dk}"]'); pg.wait_for_timeout(300)
                did = pg.evaluate("(k) => curV().orders.find(o => o.key === k).id", dk)
                opts = pg.evaluate("(id) => [...document.querySelectorAll(`select[data-b=\"v.orders.#${id}.flag\"] option`)].map(o => o.textContent)", did)
                assert opts == ['— đánh giá —', 'Bình thường', 'Nhẹ', 'Vừa', 'Nặng', 'Rất nặng'], (dk, opts)
                pg.evaluate("(id) => { curV().orders = curV().orders.filter(o => o.id !== id); renderMain(true); }", did); pg.wait_for_timeout(200)
            assert pg.evaluate("() => [['dass_d', 16], ['dass_a', 8], ['dass_s', 34]].map(([k, v]) => scaleResult(k, v).t)") == ['Trầm cảm vừa', 'Lo âu nhẹ', 'Stress rất nặng']
            # PSQI: ô đánh giá chỉ có Tốt / Kém
            pg.click('input[data-act="ord"][data-key="psqi"]'); pg.wait_for_timeout(300)
            qid = pg.evaluate("curV().orders.find(o => o.key === 'psqi').id")
            opts = pg.evaluate("(id) => [...document.querySelectorAll(`select[data-b=\"v.orders.#${id}.flag\"] option`)].map(o => o.textContent)", qid)
            assert opts == ['— đánh giá —', 'Tốt', 'Kém'], opts
            pg.evaluate("(id) => { curV().orders = curV().orders.filter(o => o.id !== id); renderMain(true); }", qid); pg.wait_for_timeout(200)
            # giao diện: chọn GAD-7 ở bước 2, nhập 12 -> ô Kết quả hiện "Lo âu vừa"
            pg.evaluate("go({name: 'visit', pid: curP().id, vid: curV().id, step: 2})"); pg.wait_for_timeout(300)
            pg.click('input[data-act="ord"][data-key="gad7"]'); pg.wait_for_timeout(300)
            gid = pg.evaluate("curV().orders.find(o => o.key === 'gad7').id")
            pg.fill(f'input[data-b="v.orders.#{gid}.value"]', '12'); pg.wait_for_timeout(300)
            assert 'Lo âu vừa' in pg.inner_text(f'[data-live="scale"][data-id="{gid}"]')
            pg.evaluate("(id) => { curV().orders = curV().orders.filter(o => o.id !== id); }", gid)
            assert pg.evaluate("(ks) => ks.every(k => LABS.some(x => x[1] === k))", ['phq2', 'madrs', 'hads_a', 'hads_d', 'ymrs', 'rads', 'panss', 'bfcrs', 'audit', 'ciwa', 'isi', 'minicog', 'gpcog', 'adascog', 'clock', 'adl', 'cam', 'rass', 'wechsler', 'raven', 'denver', 'cbcl', 'mchat', 'cars', 'ados', 'vanderbilt', 'asq', 'asex', 'iief5', 'sdq_sex', 'ddimer', 'ntprobnp', 'tnths']), 'thiếu thang điểm / xét nghiệm mới'
            assert pg.evaluate("() => ['mg','phos','cl','ca','hco3','amylase','ft3','e2','testo','sa_tim','eeg','dexa','edeq'].every(k => LABS.some(x => x[1] === k))")
            # duloxetin: phì đại tiền liệt tuyến (ô / tiền sử), tiền sử ghi suy gan -> chặn
            DB = "() => drugBlockReasons(curP(), curV(), drugById('dulox30n')).filter(r => /tiền liệt tuyến|suy gan/.test(r)).length"
            du0 = pg.evaluate("() => JSON.stringify({conds: curP().conds, note: curP().condNote})")
            pg.evaluate("() => { const p = curP(); p.conds = p.conds.filter(k => !['bph','liver'].includes(k)); p.condNote = 'Không phì đại tiền liệt tuyến'; }")
            assert pg.evaluate(DB) == 0
            pg.evaluate("() => { curP().conds.push('bph'); }")
            assert pg.evaluate(DB) == 1, 'ô phì đại tiền liệt tuyến phải chặn duloxetin'
            pg.evaluate("() => { const p = curP(); p.conds = p.conds.filter(k => k !== 'bph'); p.condNote = 'Suy gan do rượu'; }")
            assert pg.evaluate(DB) == 1, 'tiền sử ghi suy gan phải chặn duloxetin'
            pg.evaluate("(s) => { const p = curP(), o = JSON.parse(s); p.conds = o.conds; p.condNote = o.note; }", du0)
            # mẫu lời dặn "Tâm bệnh" có trong thư viện, gợi ý khi đơn có SSRI
            assert pg.evaluate("() => { const t = S.tpls.find(x => x.id === 'adv_psych'); return !!t && t.cat === 'advice' && t.title === 'Tâm bệnh' && tplMatches(t, ctxOf(curP(), curV()), new Set(['ssri'])); }"), 'thiếu mẫu lời dặn Tâm bệnh'
            assert pg.evaluate("() => S.tpls.find(x => x.id === 'adv_psych').text.includes('Tránh mang thai trong thời gian sử dụng thuốc')"), 'mẫu Tâm bệnh thiếu câu tránh mang thai'
            assert pg.evaluate("() => { const t = S.tpls.find(x => x.id === 'adv_viagra'); const p = curP(), v = curV(); const c0 = p.conds; p.conds = c0.concat(['sexual_dysf']); const a = !!t && t.cat === 'advice' && /Ăn ít dầu mỡ/.test(t.text) && /> 1 giờ/.test(t.text) && tplMatches(t, ctxOf(p, v), new Set()); p.conds = c0.filter(k => k !== 'sexual_dysf'); const b = tplMatches(t, ctxOf(p, v), new Set(['pde5'])); p.conds = c0; return a && b; }"), 'mẫu lời dặn Viagra phải gợi ý khi rối loạn tình dục hoặc đơn có sildenafil'
            assert pg.evaluate("() => { const t = S.tpls.find(x => x.id === 'adv_ed'); const v = curV(), d0 = JSON.stringify(v.dx); v.dx = {...v.dx, icd: 'F52.2 – Thất bại trong đáp ứng sinh dục (rối loạn cương)'}; const a = !!t && /Masters và Johnson/.test(t.text) && tplMatches(t, ctxOf(curP(), v), new Set()); v.dx = {...v.dx, icd: 'F52.0 – Thiếu hoặc mất ham muốn tình dục'}; const b = !tplMatches(t, ctxOf(curP(), v), new Set()); v.dx = JSON.parse(d0); return a && b; }"), 'mẫu rối loạn cương dương chỉ gợi ý khi chẩn đoán rối loạn cương'
            assert pg.evaluate("() => { const t = S.tpls.find(x => x.id === 'adv_pe'); const v = curV(), d0 = JSON.stringify(v.dx); v.dx = {...v.dx, icd: 'F52.4 – Phóng tinh sớm'}; const a = !!t && /Kegel/.test(t.text) && /Semans/.test(t.text) && tplMatches(t, ctxOf(curP(), v), new Set()); v.dx = {...v.dx, icd: 'F52.2 – Thất bại trong đáp ứng sinh dục (rối loạn cương)'}; const b = !tplMatches(t, ctxOf(curP(), v), new Set()); v.dx = JSON.parse(d0); return a && b; }"), 'mẫu xuất tinh sớm chỉ gợi ý khi chẩn đoán xuất tinh sớm'
            assert pg.evaluate("() => { const tf = S.tpls.find(x => x.id === 'adv_sex_f'), tr = S.tpls.find(x => x.id === 'adv_relax'), p = curP(), v = curV(), d0 = JSON.stringify(v.dx), s0 = p.sex; v.dx = {...v.dx, icd: 'F52.0 – Thiếu hoặc mất ham muốn tình dục'}; p.sex = 'Nữ'; const a = tplMatches(tf, ctxOf(p, v), new Set()) && tplMatches(tr, ctxOf(p, v), new Set()) && /Kegel/.test(tf.text) && /Jacobson/.test(tr.text); p.sex = 'Nam'; const b = !tplMatches(tf, ctxOf(p, v), new Set()) && tplMatches(tr, ctxOf(p, v), new Set()); v.dx = {...v.dx, icd: 'K29.7 – Viêm dạ dày, không đặc hiệu'}; const c0 = p.conds; p.conds = c0.filter(k => k !== 'sexual_dysf'); const c = !tplMatches(tr, ctxOf(p, v), new Set()); p.conds = c0; p.sex = s0; v.dx = JSON.parse(d0); return a && b && c; }"), 'mẫu nữ chỉ gợi ý khi bệnh nhân nữ có rối loạn tình dục; mẫu thư giãn cho mọi rối loạn tình dục'
            # máy đang dùng có mẫu bản cũ -> updateSeedTpls thêm câu một lần
            assert pg.evaluate("async () => { const t = S.tpls.find(x => x.id === 'adv_psych'); t.text = t.text.replace(' Tránh mang thai trong thời gian sử dụng thuốc.', ''); S.settings.tplUpdated = []; await updateSeedTpls(); return (t.text.match(/Tránh mang thai/g) || []).length; }") == 1
            # tiền sử ghi "đang sử dụng rượu" -> chặn benzodiazepin; "không ..." hoặc "đã bỏ rượu" không chặn; zopiclon không bị quy tắc này chặn
            RB = "(id) => drugBlockReasons(curP(), curV(), drugById(id)).filter(r => /đang sử dụng rượu|có uống rượu bia/.test(r)).length"
            rb0 = pg.evaluate("() => curP().condNote"); al0 = pg.evaluate("() => (curP().risk || {}).alcohol || 'no'")
            pg.evaluate("() => { curP().risk = {...(curP().risk || {}), alcohol: 'no'}; }")
            pg.evaluate("() => { curP().condNote = 'Đã bỏ rượu 2 năm; không đang sử dụng rượu'; }")
            assert pg.evaluate(RB, 'diaz5') == 0
            pg.evaluate("() => { curP().condNote = 'THA 5 năm. Đang sử dụng rượu 3 cốc/ngày'; }")
            assert [pg.evaluate(RB, x) for x in ['diaz5', 'loraz1', 'alpra05n', 'clona2', 'broma6']] == [1, 1, 1, 1, 1], 'đang sử dụng rượu phải chặn benzodiazepin'
            assert pg.evaluate(RB, 'zopi7n') == 0
            pg.evaluate("() => { curP().condNote = ''; curP().risk.alcohol = 'heavy'; }")
            assert pg.evaluate(RB, 'diaz5') == 1, 'uống rượu bia thường xuyên, nhiều phải chặn benzodiazepin'
            pg.evaluate("() => { curP().risk.alcohol = 'some'; }")
            assert pg.evaluate(RB, 'diaz5') == 1, 'uống rượu bia thỉnh thoảng cũng chặn benzodiazepin'
            pg.evaluate("([s, a]) => { curP().condNote = s; curP().risk.alcohol = a; }", [rb0, al0])
            # tích ô đang cho con bú -> chặn mọi thuốc thần kinh – tâm thần; thuốc nhóm khác không bị chặn
            BB = "(id) => drugBlockReasons(curP(), curV(), drugById(id)).filter(r => /cho con bú/.test(r)).length"
            bb0 = pg.evaluate("() => JSON.stringify({conds: curP().conds, note: curP().condNote, sex: curP().sex, hpi: curV().hpi})")
            pg.evaluate("() => { const p = curP(); p.conds = p.conds.filter(k => k !== 'breastfeeding'); p.condNote = ''; curV().hpi = ''; }")
            assert pg.evaluate(BB, 'sert50') == 0
            pg.evaluate("() => { curP().conds.push('breastfeeding'); curP().sex = 'Nữ'; }")
            neuro_b = pg.evaluate("() => DRUGS_SEED.filter(d => d.g === 'neuro' && !/sertralin|paroxetin/.test(d.hc)).map(d => d.id)")
            assert all(pg.evaluate(BB, x) == 1 for x in neuro_b), 'cho con bú phải chặn mọi thuốc thần kinh – tâm thần'
            assert pg.evaluate(BB, 'cipro500') == 0
            pg.evaluate("(s) => { const p = curP(), o = JSON.parse(s); p.conds = o.conds; p.condNote = o.note; p.sex = o.sex; curV().hpi = o.hpi; }", bb0)
            # pregabalin: tiền sử ghi không dung nạp galactose / thiếu lactase Lapp / kém hấp thu glucose – galactose -> chặn
            GB = "() => drugBlockReasons(curP(), curV(), drugById('pregab75')).filter(r => /galactose/.test(r)).length"
            assert pg.evaluate("() => { const d = drugById('pregab75'); return !!d && d.renal.length === 3 && /15–29: 25–150/.test(d.how); }"), 'thiếu pregabalin / liều theo thận'
            gl0 = pg.evaluate("() => curP().condNote")
            pg.evaluate("() => { curP().condNote = 'Viêm dạ dày'; }")
            assert pg.evaluate(GB) == 0
            for note in ['Không dung nạp galactose bẩm sinh', 'Thiếu lactase Lapp', 'Kém hấp thu glucose – galactose']:
                pg.evaluate("(s) => { curP().condNote = s; }", note)
                assert pg.evaluate(GB) == 1, note
            assert pg.evaluate("() => drugBlockReasons(curP(), curV(), drugById('gaba300n')).filter(r => /galactose/.test(r)).length") == 0
            pg.evaluate("(s) => { curP().condNote = s; }", gl0)
            # propranolol: hen/COPD, rối loạn nhịp, suy tim (ô bệnh nền), bệnh mạch ngoại biên nặng (tiền sử) -> chặn
            PRB = "() => drugBlockReasons(curP(), curV(), drugById('propra40')).filter(r => /^propranolol:/.test(r)).length"
            pr0 = pg.evaluate("() => JSON.stringify({conds: curP().conds, note: curP().condNote, dx: curV().dx})")
            pg.evaluate("() => { const p = curP(); p.conds = p.conds.filter(k => !['asthma','af','heart_failure'].includes(k)); p.condNote = ''; curV().dx = {...curV().dx, main: 'Lo âu', secondary: '', icd: ''}; }")
            assert pg.evaluate(PRB) == 0
            for k in ['asthma', 'af', 'heart_failure']:
                pg.evaluate("(k) => { const p = curP(); p.conds = p.conds.filter(x => !['asthma','af','heart_failure'].includes(x)).concat([k]); }", k)
                assert pg.evaluate(PRB) == 1, k
            pg.evaluate("() => { const p = curP(); p.conds = p.conds.filter(x => !['asthma','af','heart_failure'].includes(x)); p.condNote = 'Bệnh mạch ngoại biên nặng, đau cách hồi'; }")
            assert pg.evaluate(PRB) == 1, 'bệnh mạch ngoại biên nặng phải chặn propranolol'
            pg.evaluate("(s) => { const p = curP(), o = JSON.parse(s); p.conds = o.conds; p.condNote = o.note; curV().dx = o.dx; }", pr0)
            assert pg.evaluate("() => ['piracetam','ginkgo','vinpocetin','cholalf','nicergolin','silymarin'].every(id => { const d = drugById(id); return d && !/mg/.test(d.n); })"), 'thiếu thuốc hỗ trợ thần kinh / silymarin'
            # tuổi < 18 hoặc > 65 -> chặn benzodiazepin; 40 tuổi không chặn
            AGB = "(id) => drugBlockReasons(curP(), curV(), drugById(id)).filter(r => /benzodiazepin —/.test(r)).length"
            ag0 = pg.evaluate("() => JSON.stringify({dob: curP().dob || '', by: curP().birthYear ?? null})")
            for age, exp in [(40, 0), (16, 1), (70, 1), (65, 0), (18, 0)]:
                pg.evaluate("(a) => { const p = curP(); p.dob = ''; p.birthYear = Number(curV().date.slice(0, 4)) - a; }", age)
                assert pg.evaluate(AGB, 'diaz5') == exp, (age, exp)
            pg.evaluate("(s) => { const p = curP(), o = JSON.parse(s); p.dob = o.dob; p.birthYear = o.by; }", ag0)
            # thuốc THA nhóm A–D: chống chỉ định -> chặn, thận trọng -> cảnh báo (VNHA 2026 Bảng 10.5)
            HB = "(id) => drugBlockReasons(curP(), curV(), drugById(id)).filter(r => /VNHA 2026/.test(r)).length"
            HC = "(id) => checkAll(curP(), curV(), [{line: {id: 'L_h', drugId: id}, drug: drugById(id)}]).items.filter(w => w.kind === 'Thận trọng (VNHA 2026)').length"
            h0 = pg.evaluate("() => JSON.stringify({conds: curP().conds, note: curP().condNote, sex: curP().sex, vit: curV().vitals, orders: curV().orders, hpi: curV().hpi})")
            pg.evaluate("() => { const p = curP(), v = curV(); p.conds = p.conds.filter(k => !['asthma','heart_failure','gout','diabetes','pregnant'].includes(k)); p.condNote = ''; v.hpi = ''; v.vitals = {...v.vitals, pulse: 72}; v.orders = v.orders.filter(o => !['na','k','bhcg'].includes(o.key)); }")
            assert [pg.evaluate(HB, x) for x in ['telmi40', 'meto50', 'nife30', 'hctz25']] == [0, 0, 0, 0]
            pg.evaluate("() => { curP().condNote = 'Tiền sử phù mạch khi dùng captopril'; }")
            assert pg.evaluate(HB, 'lisi10') == 1 and pg.evaluate(HB, 'telmi40') == 0, 'phù mạch chỉ chống chỉ định ức chế men chuyển'
            pg.evaluate("() => { curP().condNote = 'Đang mang thai 12 tuần'; curP().sex = 'Nữ'; }")
            assert [pg.evaluate(HB, x) for x in ['telmi40', 'peri5', 'hctz25', 'nife30']] == [1, 1, 1, 0], 'mang thai: chặn A và D, không chặn nifedipin'
            pg.evaluate("() => { const p = curP(); p.condNote = ''; p.conds.push('asthma'); }")
            assert pg.evaluate(HB, 'carve625') == 1 and pg.evaluate(HB, 'meto50') == 0 and pg.evaluate(HC, 'meto50') == 1, 'hen: chặn chẹn beta không chọn lọc, chọn lọc chỉ thận trọng'
            pg.evaluate("() => { const p = curP(); p.conds = p.conds.filter(k => k !== 'asthma'); curV().vitals.pulse = 45; }")
            assert pg.evaluate(HB, 'biso25') == 1, 'mạch < 50 phải chặn chẹn beta'
            pg.evaluate("() => { curV().vitals.pulse = 72; curP().conds.push('heart_failure'); }")
            assert pg.evaluate(HB, 'dilti60') == 1 and pg.evaluate(HB, 'amlo5') == 0 and pg.evaluate(HC, 'amlo5') == 1
            pg.evaluate("() => { const p = curP(); p.conds = p.conds.filter(k => k !== 'heart_failure'); curV().orders.push({id: 'o_k_h', key: 'k', name: 'Kali', unit: 'mmol/L', ref: '', type: 'n', value: 2.8, flag: '', note: ''}); }")
            assert pg.evaluate(HB, 'inda15') == 1, 'K < 3 phải chặn lợi tiểu thiazid'
            pg.evaluate("(s) => { const p = curP(), v = curV(), o = JSON.parse(s); p.conds = o.conds; p.condNote = o.note; p.sex = o.sex; v.vitals = o.vit; v.orders = o.orders; v.hpi = o.hpi; }", h0)
            # nguy cơ tim mạch: bảng kiểm VNHA 2026 + SCORE2-AP
            cv0 = pg.evaluate("() => JSON.stringify({conds: curP().conds, sex: curP().sex, dob: curP().dob || '', by: curP().birthYear ?? null, risk: curP().risk, fam: curP().famNote || '', vit: curV().vitals, orders: curV().orders, w: curP().weight, waist: curP().waist})")
            pg.evaluate("() => { const p = curP(), v = curV(); p.conds = []; p.sex = 'Nữ'; p.dob = ''; p.birthYear = Number(v.date.slice(0, 4)) - 45; p.risk = {...(p.risk || {}), smoke: 'never'}; p.famNote = ''; p.weight = 50; p.waist = 70; v.vitals = {...v.vitals, sbp: 135, dbp: 82, weight: 50, height: 160, waist: 70}; v.orders = v.orders.filter(o => !['ldl','hdl','chol','tg','glu','hba1c','acr','creat'].includes(o.key)); }")
            pg.evaluate("() => { window._rOf = renalOf; renalOf = () => null; }")   # bỏ eGFR của lượt khám cũ khi thử
            assert pg.evaluate("() => cvRisk(curP(), curV()).level") == 'Thấp', 'tiền THA, không YTNC -> thấp'
            pg.evaluate("() => { curV().vitals.sbp = 150; curV().vitals.dbp = 92; }")
            assert pg.evaluate("() => cvRisk(curP(), curV()).level") == 'Trung bình'
            pg.evaluate("() => { curP().conds = ['diabetes']; }")
            assert pg.evaluate("() => cvRisk(curP(), curV()).level") == 'Cao', 'đái tháo đường -> cao'
            pg.evaluate("() => { curP().conds = []; curV().orders.push({id: 'o_tc', key: 'chol', name: 'Cholesterol', unit: 'mmol/L', ref: '', type: 'n', value: 6.2, flag: '', note: ''}, {id: 'o_hdl', key: 'hdl', name: 'HDL', unit: 'mmol/L', ref: '', type: 'n', value: 1.3, flag: '', note: ''}); curP().risk.smoke = 'current'; }")
            assert pg.evaluate("() => cvRisk(curP(), curV()).score") == 15, 'SCORE2-AP: nữ 45 tuổi hút thuốc, HATT 150, non-HDL 4,9 -> 15%'
            pg.evaluate("(s) => { const p = curP(), v = curV(), o = JSON.parse(s); p.conds = o.conds; p.sex = o.sex; p.dob = o.dob; p.birthYear = o.by; p.risk = o.risk; p.famNote = o.fam; v.vitals = o.vit; v.orders = o.orders; p.weight = o.w; p.waist = o.waist; }", cv0)
            pg.evaluate("() => { renalOf = window._rOf; }")
            pg.evaluate("go({name: 'visit', pid: curP().id, vid: curV().id, step: 1})"); pg.wait_for_timeout(300)
            assert 'VNHA 2026' in pg.inner_text('[data-live="cvrisk"]'), 'thẻ Nguy cơ tim mạch phải hiện ở bước 1'
            assert pg.locator('[data-live="cvrisk"] a[href*="caremeyeulayminh.com"]').count() == 1 and pg.locator('[data-live="cvrisk"] a[href*="prevent-calculator"]').count() == 1 and pg.locator('[data-live="cvrisk"] a[href*="mdcalc.com"]').count() == 3
            assert 'Chỉ số để nhập PREVENT-CVD' in pg.inner_text('[data-live="cvrisk"]')
            # sửa 2026-11-02: không tích ô mang thai thì không chặn nhầm vì câu tiền sử sản khoa / dự định / phòng tránh / β-hCG cũ đã sinh
            pf0 = pg.evaluate("() => JSON.stringify({conds: curP().conds, note: curP().condNote, sex: curP().sex, hpi: curV().hpi, reason: curV().reason, orders: curV().orders})")
            pg.evaluate("() => { const p = curP(), v = curV(); p.sex = 'Nữ'; p.conds = p.conds.filter(k => !['pregnant','breastfeeding'].includes(k)); v.hpi = ''; v.reason = ''; v.orders = v.orders.filter(o => o.key !== 'bhcg'); }")
            for note in ['PARA 2002, mang thai 2 lần', 'Tránh mang thai khi dùng thuốc', 'Dự định mang thai năm sau', 'Lần mang thai trước bị tiền sản giật', 'Không mang thai', 'Chưa có thai', 'Sau mang thai bị trầm cảm']:
                pg.evaluate("(s) => { curP().condNote = s; }", note)
                assert pg.evaluate("() => pregnancyReason(curP(), curV())") == '', note
            for note in ['Đang mang thai 10 tuần', 'Có thai 8 tuần', 'mang thai', 'Đang mang thai lần đầu']:
                pg.evaluate("(s) => { curP().condNote = s; }", note)
                assert pg.evaluate("() => pregnancyReason(curP(), curV())") != '', note
            pg.evaluate("() => { const p = curP(), v = curV(); p.condNote = 'Sau sinh 3 tháng'; p.visits.find(x => x !== v).orders.push({id: 'o_hcg_old', key: 'bhcg', name: 'β-hCG', unit: 'mIU/mL', ref: '', type: 'n', value: 5000, flag: '', note: ''}); }")
            assert pg.evaluate("() => pregnancyReason(curP(), curV())") == '', 'β-hCG cũ sau khi đã sinh không tính'
            pg.evaluate("() => { curP().sex = 'Nam'; curP().condNote = 'mang thai'; }")
            assert pg.evaluate("() => pregnancyReason(curP(), curV())") == '', 'bệnh nhân nam không bao giờ mang thai'
            pg.evaluate("() => { const p = curP(); p.sex = 'Nữ'; p.conds = p.conds.filter(k => k !== 'breastfeeding'); }")
            for note, exp in [('Đã cai sữa, thôi cho con bú', False), ('Trước đây cho con bú 12 tháng', False), ('Không cho con bú', False), ('Sinh con 3 tháng, đang cho con bú', True)]:
                pg.evaluate("(s) => { curP().condNote = s; }", note)
                assert pg.evaluate("() => breastfeeding(curP(), curV())") == exp, note
            pg.evaluate("(s) => { const p = curP(), v = curV(), o = JSON.parse(s); p.conds = o.conds; p.condNote = o.note; p.sex = o.sex; v.hpi = o.hpi; v.reason = o.reason; v.orders = o.orders; p.visits.forEach(x => { if(x !== v) x.orders = (x.orders || []).filter(q => q.id !== 'o_hcg_old'); }); }", pf0)
            # sildenafil: nitrat, tiền sử tim mạch, HA < 90/50 hoặc > 170/100 -> chặn
            SB2 = "() => drugBlockReasons(curP(), curV(), drugById('silde50')).filter(r => /^sildenafil:/.test(r)).length"
            sd0 = pg.evaluate("() => JSON.stringify({conds: curP().conds, note: curP().condNote, meds: curP().meds, vit: curV().vitals, hpi: curV().hpi, dx: curV().dx, sex: curP().sex, dob: curP().dob || '', by: curP().birthYear ?? null})")
            pg.evaluate("() => { window._rOf2 = renalOf; renalOf = () => ({egfr: 75, crcl: 80}); }")
            pg.evaluate("() => { const p = curP(), v = curV(); p.sex = 'Nam'; p.conds = p.conds.filter(k => !['af','heart_failure','cvd'].includes(k)); p.condNote = ''; p.meds = []; v.hpi = ''; v.dx = {...v.dx, icd: '', icd2: ''}; v.vitals = {...v.vitals, sbp: 125, dbp: 78}; }")
            assert pg.evaluate(SB2) == 0 and pg.evaluate("() => drugBlockReasons(curP(), curV(), drugById('tada20')).filter(r => /^tadalafil:/.test(r)).length") == 0
            for setup in ["() => { curP().meds = [{id: 'm_n', text: 'Isosorbid mononitrat 60 mg', dose: ''}]; }",
                          "() => { curP().meds = []; curP().condNote = 'Nhồi máu cơ tim 2023'; }",
                          "() => { curP().condNote = ''; curP().conds.push('af'); }",
                          "() => { const p = curP(); p.conds = p.conds.filter(k => k !== 'af'); curV().vitals.sbp = 85; }",
                          "() => { curV().vitals.sbp = 175; }",
                          "() => { curV().vitals.sbp = 125; curP().sex = 'Nữ'; }",
                          "() => { curP().sex = 'Nam'; renalOf = () => ({egfr: 25, crcl: 40}); }",
                          "() => { renalOf = () => ({egfr: 45, crcl: 28}); }",
                          "() => { renalOf = () => ({egfr: 75, crcl: 80}); const p = curP(); p.dob = ''; p.birthYear = Number(curV().date.slice(0, 4)) - 16; }"]:
                pg.evaluate(setup)
                assert pg.evaluate(SB2) == 1, setup
                assert pg.evaluate("() => drugBlockReasons(curP(), curV(), drugById('tada20')).filter(r => /^tadalafil:/.test(r)).length") == 1, 'tadalafil cùng quy tắc: ' + setup
            pg.evaluate("(s) => { const p = curP(), v = curV(), o = JSON.parse(s); p.conds = o.conds; p.condNote = o.note; p.meds = o.meds; v.vitals = o.vit; v.hpi = o.hpi; v.dx = o.dx; p.sex = o.sex; p.dob = o.dob; p.birthYear = o.by; renalOf = window._rOf2; }", sd0)
            # mang thai (ô hồ sơ / tiền sử ghi) -> chặn toàn bộ nhóm thần kinh – tâm thần; thuốc nhóm khác không bị chặn
            PB = "(id) => drugBlockReasons(curP(), curV(), drugById(id)).filter(r => /^đang mang thai/.test(r)).length"
            pg0 = pg.evaluate("() => JSON.stringify({conds: curP().conds, note: curP().condNote, sex: curP().sex, hpi: curV().hpi, reason: curV().reason, orders: curV().orders})")
            pg.evaluate("() => { const p = curP(), v = curV(); p.conds = p.conds.filter(k => k !== 'pregnant'); p.condNote = 'Đã từng mang thai 2 lần'; v.hpi = ''; v.reason = ''; v.orders = (v.orders || []).filter(o => o.key !== 'bhcg'); }")
            assert pg.evaluate(PB, 'sert50') == 0 and pg.evaluate(PB, 'gaba300n') == 0
            pg.evaluate("() => { curP().condNote = 'Đang mang thai 10 tuần'; curP().sex = 'Nữ'; }")
            neuro = pg.evaluate("() => DRUGS_SEED.filter(d => d.g === 'neuro').map(d => d.id)")
            assert all(pg.evaluate(PB, x) == 1 for x in neuro), 'mang thai phải chặn mọi thuốc thần kinh – tâm thần'
            assert pg.evaluate(PB, 'tiane12') == 1 and pg.evaluate(PB, 'cipro500') == 0
            pg.evaluate("(s) => { const p = curP(), v = curV(), o = JSON.parse(s); p.conds = o.conds; p.condNote = o.note; p.sex = o.sex; v.hpi = o.hpi; v.reason = o.reason; v.orders = o.orders; }", pg0)
            # chẩn đoán phụ có mã ICD riêng: bệnh nền lấy từ mã phụ; cảnh báo ½ liều sertralin nhận mã trầm cảm ở cột phụ
            d20 = pg.evaluate("() => JSON.stringify(curV().dx)")
            pg.evaluate("() => { curV().dx = {...curV().dx, main: 'Viêm dạ dày', icd: 'K29.7 – Viêm dạ dày, không đặc hiệu', icd2: 'G40.9 – Động kinh, không đặc hiệu', secondary: ''}; }")
            assert pg.evaluate("() => ctxOf(curP(), curV()).conds.has('epilepsy')"), 'mã ICD phụ phải đưa bệnh nền vào kiểm tra'
            assert pg.evaluate("() => dxCodes(curV())") == ['K29.7', 'G40.9']
            pg.evaluate("(s) => { curV().dx = JSON.parse(s); }", d20)
            # sertralin: ICD trầm cảm + (gan mạn hoặc 6–12 tuổi) -> cảnh báo giảm ½ liều (không chặn)
            HD = "(id) => checkAll(curP(), curV(), [{line: {id: 'L_hd', drugId: id}, drug: drugById(id)}]).items.filter(w => w.kind === 'Liều (quy tắc phòng khám)').length"
            hd0 = pg.evaluate("() => JSON.stringify({dx: curV().dx, conds: curP().conds, dob: curP().dob || null, by: curP().birthYear || null})")
            pg.evaluate("() => { const p = curP(); p.conds = p.conds.filter(k => k !== 'liver'); curV().dx = {...curV().dx, main: 'Giai đoạn trầm cảm vừa', secondary: '', icd: 'F32.1 – Giai đoạn trầm cảm vừa'}; }")
            assert pg.evaluate(HD, 'sert50') == 0
            pg.evaluate("() => { curP().conds.push('liver'); }")
            assert pg.evaluate(HD, 'sert50') == 1 and pg.evaluate(HD, 'fluox20n') == 0, 'gan mạn + trầm cảm phải cảnh báo ½ liều sertralin'
            assert 'Quy tắc phòng khám' not in pg.evaluate("() => { const p = curP(), j0 = p.job; p.job = ''; const k = checkAll(p, curV(), [{line: {id: 'L_hd', drugId: 'sert50'}, drug: drugById('sert50')}]).items.map(w => w.kind); p.job = j0; return k; }"), 'chỉ cảnh báo, không chặn'
            pg.evaluate("() => { const p = curP(); p.conds = p.conds.filter(k => k !== 'liver'); p.dob = (Number(curV().date.slice(0, 4)) - 9) + '-01-01'; }")
            assert pg.evaluate(HD, 'sert50') == 1, 'trẻ 9 tuổi + trầm cảm phải cảnh báo ½ liều'
            assert pg.evaluate("() => halfDoseReasons(curP(), curV(), drugById('fluvo100')).length") == 1, 'fluvoxamin cũng cảnh báo ½ liều'
            assert pg.evaluate("() => { const d = drugById('fluvo100'); return d && d.cls === 'SSRI' && isSsriSnri(d); }"), 'fluvoxamin có trong danh mục, nhóm SSRI'
            pg.evaluate("() => { curV().dx = {...curV().dx, icd: 'F41.1 – Rối loạn lo âu lan toả'}; }")
            assert pg.evaluate(HD, 'sert50') == 0
            pg.evaluate("(s) => { const p = curP(), o = JSON.parse(s); curV().dx = o.dx; p.conds = o.conds; p.dob = o.dob || ''; if(o.by) p.birthYear = o.by; }", hd0)
            # olanzapin: QT kéo dài (ô hồ sơ) / hạ huyết áp tư thế (ICD I95.1 hoặc ghi chữ) -> chặn
            OB = "(id) => drugBlockReasons(curP(), curV(), drugById(id)).filter(r => /^olanzapin:/.test(r)).length"
            ol0 = pg.evaluate("() => JSON.stringify({dx: curV().dx, hpi: curV().hpi, conds: curP().conds, note: curP().condNote})")
            pg.evaluate("() => { const p = curP(), v = curV(); p.conds = p.conds.filter(k => k !== 'qt_long'); p.condNote = 'Không hạ huyết áp tư thế'; v.hpi = ''; v.dx = {...v.dx, main: 'Viêm dạ dày', secondary: '', icd: ''}; v.orders = (v.orders || []).filter(o => o.key !== 'ecg'); }")
            assert pg.evaluate(OB, 'olan10n') == 0
            pg.evaluate("() => { curP().conds.push('qt_long'); }")
            assert pg.evaluate(OB, 'olan10n') == 1, 'QT kéo dài phải chặn olanzapin'
            pg.evaluate("() => { const p = curP(); p.conds = p.conds.filter(k => k !== 'qt_long'); curV().dx = {...curV().dx, icd: 'I95.1 – Hạ huyết áp tư thế'}; }")
            assert pg.evaluate(OB, 'olan10f') == 1 and pg.evaluate(OB, 'sert50') == 0, 'hạ huyết áp tư thế phải chặn olanzapin'
            pg.evaluate("(s) => { const p = curP(), v = curV(), o = JSON.parse(s); v.dx = o.dx; v.hpi = o.hpi; p.conds = o.conds; p.condNote = o.note; }", ol0)
            # fluoxetin: mất ngủ (bệnh sử / ICD), động kinh theo ICD, lo ngại tình dục -> chặn; sertralin không bị quy tắc này chặn
            FB = "(id) => drugBlockReasons(curP(), curV(), drugById(id)).filter(r => /^fluoxetin:/.test(r)).length"
            fl0 = pg.evaluate("() => JSON.stringify({dx: curV().dx, hpi: curV().hpi, reason: curV().reason, conds: curP().conds, note: curP().condNote, mental: curV().mental})")
            pg.evaluate("() => { const p = curP(), v = curV(); p.conds = p.conds.filter(k => !['epilepsy','sexual_dysf'].includes(k)); p.condNote = ''; v.mental = {sx: [], hist: [], excl: []}; v.reason = ''; v.hpi = 'Ngủ tốt, không mất ngủ'; v.dx = {...v.dx, main: 'Viêm dạ dày', secondary: '', icd: ''}; }")
            assert pg.evaluate(FB, 'fluox20n') == 0
            pg.evaluate("() => { curV().hpi = 'Khó ngủ 2 tuần'; }")
            assert pg.evaluate(FB, 'fluox20n') == 1 and pg.evaluate(FB, 'sert50') == 0, 'mất ngủ phải chặn fluoxetin'
            pg.evaluate("() => { const v = curV(); v.hpi = ''; v.dx = {...v.dx, icd: 'G40.9 – Động kinh, không đặc hiệu'}; }")
            assert pg.evaluate(FB, 'fluox20f') == 1, 'ICD động kinh phải chặn fluoxetin'
            pg.evaluate("() => { const v = curV(); v.dx = {...v.dx, icd: ''}; curP().condNote = 'Lo ngại rối loạn cương'; }")
            assert pg.evaluate(FB, 'fluox20n') == 1, 'lo ngại tình dục phải chặn fluoxetin'
            pg.evaluate("(s) => { const p = curP(), v = curV(), o = JSON.parse(s); v.dx = o.dx; v.hpi = o.hpi; v.reason = o.reason; p.conds = o.conds; p.condNote = o.note; v.mental = o.mental; }", fl0)
            # rối loạn / lo ngại tình dục (ô hồ sơ hoặc ghi chữ) -> chặn paroxetin
            XB = "(id) => drugBlockReasons(curP(), curV(), drugById(id)).filter(r => /paroxetin gây rối loạn chức năng tình dục/.test(r)).length"
            sx0 = pg.evaluate("() => JSON.stringify({conds: curP().conds, note: curP().condNote})")
            pg.evaluate("() => { const p = curP(); p.conds = p.conds.filter(k => k !== 'sexual_dysf'); p.condNote = 'Không rối loạn cương'; curV().mental = {sx: [], hist: [], excl: []}; }")
            assert pg.evaluate(XB, 'parox20n') == 0
            pg.evaluate("() => { curP().condNote = 'Lo ngại rối loạn cương dương'; }")
            assert pg.evaluate(XB, 'parox20n') == 1 and pg.evaluate(XB, 'escit10') == 0
            pg.evaluate("() => { const p = curP(); p.condNote = ''; p.conds = p.conds.concat(['sexual_dysf']); }")
            assert pg.evaluate(XB, 'parox20f') == 1, 'ô hồ sơ "Rối loạn / lo ngại chức năng tình dục" phải chặn paroxetin'
            pg.evaluate("(s) => { const p = curP(), o = JSON.parse(s); p.conds = o.conds; p.condNote = o.note; }", sx0)
            # venlafaxin: bệnh nền tăng huyết áp -> chặn (ca mẫu có THA)
            VH = "(id) => drugBlockReasons(curP(), curV(), drugById(id)).filter(r => /^bệnh nền tăng huyết áp/.test(r)).length"
            assert pg.evaluate("curP().conds.includes('htn')") and pg.evaluate(VH, 'venla75n') == 1 and pg.evaluate(VH, 'dulox30n') == 0
            dx0 = pg.evaluate("() => JSON.stringify(curV().dx)")
            pg.evaluate("() => { const v = curV(); curP().conds = curP().conds.filter(k => k !== 'htn'); v.dx = {...v.dx, icd: '', main: 'Viêm dạ dày', secondary: ''}; }")
            assert pg.evaluate(VH, 'venla75f') == 0, 'không có THA (hồ sơ, ICD, chẩn đoán) thì không chặn'
            pg.evaluate("() => { curV().dx.secondary = 'Tăng huyết áp độ 1'; }")
            assert pg.evaluate(VH, 'venla75f') == 1, 'THA ghi trong chẩn đoán kèm theo cũng phải chặn'
            pg.evaluate("(s) => { curP().conds.push('htn'); curV().dx = JSON.parse(s); }", dx0)
            # carbamazepin: điện tim có block nhĩ thất -> chặn
            A = "(t) => avBlockText(t)"
            for txt in ['Block nhĩ thất độ I', 'Blốc nhĩ thất cấp II', 'BAV độ III', 'AV block 1st degree', 'Nhịp xoang, block AV độ I']:
                assert pg.evaluate(A, txt), txt
            for txt in ['Không block nhĩ thất', 'Nhịp xoang, trục trung gian', 'Block nhánh phải hoàn toàn']:
                assert not pg.evaluate(A, txt), txt
            pg.evaluate("() => { const v = curV(); v.rx = []; v.orders = v.orders.filter(o => o.key !== 'ecg').concat([{id: 'o_ecg_av', key: 'ecg', name: 'Điện tim (ECG)', type: 't', value: 'Nhịp xoang 60 l/ph, block nhĩ thất độ I', note: ''}]); }")
            pg.evaluate("addRx('carba200n')"); pg.wait_for_timeout(200)
            assert pg.evaluate("curV().rx.length") == 0, 'carbamazepin phải bị chặn khi có block nhĩ thất'
            assert 'block nhĩ thất' in pg.evaluate("() => drugBlockReasons(curP(), curV(), drugById('carba200f')).join(' ')")
            pg.evaluate("(s) => { const v = curV(), o = JSON.parse(s); v.rx = o.rx; v.orders = o.orders; curP().meds = o.meds; savePatient(curP()); }", st2)

            # 6c. Khám tâm thần + gợi ý chẩn đoán (BYT 2020, Bài 18–23)
            DX = """(o) => { const v = curV(); v.mental = Object.assign({sx: [], hist: [], excl: []}, o);
                       const r = psyDx(curP(), v); return {codes: r.sugs.filter(s => s.ok).map(s => s.code), all: r.sugs.map(s => s.code),
                       alerts: r.alerts.map(a => a.t), todo: r.todo.join(' | ')}; }"""
            pg.evaluate("go({name: 'visit', pid: 'p_demoA', vid: 'v_demo_now', step: 1})"); pg.wait_for_timeout(200)
            dep = ['dep_mood', 'dep_anhed', 'dep_conc', 'dep_sleep', 'dep_pessim']
            r = pg.evaluate(DX, {'sx': dep, 'weeks': 3})
            assert r['codes'] == ['F32.1'], r
            assert 'MDQ' in r['todo'] and 'TSH' in r['todo'], r
            assert pg.evaluate(DX, {'sx': dep, 'weeks': 1})['codes'] == [], 'trầm cảm < 2 tuần không được đủ tiêu chuẩn'
            assert pg.evaluate(DX, {'sx': dep, 'weeks': 3, 'hist': ['hypomania']})['codes'] == ['F31.3']
            sev = ['dep_mood', 'dep_anhed', 'dep_energy', 'dep_conc', 'dep_guilt', 'dep_sleep', 'dep_appetite', 'psy_delus']
            assert pg.evaluate(DX, {'sx': sev, 'weeks': 4, 'hist': ['dep']})['codes'] == ['F33.3']
            # trầm cảm đủ số lượng nặng (3/3 + 4/7): chưa xác nhận "đặc biệt nặng" -> vừa; xác nhận -> nặng
            sev4 = ['dep_mood', 'dep_anhed', 'dep_energy', 'dep_conc', 'dep_guilt', 'dep_pessim', 'dep_sleep']
            r = pg.evaluate("(o) => { const v = curV(); v.mental = Object.assign({sx: [], hist: [], excl: []}, o); const s = psyDx(curP(), v).sugs.find(x => x.ok); return s && [s.code, s.note]; }", {'sx': sev4, 'weeks': 3, 'hist': ['hypomania']})
            assert r[0] == 'F31.3' and 'chưa xác nhận' in r[1], r
            assert pg.evaluate(DX, {'sx': sev4, 'weeks': 3, 'hist': ['hypomania'], 'severe': True})['codes'] == ['F31.4']
            assert pg.evaluate(DX, {'sx': sev4, 'weeks': 3, 'severe': True})['codes'] == ['F32.2']
            man = ['man_mood', 'man_talk', 'man_sleep', 'man_grand']
            assert pg.evaluate(DX, {'sx': man, 'weeks': 1, 'impair': 'marked'})['codes'] == ['F30.1']
            assert pg.evaluate(DX, {'sx': man, 'weeks': 1, 'impair': 'none'})['codes'] == ['F30.0']
            # ICD-10 bản VN tr. 101: F31.7 cần hưng cảm + thêm ≥ 1 giai đoạn khác; F31.6 cần ≥ 2 tuần, tiền sử bất kỳ giai đoạn cảm xúc
            assert pg.evaluate(DX, {'hist': ['mania']})['codes'] == [] and pg.evaluate(DX, {'hist': ['mania', 'dep']})['codes'] == ['F31.7']
            assert pg.evaluate(DX, {'sx': ['mix_now'], 'weeks': 3, 'hist': ['dep']})['codes'] == ['F31.6']
            assert pg.evaluate(DX, {'sx': ['mix_now'], 'weeks': 1, 'hist': ['dep']})['codes'] == []
            assert pg.evaluate(DX, {'sx': man, 'weeks': 0.3, 'impair': 'none'})['codes'] == [], 'hưng cảm nhẹ cần ≥ 4 ngày'
            I11 = "(o) => { const v = curV(); v.mental = Object.assign({sx: [], hist: [], excl: []}, o); return psyDx(curP(), v).sugs.map(s => [s.code, s.i11 || '', s.note || '']); }"
            r = dict((x[0], x) for x in pg.evaluate(I11, {'sx': dep, 'weeks': 3}))
            assert '6A70' in r['F32.1'][1] and '5/10' in r['F32.1'][1] and 'mức nhẹ' in r['F32.1'][2], r
            r = dict((x[0], x) for x in pg.evaluate(I11, {'sx': ['ptsd_event', 'ptsd_reexp', 'ptsd_avoid'], 'weeks': 8}))
            assert '6B40' in r['F43.1'][1], r
            r = dict((x[0], x) for x in pg.evaluate(I11, {'sx': ['adhd_inatt', 'adhd_perv'], 'weeks': 30}))
            assert '6A05.0' in r['F90.0'][1], r
            r = dict((x[0], x) for x in pg.evaluate(I11, {'sx': ['sud_alc', 'sud_crave', 'sud_toler', 'sud_neglect'], 'weeks': 60}))
            assert '3/3' in r['F10.2'][1] and '6C40.2' in r['F10.2'][1], r
            assert pg.evaluate("() => ICD11_MAP.every(r => r.length === 3) && icd11Of('F43.25')[1] === '6B43' && icd11Of('F31.6')[1].startsWith('6A60')")
            # Trẻ em – vị thành niên (ICD-10 bản VN tr. 162–191)
            assert pg.evaluate("() => ['thinh_luc', 'thi_luc'].every(k => LABS.some(r => r[1] === k && r[5] === 't'))"), 'thiếu đo thính lực / thị lực'
            assert pg.evaluate("() => ['F82','F83','F84.2','F84.3','F93.3','F93.8','F94.1','F94.2','F98.6'].every(c => ICD.some(r => r[0] === c))"), 'thiếu mã ICD trẻ em'
            dv = ['dev_read', 'dev_math', 'dev_motor', 'dev_iq', 'dev_impair', 'dev_excl']
            r = pg.evaluate(DX, {'sx': dv})
            assert set(r['codes']) == {'F81.3', 'F82', 'F83'}, r
            assert pg.evaluate(DX, {'sx': ['dev_expr', 'dev_iq', 'dev_excl']})['codes'] == ['F80.1']
            assert pg.evaluate(DX, {'sx': ['sep_anx', 'sep_6y', 'emo_4wk', 'emo_excl']})['codes'] == ['F93.0']
            assert pg.evaluate(DX, {'sx': ['sep_anx', 'emo_4wk', 'emo_excl']})['codes'] == [], 'lo âu chia ly cần khởi phát < 6 tuổi'
            assert pg.evaluate(DX, {'sx': ['mut_sel']})['codes'] == ['F94.0']
            assert pg.evaluate(DX, {'sx': ['mut_sel', 'asd_social']})['codes'] == [] or 'F94.0' not in pg.evaluate(DX, {'sx': ['mut_sel', 'asd_social']})['codes']
            tic = ['tic_daily', 'tic_18', 'tic_excl']
            assert pg.evaluate(DX, {'sx': ['tic_motor'] + tic})['codes'] == ['F95.0']
            assert pg.evaluate(DX, {'sx': ['tic_motor', 'tic_12m'] + tic})['codes'] == ['F95.1']
            assert pg.evaluate(DX, {'sx': ['tic_motor', 'tic_vocal', 'tic_12m'] + tic})['codes'] == ['F95.2']
            assert pg.evaluate(DX, {'sx': ['asd_s1', 'asd_s3', 'asd_r1', 'asd_nodelay', 'asd_excl']})['codes'] == ['F84.5']
            assert pg.evaluate(DX, {'sx': ['stereo', 'stereo_self', 'f98_excl']})['codes'] == ['F98.4']
            assert pg.evaluate(DX, {'sx': ['stutter']})['codes'] == ['F98.5']
            r = dict((x[0], x) for x in pg.evaluate(I11, {'sx': ['tic_motor', 'tic_vocal', 'tic_12m'] + tic}))
            assert '8A05.00' in r['F95.2'][1], r
            assert pg.evaluate(DX, {'sx': dep + ['dep_suicide'], 'weeks': 3})['alerts'] == ['Có ý tưởng / hành vi tự sát']
            r = pg.evaluate(DX, {'sx': dep, 'weeks': 3, 'excl': ['subst']})
            assert r['codes'] == [] and 'F32.1' in r['all'], 'có yếu tố do chất thì không được "đủ tiêu chuẩn"'
            r = pg.evaluate(DX, {'sx': ['dep_mood', 'anx_fear', 'anx_motor', 'anx_auto'], 'weeks': 8})
            assert 'F41.2' in r['codes'], r
            # rối loạn sự thích ứng: chọn mã con theo biểu hiện ưu thế; thiếu khởi phát / suy giảm thì "Chưa đủ"
            ADJ = "(o) => { const v = curV(); v.mental = Object.assign({sx: [], hist: [], excl: []}, o); return psyDx(curP(), v).sugs.filter(s => /^F43\\.2/.test(s.code)).map(s => [s.code, s.ok]); }"
            base = ['adj_stressor', 'adj_onset', 'adj_impair']
            assert pg.evaluate(ADJ, {'sx': base + ['adj_dep'], 'weeks': 3}) == [['F43.20', True]]
            assert pg.evaluate(ADJ, {'sx': base + ['adj_dep'], 'weeks': 10}) == [['F43.21', True]]
            assert pg.evaluate(ADJ, {'sx': base + ['adj_dep', 'adj_anx'], 'weeks': 6}) == [['F43.22', True]]
            assert pg.evaluate(ADJ, {'sx': base + ['adj_anx'], 'weeks': 6}) == [['F43.23', True]]
            assert pg.evaluate(ADJ, {'sx': base + ['adj_behav'], 'weeks': 6}) == [['F43.24', True]]
            assert pg.evaluate(ADJ, {'sx': base + ['adj_emo', 'adj_behav'], 'weeks': 6}) == [['F43.25', True]]
            assert pg.evaluate(ADJ, {'sx': ['adj_stressor', 'adj_anx'], 'weeks': 6}) == [['F43.23', False]], 'thiếu khởi phát / suy giảm -> Chưa đủ'
            assert pg.evaluate(ADJ, {'sx': ['adj_anx'], 'weeks': 6}) == [], 'không có sự kiện stress -> không gợi ý F43.2'
            # lo âu khác + ăn uống: gợi ý mã đúng, đủ / chưa đủ
            SG = "(o) => { const v = curV(); v.mental = Object.assign({sx: [], hist: [], excl: []}, o); return psyDx(curP(), v).sugs.map(s => [s.code, s.ok]); }"
            assert ['F41.0', True] in pg.evaluate(SG, {'sx': ['pan_attacks', 'pan_sx', 'pan_excl'], 'weeks': 6})
            assert ['F41.0', False] in pg.evaluate(SG, {'sx': ['pan_attacks', 'pan_sx', 'pan_excl', 'phob_agora'], 'weeks': 6})
            assert ['F40.1', True] in pg.evaluate(SG, {'sx': ['phob_social', 'phob_sx', 'phob_avoid', 'phob_insight', 'phob_excl'], 'weeks': 6})
            assert ['F42.2', True] in pg.evaluate(SG, {'sx': ['ocd_obs', 'ocd_comp', 'ocd_own', 'ocd_2wk', 'ocd_impair'], 'weeks': 6})
            assert ['F42.1', False] in pg.evaluate(SG, {'sx': ['ocd_comp'], 'weeks': 6})
            assert ['F43.1', True] in pg.evaluate(SG, {'sx': ['ptsd_event', 'ptsd_reexp', 'ptsd_avoid', 'ptsd_arousal', 'ptsd_6m'], 'weeks': 10})
            assert ['F43.1', False] in pg.evaluate(SG, {'sx': ['ptsd_event', 'ptsd_reexp', 'ptsd_arousal', 'ptsd_6m'], 'weeks': 10}), 'sách: né tránh là bắt buộc'
            assert ['F43.0', True] in pg.evaluate(SG, {'sx': ['ptsd_event', 'ast_acute'], 'weeks': 0})
            assert ['F50.0', True] in pg.evaluate(SG, {'sx': ['an_weight', 'an_self', 'an_body', 'an_endo'], 'weeks': 20})
            assert ['F50.1', False] in pg.evaluate(SG, {'sx': ['an_weight', 'an_self', 'an_body'], 'weeks': 20})
            assert ['F50.2', True] in pg.evaluate(SG, {'sx': ['bn_binge', 'bn_crave', 'bn_comp', 'bn_fat'], 'weeks': 20})
            assert not any(c.startswith('F50') for c, _ in pg.evaluate(SG, {'sx': ['scoff_s'], 'weeks': 2}))
            # rối loạn chức năng tình dục F52 (LEC6): đủ tiêu chuẩn chung -> đủ; thiếu -> chưa đủ; có trầm cảm -> chưa đủ (phân biệt)
            gen = ['sxg_unable', 'sxg_freq', 'sxg_6m', 'sxg_excl']
            assert ['F52.4', True] in pg.evaluate(SG, {'sx': ['sex_pe'] + gen, 'weeks': 30})
            assert ['F52.10', True] in pg.evaluate(SG, {'sx': ['sex_aversion'] + gen, 'weeks': 30})
            assert ['F52.0', False] in pg.evaluate(SG, {'sx': ['sex_libido', 'sxg_unable'], 'weeks': 30})
            assert ['F52.2', False] in pg.evaluate(SG, {'sx': ['sex_ed', 'dep_mood', 'dep_anhed', 'dep_conc', 'dep_sleep'] + gen, 'weeks': 30})
            assert ['F52.7', True] in pg.evaluate(SG, {'sx': ['sxg_hyper'], 'weeks': 30})
            # nhóm bổ sung 2026-10-30
            # Rối loạn nhận thức — ICD-10 bản VN tr. 47–62
            dg = ['dem_mem', 'dem_cog', 'dem_func', 'dem_clear', 'dem_emo', 'dem_6m']
            assert ['F00.1', True] in pg.evaluate(SG, {'sx': dg + ['dem_slow', 'dem_ad_excl'], 'weeks': 40})
            assert ['F00.1', False] in pg.evaluate(SG, {'sx': dg + ['dem_slow'], 'weeks': 40}), 'F00 cần loại trừ nguyên nhân khác (B)'
            assert ['F00.0', True] in pg.evaluate(SG, {'sx': dg + ['dem_early', 'dem_cortical', 'dem_ad_excl'], 'weeks': 40})
            assert ['F00.9', True] in pg.evaluate(SG, {'sx': dg + ['dem_early', 'dem_ad_excl'], 'weeks': 40})
            assert ['F03', True] in pg.evaluate(SG, {'sx': dg, 'weeks': 40})
            assert ['F02.0', True] in pg.evaluate(SG, {'sx': dg + ['dem_front', 'dem_front_mem'], 'weeks': 40})
            assert ['F02.1', True] in pg.evaluate(SG, {'sx': dg + ['dem_cjd', 'dem_cjd_neuro'], 'weeks': 10})
            assert ['F02.4', False] in pg.evaluate(SG, {'sx': dg + ['dem_hiv'], 'weeks': 40}), 'F02.4 cần loại trừ nguyên nhân khác'
            r = dict((x[0], x) for x in pg.evaluate(I11, {'sx': dg + ['dem_slow', 'dem_ad_excl', 'dem_sev2', 'dem_x1', 'dem_x3'], 'weeks': 40}))
            assert 'Chữ số thứ 5: 4' in r['F00.1'][2] and 'chữ số thứ 6: 1' in r['F00.1'][2] and '6D80.1' in r['F00.1'][1] and '6D86.0' in r['F00.1'][1], r
            r = pg.evaluate(DX, {'sx': ['ad_rf1', 'ad_rf7']})
            assert 'Cờ đỏ Alzheimer' in r['alerts'] and r['codes'] == [] and r['all'] == [], r
            assert pg.evaluate("() => MENTAL_SX.find(g => g.g === 'dem').items.filter(i => /^ad_rf/.test(i[0])).length") == 10
            amn = ['amn_recent', 'amn_past', 'amn_noimm', 'amn_clear', 'amn_noglobal', 'amn_cause']
            assert pg.evaluate(DX, {'sx': amn})['codes'] == ['F04']
            assert ['F04', False] in pg.evaluate(SG, {'sx': amn + dg, 'weeks': 40}), 'hội chứng quên không đi cùng mất trí'
            mci = ['mci_f06', 'mci_2w', 'mci_mem', 'mci_test', 'mci_excl']
            assert pg.evaluate(DX, {'sx': mci})['codes'] == ['F06.70']
            assert pg.evaluate(DX, {'sx': mci + ['mci_sys']})['codes'] == ['F06.71']
            assert pg.evaluate(DX, {'sx': ['mci_f06', 'mci_2w', 'mci_excl']})['codes'] == [], 'cần ≥ 1 lĩnh vực'
            r = dict((x[0], x) for x in pg.evaluate(I11, {'sx': [k for k in mci if k != 'mci_f06']}))
            assert '6D71' in r['F06.70'][1] and 'không bắt buộc' in r['F06.70'][1], r
            assert pg.evaluate("() => ['F02.8', 'F06.70', 'F06.71'].every(c => ICD.some(r => r[0] === c)) && icd11Of('F02.3')[1] === '6D85.0' && icd11Of('F04')[1] === '6D72'")
            assert ['F01.0', True] in pg.evaluate(SG, {'sx': dg + ['dem_vasc', 'dem_uneven', 'dem_focal', 'dem_step'], 'weeks': 40})
            assert ['F01.9', False] in pg.evaluate(SG, {'sx': dg + ['dem_vasc'], 'weeks': 40}), 'F01 cần G2, G3'
            # Cập nhật F00–F03 theo BYT 2020 Bài 1–3, ICD-11 (2026-11-06)
            lbd = ['dem_lbd_vh', 'dem_lbd_rbd']
            assert ['F02.8', True] in pg.evaluate(SG, {'sx': dg + lbd + ['dem_f02_excl'], 'weeks': 40})
            r = dict((x[0], x) for x in pg.evaluate(I11, {'sx': dg + lbd + ['dem_f02_excl', 'dem_sev2'], 'weeks': 40}))
            assert '6D82&XS0T' in r['F02.8'][1] and 'G31.8' in r['F02.8'][2], r['F02.8']
            assert ['F02.3', False] in pg.evaluate(SG, {'sx': dg + ['dem_pd', 'dem_lbd_vh', 'dem_pd_1y'], 'weeks': 40})
            assert ['F02.8', False] in pg.evaluate(SG, {'sx': dg + ['dem_pd', 'dem_f02_excl'] + lbd, 'weeks': 40}), 'Parkinson + 2 dấu Lewy, chưa đủ 1 năm → thể Lewy'
            assert ['F02.3', True] in pg.evaluate(SG, {'sx': dg + ['dem_pd', 'dem_pd_1y', 'dem_f02_excl'] + lbd, 'weeks': 40})
            r = dict((x[0], x) for x in pg.evaluate(I11, {'sx': dg + ['dem_vasc', 'dem_uneven', 'dem_focal', 'dem_step'], 'weeks': 40}))
            assert 'CT / MRI' in r['F01.0'][2] and '3 tháng' in r['F01.0'][2] and 'XS5W' in r['F01.0'][1], r['F01.0']
            assert ['F05.1', True] in pg.evaluate(SG, {'sx': ['del_cons', 'del_cog', 'del_psymo', 'del_sleep', 'del_acute', 'del_cause'] + dg, 'weeks': 40})
            assert ['F05.0', True] in pg.evaluate(SG, {'sx': ['del_cons', 'del_cog', 'del_psymo', 'del_sleep', 'del_acute', 'del_cause'], 'weeks': 0})
            assert ['F51.0', True] in pg.evaluate(SG, {'sx': ['ins_compl', 'ins_freq', 'slp_impair', 'slp_excl'], 'weeks': 6})
            assert ['F10.2', True] in pg.evaluate(SG, {'sx': ['sud_alc', 'sud_crave', 'sud_control', 'sud_withdraw', 'sud_12m'], 'weeks': 20})
            assert ['F17.1', False] in pg.evaluate(SG, {'sx': ['sud_tob', 'sud_harm'], 'weeks': 20})
            assert ['F63.0', True] in pg.evaluate(SG, {'sx': ['gam_2ep', 'gam_cont', 'gam_urge', 'gam_preocc'], 'weeks': 60})
            assert ['F91.3', False] in pg.evaluate(SG, {'sx': ['cd_odd', 'cd_pattern'], 'weeks': 30}), 'khoá cũ: F91.3 nay cần C, loại trừ'
            # F91, F63.8 theo ICD-10 bản VN tr. 177–181, ICD-11 6C73 (2026-11-07)
            _age = pg.evaluate("() => { const p = curP(), o = [p.dob, p.birthYear]; p.dob = ''; p.birthYear = Number(todayISO().slice(0, 4)) - 12; return o; }")
            assert ['F91.3', True] in pg.evaluate(SG, {'sx': ['cd1', 'cd2', 'cd3', 'cd7', 'cd_6m', 'cd_odd_c', 'cd_excl'], 'weeks': 30})
            assert ['F91.3', False] in pg.evaluate(SG, {'sx': ['cd1', 'cd2', 'cd3', 'cd7', 'cd_odd_c', 'cd_excl'], 'weeks': 8}), 'F91.3 cần ≥ 6 tháng'
            _r = pg.evaluate(SG, {'sx': ['cd10', 'cd17', 'cd18', 'cd_6m', 'cd_excl'], 'weeks': 30}); assert ['F91.2', True] in _r, _r
            assert ['F91.0', True] in pg.evaluate(SG, {'sx': ['cd10', 'cd15', 'cd9', 'cd_6m', 'cd_excl', 'cd_family'], 'weeks': 30})
            assert ['F91.1', True] in pg.evaluate(SG, {'sx': ['cd10', 'cd15', 'cd22', 'cd_6m', 'cd_excl', 'cd_peer'], 'weeks': 30})
            r = pg.evaluate(SG, {'sx': ['cd1', 'cd2', 'cd10', 'cd15', 'cd22', 'cd_6m', 'cd_excl'], 'weeks': 30})
            assert ['F91.2', True] in r and not any(x[0] == 'F91.3' for x in r), r
            r = dict((x[0], x) for x in pg.evaluate(I11, {'sx': ['cd1', 'cd2', 'cd3', 'cd7', 'cd_6m', 'cd_odd_c', 'cd_excl', 'odd_sev2'], 'weeks': 30}))
            assert 'Mức độ: trung bình' in r['F91.3'][2], r
            r = dict((x[0], x) for x in pg.evaluate(I11, {'sx': ['cd10', 'cd17', 'cd18', 'cd_6m', 'cd_excl', 'cd_sev3'], 'weeks': 30}))
            assert 'Mức độ: nặng' in r['F91.2'][2], r
            ied = ['ied_ep', 'ied_dispro', 'ied_3m', 'ied_imp', 'ied_excl', 'ied_impair']
            assert ['F63.8', True] in pg.evaluate(SG, {'sx': ied, 'weeks': 20})
            assert ['F63.8', False] in pg.evaluate(SG, {'sx': ied[:3], 'weeks': 20})
            r = dict((x[0], x) for x in pg.evaluate(I11, {'sx': ied, 'weeks': 20}))
            assert '6C73' in r['F63.8'][1], r
            r = dict((x[0], x) for x in pg.evaluate(I11, {'sx': ied + ['ied_sev2'], 'weeks': 20}))
            assert 'Mức độ: A2' in r['F63.8'][2], r
            pg.evaluate("(o) => { const p = curP(); p.dob = o[0]; p.birthYear = o[1]; }", _age)
            assert ['F44', True] in pg.evaluate(SG, {'sx': ['dis_sx', 'dis_noorg', 'dis_time'], 'weeks': 2})
            assert pg.evaluate("() => [7, 8, 13, 14, 18, 19, 22, 23, 52].map(x => scaleResult('hamd', x).t).join('|')") == 'Bình thường|Nhẹ|Nhẹ|Vừa|Vừa|Nặng|Nặng|Rất nặng|Rất nặng', 'ngưỡng HAM-D'
            # Ngưỡng MADRS (bác sĩ đặt 2026-11-12)
            assert pg.evaluate("() => [6, 7, 19, 20, 30, 31, 39, 40, 60].map(x => scaleResult('madrs', x).t).join('|')") == 'Bình thường / không có triệu chứng|Nhẹ|Nhẹ|Mức độ vừa phải|Mức độ vừa phải|Nghiêm trọng|Nghiêm trọng|Cực kỳ nghiêm trọng|Cực kỳ nghiêm trọng'
            # Trắc nghiệm tâm lý: sàng lọc trước, chẩn đoán / mức độ sau (bác sĩ đặt 2026-11-12)
            r = pg.evaluate("""() => { const ks = LABS.filter(l => l[0] === 'Trắc nghiệm tâm lý').map(l => l[1]);
              return [ks.length === new Set(ks).size, ks[0], ks.indexOf('bdi') > ks.indexOf('scs_f'), ks.indexOf('mmse') < ks.indexOf('bdi'), ks.length]; }""")
            assert r == [True, 'phq2', True, True, 70], r
            # Bảng chống chỉ định thuốc tâm thần + tiền sử tim mạch (bác sĩ đặt 2026-11-12)
            r = pg.evaluate("""() => { const p = curP(), v = curV(), c0 = p.conds, m0 = p.meds, rx0 = v.rx, o0 = v.orders, n0 = p.condNote;
              const K = id => drugBlockReasons(p, v, drugById(id)).filter(x => /^chống chỉ định/.test(x)).join('|');
              const has = (id, re) => re.test(K(id));
              p.conds = []; p.meds = []; v.rx = []; v.orders = []; p.condNote = '';
              const z = ['sert50', 'amitri25', 'venla75n', 'carba200n', 'olan10n'].map(K).join('');
              p.conds = ['htn']; const a = [has('amitri25', /tim mạch/), has('venla75n', /tim mạch/), has('sert50', /tim mạch/), has('escit10n', /tim mạch/)];
              p.conds = ['bipolar']; const b = [has('sert50', /lưỡng cực/), has('mirta30n', /lưỡng cực/), has('olan10n', /lưỡng cực/)];
              p.conds = ['glaucoma']; const c = [has('dulox30n', /glôcôm/), has('amitri25', /glôcôm/)];
              p.conds = ['af']; const dd = has('carba200n', /rối loạn nhịp/);
              p.conds = ['dementia']; p.dob = ''; const by0 = p.birthYear; p.birthYear = +v.date.slice(0, 4) - 70; const e = has('quet100n', /sa sút/); p.birthYear = by0;
              p.conds = ['qt_long']; const f = [has('escit10n', /QT/), has('quet100n', /QT/)];
              p.conds = []; p.meds = [{id: 'mm', text: 'Moclobemid 150 mg'}]; const g = [has('sert50', /IMAO/), has('carba200n', /IMAO/)];
              p.conds = c0; p.meds = m0; v.rx = rx0; v.orders = o0; p.condNote = n0; return [z, a, b, c, dd, e, f, g]; }""")
            assert r == ['', [True, True, False, False], [True, True, False], [True, True], True, True, [True, True], [True, True]], r
            # Sertralin: NSAID / rối loạn đông máu (chữ), glôcôm (ô), lái xe, QTc dài (bác sĩ đặt 2026-11-12)
            r = pg.evaluate("""() => { const p = curP(), v = curV(), c0 = p.conds, n0 = p.condNote, j0 = p.job, o0 = v.orders, d = drugById('sert50');
              const B = () => drugBlockReasons(p, v, d).filter(x => /^sertralin:/.test(x)).length;
              p.conds = []; p.condNote = ''; p.job = 'Giáo viên'; v.orders = []; const b0 = B();
              p.condNote = 'Đang sử dụng các thuốc thuộc nhóm NSAIDs'; const b1 = B(); p.condNote = 'Đang dùng diclofenac'; const b2 = B();
              p.condNote = 'Rối loạn đông máu'; const b3 = B(); p.condNote = 'Không rối loạn đông máu'; const b3n = B(); p.condNote = '';
              p.conds = ['glaucoma']; const b4 = B(); p.conds = []; p.job = 'Lái xe taxi'; const b5 = B(); p.job = 'Giáo viên';
              v.orders = [{id: 'qe', key: 'ecg', name: 'Điện tim', type: 't', value: 'Nhịp xoang, QTc dài 490 ms', flag: '', note: ''}]; const b6 = B();
              const f = drugBlockReasons(p, v, drugById('prozac10')).filter(x => /^sertralin:/.test(x)).length;
              p.conds = c0; p.condNote = n0; p.job = j0; v.orders = o0; return [b0, b1, b2, b3, b3n, b4, b5, b6, f]; }""")
            assert r == [0, 1, 1, 1, 0, 1, 1, 1, 0], r
            # Prozac 10 mg thay fluoxetin 20 mg (bác sĩ đặt 2026-11-12)
            r = pg.evaluate("""() => { const p = curP(), v = curV(), c0 = p.conds, n0 = p.condNote, m0 = p.meds, r0 = p.renalManual, d = drugById('prozac10');
              const B = () => drugBlockReasons(p, v, d).filter(x => /^prozac/.test(x)).length;
              const hits = drugSearch('fluox').map(x => x.id);
              p.conds = []; p.condNote = ''; p.meds = []; p.renalManual = null; const b0 = B();
              p.conds = ['bipolar']; const b1 = B(); p.conds = ['epilepsy']; const b2 = B(); p.conds = [];
              p.renalManual = {egfr: 8, date: v.date}; const b3 = B(); p.renalManual = {egfr: 40, date: v.date}; const b3b = B(); p.renalManual = null;
              p.condNote = 'Rối loạn cảm xúc lưỡng cực'; const b4 = B(); p.condNote = 'Đang điều trị thuốc nhóm MAOI'; const b5 = B(); p.condNote = 'Không có rối loạn cảm xúc lưỡng cực'; const b6 = B(); const y0 = p.birthYear, dob0 = p.dob; p.dob = ''; p.birthYear = +v.date.slice(0, 4) - 15; const b7 = B(); p.birthYear = +v.date.slice(0, 4) - 30; const b8 = B(); p.birthYear = y0; p.dob = dob0;
              p.conds = c0; p.condNote = n0; p.meds = m0; p.renalManual = r0;
              return [hits.includes('prozac10'), hits.includes('fluox20n') || hits.includes('fluox20f'), d.howOpts[0], d.dose.join(''), b0, b1, b2, b3, b3b, b4, b5, b6, b7, b8]; }""")
            assert r == [True, False, 'Uống mỗi lần 2 viên, ngày uống 1 lần sau ăn sáng', '2000', 0, 1, 1, 1, 0, 1, 1, 0, 1, 0], r
            # Link MDCalc khi chọn MADRS (bác sĩ đặt 2026-11-12)
            r = pg.evaluate("""() => { const v = curV(), o0 = v.orders, s0 = S.view.step; const l = LABS.find(x => x[1] === 'madrs');
              v.orders = [{id: 'om', key: 'madrs', name: l[2], unit: l[3], ref: l[4], type: l[5], value: '', flag: '', note: ''}];
              go({name: 'visit', pid: S.view.pid, vid: v.id, step: 2}); const a = document.querySelector('a[href*="mdcalc.com/calc/4058"]');
              const ok = !!a && a.target === '_blank' && /noopener/.test(a.rel); v.orders = o0; go({name: 'visit', pid: S.view.pid, vid: v.id, step: s0 || 1});
              return [ok, scaleLinkHTML('phq9') === '' && scaleLinkHTML('hamd').includes('mdcalc.com/calc/10043/hamilton-depression-rating-scale-hamd') && scaleLinkHTML('gds').includes('mdcalc.com/calc/10566/geriatric-depression-scale-gds-15') && scaleLinkHTML('epds').includes('mdcalc.com/calc/10466/edinburgh-postnatal-depression-scale-epds')]; }""")
            assert r == [True, True], r
            # Bảng kiểm dạng cây (2026-11-09): bệnh → tiêu chuẩn → danh sách; mọi nhóm vẫn đủ mục, không trùng khoá
            r = pg.evaluate("""() => { const g = MENTAL_SX.find(x => x.g === 'som'), h = checklistHTML(g, []), d = document.createElement('div'); d.innerHTML = '<div class="checks">' + h + '</div>';
              const lvOf = k => d.querySelector('[data-v="' + k + '"]').closest('.csec').className.match(/ind(\\d)/)[1];
              const keys = MENTAL_SX.flatMap(x => x.items.map(i => i[0]));
              return {a: lvOf('som_2y'), sym: lvOf('som_d1'), excl: lvOf('som_excl'), first: d.querySelector('.subhd').textContent, dup: keys.length - new Set(keys).size, n: d.querySelectorAll('input').length === g.items.length,
                order: MENTAL_SX.find(x => x.g === 'cond').items.map(i => i[0]).indexOf('cd_sev1') < MENTAL_SX.find(x => x.g === 'cond').items.map(i => i[0]).indexOf('cd_6m')}; }""")
            assert r['a'] == '1' and r['sym'] == '3' and r['excl'] == '1' and r['first'].startswith('Rối loạn cơ thể hoá') and r['dup'] == 0 and r['n'] and r['order'], r
            # F45 theo ICD-10 bản VN tr. 125–129 (2026-11-07)
            assert ['F45.0', True] in pg.evaluate(SG, {'sx': ['som_2y', 'som_visits', 'som_refuse', 'som_6sx', 'som_excl'], 'weeks': 110})
            assert ['F45.0', False] in pg.evaluate(SG, {'sx': ['som_2y', 'som_visits', 'som_refuse', 'som_6sx'], 'weeks': 110}), 'F45.0 cần E'
            assert ['F45.1', True] in pg.evaluate(SG, {'sx': ['som_6m', 'som_visits', 'som_refuse', 'som_excl'], 'weeks': 30})
            assert ['F45.1', False] in pg.evaluate(SG, {'sx': ['som_visits', 'som_refuse', 'som_excl'], 'weeks': 8}), 'F45.1 cần ≥ 6 tháng'
            assert ['F45.2', True] in pg.evaluate(SG, {'sx': ['hyp_a1', 'hyp_b', 'hyp_c', 'hyp_excl'], 'weeks': 30})
            assert ['F45.2', False] in pg.evaluate(SG, {'sx': ['hyp_b', 'hyp_c', 'hyp_excl'], 'weeks': 30})
            assert ['F45.30', True] in pg.evaluate(SG, {'sx': ['aut_a', 'aut_cv', 'aut_b', 'aut_c', 'aut_d', 'aut_excl'], 'weeks': 30})
            assert ['F45.3', False] in pg.evaluate(SG, {'sx': ['aut_a', 'aut_cv', 'aut_ugi', 'aut_b'], 'weeks': 30})
            assert ['F45.4', True] in pg.evaluate(SG, {'sx': ['pain_a', 'pain_excl'], 'weeks': 30})
            # Tách triệu chứng F45.0 D, F45.3 B, C; F45.8, F45.9 (2026-11-09)
            sd = ['som_d1', 'som_d2', 'som_d3', 'som_d4', 'som_d7', 'som_d13']
            assert ['F45.0', True] in pg.evaluate(SG, {'sx': ['som_2y', 'som_visits', 'som_refuse', 'som_excl'] + sd, 'weeks': 110})
            assert ['F45.1', True] in pg.evaluate(SG, {'sx': ['som_2y', 'som_visits', 'som_refuse', 'som_excl', 'som_d1', 'som_d2', 'som_d3', 'som_d4', 'som_d5', 'som_d6'], 'weeks': 110}), '6 triệu chứng cùng 1 nhóm chưa đủ D'
            ab = ['aut_a', 'aut_cv', 'aut_d', 'aut_excl']
            assert ['F45.30', True] in pg.evaluate(SG, {'sx': ab + ['aut_b1', 'aut_b2', 'aut_c1'], 'weeks': 30})
            assert ['F45.30', False] in pg.evaluate(SG, {'sx': ab + ['aut_b1', 'aut_c1'], 'weeks': 30}), 'B cần ≥ 2'
            assert ['F45.30', False] in pg.evaluate(SG, {'sx': ab + ['aut_b1', 'aut_b2'], 'weeks': 30}), 'C cần ≥ 1'
            assert ['F45.8', True] in pg.evaluate(SG, {'sx': ['so8_local', 'so8_noles'], 'weeks': 10})
            assert ['F45.8', False] in pg.evaluate(SG, {'sx': ['so8_stress'], 'weeks': 10})
            assert ['F45.9', True] in pg.evaluate(SG, {'sx': ['so9'], 'weeks': 10})
            assert pg.evaluate("() => icd11Of('F45.8')[1] === '6C2Y' && icd11Of('F45.9')[1] === '6C2Z' && ['F45.0','F45.1','F45.2','F45.3','F45.30','F45.31','F45.32','F45.33','F45.34','F45.38','F45.4','F45.8','F45.9'].every(c => ICD.some(r => r[0] === c))")
            r = dict((x[0], x) for x in pg.evaluate(I11, {'sx': ['hyp_a2', 'hyp_b', 'hyp_c', 'hyp_excl'], 'weeks': 30}))
            assert '6B21' in r['F45.2'][1], r
            assert pg.evaluate("() => ['F45.30', 'F45.31', 'F45.32', 'F45.33', 'F45.34', 'F45.38'].every(c => ICD.some(r => r[0] === c)) && icd11Of('F45.2')[1] === '6B23'")
            # khoá cũ adhd_inatt / adhd_hyper / adhd_imp vẫn được tính (hồ sơ trước 2026-11-04)
            assert ['F90.0', True] in pg.evaluate(SG, {'sx': ['adhd_inatt', 'adhd_hyper', 'adhd_imp', 'adhd_7y', 'adhd_perv', 'adhd_impair', 'adhd_excl'], 'weeks': 30})
            # ADHD theo BYT 2020 Bài 30 (ICD-10): giảm chú ý ≥ 6/9, tăng động ≥ 3/5, xung động ≥ 1/4
            adc = ['adhd_6m', 'adhd_7y', 'adhd_perv', 'adhd_impair', 'adhd_excl']
            ad = ['adhd_i1', 'adhd_i2', 'adhd_i3', 'adhd_i5', 'adhd_i8', 'adhd_i9', 'adhd_h1', 'adhd_h2', 'adhd_h5', 'adhd_m2'] + adc
            assert pg.evaluate(DX, {'sx': ad})['codes'] == ['F90.0']
            assert pg.evaluate(DX, {'sx': [k for k in ad if k != 'adhd_i9']})['codes'] == [], 'giảm chú ý 5/9 chưa đủ'
            assert pg.evaluate(DX, {'sx': ad, 'weeks': 10})['codes'] == [], 'ADHD cần ≥ 6 tháng'
            assert 'F90.1' in pg.evaluate(DX, {'sx': ad + ['cd_pattern', 'cd_aggr']})['codes']
            r = dict((x[0], x) for x in pg.evaluate(I11, {'sx': ad}))
            assert '6A05.2' in r['F90.0'][1], r
            r = dict((x[0], x) for x in pg.evaluate(I11, {'sx': ['adhd_h1', 'adhd_h2', 'adhd_h3', 'adhd_m1'] + adc}))
            assert '6A05.1' in r['F90.0'][1], r
            # Đái dầm F98.0 / ỉa bậy F98.1 — ICD-10 bản VN tr. 189–190
            enu = ['enu_age', 'enu_wet', 'enu_excl', 'enu_nopsy', 'enu_3m']
            assert pg.evaluate(DX, {'sx': enu + ['enu_night']})['codes'] == ['F98.0']
            r = dict((x[0], x) for x in pg.evaluate(I11, {'sx': enu + ['enu_night', 'enu_day']}))
            assert 'F98.02' in r['F98.0'][2] and '6C00.2' in r['F98.0'][1], r
            assert pg.evaluate(DX, {'sx': enu, 'weeks': 6})['codes'] == [], 'đái dầm cần ≥ 3 tháng'
            assert pg.evaluate(DX, {'sx': [k for k in enu if k != 'enu_excl']})['codes'] == []
            assert pg.evaluate(DX, {'sx': [k for k in enu if k != 'enu_excl'] + ['elim_excl']})['codes'] == ['F98.0'], 'khoá cũ elim_excl'
            enc = ['enc_soil', 'enc_age', 'enc_freq', 'enc_6m', 'enc_excl']
            assert pg.evaluate(DX, {'sx': enc})['codes'] == ['F98.1']
            r = dict((x[0], x) for x in pg.evaluate(I11, {'sx': enc + ['enc_overflow']}))
            assert 'F98.12' in r['F98.1'][2] and '6C01.0' in r['F98.1'][1], r
            assert pg.evaluate(DX, {'sx': enc, 'weeks': 20})['codes'] == [], 'ỉa bậy cần ≥ 6 tháng'
            pg.evaluate("() => { curP().dob0 = curP().dob; curP().dob = (Number(todayISO().slice(0, 4)) - 3) + '-01-01'; }")
            assert pg.evaluate(SG, {'sx': enc}) == [['F98.1', False]], 'trẻ 3 tuổi chưa đủ tuổi'
            pg.evaluate("() => { const p = curP(); p.dob = p.dob0; delete p.dob0; }")
            # Chậm phát triển tâm thần — BYT 2020 Bài 28; ICD-11 cần cả trí tuệ và hành vi thích ứng
            ORD = "(x) => { const v = curV(); v.orders = (v.orders || []).filter(o => o.key !== 'wechsler').concat(x == null ? [] : [{id: 'o_iq_t', key: 'wechsler', name: 'IQ', unit: 'IQ', ref: '', type: 'n', value: x, flag: '', note: ''}]); }"
            idc = ['id_concept', 'id_practical', 'id_onset', 'id_excl']
            pg.evaluate(ORD, 42)
            assert pg.evaluate(DX, {'sx': idc})['codes'] == ['F71']
            r = dict((x[0], x) for x in pg.evaluate(I11, {'sx': idc}))
            assert 'F71.0' in r['F71'][2] and '6A00.1' in r['F71'][1], r
            assert pg.evaluate(SG, {'sx': ['id_onset', 'id_excl']}) == [['F71', False]], 'thiếu hành vi thích ứng'
            assert 'F71.1' in dict((x[0], x) for x in pg.evaluate(I11, {'sx': idc + ['id_behav']}))['F71'][2]
            r = dict((x[0], x) for x in pg.evaluate(I11, {'sx': idc + ['id_l3']}))
            assert 'khác mức theo lâm sàng' in r['F71'][2], r
            # tự kỷ kèm IQ < 70 → gợi ý F70–F79 và mã ICD-11 6A02.3
            r = dict((x[0], x) for x in pg.evaluate(I11, {'sx': ['asd_before3', 'asd_s1', 'asd_s2', 'asd_s4', 'asd_c1', 'asd_c3', 'asd_r2', 'asd_excl']}))
            assert 'F70–F79' in r['F84.0'][2] and '6A02.3' in r['F84.0'][1], r
            pg.evaluate(ORD, 85)
            assert ['F70', False] not in pg.evaluate(SG, {'sx': idc}) and pg.evaluate(SG, {'sx': idc}) == [['F79', False]], 'IQ ≥ 70'
            pg.evaluate(ORD, None)
            assert pg.evaluate(DX, {'sx': idc + ['id_l2']})['all'] == ['F71'] and pg.evaluate(DX, {'sx': idc + ['id_l2']})['codes'] == [], 'chưa có IQ'
            r = dict((x[0], x) for x in pg.evaluate(I11, {'sx': idc + ['id_sensory']}))
            assert 'F78' in r and '6A00.4' in r['F78'][1], r
            r = pg.evaluate(DX, {'sx': ['rf_word', 'rf_loss']})
            assert 'Cờ đỏ tự kỷ' in r['alerts'] and r['codes'] == [], r
            # khoá cũ asd_social / asd_comm vẫn được tính (hồ sơ trước 2026-11-04)
            assert ['F84.1', True] in pg.evaluate(SG, {'sx': ['asd_social', 'asd_comm', 'asd_excl'], 'weeks': 30})
            # Tự kỷ F84.0 (ICD-10 bản VN tr. 167–168): A trước 3 tuổi + B ≥ 6 triệu chứng (xã hội ≥ 2, giao tiếp ≥ 1, hành vi ≥ 1) + C loại trừ
            a6 = ['asd_before3', 'asd_s1', 'asd_s2', 'asd_s4', 'asd_c1', 'asd_c3', 'asd_r2', 'asd_excl']
            assert ['F84.0', True] in pg.evaluate(SG, {'sx': a6})
            r = pg.evaluate(I11, {'sx': ['asd_before3', 'asd_s1', 'asd_c1', 'asd_c3', 'asd_r2', 'asd_r3', 'asd_excl']})
            f841 = [x for x in r if x[0] == 'F84.1']
            assert f841 and 'F84.11' in f841[0][2] and 'xã hội 1/2' in f841[0][2], r
            r = pg.evaluate(I11, {'sx': [k for k in a6 if k != 'asd_before3']})
            assert any(x[0] == 'F84.1' and 'F84.10' in x[2] for x in r), r
            assert ['F84.0', False] in pg.evaluate(SG, {'sx': [k for k in a6 if k != 'asd_excl']}), 'thiếu tiêu chuẩn C loại trừ'
            # rối loạn giấc ngủ khác (ICD-10 bản VN F51.2–F51.5; LEC2 G47.3, G47.4)
            assert ['F51.2', True] in pg.evaluate(SG, {'sx': ['cir_mismatch', 'slp_impair', 'slp_excl'], 'weeks': 6})
            assert ['F51.3', True] in pg.evaluate(SG, {'sx': ['sw_walk', 'slp_excl'], 'weeks': 6})
            assert ['F51.4', True] in pg.evaluate(SG, {'sx': ['nt_terror', 'slp_excl'], 'weeks': 6})
            assert ['F51.5', True] in pg.evaluate(SG, {'sx': ['nm_dream', 'slp_impair', 'slp_excl'], 'weeks': 6})
            assert ['G47.3', False] in pg.evaluate(SG, {'sx': ['osa_snore', 'osa_day'], 'weeks': 6}), 'chưa có AHI -> chưa đủ'
            assert ['G47.4', True] in pg.evaluate(SG, {'sx': ['nar_attack', 'nar_cata'], 'weeks': 20})
            assert pg.evaluate("() => [scaleResult('ahi', 22).t, scaleResult('ess', 14).t]") == ['Ngưng thở khi ngủ mức trung bình', 'Buồn ngủ quá mức (ngưỡng > 10, tham khảo)']
            assert pg.evaluate("() => FLAG_OPTS.ess") == ['Bình thường', 'Buồn ngủ quá mức']
            assert pg.evaluate("() => FLAG_OPTS.madrs") == ['Bình thường', 'Nhẹ', 'Vừa', 'Nghiêm trọng', 'Cực kỳ nghiêm trọng']
            assert pg.evaluate("() => FLAG_OPTS.hamd") == ['Bình thường', 'Nhẹ', 'Vừa', 'Nặng', 'Rất nặng']
            assert pg.evaluate("() => FLAG_OPTS.bdi") == ['Tối thiểu', 'Nhẹ', 'Vừa', 'Nặng']
            assert pg.evaluate("() => FLAG_OPTS.zung_d") == ['Bình thường', 'Nhẹ', 'Vừa', 'Nặng']
            assert pg.evaluate("() => FLAG_OPTS.gds") == ['Bình thường', 'Nhẹ', 'Vừa', 'Nặng']
            assert pg.evaluate("() => FLAG_OPTS.epds") == ['Nguy cơ thấp', 'Theo dõi', 'Nguy cơ cao']
            assert pg.evaluate("() => [FLAG_OPTS.isi, LABS.find(x => x[1] === 'isi')[2]]") == [['Không mất ngủ', 'Dưới ngưỡng', 'Vừa', 'Nặng'], 'ISI – Chỉ số mức độ mất ngủ']
            assert pg.evaluate("() => [2, 3, 6].map(n => scaleResult('stopbang', n).lv)") == [0, 1, 2]
            # giao diện: bảng kiểm ở bước 1 cập nhật tức thời, bước 3 hiện gợi ý và chọn được
            pg.evaluate("() => { curV().mental = {sx: [], hist: [], excl: []}; S.mOpen = {}; renderMain(true); }")
            if not pg.is_visible('input[data-v="dep_mood"]'): pg.click('[data-act="mentalToggle"]')
            assert not pg.is_visible('input[data-v="dem_mem"]'), 'nhóm sa sút trí tuệ phải thu gọn khi chưa tích'
            pg.click('details[data-g="dem"] > summary'); pg.wait_for_timeout(100)
            assert pg.is_visible('input[data-v="dem_mem"]')
            for k in dep: pg.check(f'input[data-v="{k}"]')
            pg.fill('input[data-b="v.mental.weeks"]', '3'); pg.wait_for_timeout(200)
            assert '2/3 chính' in pg.inner_text('[data-live="mentalSum"]')
            if not pg.is_visible('input[data-v="scoff_s"]'): pg.click('details[data-g="scoff"] > summary')
            pg.check('input[data-v="scoff_s"]'); pg.check('input[data-v="scoff_f1"]'); pg.wait_for_timeout(200)
            assert 'SCOFF = 2/5: nghi rối loạn ăn uống' in pg.inner_text('[data-live="mentalSum"]')
            pg.fill('textarea[data-b="v.mental.premorbid"]', 'Hướng nội, cầu toàn'); pg.wait_for_timeout(200)
            assert pg.evaluate("curV().mental.premorbid") == 'Hướng nội, cầu toàn', 'ô nhân cách tiền bệnh lý phải lưu vào lần khám'
            pg.fill('textarea[data-b="v.mental.trauma"]', 'Mất người thân 2024'); pg.wait_for_timeout(200)
            assert pg.evaluate("curV().mental.trauma") == 'Mất người thân 2024', 'ô tiền sử sang chấn phải lưu vào lần khám'
            pg.evaluate("go({name: 'visit', pid: 'p_demoA', vid: 'v_demo_now', step: 3})"); pg.wait_for_timeout(300)
            assert 'F32.1' in pg.inner_text('[data-live="dxsug"]')
            pg.click('[data-act="dxPick"][data-code="F32.1"]'); pg.wait_for_timeout(300)
            assert pg.evaluate("curV().dx.icd").startswith('F32.1 – ')
            assert 'depression' in pg.evaluate("curP().conds")
            pg.evaluate("() => { const v = curV(); v.mental = {sx: [], hist: [], excl: []}; v.dx.icd = ''; v.dx.main = ''; savePatient(curP()); }")

            # giao diện bước 3: 2 cột, chọn mã ICD phụ -> tự điền "Chẩn đoán phụ"
            pg.evaluate("go({name: 'visit', pid: 'p_demoA', vid: 'v_demo_now', step: 3})"); pg.wait_for_timeout(300)
            dx0 = pg.evaluate("() => JSON.stringify(curV().dx)")
            pg.evaluate("() => { curV().dx.secondary = ''; curV().dx.icd2 = ''; renderMain(true); }"); pg.wait_for_timeout(200)
            assert pg.locator('.dxcol').count() == 2
            pg.fill('input[data-b="v.dx.icd2"]', 'I10 – Tăng huyết áp vô căn'); pg.wait_for_timeout(300)
            assert pg.evaluate("() => curV().dx.secondary") == 'Tăng huyết áp vô căn'
            pg.evaluate("(s) => { curV().dx = JSON.parse(s); savePatient(curP()); }", dx0)

            # 7. Xoá bệnh nhân -> file chuyển vào da-xoa
            pg.evaluate("go({name: 'patient', pid: 'p_test1'})"); pg.evaluate('ACT.delP()'); pg.wait_for_timeout(1200)
            files = pg.evaluate(LIST)
            assert not any('/du-lieu/benh-nhan/tran-thi-binh' in f for f in files)
            assert any('/da-xoa/benh-nhan/' in f for f in files)

            # 8. Lỗi ghi file -> báo lỗi, giữ dữ liệu; ghi lại khi bấm thử lại
            pg.evaluate("""() => { window.__cw = FileSystemFileHandle.prototype.createWritable;
                FileSystemFileHandle.prototype.createWritable = () => Promise.reject(new DOMException('test', 'NotAllowedError')); }""")
            pg.evaluate("go({name: 'patient', pid: 'p_demoA'})")
            pg.evaluate("() => { const p = curP(); p.job = 'Thử lỗi ghi'; savePatient(p); }"); pg.wait_for_timeout(800)
            assert pg.evaluate('[...Store.dir.dirty]') == ['p:p_demoA']
            pg.evaluate("() => { FileSystemFileHandle.prototype.createWritable = window.__cw; }")
            pg.evaluate("go({name: 'home'})"); pg.click('.banner [data-act="dirRetry"]'); pg.wait_for_timeout(1000)
            assert pg.evaluate('[...Store.dir.dirty]') == []
            pf = [f for f in pg.evaluate(LIST) if '/benh-nhan/nguyen-van-a_' in f][0]
            assert json.loads(pg.evaluate(READ, pf))['job'] == 'Thử lỗi ghi'

            # 9. Mọi màn hình chính hiển thị được (bắt lỗi render)
            for view in ["{name:'home'}", "{name:'appts'}", "{name:'drugs'}", "{name:'tpls'}", "{name:'settings'}",
                         "{name:'patient', pid:'p_demoA', tab:'profile'}",
                         "{name:'patient', pid:'p_demoA', tab:'screen'}"] + \
                        [f"{{name:'visit', pid:'p_demoA', vid:'v_demo_now', step:{i}}}" for i in range(1, 7)]:
                pg.evaluate(f'go({view})'); pg.wait_for_timeout(120)
            pg.evaluate('ACT.newP()'); pg.wait_for_timeout(120)     # màn hình BN mới phải mở qua ACT (cần S.newP)
            b.close()
    finally:
        srv.terminate()
    assert not errs, f'Lỗi JavaScript: {errs}'
    print('OK – tất cả kiểm thử đạt')


if __name__ == '__main__':
    main()
