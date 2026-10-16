# Thiết lập Supabase cho IdeaHub

## Trạng thái

Đã chuẩn bị migration khởi tạo trong `supabase/migrations/20261016000000_initial_ideahub.sql`. Chưa tạo project, chưa chạy SQL trên database thực, chưa có Postgres adapter trong ứng dụng. Runtime vẫn chỉ hỗ trợ `json` và `memory`; việc tạo bảng chưa làm app tự chuyển sang DB.

## Project và migration

1. Kết nối tài khoản Supabase và kiểm tra organization/project hiện có trước khi tạo mới. Ưu tiên project riêng cho IdeaHub; Singapore phù hợp nếu phần lớn người dùng ở Việt Nam và region này được cung cấp. Kiểm tra gói và chi phí của organization trước khi xác nhận tạo.
2. Chạy migration trên project IdeaHub mới. Không chạy trên database đang có bảng cùng tên mà chưa kiểm tra schema. Migration không xóa hay ghi đè bảng sẵn có; tên trùng sẽ báo lỗi.
3. Xác nhận bốn bảng `public.users`, `public.ideas`, `public.memberships`, `public.comments`, index và foreign key được tạo. Không import dữ liệu demo vào production tự động.
4. Xác nhận cả bốn bảng đã bật Row Level Security và không có policy/grant cho `anon` hay `authenticated`. Ứng dụng hiện dùng Next.js API và guest session, chưa dùng Supabase Auth. Bảng `public.users` là danh tính khách của app, không phải `auth.users`.

## Kết nối backend trên Vercel

- Lấy URI tại **Connect → Transaction pooler**. Cất vào secret `DATABASE_URL` phía server/Vercel, không dùng tiền tố `NEXT_PUBLIC_`, không commit `.env`, không gửi mật khẩu trong chat.
- Dùng Node.js PostgreSQL driver phù hợp transaction pooling, SSL và pool nhỏ cho mỗi function instance; tắt named prepared statements. Không giả định một kết nối session được giữ qua nhiều transaction.
- Implement `PostgresIdeaRepository` theo interface hiện tại và bổ sung storage mode trước khi đổi runtime. `DATABASE_URL` hiện chưa được code đọc; không đổi `IDEAHUB_STORAGE` sang giá trị chưa được hỗ trợ.
- Create idea + membership, comment + join phải chạy trong transaction. Giữ validation, kiểm tra parent cùng phòng, giới hạn sâu 12 và search tiếng Việt như adapter hiện tại.
- Sau khi adapter hoàn tất, chạy integration tests với DB thật cho persistence qua restart, join đồng thời, rollback, phân trang và parent khác phòng. Chỉ chuyển deployment sang DB sau khi các kiểm tra này đạt.
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
