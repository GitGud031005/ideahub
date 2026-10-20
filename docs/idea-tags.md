# Tags ý tưởng và AI gợi ý

- Danh mục nằm trong `src/lib/idea-tags.ts`: 191 nhãn, 15 nhóm lĩnh vực. Nhãn tối đa 28 ký tự; tags lưu trong cột mảng hiện có, không cần migration. Các idea cũ giữ nguyên tags.
- Form mới chỉ chọn từ danh mục, có tìm kiếm không dấu, bỏ/chọn nhiều tags và tối đa 12 nhãn. Không có mục Chủ đề riêng hoặc tag bị khóa; tất cả các nhãn đều chọn/bỏ như nhau, ban đầu chưa chọn tag nào.
- `POST /api/ideas/suggest-tags` nhận đúng `{title,description}`, không tạo idea hoặc lưu bản nháp. Session và same-origin bắt buộc. Giới hạn dùng chung qua AuthService: 12 lượt/user/giờ và 150 lượt toàn hệ thống/ngày.
- Danh mục được gửi trong prompt; schema chỉ ràng buộc cấu trúc JSON gọn để tránh enum lớn làm chậm constrained decoding. Server kiểm tra chính xác từng nhãn theo danh mục trước khi trả, từ chối nhãn ngoài danh sách. Cấu hình dùng chung `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODELS` và danh sách model có sẵn của recap. Không có API key trên frontend.
- AI trả 1–8 nhãn, ưu tiên khoảng 3–6 nhãn phù hợp. Kết quả thay thế lựa chọn hiện tại; user duyệt/chỉnh trước khi đăng. Nếu title/description hoặc tags được sửa khi request đang chạy, không áp dụng kết quả của bản cũ.
- Lỗi/giới hạn Google giữ nguyên tags và vẫn cho chọn thủ công. Client không tự đăng idea sau khi AI trả kết quả.
- Gemini JSON transport dùng chung với recap: model availability cache 5 phút, cùng thứ tự fallback đã cấu hình, không fallback khi key/quyền truy cập bị từ chối; không trả chi tiết lỗi provider hoặc reasoning.

Tag suggestions dùng mức thinking thấp, budget tối đa 45 giây và tối đa 10 giây cho mỗi model để còn thời gian chuyển fallback. Cấu hình thinking của recap giữ nguyên.

Tạo idea chỉ cần `{title,description,tags}`. Trường `category` cũ vẫn được chấp nhận tùy chọn cho client cũ; cột database được giữ để tương thích, không được tự thêm vào tags. Tags đã lưu của idea cũ không thay đổi.
