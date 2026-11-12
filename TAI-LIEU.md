# Nguồn tài liệu y khoa dùng cho app

Mọi quy tắc lâm sàng trong `data.js` / `engine.js` phải trích từ một nguồn ở đây (hoặc nguồn chính thức khác ghi rõ tên) và được bác sĩ duyệt. App vẫn chạy offline: nội dung được chép vào code kèm ghi nguồn, app không gọi tới tài liệu khi chạy.

## Tâm thần — `C:\Users\admin\Desktop\Tâm thần\`

| Tài liệu | Vai trò | Đã dùng cho |
|---|---|---|
| `BYT tâm thần 2020.pdf` — *Hướng dẫn chẩn đoán và điều trị một số rối loạn tâm thần thường gặp*, QĐ 2058/QĐ-BYT ngày 14/5/2020, 198 trang, 35 bài (trích chữ được) | **Nguồn chính** (văn bản chính thức) | Bài 18–23: `MENTAL_SX`, `psyDx()` — F30, F31, F32, F33, F41.1, F41.2. Danh sách hoạt chất + khoảng liều (trong `how`) của 44 thuốc tâm thần bổ sung vào `DRUGS_SEED` (2026-10); HLA-B*1502 trước carbamazepin (Bài 18, 19) |

Thuốc tâm thần: **hoạt chất và liều** lấy từ BYT 2020; **tương tác, chống chỉ định, chỉnh liều thận/gan, tác dụng phụ** soạn theo Dược thư Quốc gia VN, tờ HDSD và tiêu chí Beers, rồi **đã đối chiếu với Stahl's Prescriber's Guide** (`Desktop\Tâm thần\Essential Psychopharmacology Prescribers Guide - Stephen M Stahl.pdf`, bản 2004) — các mục sửa theo Stahl ghi "(Stahl)" ngay trong lời cảnh báo. Stahl không có bromazepam, etifoxin: hai thuốc này vẫn theo HDSD. Cần bác sĩ duyệt.

**Quy tắc bác sĩ đã chốt: khi nguồn mâu thuẫn, ưu tiên khuyến cáo MỚI HƠN.** Sách Stahl trên máy là bản 2004, nên các mục sau đã thay bằng khuyến cáo mới (ghi tên nguồn trong lời cảnh báo): cho con bú theo **LactMed (NIH)**; valproat ở phụ nữ có khả năng mang thai theo **EMA 2018**; lamotrigin, SSRI khi mang thai theo dữ liệu sổ đăng ký thai kỳ / nhãn hiện hành; galantamin theo CrCl và zopiclon theo **SmPC hiện hành**. Các mục này soạn từ kiến thức về khuyến cáo, chưa có file gốc trên máy để trích nguyên văn. Giá là **giá mẫu**. Đã bỏ các thuốc ít dùng ở phòng khám nội: clozapin, chlorpromazin, levomepromazin, haloperidol, thuốc tiêm tác dụng kéo dài, citalopram, fluvoxamin, clomipramin, bupropion, nhóm dinh dưỡng não, thuốc cai nghiện/trẻ em/động kinh.
| `LEC1…LEC11-*` (bài giảng, handout, EPA, ca lâm sàng: nhận thức, giấc ngủ, stress, cảm xúc, tình dục, trẻ em, sử dụng chất, ăn uống, loạn thần, hành vi) | Bổ sung: câu hỏi khám, chẩn đoán phân biệt | Chưa dùng |
| `CBA8 - Tự gây thương tích` | Bổ sung: đánh giá nguy cơ tự sát | Chưa dùng |
| `a test trắc nghiệm tâm lý` (Beck, DASS, MMSE, PSQI, Zung dạng PDF; "Test ở BM-01…18" là ảnh chụp) | Thang điểm trắc nghiệm | Ngưỡng điểm trong `LABS` nhóm "Trắc nghiệm tâm lý" hiện theo bản gốc thông dụng — cần đối chiếu |
| `Bệnh án` (mẫu bệnh án tâm thần HMU, loạn thần, RL cảm xúc, giấc ngủ, sa sút trí tuệ) | Cấu trúc khám tâm thần | Chưa dùng |

