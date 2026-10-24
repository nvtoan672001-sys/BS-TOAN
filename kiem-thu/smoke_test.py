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
            man = ['man_mood', 'man_talk', 'man_sleep', 'man_grand']
            assert pg.evaluate(DX, {'sx': man, 'weeks': 1, 'impair': 'marked'})['codes'] == ['F30.1']
            assert pg.evaluate(DX, {'sx': man, 'weeks': 1, 'impair': 'none'})['codes'] == ['F30.0']
            assert pg.evaluate(DX, {'hist': ['mania']})['codes'] == ['F31.7']
            assert pg.evaluate(DX, {'sx': dep + ['dep_suicide'], 'weeks': 3})['alerts'] == ['Có ý tưởng / hành vi tự sát']
            r = pg.evaluate(DX, {'sx': dep, 'weeks': 3, 'excl': ['subst']})
            assert r['codes'] == [] and 'F32.1' in r['all'], 'có yếu tố do chất thì không được "đủ tiêu chuẩn"'
            r = pg.evaluate(DX, {'sx': ['dep_mood', 'anx_fear', 'anx_motor', 'anx_auto'], 'weeks': 8})
            assert 'F41.2' in r['codes'], r
            # giao diện: bảng kiểm ở bước 1 cập nhật tức thời, bước 3 hiện gợi ý và chọn được
            pg.evaluate("() => { curV().mental = {sx: [], hist: [], excl: []}; S.mOpen = {}; renderMain(true); }")
            if not pg.is_visible('input[data-v="dep_mood"]'): pg.click('[data-act="mentalToggle"]')
            for k in dep: pg.check(f'input[data-v="{k}"]')
            pg.fill('input[data-b="v.mental.weeks"]', '3'); pg.wait_for_timeout(200)
            assert '2/3 chính' in pg.inner_text('[data-live="mentalSum"]')
            pg.evaluate("go({name: 'visit', pid: 'p_demoA', vid: 'v_demo_now', step: 3})"); pg.wait_for_timeout(300)
            assert 'F32.1' in pg.inner_text('[data-live="dxsug"]')
            pg.click('[data-act="dxPick"][data-code="F32.1"]'); pg.wait_for_timeout(300)
            assert pg.evaluate("curV().dx.icd").startswith('F32.1 – ')
            assert 'depression' in pg.evaluate("curP().conds")
            pg.evaluate("() => { const v = curV(); v.mental = {sx: [], hist: [], excl: []}; v.dx.icd = ''; v.dx.main = ''; savePatient(curP()); }")

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
