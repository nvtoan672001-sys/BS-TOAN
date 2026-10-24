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
