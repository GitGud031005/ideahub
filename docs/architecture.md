# Kiến trúc và bước tích hợp DB

## Luồng hiện tại

React components → typed fetch client → Next Route Handler → validation/session → `IdeaRepository` → memory hoặc JSON.

Tất cả endpoint nằm trong một catch-all Route Handler `/api/[...path]` để giữ một API entry point và tránh giả định memory được chia sẻ giữa các function route khác nhau. Memory vẫn chỉ thuộc một instance, không đảm bảo bền vững hoặc nhất quán đa instance trên Vercel.

UI không đọc file, không nhận biết SQL và không tin dữ liệu người dùng gửi lên là author. `StateIdeaRepository` dùng một queue cho thao tác đọc/ghi trong process; JSON được ghi vào file tạm rồi rename, và không ghi nếu thao tác nghiệp vụ lỗi. Nếu JSON hỏng, adapter báo lỗi thay vì tự reset mất dữ liệu.

## Gắn PostgreSQL sau

1. Provision database và thêm secret kết nối chỉ ở server. Không dùng tên biến `NEXT_PUBLIC_*` cho URL hoặc secret DB.
2. Với Supabase, dùng migration `supabase/migrations/20261016000000_initial_ideahub.sql` và hướng dẫn `docs/supabase-setup.md`. Migration đã gồm RLS và thu hồi quyền Data API công khai; chưa được áp dụng hoặc kiểm tra với database thực.
3. Viết `PostgresIdeaRepository implements IdeaRepository` trong `src/server`. Thay factory ở `container.ts`; frontend và HTTP contract không đổi.
4. Thay signed guest session bằng auth provider khi cần tài khoản thật. Map ID của tài khoản vào bảng users; không lấy ID từ input create/comment.
5. Seed/import có chủ ý. Các ID hiện tại là text để chứa cả seed IDs lẫn UUID; không giả định mọi ID là UUID khi migrate.
6. Dùng một transaction cho create idea + creator membership; comment + join-on-comment. Join sử dụng `INSERT ... ON CONFLICT DO NOTHING` trên `(idea_id,user_id)`.
7. Kiểm tra parent trong cùng idea, chiều sâu và quyền ghi trong transaction. Composite foreign key của schema chặn parent khác idea ở DB. Không cho phép sửa parent sau khi tạo; tránh chu trình và làm hỏng cây.
8. List trả author snapshot và derived counts nhưng không trả danh sách member IDs. Dùng index, pagination và query search đã normalize tiếng Việt. Có thể dùng extension `unaccent` cùng full text/trigram khi triển khai; hiện chưa phụ thuộc extension nào.
9. Chạy lại các contract tests bằng adapter mới; thêm integration tests với DB cho unique constraints, transaction rollback, hai request join cùng lúc và parent/depth checks.
10. Khi có shared DB, thay rate limiter per-instance bằng limiter phân tán. Bổ sung quản lý tài khoản, moderation và quy tắc quyền trước khi nhận dữ liệu thật.

## Frontend

- App Router cung cấp URL `/ideas/:id` thật, hỗ trợ refresh và back/forward.
- Dashboard giữ từ khóa, filter, sort và vị trí cuộn trong provider; server xử lý tìm kiếm/filter/pagination.
- TanStack Query quản lý request cancellation và cache; mutation không tự retry để tránh post lặp do mạng.
- Bình luận được nhận dạng bằng ID, render text qua React; hierarchy dùng parentId và đường nối CSS liên tục.
- Reply drafts/sidebar giữ trong React provider qua điều hướng; backend mới không ghi dữ liệu chính vào localStorage.
- Dropdown tùy biến có keyboard navigation và focus handling. Dialog native quản lý focus modal. Canvas hero tôn trọng reduced motion, pause khi khuất hoặc background và dọn observer/listener/RAF khi unmount.
- Bình luận refresh HTTP mỗi 15 giây trong tab đang hoạt động; không tuyên bố là realtime chat.

## Môi trường và phạm vi kiểm tra

Next build/typecheck và tests chạy local. Không gọi DB, không tạo Vercel project hoặc deployment, không có secret thật trong repo. Browser QA chưa chạy trong môi trường thực hiện; cần rà desktop/mobile và keyboard sau khi import Vercel.
