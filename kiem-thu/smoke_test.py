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
            assert any(x.startswith('3|') and 'lamotrigin' in x for x in pg.evaluate(CHK, ['valp500n', 'lamo50n'])), 'valproat + lamotrigin phải cảnh báo mức 3'
            assert any('CYP2D6' in x for x in pg.evaluate(CHK, ['fluox20n', 'arip10n'])), 'fluoxetin + aripiprazol phải cảnh báo CYP2D6'
            assert any(x.startswith('3|') and 'carbamazepin' in x for x in pg.evaluate(CHK, ['carba200n', 'clari500'])), 'carbamazepin + clarithromycin phải cảnh báo mức 3'
            assert any('an thần' in x for x in pg.evaluate(CHK, ['alpra05n', 'zopi7n'])), 'hai thuốc an thần phải cảnh báo'
            assert any('cholinergic' in x for x in pg.evaluate(CHK, ['done5n', 'parox20n'])), 'donepezil + paroxetin phải cảnh báo đối kháng'
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
            assert r['p'] == 9999 and r['preg'] == 3 and r['warn'] != 'cũ' and r['ver'] == ['stahl-2026-10', 'moi-2026-10'], r
            assert pg.evaluate("S.drugs.find(x => x.id === 'quet100n').lact.lv") == 1, 'quetiapin cho con bú phải theo LactMed (mức lưu ý)'

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
            assert pg.evaluate("curV().rx.map(l => l.drugId)") == ['sert50'], 'sertralin không bị chặn vì QTc'
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
            assert pg.evaluate(FB, 'fluox20n') == 1 and pg.evaluate(FB, 'sert50') == 1
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
            assert pg.evaluate("() => drugBlockReasons(curP(), curV(), {id: 'y', n: 'Clomipramin 25 mg', hc: 'clomipramin', cls: 'Chống trầm cảm 3 vòng', tags: []}).length") == 1
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
            assert pg.evaluate("() => [['pss', 20], ['pcptsd5', 4]].map(([k, v]) => scaleResult(k, v).t)") == ['Stress cảm nhận vừa', 'Dương tính — đánh giá thêm bằng PCL-5 / CAPS-5']
            assert pg.evaluate("() => [['gad7', 12], ['gad2', 3], ['phq4_d', 1], ['phq9', 20], ['mmse', 23], ['moca', 27]].map(([k, v]) => (scaleResult(k, v) || {}).t)") == ['Lo âu vừa', 'Dương tính — làm GAD-7', 'Âm tính', 'Trầm cảm nặng', 'Suy giảm nhận thức (< 24; đối chiếu trình độ học vấn)', 'Bình thường']
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
            bb0 = pg.evaluate("() => JSON.stringify({conds: curP().conds, note: curP().condNote, hpi: curV().hpi})")
            pg.evaluate("() => { const p = curP(); p.conds = p.conds.filter(k => k !== 'breastfeeding'); p.condNote = ''; curV().hpi = ''; }")
            assert pg.evaluate(BB, 'sert50') == 0
            pg.evaluate("() => { curP().conds.push('breastfeeding'); }")
            neuro_b = pg.evaluate("() => DRUGS_SEED.filter(d => d.g === 'neuro').map(d => d.id)")
            assert all(pg.evaluate(BB, x) == 1 for x in neuro_b), 'cho con bú phải chặn mọi thuốc thần kinh – tâm thần'
            assert pg.evaluate(BB, 'cipro500') == 0
            pg.evaluate("(s) => { const p = curP(), o = JSON.parse(s); p.conds = o.conds; p.condNote = o.note; curV().hpi = o.hpi; }", bb0)
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
            # mang thai (ô hồ sơ / tiền sử ghi) -> chặn toàn bộ nhóm thần kinh – tâm thần; thuốc nhóm khác không bị chặn
            PB = "(id) => drugBlockReasons(curP(), curV(), drugById(id)).filter(r => /^đang mang thai/.test(r)).length"
            pg0 = pg.evaluate("() => JSON.stringify({conds: curP().conds, note: curP().condNote, hpi: curV().hpi, reason: curV().reason, orders: curV().orders})")
            pg.evaluate("() => { const p = curP(), v = curV(); p.conds = p.conds.filter(k => k !== 'pregnant'); p.condNote = 'Đã từng mang thai 2 lần'; v.hpi = ''; v.reason = ''; v.orders = (v.orders || []).filter(o => o.key !== 'bhcg'); }")
            assert pg.evaluate(PB, 'sert50') == 0 and pg.evaluate(PB, 'gaba300n') == 0
            pg.evaluate("() => { curP().condNote = 'Đang mang thai 10 tuần'; }")
            neuro = pg.evaluate("() => DRUGS_SEED.filter(d => d.g === 'neuro').map(d => d.id)")
            assert all(pg.evaluate(PB, x) == 1 for x in neuro), 'mang thai phải chặn mọi thuốc thần kinh – tâm thần'
            assert pg.evaluate(PB, 'tiane12') == 1 and pg.evaluate(PB, 'cipro500') == 0
            pg.evaluate("(s) => { const p = curP(), v = curV(), o = JSON.parse(s); p.conds = o.conds; p.condNote = o.note; v.hpi = o.hpi; v.reason = o.reason; v.orders = o.orders; }", pg0)
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
            assert 'Quy tắc phòng khám' not in pg.evaluate("() => checkAll(curP(), curV(), [{line: {id: 'L_hd', drugId: 'sert50'}, drug: drugById('sert50')}]).items.map(w => w.kind)"), 'chỉ cảnh báo, không chặn'
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
            VH = "(id) => drugBlockReasons(curP(), curV(), drugById(id)).filter(r => /tăng huyết áp/.test(r)).length"
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
            assert pg.evaluate(DX, {'hist': ['mania']})['codes'] == ['F31.7']
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
            assert ['F00.1', True] in pg.evaluate(SG, {'sx': ['dem_mem', 'dem_cog', 'dem_func', 'dem_clear', 'dem_emo', 'dem_6m', 'dem_slow'], 'weeks': 40})
            assert ['F01.0', True] in pg.evaluate(SG, {'sx': ['dem_mem', 'dem_cog', 'dem_func', 'dem_clear', 'dem_emo', 'dem_6m', 'dem_vasc', 'dem_step'], 'weeks': 40})
            assert ['F05.0', True] in pg.evaluate(SG, {'sx': ['del_cons', 'del_cog', 'del_psymo', 'del_sleep', 'del_acute', 'del_cause'], 'weeks': 0})
            assert ['F51.0', True] in pg.evaluate(SG, {'sx': ['ins_compl', 'ins_freq', 'slp_impair', 'slp_excl'], 'weeks': 6})
            assert ['F10.2', True] in pg.evaluate(SG, {'sx': ['sud_alc', 'sud_crave', 'sud_control', 'sud_withdraw', 'sud_12m'], 'weeks': 20})
            assert ['F17.1', False] in pg.evaluate(SG, {'sx': ['sud_tob', 'sud_harm'], 'weeks': 20})
            assert ['F63.0', True] in pg.evaluate(SG, {'sx': ['gam_2ep', 'gam_cont', 'gam_urge', 'gam_preocc'], 'weeks': 60})
            assert ['F91.3', True] in pg.evaluate(SG, {'sx': ['cd_odd', 'cd_pattern'], 'weeks': 30})
            assert ['F44', True] in pg.evaluate(SG, {'sx': ['dis_sx', 'dis_noorg', 'dis_time'], 'weeks': 2})
            assert ['F45.0', True] in pg.evaluate(SG, {'sx': ['som_2y', 'som_visits', 'som_refuse', 'som_6sx'], 'weeks': 110})
            assert ['F90.0', True] in pg.evaluate(SG, {'sx': ['adhd_inatt', 'adhd_hyper', 'adhd_imp', 'adhd_7y', 'adhd_perv', 'adhd_impair'], 'weeks': 30})
            assert ['F84.1', True] in pg.evaluate(SG, {'sx': ['asd_social', 'asd_comm'], 'weeks': 30})
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
