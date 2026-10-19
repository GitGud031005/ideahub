# Ảnh, tệp, liên kết và tin ghim

## Phạm vi và kế hoạch đã thực hiện

1. Mở rộng dữ liệu bình luận với attachment metadata, thời gian ghim và phiên bản hoạt động phòng; thêm receipt upload đóng quyền Data API.
2. Cho chọn/kéo thả tối đa 5 tệp mỗi tin nhắn, xem trước ảnh, gửi ảnh/tệp không cần nội dung chữ, hỗ trợ trả lời có tệp và optimistic outbox.
3. Hiển thị ảnh trong hội thoại, mở lớn/tải xuống; tệp có tên và dung lượng. Liên kết HTTP/HTTPS bấm được, không tải preview từ URL bên ngoài.
4. Cho thành viên đã tham gia ghim/bỏ ghim tối đa 50 tin nhắn trong một phòng. Sidebar gom Ảnh, Tệp, Liên kết, Tin ghim; tìm theo tên/nội dung và quay về tin nhắn gốc, mở các nhánh cha khi cần.
5. Kiểm tra SQL thực, quyền truy cập, idempotency, SSE khi chỉ thay đổi ghim, responsive và triển khai.

## API

| Method | Đường dẫn | Nội dung |
| --- | --- | --- |
| POST | `/api/ideas/:id/attachments` | Multipart duy nhất `file`; session, same-origin, đã tham gia; trả metadata và URL nội bộ |
| GET | `/api/ideas/:id/attachments/:attachmentId` | Session; tệp đã gửi thì cùng quyền đọc bình luận của phòng; tệp chưa gửi chỉ chủ upload truy cập |
| GET | `/api/ideas/:id/attachments/:attachmentId?download=1` | Ép tải ảnh xuống; tệp tài liệu luôn được trả như attachment |
| POST | `/api/ideas/:id/comments` | Thêm `attachmentIds?: UUID[]`; ít nhất có text hoặc tệp; server kiểm tra chủ upload, phòng và chưa gắn sang tin khác |
| POST | `/api/ideas/:id/comments/:commentId/pin` | JSON strict `{pinned:boolean}`; session, same-origin, membership; không tăng số tin chưa đọc |

## Lưu trữ và bảo vệ dữ liệu

- Dùng Cloudinary hiện có, không thêm secret hoặc dependency. Upload có chữ ký server, `raw` + delivery type `authenticated`; API không trả asset ID hay URL Cloudinary cho client.
- Tệp được đọc bằng API ký hạn 60 giây phía server, rồi proxy bytes với `private, no-store`, `nosniff` và Content-Disposition. Không gửi token/chữ ký Cloudinary xuống trình duyệt.
- Mỗi tệp tối đa **3 MB**, phù hợp proxy upload qua giới hạn request body của Vercel. Hỗ trợ JPG/PNG/WebP, PDF, TXT/CSV UTF-8, DOCX/XLSX/PPTX và ZIP. Kiểm tra bytes ảnh/PDF/ZIP và chặn SVG/HTML/executable; tài liệu chỉ download, không render inline.
- Upload giới hạn 60 lần/người/giờ, 500 lần toàn app/ngày bằng auth limiter dùng chung. Giới hạn write sẵn có vẫn áp dụng. Không tự nâng gói nhà cung cấp.
- Metadata đã gửi nằm trong bình luận JSONB, receipt lưu DB có FK phòng/bình luận, gắn trong cùng transaction. Client chỉ gửi ID, không tự gán URL hoặc tên/dung lượng. Retry cùng client ID không tạo lại bình luận hoặc chuyển attachment sang phòng khác.
- Receipt chưa gắn chỉ chủ upload đọc được. Nếu người gửi bỏ một tin lỗi sau khi upload đã xong thì receipt/asset riêng vẫn còn; hiện chưa tự xóa. Cần bổ sung retention job theo chính sách được chọn nếu khối lượng upload dở tăng.
- Bảng mới bật RLS và revoke mọi quyền PUBLIC/anon/authenticated; app dùng custom server sessions như trước. Không sử dụng Supabase Auth hoặc public Storage bucket.

## Live, cache và recap

- Ghim tăng `ideas.discussion_version` trong transaction, SSE so sánh cả version và số bình luận/thành viên. Việc ghim/bỏ ghim được truyền sang các instance mà không tạo tin mới hoặc tăng unread.
- Cache Redis vẫn tắt mặc định. Nếu opt-in bật lại, mutation ghim invalidates cache và pin/version cũng có trong kết quả trang bình luận/activity.
- Outbox giữ blob local để hiện ảnh ngay, upload tuần tự mỗi tin nhắn, rồi gửi metadata. Có thể viết tin kế tiếp trong khi upload. Retry tái dùng các receipt đã nhận; tệp upload thành công nhưng mất response có thể để lại một receipt riêng chưa gắn. Tin gửi thành công hoặc bỏ tin lỗi giải phóng blob URL.
- Sidebar lấy dữ liệu từ các trang bình luận đã xác nhận, cùng nguồn với cây thảo luận; không đưa pending/failed vào kho. Hiện client tải đủ các trang bình luận như luồng sẵn có; kho chia sẻ chưa có API phân trang riêng cho phòng rất lớn.
- Recap chỉ nhận tên các tệp đính kèm, không gửi file bytes, không mở link và không suy diễn nội dung ảnh/tệp. Recap lịch hiện có được giữ.

## Kiểm tra

SQL migration `20261019151144_discussion_sharing.sql` đã được kiểm tra bằng embedded PostgreSQL và áp dụng Supabase. Data API của bảng mới không có quyền đọc, RLS bật; advisor chỉ có INFO về chính sách cố ý để trống ở các bảng server-only.

- 66 tests: 65 pass, một integration PostgreSQL ngoài bỏ qua; typecheck/build pass.
- UI component thật với API mẫu: không tràn ngang ở 320/390/768/1440 px; đã kiểm tra ghim và số lượng tin ghim, sidebar mobile, mở ảnh lớn, quay lại tin nguồn, chọn tệp/gửi không chữ và tiếp tục gõ tin kế tiếp khi đang gửi.
- Mock transport xác minh chữ ký, authenticated delivery, MIME, giới hạn tệp, quyền chủ upload/phòng và retry idempotent.
- Kiểm tra **Cloudinary thật** từ Vercel bằng một TXT tổng hợp riêng: upload=true, tải lại đúng bytes=true, cleanup=true. Không tạo tài khoản/bình luận/membership hoặc attachment receipt của app để thử. Bản kiểm tra phát hiện và sửa yêu cầu giữ extension trong public ID của raw asset; đã thêm regression assertion. Không đọc/xuất credentials.
- Endpoint chẩn đoán và hai public UI fixture được gỡ trong commit cuối; mã fixture/test tái tạo giữ trong `tests/ui`. Ghim live được kiểm tra thêm khi message count không đổi; recap không suy diễn file bytes.

Tham khảo: [Cloudinary upload API](https://cloudinary.com/documentation/image_upload_api_reference), [upload có chữ ký](https://cloudinary.com/documentation/upload_images), [giới hạn Vercel Functions](https://vercel.com/docs/functions/limitations).
