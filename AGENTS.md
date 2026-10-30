# AGENTS.md — Hướng dẫn cho AI agent (và lập trình viên) làm việc với dự án

> Đọc hết file này trước khi sửa code. Mọi phần mô tả ở đây khớp với code tại thời điểm viết. Nếu bạn đổi kiến trúc, quy ước hay mô hình dữ liệu, **hãy cập nhật file này trong cùng lần sửa**.

## 1. Dự án là gì

App quản lý hồ sơ bệnh nhân và hỗ trợ ra quyết định lâm sàng cho **một bác sĩ nội tổng quát** (BS. Toàn), dùng **cục bộ trên một máy Windows**. Giao diện bằng tiếng Việt.

Luồng một lượt khám có 6 bước: (1) lý do khám và thăm khám → (2) cận lâm sàng (chỉ định xét nghiệm, nhập kết quả, đính kèm ảnh/PDF) → (3) chẩn đoán và kê đơn, kèm kiểm tra tương tác thuốc, chỉnh liều theo thận/gan/tuổi/thai kỳ, dị ứng, và so sánh thuốc nội–ngoại theo giá → (4) kế hoạch theo dõi (tái khám, sàng lọc theo tuổi/giới/nguy cơ, nhắc hẹn dài hạn) → (5) liệu pháp không thuốc (dinh dưỡng kcal và đạm/béo/bột, vận động, PHCN, YHCT, tâm lý/CBT) → (6) in phiếu A4 cho bệnh nhân.

