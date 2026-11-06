# Nhật ký thay đổi (dùng chung cho Claude và Gemini)

Mỗi lần làm xong, thêm một mục ở **cuối file**: ngày · agent · việc đã làm · file đã sửa · việc còn dở / cần bác sĩ duyệt.
Đọc các mục cuối trước khi bắt đầu việc mới. Quy tắc phối hợp: AGENTS.md mục 10.

---

## 2026-10-22 → 2026-10-24 · Claude
- `build.py` dựng lại (bản hiện tại là của bác sĩ, in "Đã ghi … byte"). Python 3.12 + Playwright đã cài.
- Thuốc: Gaviscon (`gavis10`); 44 thuốc tâm thần theo BYT 2020 (`SEED_ADDED`), đối chiếu Stahl 2004 rồi thay phần lỗi thời bằng khuyến cáo mới (LactMed, EMA 2018) qua `SEED_UPDATES` (`stahl-2026-10`, `moi-2026-10`). Tag + quy tắc tương tác mới cho thuốc tâm thần (`cns_dep`, `cyp2d6_*`, `inducer`, `valproate`, `lamotrigine`, `hyponat`, `ache_inh`…).
- ICD: F30–F38, F31.x, F33.x, F41.2 và 72 mã tâm thần bổ sung (lo âu, stress, nhận thức, giấc ngủ, tình dục, trẻ em, ăn uống, hành vi, rượu, thuốc lá, nghiện hành vi). Bệnh nền mới: `bipolar`, `dementia`, `parkinson`.
- Cận lâm sàng: FT4, β-hCG, nhóm "Trắc nghiệm tâm lý" (20 thang).
- Khám tâm thần (bước 1, `v.mental`) + gợi ý chẩn đoán `psyDx()` (bước 3) theo BYT 2020 Bài 18–23.
- Đơn thuốc: lọc ô tìm thuốc theo nhóm (`S.rxG`); mục "Không kê đơn" (`v.noRx`) + `rxGate()` chặn sang bước 4 khi có chẩn đoán mà không có thuốc.
- Lưu trữ: bản sao IndexedDB + hàng chờ → app mở ngay khi chưa có quyền thư mục (`startPending`, `connectPending`, `Store.mirrorAll/syncPending`). Xử lý Cốc Cốc báo sai quyền (`canWrite`), cảnh báo Opera.
- Tài liệu: `TAI-LIEU.md` (nguồn y khoa: `Desktop\Tâm thần`, notebook "Tâm thần"), AGENTS.md cập nhật.
- **Cần bác sĩ duyệt:** ngưỡng điểm trắc nghiệm, quy tắc `psyDx` (F30.0, trầm cảm nặng, F41.1 ≥ 26 tuần), nội dung cảnh báo 44 thuốc tâm thần, tên tiếng Việt các mã ICD mới. Diazepam, amitriptylin (thuốc cũ) chưa được cập nhật vào danh mục bác sĩ đang dùng.
- **Việc có thể giao Gemini:** đợt 2 gợi ý chẩn đoán cần Claude; Gemini có thể làm bảng duyệt (Excel/Markdown) 44 thuốc tâm thần và các mã ICD mới để bác sĩ đánh dấu.

