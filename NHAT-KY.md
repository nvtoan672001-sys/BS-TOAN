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