### Ràng buộc bắt buộc (không được phá)
- **Một file HTML tự chứa**, chạy bằng cách mở file trực tiếp (`file://`) trong Chrome/Edge. Không có server, không có bước cài đặt.
- **Bản web** (GitHub Pages, https://nvtoan672001-sys.github.io/BS-TOAN/): workflow `.github/workflows/pages.yml` build → chạy smoke test → deploy mỗi khi push `main`. Bản web chỉ là giao diện tĩnh — dữ liệu vẫn ở máy người dùng; vẫn cấm mọi gọi API / analytics / tài nguyên từ xa. Origin web khác `file://` nên bộ nhớ trình duyệt và quyền thư mục là riêng cho từng nơi.
- **Không phụ thuộc bên ngoài**: không framework, không npm, không CDN, không font/ảnh từ mạng. App phải chạy **offline** hoàn toàn.
- **Không gửi dữ liệu đi đâu.** Đây là dữ liệu sức khoẻ cá nhân (dữ liệu nhạy cảm theo Nghị định 13/2023/NĐ-CP). Không thêm analytics, telemetry, gọi API, hay tải tài nguyên từ xa.
- **Nội dung y khoa** (quy tắc tương tác, ngưỡng eGFR, sàng lọc, liều) là công cụ **hỗ trợ**. Mọi thay đổi phải có nguồn (tờ HDSD, Dược thư QG, KDIGO, Beers, USPSTF, ADA…) và cần bác sĩ duyệt. Không tự bịa số liệu lâm sàng. Nếu không chắc, hỏi lại thay vì đoán.
- Giữ giao diện bằng tiếng Việt có dấu, xưng "anh" với bác sĩ trong các thông báo.
- Danh sách tài liệu nguồn bác sĩ cung cấp (vị trí trên máy, tài liệu nào đã dùng cho phần nào) nằm ở **`TAI-LIEU.md`**. Cập nhật file đó khi dùng thêm nguồn.

## 2. Bố cục thư mục

```
BS-TOAN/                      ← thư mục bác sĩ dùng
├─ Ho-so-benh-nhan.html       ← APP (file build ra, KHÔNG sửa tay)
├─ HUONG-DAN.txt              ← hướng dẫn sử dụng cho bác sĩ
├─ du-lieu/                   ← DỮ LIỆU BỆNH NHÂN THẬT (app tạo ra). KHÔNG đọc, KHÔNG commit, KHÔNG gửi đi
└─ ma-nguon/                  ← mã nguồn (thư mục làm việc của bạn)
   ├─ index.html              ← khung HTML, có 2 chỗ giữ chỗ /*CSS*/ và /*JS*/
   ├─ style.css               ← toàn bộ CSS, kể cả CSS in (@media print)
   ├─ data.js                 ← cơ sở tri thức: thuốc, quy tắc tương tác, ICD, xét nghiệm, sàng lọc, mẫu tư vấn
   ├─ engine.js               ← tiện ích, LƯU TRỮ (Store), trạng thái S, tính toán y khoa, kiểm tra đơn
   ├─ ui.js                   ← toàn bộ giao diện, hành động, khởi động
   ├─ build.py                ← ghép thành ../Ho-so-benh-nhan.html
   ├─ kiem-thu/smoke_test.py  ← kiểm thử end-to-end bằng Playwright
   └─ AGENTS.md, CLAUDE.md
```

## 3. Build và kiểm thử

```bash
cd ma-nguon
python build.py                      # ghi ra ../Ho-so-benh-nhan.html (chỉ cần Python 3)
python build.py /tmp/app.html        # ghi ra chỗ khác

pip install playwright && python -m playwright install chromium   # một lần
python kiem-thu/smoke_test.py        # phải in "OK – tất cả kiểm thử đạt"
```

- `build.py` nối `data.js` → `engine.js` → `ui.js`, **đúng thứ tự này**, thành một `<script>`, rồi nhúng `style.css`.
- Smoke test tự build ra thư mục tạm, chạy server cục bộ, và **thay `showDirectoryPicker` bằng OPFS** (thư mục ảo của trình duyệt), nên không đụng dữ liệu thật. Test bao gồm: chọn thư mục, chép dữ liệu từ trình duyệt sang thư mục, sửa/đổi tên file bệnh nhân, đính kèm file, tải lại trang, cảnh báo tương tác (ibuprofen + Sintrom), xoá vào `da-xoa`, lỗi ghi và ghi lại, và render mọi màn hình.
- **Sau mỗi thay đổi: chạy smoke test.** Khi thêm tính năng, thêm bước kiểm tra tương ứng vào test.
- Kiểm tra nhanh cú pháp: `python build.py /tmp/a.html && node -e "new Function(require('fs').readFileSync('/tmp/a.html','utf8').split('<script>')[1].split('</script>')[0])"`.
- Khi đổi giao diện, chụp màn hình bằng Playwright ở **1280px** và **390px** (điện thoại), rồi kiểm tra không bị tràn ngang: `#main.scrollWidth - #main.clientWidth == 0`.

## 4. Kiến trúc

### 4.1 Không có module, mọi thứ ở phạm vi toàn cục
Ba file JS được nối lại nên dùng chung một phạm vi. `engine.js` và `ui.js` bắt đầu bằng `'use strict'`. Hằng số trong `data.js` (ví dụ `DRUGS_SEED`, `RULES`) được dùng trực tiếp trong hai file kia. **Đừng thêm `import`/`export`** vì sẽ làm hỏng build.

### 4.2 Trạng thái và render (`engine.js` → `S`, `ui.js`)
- `S` là trạng thái duy nhất: `patients`, `drugs`, `tpls`, `settings`, `view`, `modal`, `cmp` (so sánh thuốc), `editDrug`, `editTpl`, `newP`, `gate` (màn hình chọn thư mục), `storeErr`, `otherTab`…
- `S.view = {name, pid?, vid?, step?, tab?}`. `name` thuộc `home | appts | newp | patient | visit | drugs | tpls | settings`. Đổi màn hình **luôn qua `go(view)`**, vì hàm này flush các lần lưu đang chờ trước. Riêng màn hình `newp` phải mở qua `ACT.newP()` vì nó cần tạo `S.newP` trước.
- `curP()` / `curV()` trả về bệnh nhân / lượt khám đang mở theo `S.view.pid` / `S.view.vid`.
- Render bằng **chuỗi HTML + `innerHTML`**: `render()` gồm `renderNav`, `renderSide`, `renderMain`, `renderModal`. Các hàm `viewXxx()` và `stepN()` trả về chuỗi.
- **Mọi giá trị người dùng nhập phải qua `esc()`** khi chèn vào HTML để tránh XSS hoặc vỡ giao diện.

### 4.3 Ràng buộc dữ liệu hai chiều qua thuộc tính `data-*`
- `data-b="root.path"`: ô nhập gắn với dữ liệu. Có 7 root: `p` (bệnh nhân hiện tại), `v` (lượt khám hiện tại), `s` (settings), `d` (thuốc đang sửa), `t` (mẫu đang sửa), `n` (bệnh nhân mới), `c` (trạng thái so sánh). Khi một bước trong path là `#id`, nó chọn phần tử có `id` đó trong mảng, ví dụ `v.rx.#r123.days`.
- `data-t`: `num` (chấp nhận dấu phẩy thập phân, lưu thành số hoặc `null`), `bool`, `list` (checkbox thêm/bớt `data-v` vào mảng), `radio`. Không có `data-t` thì lưu chuỗi.
- Hàm dựng control: `I` (input), `U` (input có đơn vị), `T` (textarea), `SEL`, `CB`, `CL`, `RAD`, `F` (nhãn + control).
- Luồng sự kiện: `input` → `onBind(el)` → ghi vào object → `afterChange(path)`. Hàm này xử lý tính toán phụ thuộc (ngày tái khám ↔ số ngày, ICD → tự thêm bệnh nền mạn tính, cân nặng mới nhất → hồ sơ), gọi `savePatient(p)` (debounce 300 ms), rồi `updateLive()`.
- `data-live="key"`: vùng **tự tính lại** khi dữ liệu đổi. Hàm của từng key nằm trong bảng `LIVE` (`ctx`, `warn`, `rxw`, `rxqty`, `rxcost`, `egfr`, `nutri`, `print`, `cmp`…). **Quy tắc quan trọng:** khi người dùng đang gõ, chỉ cập nhật bằng `updateLive()`. Gọi `renderMain()` lúc đó sẽ dựng lại DOM và làm ô nhập mất focus.
- `data-act="name"`: nút bấm → `ACT[name](el, event)`. Bảng `ACT` trong `ui.js` có khoảng 55 hành động. Thêm hành động mới bằng cách thêm vào bảng này, **không dùng `onclick` inline**.
- Mọi listener được gắn **một lần** ở `bindEvents()` theo kiểu ủy quyền sự kiện trên `document`.

### 4.4 Lưu trữ (`engine.js` → `Store`, `IDB`, `makeDirStore`)
`Store` là lớp mặt tiền với API kiểu key-value theo "store": `all(s)`, `get(s, id)`, `put(s, obj)`, `putMany(s, arr)`, `del(s, id)`, `clear(s)`. Có 5 store: `patients`, `drugs`, `templates`, `files`, `kv`. **Code giao diện chỉ được gọi `Store`**, không gọi trực tiếp backend.

Có hai backend:
1. **`dir` (chính)**: File System Access API (`showDirectoryPicker`, chỉ có trên Chrome/Edge). Bác sĩ chọn thư mục (thường là `BS-TOAN`), app tạo `du-lieu/` bên trong:
   ```
   du-lieu/benh-nhan/<slug-ten>_<ma-BN>_<id>.json   một bệnh nhân / file (kể cả mọi lượt khám); tên file đổi theo tên BN
   du-lieu/tep-dinh-kem/<fileId>__<ten-goc>          file nhị phân thật (ảnh, PDF)
   du-lieu/danh-muc-thuoc.json | mau-tu-van.json | cai-dat.json   mảng các object
   du-lieu/sao-luu/sao-luu-YYYY-MM-DD.json           snapshot mỗi ngày (không kèm tệp đính kèm), giữ 60 bản
   du-lieu/da-xoa/<thư-mục>/<thời-gian>_<tên>        xoá = chuyển vào đây, không xoá hẳn
   du-lieu/DOC-TRUOC.txt
   ```
   - Khi mở thư mục, toàn bộ JSON được đọc vào cache trong bộ nhớ. `get`/`all` đọc từ cache (riêng `files` thì đọc từ đĩa).
   - Ghi file qua `_write()`: **tuần tự theo từng file** bằng hàng đợi promise, dùng `createWritable` nên ghi nguyên tử. Lần ghi lỗi được đưa vào `dirty` (`p:<id>`, `c:<store>`, `f:<id>`) và gọi `onStoreError()`. Header khi đó chuyển đỏ và hiện banner, nút "Ghi lại ngay" chạy `ACT.dirRetry` → `Store.dir.retry()`.
   - `Store.put('files', {id, name, type, size, blob})` ở chế độ `dir` (có thể dùng `data` dạng dataURL thay cho `blob`). `get('files', id)` luôn trả về `{id, name, type, size, data: dataURL}`.
2. **`idb` / `ls` (dự phòng)**: IndexedDB (`ho-so-benh-nhan` v1), hoặc localStorage nếu IDB lỗi. Dùng khi trình duyệt không hỗ trợ `dir`, hoặc khi bác sĩ chọn "Tạm lưu trong trình duyệt".

**IndexedDB luôn được dùng** để nhớ các khoá trong `LOCAL_KV`: `dirh` (handle thư mục), `pref` (`browserOnly`), `fh` (tính năng cũ, xem bên dưới). Các khoá này không bao giờ ghi ra thư mục.

**Khởi động** (`init` → `boot` trong `ui.js`):
- Có `dirh` và quyền đã được cấp → `startDir(h)`.
- Có `dirh` nhưng chưa có quyền, **và đã có bản sao** của đúng thư mục đó (kv `mirror` cùng tên) → `startPending(h)`: vào giao diện ngay, chạy trên bản sao IndexedDB (`Store.mode='idb'`, `S.pendingDir=h`, `Store.pend` = hàng chờ, lưu ở kv `pendsync`). Lần `pointerdown` đầu tiên (hoặc nút "Kết nối thư mục" / ô trạng thái) gọi `connectPending()` → `requestPermission` → `Store.syncPending(d)` đẩy các thay đổi tạm vào thư mục → `startDir(h)`. Tệp đính kèm cũ không có bản sao, chỉ mở được sau khi kết nối.
- Có `dirh`, chưa có quyền, chưa có bản sao → `S.gate = {kind:'reconnect'}`. Cần người dùng bấm thì mới gọi được `requestPermission`.
- **Bản sao**: ở chế độ `dir`, `Store.put/putMany/del/clear` chép thêm vào IndexedDB (trừ `files`); `startDir()` gọi `Store.mirrorAll()` mỗi lần mở thư mục thành công. Khi sửa `Store`, giữ cả hai đường này.
- Chưa có `dirh` → `S.gate = {kind:'setup'}`, trừ khi `pref.browserOnly` thì vào `startBrowser()`.

`startDir()` xử lý ba trường hợp: thư mục có sẵn dữ liệu → mở; thư mục trống và đang có dữ liệu ở nguồn cũ → hỏi rồi `Store.copyAll(src, dst)`; còn lại → `seedAll()`.

Các phần khác:
- **Xuất/nhập một file**: `snapshot()` → `{app:'ho-so-benh-nhan', ver:1, exportedAt, settings, patients, drugs, tpls, files}`. `importAll()` **thay thế** toàn bộ dữ liệu. Giữ tương thích định dạng này. Nếu đổi, tăng `ver` và viết chuyển đổi.
- **Tính năng cũ** "tự động lưu ra một file" (`S.fileHandle`, `fileLink`, `writeFileNow`) chỉ còn hiện trong chế độ trình duyệt khi đã bật từ trước. Đừng phát triển tiếp, hãy dùng `dir`.
- `BroadcastChannel('hsbn')` phát hiện app đang mở ở tab khác và hiện cảnh báo. App **không có khoá ghi giữa các tab**.

### 4.5 Bộ máy y khoa (`engine.js`)
- `ageOf(p, atISO)`: dùng `dob` hoặc `birthYear`. `bmiOf` và `bmiClass` dùng **ngưỡng người châu Á** (≥23 là thừa cân).
- `renalOf(p)`: lấy creatinin **mới nhất** từ mọi lượt khám (`orders` có `key==='creat'`, đơn vị **µmol/L**) hoặc từ `p.renalManual`. Tính eGFR theo **CKD-EPI 2021** (không hệ số chủng tộc) và CrCl theo **Cockcroft-Gault**, kèm phân độ G1–G5.
- `ctxOf(p, v)` → ngữ cảnh bệnh nhân: `conds` (Set) gộp từ bệnh nền, từ ICD của chẩn đoán (`ICD[i][2]`), từ từ khoá chẩn đoán (`DX_KEYWORDS`, so khớp không dấu), và các điều kiện suy ra: `elderly` (≥65), `child` (<18), `obese` (BMI≥23), `sedentary`, `alcohol`. Cùng với `egfr`, `longMeds` (thuốc dùng dài hạn đã resolve), `allergies`…
- **Tag thuốc**: mỗi thuốc có `tags`. `expandTags()` mở rộng theo bảng `IMPLY`, ví dụ `vka` → `anticoag`, `acei` → `raas`.
- `drugChecks(drug, ctx)`: kiểm tra từng thuốc với dị ứng (`ALLERGY[].hit`), thận (`drug.renal[]`, lấy ngưỡng `lt` **thấp nhất** mà eGFR nhỏ hơn), gan, người cao tuổi, thai, cho bú, trẻ em, và bệnh kèm (`drug.cond`).
- `checkAll(p, v)`: chạy `drugChecks` cho mọi dòng đơn, rồi kiểm tra **từng cặp** (đơn × đơn, đơn × thuốc dài hạn). Mỗi cặp được xét trùng hoạt chất → `RULES` theo tag → trùng nhóm `cls`. Có thêm quy tắc "triple whammy" (RAA + lợi tiểu + NSAID). Kết quả loại trùng và sắp theo mức độ.
- **Mức độ** `lv`: 3 = Nguy cơ cao, 2 = Thận trọng, 1 = Lưu ý (`LV_LABEL`).
- `rxQty`/`rxCost`: liều sáng/trưa/chiều/tối × số ngày, làm tròn lên số viên; giá = số lượng × `drug.p`.
- `nutriCalc(p, v)`: BMR theo Mifflin-St Jeor (cân nặng thực) × hệ số vận động (`ACT_LV`). Mặc định giảm cân khi BMI≥23, thâm hụt 500 kcal, không thấp hơn 1200 (nữ) / 1500 (nam). Đạm 1,0 g/kg, hoặc 0,8 g/kg nếu eGFR<60 (KDIGO). Khi BMI≥25, đạm tính theo **cân nặng hiệu chỉnh** = IBW + 0,25×(cân thực − IBW), với IBW = 22×chiều cao². Bác sĩ ghi đè được bằng `v.nutrition.kcal`, `proteinGkg`, `fatPct`, `deficit`. Chia theo bữa bằng `MEALS`.
- **Gợi ý chẩn đoán tâm thần** (`psyDx(p, v)`, mục `GỢI Ý CHẨN ĐOÁN TÂM THẦN`): đọc bảng kiểm `v.mental` (bước 1, khung "Khám tâm thần", định nghĩa trong `MENTAL_SX`/`MENTAL_IMPAIR`/`MENTAL_HIST`/`MENTAL_EXCL` của `data.js`) và kết quả MDQ, HCL-32, TSH; trả về `{sugs:[{code, name, src, met, miss, note, ok}], alerts, todo}`. Tiêu chuẩn lấy từ **BYT 2020 – QĐ 2058/QĐ-BYT, Bài 18–23** (F30–F33, F41.1, F41.2); mỗi gợi ý ghi bài nguồn. Bước 3 hiện khung `data-live="dxsug"`, nút `dxPick` điền mã ICD. Khung khám tâm thần thu gọn mặc định (`mentalOpen`), **không in lên phiếu**. Sửa quy tắc phải giữ đúng nguồn và có bác sĩ duyệt; smoke test bước 6c kiểm tra các ca mẫu.
- **Quy tắc phòng khám cho SSRI/SNRI** (bác sĩ đặt 2026-10-24; `isSsriSnri`, `ssriBlockReasons`, `bipolarHistory` trong `engine.js`): KHÔNG cho kê (chặn ở `addRx`/`cmpPick` qua `rxBlocked`, và báo mức 3 "Quy tắc phòng khám" trong `checkAll`) khi khám tâm thần có rối loạn chức năng tình dục (`v.mental.sx` nhóm `sex_*`) hoặc chẩn đoán F52.x; bệnh sử/lý do khám có buồn nôn, tiêu chảy, phân lỏng (bỏ qua câu phủ định "không/chưa/hết …"); thuốc dài hạn có NSAID, kháng đông, chống kết tập tiểu cầu (kể cả aspirin), cường giao cảm (kể cả salbutamol) — theo tag hoặc tên trong `LONG_KW`. Tiền sử lưỡng cực (bệnh nền `bipolar` hoặc `v.mental.hist` hưng cảm/hưng cảm nhẹ/hỗn hợp) → chỉ cảnh báo mức 2.
- **QTc dài → không kê citalopram/escitalopram** (bác sĩ đặt 2026-10-25): `qtcLong(p, v)` đọc kết quả điện tim (`orders` key `ecg`) mới nhất — lượt khám hiện tại trước, rồi lượt cũ gần nhất — và `qtcLongText()` nhận "QT(c) dài / kéo dài", "kéo dài (khoảng) QT(c)", bỏ qua câu phủ định. Khi đó cũng tự thêm `qt_long` vào ngữ cảnh (cảnh báo mọi thuốc kéo dài QT). Tất cả lý do chặn gom ở `drugBlockReasons(p, v, d)`; giao diện chỉ gọi hàm này (`rxBlocked`).
- **Agomelatin** (`agome25`, soạn theo SmPC vì không có trong BYT 2020/Stahl 2004; bác sĩ đặt 2026-10-25): không kê khi AST hoặc ALT mới nhất > 3 × giới hạn trên (`transaminaseHigh`, giới hạn lấy từ `ref` "< 40") hoặc đơn / thuốc dài hạn có ciprofloxacin, fluvoxamin (`cyp1a2InhNames`). Có thêm quy tắc tương tác `cyp1a2_inh` + `cyp1a2_sub` (mức 3).
- **Duloxetin** (bác sĩ đặt 2026-10-25): không kê khi AST/ALT > 3 × giới hạn trên (`transaminaseHigh`) hoặc CrCl < 30 mL/phút (`renalOf(p).crcl`, creatinin mới nhất + cân nặng hồ sơ); chưa có cân nặng thì dùng eGFR < 30. Duloxetin là SNRI nên quy tắc SSRI/SNRI vẫn áp dụng thêm.
  - Bổ sung 2026-10-27: chặn thêm khi hồ sơ nền phì đại tiền liệt tuyến (ô `bph` hoặc tiền sử ghi "phì đại tiền liệt tuyến"), tiền sử ghi "bệnh gan mạn / suy gan / xơ gan / viêm gan mạn" (ô `liver` đã chặn ở quy tắc bệnh gan), eGFR < 15 (dù CrCl ≥ 30). CrCl < 15 đã nằm trong ngưỡng CrCl < 30.
- **Valproat** (bác sĩ đặt 2026-10-25): bệnh nhân **nữ** chưa có β-hCG trong lượt khám này hoặc 7 ngày gần nhất, hoặc β-hCG > 5 mIU/mL / "dương tính" → không kê (`bhcgLatest`; hiểu cả "< 5", "âm tính"). Nam không áp dụng.
- **Bệnh gan mạn / xơ gan** (`liver`; hồ sơ, ICD K74.6, từ khoá "xơ gan", "bệnh gan mạn", "suy gan") → không kê agomelatin, duloxetin, valproat, nefazodon (bác sĩ đặt 2026-10-25).
- **Động kinh** (`epilepsy`; hồ sơ, ICD G40.9, từ khoá "động kinh") → không kê bupropion, clomipramin; TCA liều > `TCA_EPI_MAX` (150 mg/ngày, tính bằng `dailyMg` = tổng liều 4 cữ × hàm lượng trong tên thuốc) bị báo mức 3 trong đơn (bác sĩ đặt 2026-10-25). Bupropion, nefazodon, clomipramin hiện không có trong danh mục — quy tắc theo tên hoạt chất nên có hiệu lực khi bác sĩ thêm thuốc.
- **Chán ăn tâm thần** (`anorexia`: ICD F50.0 / F50.1 hoặc chẩn đoán ghi "chán ăn tâm thần") → không kê TCA (`isTca`), IMAO (`isMaoi`: moclobemid, phenelzin, tranylcypromin, isocarboxazid; không tính selegilin / rasagilin), bupropion (bác sĩ đặt 2026-10-26; nguồn LEC9 slide "Liệu pháp hoá dược": TCA độc tính tim ở người suy dinh dưỡng, bupropion chống chỉ định ở rối loạn ăn uống — IMAO là quy tắc của bác sĩ, không có trong LEC9). Hiện danh mục không có IMAO / bupropion — quy tắc theo tên.
- **Ăn vô độ tâm thần** (`bulimia`: ICD F50.2 / F50.3 hoặc chẩn đoán ghi "ăn vô độ tâm thần") → không kê bupropion (bác sĩ đặt 2026-10-26; LEC9).
- **Rối loạn ăn uống — danh mục** (2026-10-26, nguồn LEC9 EPA + handout mục 4): thêm ICD F50.3, F50.5, F50.8, F50.9, F98.2, F98.3; xét nghiệm Clo, Canxi, Magie, Phospho, HCO₃⁻, Amylase, FT3, Estradiol, Testosteron, Siêu âm tim, EEG, DXA; trắc nghiệm EDE-Q 6.0; bảng kiểm SCOFF (nhóm `scoff_*` trong khám tâm thần, ≥ 2 câu "có" → chip nghi rối loạn ăn uống; ngưỡng theo Morgan 1999). Khoảng tham chiếu xét nghiệm là mức thường dùng ở người lớn, tuỳ phòng xét nghiệm.
- **Fluoxetin** (`fluoxBlockReasons`, bác sĩ đặt 2026-10-26) → chặn khi: rối loạn / lo ngại tình dục (`sexualConcern`); mất ngủ (`insomnia`: ICD G47.0 / F51.0, chẩn đoán ghi "mất ngủ", hoặc bệnh sử / lý do khám / tiền sử ghi "mất ngủ", "khó ngủ" không phủ định); động kinh theo ICD / chữ. Buồn nôn, tiêu chảy và ô tích động kinh đã chặn chung SSRI. Mục "Rối loạn giấc ngủ" trong bảng kiểm trầm cảm KHÔNG tính là mất ngủ.
- **Olanzapin** (bác sĩ đặt 2026-10-26) → chặn khi QT kéo dài (`qt_long`: ô hồ sơ hoặc điện tim mô tả QTc dài) hoặc hạ huyết áp tư thế (`orthostatic`: ICD I95.1, chẩn đoán ghi, hoặc tiền sử / bệnh sử ghi "hạ huyết áp tư thế" không phủ định).
- **Đang cho con bú → chặn toàn bộ nhóm thần kinh – tâm thần** (bác sĩ đặt 2026-10-27; `breastfeeding`: ô hồ sơ, hoặc tiền sử / bệnh sử ghi "cho con bú", "đang cho bú", "nuôi con bằng sữa mẹ"). Fluoxetin giữ lý do riêng.
- **Mang thai → chặn toàn bộ nhóm thần kinh – tâm thần** (`d.g === 'neuro'`, gồm cả gabapentin, ức chế cholinesterase — bác sĩ chọn 2026-10-27). Nhận mang thai bằng `pregnancyReason` (ô hồ sơ, tiền sử / bệnh sử ghi "mang thai" trừ "đã / từng mang thai", β-hCG > 5 trong 280 ngày). Valproat, carbamazepin, paroxetin giữ lý do dị tật riêng.
- **Sertralin, fluvoxamin — cảnh báo giảm ½ liều** (`halfDoseReasons`, bác sĩ đặt 2026-10-27; mức 2, kind `'Liều (quy tắc phòng khám)'`, KHÔNG chặn): chẩn đoán ICD trầm cảm (`DEP_ICD`: F32.x, F33.x, F34 / F34.1, F41.2, F31.3–F31.5) VÀ (bệnh gan mạn / xơ gan HOẶC 6–12 tuổi tính tại ngày khám). Chỉ xét mã ICD, không xét chữ chẩn đoán. Fluvoxamin có trong danh mục từ 2026-10-27 (`fluvo100`, Fluvoxamin 100 mg, nguồn Stahl Prescriber's Guide + liều BYT 2020; giá 15.000 là giá tạm — bác sĩ sửa; tag `cyp1a2_inh` nên chặn agomelatin khi kê cùng).
- **Thang điểm tâm thần trong cận lâm sàng** (2026-10-27): 30 thang thêm vào nhóm "Trắc nghiệm tâm lý" của `LABS` theo các thang được nêu trong thư mục Tâm thần (BYT 2020, LEC1–12, bộ test). Ngưỡng có trong nguồn: PHQ-2 (≥ 3), MADRS (ảnh MDCalc), ISI (LEC2). Ngưỡng ghi "(tham khảo)" lấy theo tác giả gốc của thang, KHÔNG có trong tài liệu — chờ bác sĩ duyệt. Cùng đợt: D-dimer, NT-proBNP, Troponin T-hs (ngưỡng ESC, tuỳ phòng xét nghiệm).
- **Ô "Kết quả" tự diễn giải tổng điểm trắc nghiệm** (2026-10-27): `SCALE_BANDS` (data.js) + `scaleResult` (engine.js) → dòng "Kết quả" ở bước 2 (`LIVE.scale`) và " — kết luận" trên phiếu in. Gồm BDI, Zung SDS/SAS, PHQ-9, PHQ-2, GAD-7, GAD-2, PHQ-4 (lo âu / trầm cảm), MDQ, HCL-32, GDS-15, MMSE, MoCA, PSQI, HAM-D, HAM-A, MADRS, ISI. C-SSRS, MMPI là ô ghi chữ. GAD-7 / GAD-2 / PHQ-4 theo phiếu trong thư mục Tâm thần.
- **Đang dùng rượu → chặn benzodiazepin** (bác sĩ đặt 2026-10-27): ô "Tiền sử bệnh, phẫu thuật, nhập viện" (`p.condNote`) ghi "đang sử dụng / đang dùng / đang uống / đang nghiện rượu" (không phủ định) → không kê thuốc `cls === 'Benzodiazepin'` hoặc tag `bzd`. Cũng chặn khi mục nguy cơ "Rượu bia" ở hồ sơ chọn "Thỉnh thoảng" hoặc "Thường xuyên, nhiều" (`p.risk.alcohol` là `some` / `heavy`; bác sĩ chọn 2026-10-27). Zopiclon không bị chặn.
- **Pregabalin** (bác sĩ đặt 2026-10-27): ô tiền sử (`p.condNote`) ghi "không dung nạp galactose", "thiếu lactase (Lapp)" hoặc "kém hấp thu glucose – galactose" → không kê (viên chứa lactose). Pregabalin có trong danh mục từ 2026-10-27 (`pregab75`, Pregabalin 75 mg, nguồn Stahl; liều theo CrCl do bác sĩ cung cấp: 30–59: 75–300; 15–29: 25–150; < 15: 25–75 mg/ngày — ghi ở `how` và `renal`; giá 10.000 là giá tạm).
- **Propranolol** (`propra40`, thêm 2026-10-27, liều 10–160 mg/ngày theo bác sĩ + BYT 2020): chặn khi bệnh nền `asthma` (hen / COPD), `af` (rung nhĩ / rối loạn nhịp), `heart_failure`, hoặc tiền sử ghi "bệnh mạch ngoại biên nặng".
- **Thuốc không ghi hàm lượng** (2026-10-27, bác sĩ yêu cầu): piracetam, ginkgo biloba, vinpocetin, cholin alfoscerat, nicergolin (nhóm `neuro`), silymarin (`other`); giá 0 — bác sĩ điền; nội dung lâm sàng là thông tin chung (tờ hướng dẫn, FDA, EMA), chờ bác sĩ duyệt.
- **Ô "Tuổi" thay ô "Năm sinh"** (2026-10-27): `AGE()` + `data-t="age"` hiển thị tuổi, lưu vào `birthYear` = năm nay − tuổi (giữ nguyên `ageOf`). **Tuổi < 18 hoặc > 65 → chặn benzodiazepin** (cùng khối quy tắc tuổi với TCA, paroxetin).
- **Bộ chỉ định gộp** (`LAB_PANELS`, 2026-10-27): "Điện giải đồ (Na, K, Clo)" là một ô chọn ở bước 2 (ACT.ordPanel) thêm / bỏ cả 3 dòng `na`, `k`, `cl`; ô chọn riêng của 3 chất bị ẩn; bảng kết quả gom 3 dòng dưới dòng tiêu đề `tr.panel-hdr`. Khoá `na`, `k`, `cl` giữ nguyên nên các quy tắc đọc kali / natri vẫn chạy.
- **Định hướng chẩn đoán rối loạn sự thích ứng** (2026-10-28): nhóm `adj` trong `MENTAL_SX` (sự kiện stress, khởi phát ≤ 1 tháng, đau khổ / suy giảm chức năng, biểu hiện ưu thế) → `psyDx` gợi ý F43.20 (trầm cảm ≤ 4 tuần) / F43.21 (trầm cảm > 4 tuần, ≤ 2 năm) / F43.22 (trầm cảm + lo âu) / F43.23 (lo âu hoặc cảm xúc khác) / F43.24 (hành vi) / F43.25 (cảm xúc + hành vi). Ô loại trừ `stress` cũng tính là có sự kiện. Đủ tiêu chuẩn trầm cảm → ghi "ưu tiên F32". Nguồn: tiêu chuẩn ICD-10 WHO (BYT 2020 và LEC4 chỉ dẫn "chẩn đoán theo ICD-10", không chép tiêu chuẩn) — chờ bác sĩ duyệt.
- **Chẩn đoán phụ có mã ICD** (2026-10-28): bước 3 chia 2 cột — chính (`v.dx.icd`, `v.dx.main`) | phụ (`v.dx.icd2`, `v.dx.secondary`, trước đây gọi "kèm theo"). `dxCodes(v)` trả về cả 2 mã; `ctxOf`, quy tắc F52 (SSRI), cảnh báo ½ liều sertralin / fluvoxamin đọc cả mã phụ. Gợi ý chẩn đoán tâm thần vẫn điền vào mã chính.
- **Định hướng chẩn đoán lo âu khác và rối loạn ăn uống** (2026-10-28): nhóm `panic`, `phob`, `ocd`, `ptsd`, `ed` trong `MENTAL_SX` → `psyDx` gợi ý F41.0, F40.0/F40.1/F40.2, F42.0/F42.1/F42.2 (mã con mới thêm), F43.0, F43.1, F50.0/F50.1, F50.2/F50.3. Chán ăn: BYT 2020 Bài 26 (theo ICD-10), tự nhận BMI ≤ 17,5 từ sinh hiệu / hồ sơ, mức độ BMI theo LEC9. Ăn vô độ: handout LEC9 (ICD-10 F50.2). Hoảng sợ, ám ảnh sợ, ám ảnh nghi thức, stress cấp, PTSD: tiêu chuẩn ICD-10 WHO (BYT 2020 không có bài riêng) — chờ bác sĩ duyệt.
- **Định hướng chẩn đoán rối loạn chức năng tình dục F52** (2026-10-30, nguồn LEC6): nhóm `sex` mở rộng (thêm `sex_aversion`, `sex_nopleasure`, `sex_orgasm`, `sex_vaginismus` — mọi `sex_*` vẫn kích hoạt quy tắc SSRI / paroxetin) và nhóm `sexdx` (`sxg_*`: tiêu chuẩn chung a–d + xu hướng quá mức, KHÔNG tính là triệu chứng cho quy tắc thuốc). `psyDx` gợi ý F52.0, F52.10, F52.11, F52.2–F52.7; "Chưa đủ" khi thiếu tiêu chuẩn chung, có trầm cảm / lo âu (chẩn đoán phân biệt) hoặc đang dùng SSRI/SNRI dài hạn. Thêm ICD F52.10, F52.11, F52.8, F52.9.
- **Rà lại theo sách ICD-10 bản VN (2026-10-30)**: F40, F41.0, F42, F43.0, F43.1, F43.2 đã đối chiếu tiêu chuẩn nghiên cứu tr. 111–121 — PTSD bắt buộc né tránh (C); stress cấp khởi phát ≤ 1 giờ, giảm sau ≤ 8 giờ / ≤ 48 giờ; hoảng sợ ≥ 4 triệu chứng trong cơn, mức độ F41.00 / F41.01; ám ảnh sợ thêm tiêu chuẩn B (`phob_sx`) và loại trừ (`phob_excl`); ám ảnh nghi thức thêm suy giảm chức năng (`ocd_impair`). Khoá cũ `pan_month` bỏ (thay bằng `pan_excl`).
- **Định hướng chẩn đoán đợt 2026-10-30**: nhóm `MENTAL_SX` `dem`, `del`, `slp`, `sud`, `gam`, `cond`, `kid`, `diss` → `psyDx` gợi ý F00.0/F00.1/F01.0/F01.9/F03 (G1–G4), F05.0/F05.1, F51.0/F51.1, F10.1/F10.2/F17.1/F17.2 (F1x.2: ≥ 3/6), F63.0/F63.8, F91.0–F91.3, F90.0/F90.1, F84.0/F84.1, F70–F73 (theo IQ Wechsler ở cận lâm sàng), F98.0/F98.1, F44, F45.0. Nguồn: BYT 2020 (Bài 1, 2, 4, 7, 24, 25, 27–31) và **ICD-10 bản tiếng Việt "tiêu chuẩn chẩn đoán dành cho nghiên cứu"** (`Tâm thần/ICD-10-nghiên-cứu-VN.pdf`, bản scan — trang sách = trang PDF + 27; đọc bằng ảnh trang). Thêm ~70 mã ICD con theo danh sách của sách này.
- **Nguy cơ tim mạch** (2026-10-30, `cvRisk` + thẻ "Nguy cơ tim mạch" ở bước 1, `LIVE.cvrisk`): (1) bảng kiểm VSH/VNHA 2026 Hình 7.2 — tiền THA / độ 1 / độ 2 × yếu tố nguy cơ Bảng 7.1 (tuổi nam ≥ 60 / nữ ≥ 65, giới nam, hút thuốc, LDL ≥ 3,4, HDL < 1,0, gia đình bệnh tim mạch — tự nhận từ ô tiền sử gia đình), tổn thương cơ quan đích (phì đại thất trái trên ECG, ACR 3–30 mg/mmol, eGFR 30–59), CKM giai đoạn 1–2 (BMI ≥ 23 / vòng bụng ≥ 90 nam, ≥ 80 nữ; glucose đói 5,6–6,9 hoặc HbA1c 5,7–6,4; TG ≥ 1,5), CKM ≥ 3 (eGFR < 30), đái tháo đường, bệnh tim mạch xác định; (2) `SCORE2_AP` (data.js) chép từ Hình PL1, 40–69 tuổi, tra theo giới / hút thuốc / tuổi / HATT / non-HDL. PREVENT-CVD chỉ có biểu mẫu trong khuyến cáo, chưa có công thức — app hiện nút mở CAREME / PREVENT / SCORE2 / SCORE2-OP / SCORE2-Diabetes (MDCalc) (`CV_LINKS`, link bác sĩ cung cấp) và tóm tắt sẵn chỉ số cần nhập (cholesterol, HDL đổi mg/dL × 38,67; ACR mg/mmol × 8,84 → mg/g). App không gửi dữ liệu ra ngoài.
- **Phân độ huyết áp** (`bpClass`, 2026-10-30) theo **VNHA 2026 Bảng 3.2**: bình thường < 120/< 80; bình thường cao 120–129 / < 80; tiền THA 130–139 và/hoặc 80–89; THA độ 1 140–159 / 90–99; THA độ 2 ≥ 160 / ≥ 100 (không còn "độ 3"); ghi "tâm thu đơn độc" khi HATT ≥ 140 và HATTr < 90; ≥ 180/110 thêm nhắc đánh giá tổn thương cơ quan đích (Bảng 3.1).
- **Thuốc tăng huyết áp nhóm A, B, C, D** (bác sĩ đặt 2026-10-30; nguồn **Khuyến cáo VSH/VNHA 2026** `Desktop/tim mạch/THA/` — Bảng 10.5 chống chỉ định / thận trọng, Bảng PL5 liều): thêm 15 thuốc (`SEED_ADDED`), tag mới `ccb`, `thiazide`. `htnGroup(d)` → A (acei / arb), B (beta_blocker), C (ccb / dipin, diltiazem, verapamil), D (thiazide / indapamid). `htnBlockReasons` (chặn): A — mang thai / dự định mang thai, hẹp ĐM thận 2 bên / 1 thận; riêng ức chế men chuyển — phù mạch, lọc huyết tương / màng lọc đặc biệt. B — hen / COPD với chẹn beta không chọn lọc, mạch < 50 hoặc nhịp chậm nặng / block nhĩ thất độ 2–3, u tuỷ thượng thận. C không DHP — suy tim. D — mang thai, Na < 130, K < 3 (ngưỡng "rõ rệt" do app đặt — chờ bác sĩ duyệt). `htnCautions` (cảnh báo mức 2, kind "Thận trọng (VNHA 2026)"): hẹp ĐM thận 1 bên, K > 5, đang lọc máu; hen / COPD với chẹn beta chọn lọc, đái tháo đường, mạch 50–59; suy tim / hẹp van ĐMC với DHP; gút, đái tháo đường với thiazid.
- **Tích ô "Động kinh"** ở hồ sơ nền (chỉ ô tích `p.conds`, không tính ICD G40.9 hay chữ "động kinh") → không kê mọi SSRI (`cls === 'SSRI'` hoặc tag `ssri`); SNRI không bị chặn bởi quy tắc này (bác sĩ đặt 2026-10-25).
- **Hút thuốc lá HOẶC béo phì** (`smokeObeseReasons`: hồ sơ "Đang hút" / ghi "hút thuốc" trừ "đã bỏ"; BMI ≥ 25 theo sinh hiệu lần khám hoặc hồ sơ, hoặc ICD E66 / ghi "béo phì") → không kê mirtazapin, paroxetin, olanzapin (bác sĩ đặt 2026-10-25: một trong hai là đủ, ngưỡng BMI 25). Người đã bỏ thuốc không tính.
- **Rối loạn / lo ngại chức năng tình dục** (`sexualConcern`: bệnh nền `sexual_dysf` — ô hồ sơ hoặc ICD F52.x; khám tâm thần nhóm `sex_*`; hoặc tiền sử / bệnh sử ghi "rối loạn (chức năng) tình dục", "rối loạn cương", "xuất tinh sớm", "giảm ham muốn", "lãnh cảm"… không phủ định) → không kê paroxetin (bác sĩ đặt 2026-10-25).
- **Venlafaxin** (bác sĩ đặt 2026-10-25): bệnh nền tăng huyết áp (`htn` trong `ctxOf().conds` — hồ sơ, ICD I10, từ khoá chẩn đoán) → không kê.
- **Tuổi > 65 hoặc < 18 → không kê TCA (amitriptylin, clomipramin, imipramin, nortriptylin, doxepin) và paroxetin** (bác sĩ đặt 2026-10-25): tuổi từ `ctxOf().age`; đúng 65 tuổi chưa chặn.
- **Mang thai → không kê valproat, carbamazepin, paroxetin** (bác sĩ đặt 2026-10-25; `pregnancyReason`): bệnh nền `pregnant`, hoặc tiền sử / bệnh sử / lý do khám ghi "mang thai", "có thai", "có bầu" (bỏ phủ định và "đã / từng mang thai"), hoặc β-hCG mới nhất dương tính / > 5 trong 280 ngày.
- **Fluoxetin** (bác sĩ đặt 2026-10-25): đang cho con bú (bệnh nền `breastfeeding`, hoặc "Tiền sử bệnh…"/bệnh sử ghi "cho con bú", "nuôi con bằng sữa mẹ", bỏ câu phủ định — `breastfeeding()`) → không kê.
- **Carbamazepin** (bác sĩ đặt 2026-10-25): điện tim mới nhất có "block / blốc nhĩ thất", "block AV", "AV block", "BAV" → không kê (`avBlockText`, bỏ câu phủ định; "block nhánh" không tính).
- **eGFR ở bước 2**: mỗi dòng creatinin có dòng `tr.egfr-row` ngay dưới, LIVE `egfr` tính CKD-EPI 2021 (`egfrCKDEPI`) + phân độ KDIGO (`EGFR_LABEL`) + CrCl; phiếu in cũng in dòng riêng.
- `screenList(p)` dùng `SCREEN[].when(c)` và `every` (tháng). Ngày làm gần nhất được tự suy ra từ chỉ định xét nghiệm/nội soi qua `ORDER_TO_SCREEN`. `apptList()` gộp tái khám, nhắc hẹn và sàng lọc đến hạn.

## 5. Mô hình dữ liệu (đã lưu ra file, **đổi tên trường cần viết chuyển đổi**)

**Bệnh nhân** (`benh-nhan/*.json`):
`{id, code:'BN0001', demo?, createdAt, updatedAt, name, sex:'Nam'|'Nữ', dob:'YYYY-MM-DD' | birthYear, phone, job, address, height(cm), weight(kg), waist, activity:'sedentary'|…(ACT_LV), exerciseMin, conds:[CONDS.k], condNote, allergies:[ALLERGY.k], allergyText, noAllergy, meds:[{id, drugId? | text?, grp?, dose, note}], risk:{smoke, packYears, quitYear, alcohol:'no'|'some'|'heavy'}, fam:[FAM_CANCER key], famNote, social, screen:{[SCREEN.id]:{last}}, recalls:[{id,title,due,note,done}], renalManual?:{creat,egfr,date}, visits:[Visit]}`

**Lượt khám** (tạo bằng `newVisitObj(p, kind)`):
`{id, date, kind:'clinic'|'old', place, status:'draft'|'done', reason, hpi, vitals:{sbp,dbp,pulse,temp,spo2,weight,height,waist}, exam, orders:[{id,key(LABS),name,unit,ref,type,value,flag,note}], files:[{id,name,type,size}], dx:{main, icd:'K29.7 – Tên', secondary, disp, note}, rx:[{id, drugId, s,tr,c,t (liều sáng/trưa/chiều/tối), days, how, note}], rxNote, noRx?:{reason:'home'|'none'|'consult'|'other', note} (lý do không kê đơn; `rxGate(v)` chặn sang bước 4 khi có chẩn đoán mà không có thuốc và không có lý do, trừ `kind:'old'`), plan:{followDays, followDate, followReason, returnSigns, notes}, nutrition:{goal,text}, activity:{minutes,joint,text}, rehab:{text}, tcm:{text}, psych:{phq9,gad7,text}, mental:{sx:[MENTAL_SX item key], severe?:bool (bác sĩ xác nhận "một số triệu chứng đặc biệt nặng" — điều kiện để psyDx xếp trầm cảm nặng; có loạn thần thì tự coi là nặng), weeks, impair:'none'|'marked'|'hosp', hist:[MENTAL_HIST key], excl:[MENTAL_EXCL key], text}, print:{reason,dx,labs,rx,ae,plan,ret,diet,act,rehab,tcm,psych,price: bool}}`
`kind:'old'` là hồ sơ cũ nhập lại từ nơi khác.

**Thuốc** (`DRUGS_SEED`, `danh-muc-thuoc.json`):
`{id, n:'Tên + hàm lượng', hc:'hoạt chất', o:'Nội'|'Ngoại', u:'viên', p:giá/đơn vị (VNĐ, giá MẪU), cls:'nhóm (để phát hiện trùng nhóm)', g: key của GROUPS, tags:[TAGS key], dose:[s,tr,c,t], how, ae:'tác dụng phụ hay gặp (in cho BN)', warn:'dấu hiệu cần quay lại', pro, con, renal:[{lt: eGFR, lv, m}], hep:{lv,m}, old:{lv,m}, preg:{lv,m}, lact:{lv,m}, cond:{[cond key]:{lv,m}}}`

**Mẫu tư vấn**: `{id, cat: TPL_CATS key, title, tags:[cond key | 'tag:<drug tag>'], text}`. Tag dùng để gợi ý ★ (`tplMatches`).

**Settings** (`kv` id `settings`): `{clinic, doctor, address, phone, footer, lastBackup, created, demoCleared?}`.

**Bảng tra trong `data.js`**: `LABS` = `[nhóm, key, tên, đơn vị, khoảng tham chiếu, kiểu 'n'|'t']`, `ICD` = `[mã, tên, [cond keys]]`, `RULES` = `{a: tag, b: tag, lv, m}`, `SCREEN` = `{id, t, every(tháng), when(c), how}`.

## 6. Công thức cho các việc hay gặp

- **Thêm thuốc mẫu**: thêm object vào `DRUGS_SEED` với `id` mới, duy nhất, **không bao giờ đổi `id` cũ** (đơn thuốc cũ tham chiếu theo `id`). Gắn đúng `tags` để quy tắc tương tác áp dụng được. Xem lưu ý về seed ở mục 7.
- **Thêm quy tắc tương tác**: thêm `{a, b, lv, m}` vào `RULES`. Nếu cần nhóm mới, thêm key vào `TAGS` (kèm nhãn tiếng Việt), thêm vào `IMPLY` nếu là nhóm con, và gắn tag cho các thuốc liên quan. Viết `m` ngắn, nêu hậu quả và cách xử trí.
- **Thêm bệnh nền**: thêm vào `CONDS` (`{k, t}`), rồi tuỳ trường hợp thêm vào `ICD[...][2]`, `DX_KEYWORDS`, `CHRONIC` (`ui.js`, để tự thêm vào hồ sơ khi chọn ICD), và `drug.cond`.
- **Thêm xét nghiệm**: thêm vào `LABS`. Nếu xét nghiệm đó dùng làm ngày sàng lọc, thêm vào `ORDER_TO_SCREEN`.
- **Thêm trường cho bệnh nhân/lượt khám**: thêm control `data-b="p.xxx"` hoặc `v.xxx`. Lượt khám mới thì đặt mặc định trong `newVisitObj`. Code đọc trường phải **chịu được `undefined`** vì hồ sơ cũ không có trường đó. Chuẩn hoá thêm trong `loadAll()` nếu cần. Nếu trường cần in, sửa `sheetHTML()` và `PRINT_OPTS`.
- **Thêm màn hình**: viết `viewXxx()`, thêm nhánh vào `renderMain()`, và thêm vào `NAV` nếu cần mục menu.
- **Thêm nút**: `<button data-act="tenHanhDong" data-id="…">` và `ACT.tenHanhDong = (el, e) => {…}`.
- **Đổi giao diện phiếu in**: `sheetHTML()` và CSS trong `@media print` / `#printRoot`. Kiểm tra bằng Playwright `page.pdf()` khổ A4.

## 7. Cạm bẫy đã biết, đọc kỹ

1. **Seed chỉ chạy lần đầu.** `DRUGS_SEED` và `TEMPLATES_SEED` chỉ được ghi vào dữ liệu khi thư mục còn trống (`seedAll`). Sửa `data.js` **không** cập nhật danh mục của bác sĩ đang dùng. Nút "Khôi phục danh mục mẫu" (`ACT.drugReset`) **ghi đè các thuốc mẫu cùng `id`**, làm mất giá bác sĩ đã sửa. Muốn phát hành thuốc hoặc quy tắc mới cho người đang dùng, cần viết bước chuyển đổi trong `loadAll()`: chỉ thêm `id` chưa có, không ghi đè. Cơ chế đã có sẵn (`ui.js`): thêm `id` vào `SEED_ADDED` → `addNewSeedDrugs()` thêm mỗi thuốc đúng một lần (nhớ ở `settings.seedAdded`, thuốc bác sĩ đã xoá không thêm lại). Sửa **nội dung lâm sàng** thuốc mẫu đã phát hành: thêm đợt `{ver, ids}` vào `SEED_UPDATES` → `updateSeedDrugs()` chép lại các trường `SEED_CLIN` một lần (nhớ ở `settings.seedUpdated`), không đụng tên, giá, đơn vị. Mẫu lời dặn / tư vấn mới: thêm `id` vào `TPL_ADDED` → `addNewSeedTpls()` (nhớ ở `settings.tplAdded`); đã có `adv_psych` ("Tâm bệnh", bác sĩ soạn 2026-10-27). Sửa nội dung mẫu đã phát hành: thêm `{ver, id, from, to}` vào `TPL_UPDATES` → `updateSeedTpls()` thay đoạn một lần (nhớ ở `settings.tplUpdated`), bỏ qua nếu bác sĩ đã sửa đoạn đó. Riêng `RULES`, `TAGS`, `ICD`, `LABS`, `SCREEN` nằm trong code nên có hiệu lực ngay sau khi build.
2. **Không đổi tên trường đã lưu** và không đổi `id` của thuốc, mẫu hay bệnh nhân. Dữ liệu thật đang ở dạng file JSON trên máy bác sĩ.
3. **Ngày là chuỗi `YYYY-MM-DD` theo giờ địa phương.** Dùng `todayISO`, `addDays`, `addMonths`, `daysBetween`, `parseISO`. Không dùng `new Date('YYYY-MM-DD')` vì nó parse theo UTC và lệch ngày ở múi giờ +07.
4. **Số kiểu Việt Nam**: người dùng gõ dấu phẩy thập phân, nên luôn đọc qua `num()`. Hiển thị qua `fmtN()` hoặc `money()` (định dạng vi-VN).
5. **Focus khi gõ**: xem mục 4.3. Không gọi `renderMain()` trong luồng `input`.
6. **Lưu hồ sơ**: sau khi sửa object bệnh nhân bằng code, gọi `savePatient(p)`. Hàm này debounce, và `go()`/`pagehide` gọi `flushSaves()`. Danh mục thuốc và mẫu thì gọi `Store.put('drugs'|'templates', obj)` trực tiếp.
7. **File System Access**: chỉ có trên Chromium. `requestPermission`/`showDirectoryPicker` **bắt buộc** gọi từ thao tác của người dùng (click). Handle lưu được trong IndexedDB nhưng phải xin quyền lại sau mỗi lần mở trình duyệt, trừ khi người dùng chọn "Cho phép mỗi lần truy cập". Thư mục bị đổi tên hoặc di chuyển thì handle hỏng → màn hình "Chọn thư mục khác".
8. **Một tab duy nhất**: hai tab cùng ghi sẽ đè nhau, bên ghi sau thắng. Đừng giả định có đồng bộ giữa các tab.
9. **Ca mẫu** (`demoPatient()`, `id 'p_demoA'`, `demo:true`) dùng để demo và test. Smoke test dựa vào nó, nên giữ nguyên `id` và cấu trúc.
10. **Giá thuốc trong seed là giá MẪU.** Đừng trình bày như giá thật.
11. **Trình duyệt ở Việt Nam**: tên file có dấu được giữ nguyên trong `tep-dinh-kem`. Tên file bệnh nhân dùng `slugName()` (không dấu). Không dùng các ký tự `\/:*?"<>|`, đã có `safeFile()` lo.

## 8. Quy ước code

- JS thuần ES2020+, 2 dấu cách thụt lề, nháy đơn, có dấu chấm phẩy. Hàm ngắn có thể viết trên một dòng (giữ phong cách hiện có). Chú thích bằng tiếng Việt.
- Chia mục bằng tiêu đề `// ================= TÊN MỤC =================`. Đặt code mới vào đúng mục.
- Không thêm thư viện. Nếu thật sự cần (ví dụ mã hoá), dùng Web Crypto có sẵn trong trình duyệt.
- CSS: dùng các lớp sẵn có (`card`, `btn pri|sm|xs|ghost|danger`, `chip ok|r1|r2|r3`, `banner info`, `g2`, `row`, `stack`, `small`, `muted`, `tiny`). Grid dùng `minmax(0,1fr)` để không tràn. Màn hình ≤820px có sidebar dạng ngăn kéo.
- Ưu tiên sửa nhỏ, đúng chỗ. Không viết lại cả file khi chỉ cần sửa vài dòng.

## 9. Bảo mật và quyền riêng tư

- **Không đọc, không sao chép, không đưa `du-lieu/` vào git hay vào prompt.** Để test, dùng ca mẫu hoặc dữ liệu giả.
- Khi chuyển dự án cho người khác, **chỉ chuyển `ma-nguon/`** (và `Ho-so-benh-nhan.html`), không chuyển `du-lieu/`.
- Đã có `.gitignore` chặn `du-lieu/`, `*.json` sao lưu và thư mục build.
- Hướng nâng cấp đã bàn với bác sĩ nhưng chưa làm: khoá app bằng mật khẩu và mã hoá file dữ liệu/sao lưu bằng AES-GCM (Web Crypto, khoá dẫn xuất từ mật khẩu bằng PBKDF2). Nếu làm, phải có cảnh báo rõ rằng **quên mật khẩu là mất dữ liệu**, và phải giữ đường chuyển đổi cho dữ liệu chưa mã hoá.

## 10. Phối hợp nhiều AI agent (Claude + Gemini)

**Antigravity (từ 2026-10-24, thay Gemini CLI cho việc tổng hợp thông tin):** không được động vào thư mục này. Claude viết phiếu giao việc trong `C:\Users\admin\Desktop\Giao-viec-Antigravity\phieu\` (theo `_MAU-PHIEU.md`), bác sĩ giao cho Antigravity, Antigravity ghi kết quả vào `...\ket-qua\`, Claude đối chiếu nguồn (mốc thời gian video, số trang) trước khi đưa bất cứ gì vào app; bác sĩ duyệt. Quy tắc cho Antigravity nằm ở `Giao-viec-Antigravity\AGENTS.md`. Đánh số phiếu PGV-001, 002… và ghi vào NHAT-KY.md.

Gemini CLI (cũ) dùng chung thư mục này với Claude: `CLAUDE.md` và `GEMINI.md` đều chỉ trỏ về file này — **mọi quy ước chung đặt ở AGENTS.md**, không viết riêng vào hai file kia.

**Phân công mặc định**
- **Gemini – tác vụ cơ bản, theo công thức mục 6:** thêm/sửa thuốc trong `DRUGS_SEED` (kèm `SEED_ADDED`/`SEED_UPDATES`), thêm mã ICD, xét nghiệm (`LABS`), mẫu tư vấn; sửa chữ, nhãn, câu thông báo trên giao diện; chỉnh CSS nhỏ; chạy build + smoke test; trích nội dung từ tài liệu nguồn (`TAI-LIEU.md`) ra bảng cho bác sĩ duyệt.
- **Claude – phần phức tạp:** lưu trữ (`Store`, bản sao, hàng chờ, quyền thư mục), luồng khởi động, logic lâm sàng nhiều bước (`checkAll`, `psyDx`, `rxGate`, `nutriCalc`), quy tắc tương tác, đối chiếu nguồn y khoa, thay đổi mô hình dữ liệu.
- Việc nằm giữa hai nhóm: agent nào nhận thì làm, nhưng ghi rõ vào `NHAT-KY.md`.

**Quy tắc bắt buộc khi phối hợp**
1. **Một agent sửa code tại một thời điểm.** Không chạy hai agent cùng lúc trên cùng file (đã từng mất Gaviscon và `addNewSeedDrugs` khi gộp thư mục). `ma-nguon/` là kho **git** (nhánh `main`): bắt đầu việc với cây làm việc sạch (`git status`), xong việc và test đạt thì **commit** với lời nhắn tiếng Việt ghi tên agent, vd. `[Gemini] Thêm mã ICD F43.x`. Remote `origin` = https://github.com/nvtoan672001-sys/BS-TOAN (**CÔNG KHAI** — bác sĩ chọn để công khai, 2026-10-24). Chỉ `push` khi bác sĩ yêu cầu; trước khi push kiểm tra không có dữ liệu bệnh nhân, khóa API, mật khẩu (`du-lieu/` nằm ngoài kho và đã bị `.gitignore` chặn). Hỏng thì xem `git diff`/`git log` để quay lại.
2. **Trước khi bắt đầu:** đọc 20 dòng cuối `NHAT-KY.md` để biết agent kia vừa làm gì; kiểm tra tính năng mình định sửa còn đúng như mô tả ở đây.
3. **Sau khi xong:** `python build.py` + `python kiem-thu/smoke_test.py` phải đạt; thêm một mục vào `NHAT-KY.md` (ngày, agent, việc đã làm, file đã sửa, việc còn dở); cập nhật AGENTS.md nếu đổi kiến trúc/quy ước/mô hình dữ liệu.
4. **Nội dung y khoa:** ghi nguồn ngay trong lời cảnh báo; khi các nguồn mâu thuẫn, **ưu tiên khuyến cáo mới hơn** (bác sĩ đã chốt); luôn để bác sĩ duyệt. Câu trả lời tóm tắt của NotebookLM/Gemini Notebook không phải nguồn trích.
5. **Không đọc, không gửi `du-lieu/`** (dữ liệu bệnh nhân thật) cho bất kỳ agent hay dịch vụ nào — kể cả để "kiểm tra lỗi".
6. Python không có trên PATH của shell: dùng `%LOCALAPPDATA%\Programs\Python\Python312\python.exe`.

## 11. Thuật ngữ

| Tiếng Việt trong code/UI | Nghĩa |
|---|---|
| lượt khám (visit), hồ sơ cũ (`kind:'old'`) | một lần khám; lần khám ở nơi khác nhập lại |
| chỉ định / cận lâm sàng (`orders`) | xét nghiệm, chẩn đoán hình ảnh |
| đơn thuốc (`rx`), thuốc dài hạn (`meds`) | đơn của lượt khám; thuốc bệnh nhân đang dùng thường xuyên |
| tái khám, nhắc hẹn (`recalls`), sàng lọc (`SCREEN`) | follow-up; hẹn dài hạn (ví dụ nội soi sau 3 năm); screening |
| nội / ngoại (`o`) | thuốc sản xuất trong nước / nhập khẩu |
| bệnh nền (`conds`) | bệnh mạn tính, tình trạng đặc biệt |
| PHCN, YHCT | phục hồi chức năng, y học cổ truyền |
| phiếu (`sheetHTML`) | tờ A4 in cho bệnh nhân |