### Notebook "Tâm thần" (Gemini Notebook / NotebookLM của bác sĩ)
`https://notebooklm.google.com/notebook/9c64b2c3-c60b-4a89-ac89-750319d11f78` — cần bác sĩ tự đăng nhập Google trong khung trình duyệt. 26 nguồn, phần lớn trùng với thư mục trên máy (BYT 2020, handout, slide LEC1–11, Rối loạn cảm xúc.docx, rối loạn giấc ngủ.docx…), **thêm**:
- *Stahl's Essential Psychopharmacology – Prescriber's Guide* (Stephen M. Stahl) — nguồn tốt nhất hiện có cho liều, tương tác, chỉnh liều thận/gan, thai kỳ của thuốc tâm thần.
- *Stahl's Essential Psychopharmacology: Neuroscientific Basis and Practical Applications*.
- Ghi chú "Rối loạn khí sắc" (bác sĩ tự viết trong notebook).

Câu trả lời trò chuyện của notebook là tóm tắt AI, **không dùng làm nguồn trích** cho quy tắc lâm sàng; đối chiếu nguyên văn trong file gốc.

**Vai trò (bác sĩ chốt 2026-10-24):** NotebookLM chỉ cung cấp **dữ kiện** — không giao ca để nó chẩn đoán. Claude lập luận chẩn đoán và hỏi NotebookLM câu hẹp ("nguyên văn tiêu chuẩn …", "liều … theo nguồn nào"); số liệu không nằm trong `cited_text` coi như chưa có nguồn. Đã kết nối qua MCP `notebooklm` (`BS-TOAN\.mcp.json`).

### Mã ICD tâm thần (2026-10-24)
72 mã bổ sung trong `ICD` (`data.js`, mục "Tâm thần bổ sung"). Mã có ghi sẵn trong tài liệu: F04–F07 (BYT Bài 5–6), F41.0, F43.x, F44, F45.x (LEC4, CBA3), F50.x (LEC9), F51.x, G47 (LEC2), F52.x (LEC6), F70–F73, F98.x (BYT Bài 28–33). Bài học có nhưng **không ghi mã**, dùng mã chuẩn ICD-10 tương ứng: sa sút trí tuệ F00–F03 (Bài 1–3), sảng F05 (Bài 4), rượu F10.x (Bài 7), thuốc lá F17.x và cờ bạc/nghiện hành vi F63.x (LEC8), F40.x, F42 (LEC4), tự kỷ F84.0 (Bài 29), ADHD F90.0 (Bài 30), nói lắp F98.5 (Bài 34), rối loạn cư xử, thách thức chống đối, rối loạn bùng nổ từng cơn, nhân cách chống đối xã hội (LEC11). ICD-10 không có mã riêng cho nghiện trò chơi điện tử (chỉ có ở ICD-11: 6C51) nên dùng F63.8.

Mục lục BYT 2020: Bài 1–3 sa sút trí tuệ · 4 sảng · 5–6 do tổn thương não · 7–12 rượu, chất · 13–17 loạn thần · 18–21 khí sắc · 22–23 lo âu · 24 phân ly · 25 cơ thể hoá · 26 chán ăn · 27 mất ngủ không thực tổn · 28 chậm phát triển · 29–34 trẻ em · 35 động kinh.

Đợt tiếp theo đã bàn với bác sĩ: mất ngủ (Bài 27), sa sút trí tuệ (Bài 1–3, MMSE/MoCA), rối loạn do rượu (Bài 7).

## ICD-11 (2026-11-03)