## 2026-10-24 · Claude
- Cài git, khởi tạo kho `ma-nguon` (nhánh `main`). Cài Gemini CLI (bác sĩ tự cài, xác thực bằng `GEMINI_API_KEY` — đăng nhập Google cá nhân không còn được hỗ trợ). Gọi không tương tác: `gemini.cmd --approval-mode auto_edit -p "<việc>"` (PowerShell chặn `.ps1`, dùng `.cmd`).
- Đã giao Gemini lập bảng duyệt nhưng thất bại (máy chủ 503, "fetch failed"), Gemini không sửa file nào. Claude tự xuất bảng bằng script: `BS-TOAN\bang-duyet\thuoc-tam-than.csv` (44 thuốc), `icd-tam-than-moi.csv` (66 mã nhóm "Tâm thần bổ sung"). Bảng nằm ngoài kho git.
- Sửa số liệu: đợt mã ICD tâm thần bổ sung là **66 mã** (trước đó báo nhầm 72).
- Chuyển việc tổng hợp thông tin sang **Antigravity**, cách ly khỏi codebase: thư mục `Desktop\Giao-viec-Antigravity\` (AGENTS.md quy tắc, `phieu/`, `ket-qua/`, `tai-lieu-dau-vao/`, HUONG-DAN-BAC-SI.md). Chưa có phiếu nào; phiếu đầu tiên sẽ là PGV-001.
- PGV-001 (2026-10-24): tóm tắt record ĐTĐ ver 2 (`dtd ver 2.mp4`, `đtđ ver 2.mp4` trong thư mục iTop Screen Recorder\Videos). Trạng thái: CHỜ LÀM.
- PGV-001 Antigravity nộp `ket-qua/PGV-001-tom-tat-record-dtd-ver2.md`. Claude kiểm tra (cắt khung hình video tại mốc agent ghi + đối chiếu docx): **ĐẠT CÓ ĐIỀU KIỆN ≈ 8/10**. Đúng: số liệu thử nghiệm SGLT2i [14:40], lịch sàng lọc biến chứng + IWGDF [26:48], ADA 2026 HA [01:42:32]. Sai: gộp ESC/EASD 2019 thành ESC 2024; mốc LDL-C [02:06:16] thực tế là slide dự phòng tiên phát (LDL < 1,8 mmol/L) bị bỏ sót; nhiều mốc [00:00] không xác minh được. Đánh giá chi tiết: `Giao-viec-Antigravity\danh-gia\PGV-001-danh-gia-claude.md`. Chưa đưa gì vào app.
- PGV-002 (2026-10-24): Antigravity sửa 4 điểm của PGV-001 (tách ESC cũ/2024, đích LDL-C + mốc, thay mốc [00:00], kiểm lại số liệu chưa chắc). Kết quả: `ket-qua/PGV-002-sua-loi-PGV-001.md`. Trạng thái: CHỜ LÀM.

## 2026-11-05 · Claude
- Bệnh nền mới `vestibular` "Rối loạn tiền đình" (ô tích ở tiền sử + từ khoá chẩn đoán).
- Thuốc mới `pirac400` Piracetam 400 mg (2-2-0-2), ô cách dùng có `howOpts` → chọn "Tự ghi (để trống)" hoặc "Dùng mỗi lần 2 viên, ngày 3 lần sau ăn sáng, trưa, tối". Lưu ý chỉnh liều theo Clcr (50–79: 2/3; 30–49: 1/3; 20–29: 1/6) — áp cho cả `piracetam` cũ (đợt `piracetam-2026-11-05`).
- Chặn kê piracetam (`drugBlockReasons`): CrCl < 20; tiền sử ghi xơ gan / đột quỵ; mang thai; cho con bú (đã có quy tắc nhóm thần kinh); rối loạn tiền đình. File: data.js, engine.js, ui.js, kiem-thu/smoke_test.py.
- Bệnh nền mới `pad` "Bệnh mạch ngoại biên" (ô tích ở tiền sử + từ khoá chẩn đoán "bệnh (động) mạch ngoại biên", "bệnh động mạch chi dưới"). Chưa dùng trong luật nào; quy tắc propranolol vẫn chỉ chặn khi tiền sử ghi "bệnh mạch ngoại biên nặng". Thêm kiểm thử chặn kê piracetam (tiền đình, xơ gan, đột quỵ, mang thai, howOpts, mức Clcr).
- Methylphenidat (bác sĩ đặt): `mph5` Ritalin 5 mg phóng thích nhanh (1-1-0-0), `mph18er` Concerta 18 mg, `mph20la` Ritalin LA 20 mg (1-0-0-0); thuốc Ngoại, giá 0 (chờ bác sĩ). Mỗi thuốc có `howOpts` (tự ghi / câu soạn sẵn — Ritalin 5 mg: bác sĩ chọn "ngày 2 lần sau ăn sáng, trưa") và trường mới `dnote` → cảnh báo "Liều (quy tắc phòng khám)" ở đơn thuốc. Chặn kê: tiền sử THA, rối loạn nhịp, động kinh, bệnh mạch ngoại biên, glôcôm góc đóng (ô tích hoặc chữ), tic, chóng mặt (chữ trong ô tiền sử).
- Bệnh nền mới `malnutrition` "Suy dinh dưỡng" (ô tích + từ khoá). Thuốc mới `atomox` Atomoxetin (Ngoại, 1-0-0-0, chưa ghi hàm lượng, ô cách dùng để trống theo bác sĩ), `dnote` = lưu ý liều theo cân nặng và xơ gan của bác sĩ. Chặn kê: tiền sử glôcôm góc đóng, u tuỷ thượng thận (chữ), THA, rối loạn nhịp, suy dinh dưỡng, phì đại tiền liệt tuyến, rối loạn tiền đình (ô tích hoặc chữ); mang thai, cho con bú (quy tắc nhóm thần kinh).
- Thuốc mới `clon025` Clonidin 0,025 mg (Ngoại, 1-0-0-1, tag `cns_dep`), `howOpts` "ngày 2 lần sau ăn sáng, tối", `dnote` "trung bình 0,1–0,25 mg/ngày, tăng 0,025–0,05 mg mỗi 3–7 ngày". Chặn kê: tiền sử glôcôm góc đóng, u tuỷ thượng thận, THA, rối loạn nhịp, rối loạn tiền đình (ô tích hoặc chữ), xơ gan (chữ); mang thai, cho con bú (quy tắc nhóm thần kinh).
- Mẫu lời dặn mới `adv_child_psy` "Rối loạn tâm thần trẻ em" (văn bản của bác sĩ, thêm dấu chấm sau "aerobic nhẹ" và xuống dòng theo từng phần) — gợi ý khi chẩn đoán có mã F70–F98 (cond mới `child_psy` gắn vào 69 dòng ICD, nhãn ở `COND_EXTRA`). Thêm vào `TPL_ADDED`.
- Mẫu lời dặn mới `adv_asd` "Tự kỷ" (văn bản của bác sĩ) — gợi ý khi chẩn đoán có mã F84.x (cond mới `asd` gắn vào 8 dòng ICD F84). Mẫu chung `adv_child_psy` vẫn gợi ý kèm.
- Mẫu lời dặn mới `adv_stutter` "Nói lắp" (văn bản của bác sĩ, thêm dấu chấm cuối) — gợi ý khi chẩn đoán có mã F98.5 (cond mới `stutter`).
- Mẫu `adv_child_psy` bổ sung đoạn cuối "Theo dõi phát triển … Tái khám sau 2 tuần." (bác sĩ gửi); bản đã cài được thêm một lần qua `TPL_UPDATES` (`tre-em-theo-doi-2026-11-05`, bỏ qua nếu bác sĩ đã sửa đoạn cuối).
- Rối loạn nhận thức (F00–F06.7) viết lại theo ICD-10 bản VN tr. 47–62 + ICD-11 6D70–6D86: nhóm `dem` (G1–G4, mức độ = chữ số 6, triệu chứng phụ = chữ số 5, F00 B + F00.0 / F00.1 / F00.2 / F00.9, F01 G2–G4 + F01.0–F01.3 / F01.9, F02.0–F02.4, F02.8, F03), nhóm `del` ghi A–F, nhóm mới `amn` (F04) và `mci` (F06.70 / F06.71). Thêm ICD F02.8, F06.70, F06.71; `ICD11_MAP` thêm F00.0–F00.2, F02.0–F02.8, F04, F06.7. Khoá `dem_slow` đổi nghĩa (chỉ "từ từ, tiến triển rất chậm"; loại trừ nguyên nhân khác thành `dem_ad_excl`) — hồ sơ cũ sẽ hiện "Chưa có: B. Không có bằng chứng…".

## 2026-11-06 · Claude
- Cờ đỏ Alzheimer (bác sĩ cung cấp): 10 mục `ad_rf1`–`ad_rf10` đầu phần F00 của nhóm `dem` → `psyDx` cảnh báo mức 3 "Cờ đỏ Alzheimer" (không tự gợi ý mã), nhắc MMSE / MoCA, đánh giá G1–G4, loại trừ nguyên nhân điều trị được.
- Diễn giải MMSE (bác sĩ đặt): `SCALE_BANDS.mmse` = Bình thường (24–30) / Nhẹ (19–23) / Vừa (10–18) / Nặng (< 10) — bác sĩ sửa lại cùng ngày; khoảng tham chiếu trong `LABS` sửa theo. Rối loạn nhận thức nhẹ F06.7 vẫn tính "trắc nghiệm bất thường" khi MMSE < 24.
