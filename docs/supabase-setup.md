# Thiết lập Supabase cho IdeaHub

## Trạng thái

Project hiện có: [GitGud031005’s Project](https://supabase.com/dashboard/project/uvznolytqgppsxvcphus), organization `ideahub`, gói Free, region Tokyo (`ap-northeast-1`). Không tạo project mới hay thay đổi gói.

Đã áp dụng migration `supabase/migrations/20261016082442_initial_ideahub.sql` và khớp phiên bản với migration history trên Supabase. Bốn bảng/index/FK đã được tạo, RLS đã bật và quyền Data API cho frontend đã bị thu hồi. SQL smoke test đã đạt trên database thật và rollback fixture; REST Data API đã từ chối truy cập cả bốn bảng bằng publishable key. Các bảng vẫn trống.

PostgreSQL adapter, cấu hình pool/TLS và health probe đã có trong ứng dụng. Bộ 16 kiểm thử đã đạt, trong đó có SQL contract trên PostgreSQL nhúng (PGlite). Chưa có `DATABASE_URL`/`SESSION_SECRET` trên Vercel, chưa deploy và chưa chạy end-to-end qua pg driver. Default local vẫn là `json`, trên Vercel vẫn là `memory` nếu không cấu hình rõ storage mode.

## Project và migration

1. Kết nối tài khoản Supabase và kiểm tra organization/project hiện có trước khi tạo mới. Ưu tiên project riêng cho IdeaHub; Singapore phù hợp nếu phần lớn người dùng ở Việt Nam và region này được cung cấp. Kiểm tra gói và chi phí của organization trước khi xác nhận tạo.
2. Chạy migration trên project IdeaHub mới. Không chạy trên database đang có bảng cùng tên mà chưa kiểm tra schema. Migration không xóa hay ghi đè bảng sẵn có; tên trùng sẽ báo lỗi.
3. Xác nhận bốn bảng `public.users`, `public.ideas`, `public.memberships`, `public.comments`, index và foreign key được tạo. Không import dữ liệu demo vào production tự động.
4. Xác nhận cả bốn bảng đã bật Row Level Security và không có policy/grant cho `anon` hay `authenticated`. Ứng dụng hiện dùng Next.js API và guest session, chưa dùng Supabase Auth. Bảng `public.users` là danh tính khách của app, không phải `auth.users`.

## Kết nối backend trên Vercel

- Lấy URI tại **Connect → Transaction pooler**. Cất vào secret `DATABASE_URL` phía server/Vercel, không dùng tiền tố `NEXT_PUBLIC_`, không commit `.env`, không gửi mật khẩu trong chat.
- Dùng Node.js PostgreSQL driver phù hợp transaction pooling, SSL và pool nhỏ cho mỗi function instance; tắt named prepared statements. Không giả định một kết nối session được giữ qua nhiều transaction.
- Đặt `IDEAHUB_STORAGE=postgres`, `DATABASE_URL` và `SESSION_SECRET` trong Vercel rồi redeploy. `PostgresIdeaRepository` đã được chọn qua factory khi dùng mode này. TLS luôn xác minh chứng chỉ; nếu gặp lỗi CA, cấu hình `DATABASE_SSL_CA` bằng root certificate từ Dashboard thay vì tắt xác minh.
- Create idea + membership, comment + join phải chạy trong transaction. Giữ validation, kiểm tra parent cùng phòng, giới hạn sâu 12 và search tiếng Việt như adapter hiện tại.
- Chạy integration test với credential test riêng bằng `TEST_DATABASE_URL=... npm test` (hoặc đặt biến tương đương trên Windows). Test chỉ xóa fixture UUID của chính lần chạy; không reset bảng. Sau đó gọi `/api/health`: cần nhận `storage: "postgres"`, `persistent: true`, rồi thử tạo idea/thảo luận và kiểm tra lại sau redeploy.
- Thêm login/OAuth và RLS policies theo `auth.uid()` là bước riêng. Không mở policy `USING (true)` để bỏ qua vấn đề xác thực của phiên khách.

## Kiểm tra bảo vệ bảng

Chạy bằng tài khoản quản trị sau khi áp dụng migration:

```sql
select n.nspname as schema_name, c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('users', 'ideas', 'memberships', 'comments')
  and c.relkind = 'r';

select grantee, table_name, privilege_type
from information_schema.table_privileges
where table_schema = 'public'
  and table_name in ('users', 'ideas', 'memberships', 'comments')
  and grantee in ('PUBLIC', 'anon', 'authenticated');
```

Query đầu phải có bốn hàng với `rls_enabled = true`; query sau không có hàng. Sau đó kiểm tra Security Advisor và thử Data API bằng publishable key để xác nhận không đọc/ghi được dữ liệu.

Tài liệu chính thức: [kết nối PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres), [bảo vệ dữ liệu](https://supabase.com/docs/guides/database/secure-data), [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Kết quả advisors

Không có lỗi hoặc cảnh báo mức WARN/ERROR sau migration. Có hai nhóm INFO dự kiến:

- [RLS enabled, no policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy): chủ ý chặn toàn bộ Data API frontend trong kiến trúc server-only hiện tại. Không thêm public policy để làm mất thông báo này.
- [Unused index](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index): project mới chưa có traffic; giữ các index phục vụ FK và truy vấn của ứng dụng.

Smoke SQL được lưu ở `tests/supabase-smoke.sql`, chạy trong transaction và rollback toàn bộ fixture.