`Tâm thần/ICD-11.pdf` — WHO 2024, *Clinical descriptions and diagnostic requirements for ICD-11 mental, behavioural and neurodevelopmental disorders* (852 trang, có lớp chữ, trích bằng pypdf). Dùng mục "Essential (required) features" cho `ICD11_MAP` (data.js) và các ghi chú ICD-11 trong `psyDx`. `Tâm thần/ICD-10.pdf` — bản tiếng Anh ICD-10 *Diagnostic criteria for research* (WHO, bản scan nén CCITT, đọc bằng ảnh trang); nội dung trùng `ICD-10-nghiên-cứu-VN.pdf` nên app trích dẫn theo bản tiếng Việt.

## Trẻ em – vị thành niên (2026-11-03)

LEC7 (`Tâm thần/LEC7…`) chỉ nêu đại cương và ghi chẩn đoán theo ICD-10 / DSM-5, không có tiêu chuẩn từng bệnh. Tiêu chuẩn lấy từ `ICD-10-nghiên-cứu-VN.pdf` tr. 162–191 (F80–F98) và BYT 2020 Bài 28–34; mã ICD-11 từ `ICD-11.pdf`.

ADHD và chậm phát triển tâm thần (2026-11-04): ADHD theo BYT 2020 Bài 30 tr. 166–167 (5 tiêu chuẩn ICD-10: 9 / 5 / 4 triệu chứng, trước 7 tuổi, nhiều hoàn cảnh, suy giảm chức năng, loại trừ F84 – hưng cảm – trầm cảm – lo âu) và ICD-11 6A05 (trước 12 tuổi, chỉ cần một nhóm triệu chứng). Chậm phát triển tâm thần theo BYT 2020 Bài 28 tr. 154–155 (mô tả lâm sàng 4 mức, IQ, cận lâm sàng, chẩn đoán phân biệt) và ICD-11 6A00 (trí tuệ VÀ hành vi thích ứng ≈ ≥ 2 độ lệch chuẩn; 6A00.4 tạm thời cho trẻ < 4 tuổi hoặc không đánh giá được). Ký tự thứ 4 (.0 / .1) và F78 / F79 theo bảng mã ICD-10. Mã chi tiết tự kỷ ICD-11 6A02.0–6A02.5 (trí tuệ × ngôn ngữ chức năng) từ `ICD-11.pdf`.

Đái dầm, ỉa bậy (2026-11-04): tiêu chuẩn A–E của F98.0 và F98.1, mã ký tự thứ 5 theo `ICD-10-nghiên-cứu-VN.pdf` tr. 189–190; BYT 2020 Bài 31 tr. 170–171 (trích nguyên tiêu chuẩn ICD-10 cho đái dầm, cận lâm sàng, chẩn đoán phân biệt); ICD-11 6C00 (6C00.0 ban đêm, .1 ban ngày, .2 cả hai; tần suất vài lần/tuần trong nhiều tháng), 6C01 (6C01.0 có táo bón kèm són phân tràn, 6C01.1 không) từ `ICD-11.pdf` tr. 421–425.

Rối loạn nhận thức (2026-11-05): tiêu chuẩn mất trí G1–G4, F00–F03 kèm thể, F04, F05 (A–F), F06 (G1–G3), F06.7 (A–D) theo `ICD-10-nghiên-cứu-VN.pdf` tr. 47–62 (ảnh trang PDF 20–35); chữ số thứ 5, thứ 6 ở tr. 49–50. BYT 2020 Bài 1–4 (sa sút trí tuệ, sảng). ICD-11 6D70 (sảng), 6D71 (rối loạn thần kinh nhận thức nhẹ), 6D72 (hội chứng quên), 6D80–6D85 (sa sút trí tuệ theo nguyên nhân), 6D86 (rối loạn hành vi – tâm lý trong sa sút trí tuệ) từ `ICD-11.pdf` tr. 602–626.

- **Dược thư Quốc gia Việt Nam 2022, quyển 1 và 2** (`Desktop/sách PDF/Duoc-thu-quoc-gia-viet-nam-2022-quyen-*.pdf`, bản scan không có lớp chữ): dùng đối chiếu tương tác thuốc tâm thần (2026-11-09). Chuyên luận sắp theo vần; trang sách = trang PDF + khoảng 12.
