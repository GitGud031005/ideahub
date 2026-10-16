# Kiến trúc và bước tích hợp DB

## Luồng hiện tại

React components → typed fetch client → Next Route Handler → validation/session → `IdeaRepository` → memory, JSON hoặc PostgreSQL.

Tất cả endpoint nằm trong một catch-all Route Handler `/api/[...path]` để giữ một API entry point và tránh giả định memory được chia sẻ giữa các function route khác nhau. Memory vẫn chỉ thuộc một instance, không đảm bảo bền vững hoặc nhất quán đa instance trên Vercel.

UI không đọc file, không nhận biết SQL và không tin dữ liệu người dùng gửi lên là author. `StateIdeaRepository` dùng một queue cho thao tác đọc/ghi trong process; JSON được ghi vào file tạm rồi rename, và không ghi nếu thao tác nghiệp vụ lỗi. Nếu JSON hỏng, adapter báo lỗi thay vì tự reset mất dữ liệu.

## PostgreSQL / Supabase

`PostgresIdeaRepository` giữ nguyên HTTP contract và frontend. Chọn bằng `IDEAHUB_STORAGE=postgres`, cung cấp `DATABASE_URL` từ Supabase Transaction pooler. `database.ts` dùng một pool được cache cho mỗi warm instance, tối đa một connection, có timeout và TLS xác minh chứng chỉ. Các câu SQL có parameter và không có named prepared statements; transaction giữ cùng một client đến khi commit/rollback.

- Tạo idea + creator membership và comment + join chạy trong transaction. Join dùng `ON CONFLICT DO NOTHING` trên unique key; không tạo membership trùng khi ghi đồng thời.
- Parent phải thuộc cùng idea nhờ kiểm tra nghiệp vụ và composite foreign key. Recursive query kiểm tra tối đa 12 cấp trả lời; ứng dụng không cho sửa parent sau khi tạo.
- List ideas/comments đọc trong repeatable-read transaction để counts, cursor và items dùng cùng snapshot. Cursor bình luận nằm trong cùng idea, dựa trên timestamp và ID tại DB.
- `search_text` được adapter chuẩn hóa tiếng Việt từ title/description/tags, tìm chuỗi literal bằng parameter. Với dữ liệu lớn cần benchmark và bổ sung index tìm kiếm phù hợp; hiện không phụ thuộc extension.
- Backend lấy danh tính từ signed guest session, không nhận author ID từ input. Bảng `public.users` chưa tích hợp Supabase Auth. RLS bật nhưng không có policy frontend; quyền `anon`/`authenticated` đã bị thu hồi. Next.js truy cập bằng credential DB phía server.
- Không tự seed hoặc import dữ liệu JSON/localStorage vào DB. Cả hai chế độ demo vẫn có để phát triển local.
- `/api/health` thực sự thử query bảng ideas khi dùng postgres và trả 503 nếu DB không truy cập được. `persistent` mô tả storage mode; không thay cho kiểm tra backup hay độ bền vận hành.

Migration và cấu hình cụ thể nằm trong [hướng dẫn Supabase](supabase-setup.md). Vẫn cần `DATABASE_URL` trong môi trường chạy ứng dụng. Không hardcode secret trong source hoặc dùng `NEXT_PUBLIC_*` cho credential.

Bước tiếp theo khi có tài khoản thật: thay guest session bằng auth provider, map ID của tài khoản, bổ sung chính sách quyền và rate limiter phân tán. Integration test của adapter dùng `TEST_DATABASE_URL` riêng, không tự dùng credential production.

## Frontend

- App Router cung cấp URL `/ideas/:id` thật, hỗ trợ refresh và back/forward.
- Dashboard giữ từ khóa, filter, sort và vị trí cuộn trong provider; server xử lý tìm kiếm/filter/pagination.
- TanStack Query quản lý request cancellation và cache; mutation không tự retry để tránh post lặp do mạng.
- Bình luận được nhận dạng bằng ID, render text qua React; hierarchy dùng parentId và đường nối CSS liên tục.
- Reply drafts/sidebar giữ trong React provider qua điều hướng; backend mới không ghi dữ liệu chính vào localStorage.
- Dropdown tùy biến có keyboard navigation và focus handling. Dialog native quản lý focus modal. Canvas hero tôn trọng reduced motion, pause khi khuất hoặc background và dọn observer/listener/RAF khi unmount.
- Bình luận refresh HTTP mỗi 15 giây trong tab đang hoạt động; không tuyên bố là realtime chat.

## Môi trường và phạm vi kiểm tra

Next build/typecheck và tests chạy local. SQL adapter đã qua contract test trên PostgreSQL nhúng (PGlite). Schema đã áp dụng và smoke test trên Supabase; toàn bộ fixture được rollback. Chưa chạy integration test qua pg driver vì chưa có DATABASE_URL của ứng dụng. Không tạo Vercel project/deployment, không có secret thật trong repo. Browser QA chưa chạy trong môi trường thực hiện; cần rà desktop/mobile và keyboard sau khi import Vercel.
