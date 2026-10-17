# IdeaHub

Ứng dụng full-stack chuyển từ mock đã chốt: dashboard chung, prism và tia sáng liên tục, tags cuộn ngang, trang thảo luận toàn màn hình, bình luận lồng nhau và sidebar đóng/mở được.

## Stack

- Next.js 16 App Router + React 19 + TypeScript strict.
- CSS thuần với các token và component rõ ràng, giữ ngôn ngữ thiết kế trắng đen của mock.
- TanStack Query: cache, tải thêm idea, hủy request tìm kiếm cũ, mutation và cập nhật thảo luận mỗi 15 giây khi tab hoạt động.
- Lucide React: icon đồng bộ, không phụ thuộc glyph của hệ điều hành.
- Next.js Route Handlers chạy Node.js: API cùng domain, phù hợp deploy Vercel.
- Zod: validation phía client và server. Repository interface tách khỏi HTTP/UI để thay storage sau.

## Chạy local

Yêu cầu Node.js 22 hoặc 24 và npm. Các phiên bản dependency được khóa trong `package-lock.json`.

```bash
npm ci
cp .env.example .env.local
```

Mặc định local dùng JSON cho idea và auth trong bộ nhớ để phát triển. Tài khoản local bị đặt lại khi restart; muốn tài khoản bền vững thì dùng `IDEAHUB_STORAGE=postgres` và một database phát triển riêng. Không dùng DB production để chạy test.

```bash
npm run dev
```

Mở http://localhost:3000. Lần đầu backend tạo 6 idea và bình luận mẫu. Khách xem danh sách mà không cần cookie. Tạo idea, tham gia và bình luận yêu cầu tài khoản thật; “Của bạn” theo ID tài khoản, không phụ thuộc trình duyệt. Dữ liệu local được giữ qua lần khởi động tiếp theo; xóa thư mục `data/` để reset có chủ ý. Không commit dữ liệu runtime hoặc file `.env`.

```bash
npm run check   # TypeScript và kiểm thử backend
npm run build   # Build production
npm start      # Production auth cần PostgreSQL
```

## Deploy Vercel

1. Import repo `GitGud031005/ideahub` trong Vercel.
2. Chọn framework **Next.js**, Root Directory là root repo; Install Command `npm ci`, Build Command `npm run build`. Không đặt Output Directory thành `dist` và không chọn Static HTML.
3. Thêm biến môi trường cho Preview/Production:

   | Biến | Giá trị |
   | --- | --- |
   | `IDEAHUB_STORAGE` | `postgres` bắt buộc cho auth production |
   | `DATABASE_URL` | URI **Transaction pooler** từ Supabase → Connect; chỉ lưu ở server |
   | `DATABASE_SSL_CA` | Tùy chọn: PEM root certificate nếu DB dùng CA riêng |

4. Deploy. Không cần server Express riêng, API chạy trong cùng ứng dụng. Truy cập `/api/health` để kiểm tra runtime/storage, rồi mở dashboard và thử tạo idea.

## Tài khoản và phiên đăng nhập

- Đăng ký bằng username (3–24 chữ cái không dấu/số/gạch dưới), họ tên và mật khẩu 8–128 ký tự. Username không phân biệt hoa thường; không trim mật khẩu.
- Mật khẩu dùng scrypt (N=131072, r=8, p=1), salt riêng 16 byte; chỉ hash được lưu trong schema `ideahub_private`.
- Cookie `ideahub_auth` chứa token ngẫu nhiên 256 bit, HttpOnly + Secure ở production + SameSite=Lax; DB chỉ lưu SHA-256 của token. Phiên hết hạn sau 30 ngày. Đăng xuất thu hồi phiên trên server; đăng nhập đổi token và thu hồi token cũ của trình duyệt.
- Phiên khách cũ không cấp quyền ghi. Tên tác giả và avatar chữ cái đầu lấy từ tài khoản trên server. Không nhận ID/name tác giả từ body.
- Auth có giới hạn đăng nhập/đăng ký theo username, IP do Vercel cung cấp và budget toàn ứng dụng, dùng bucket PostgreSQL chia sẻ giữa instance. Wrong-password và username không tồn tại trả cùng lỗi.
- UI yêu cầu đăng nhập trước khi tạo/tham gia, tiếp tục thao tác sau đăng nhập, xóa cache/draft khi đổi tài khoản. API kiểm tra độc lập, kể cả mở URL trực tiếp.
- Bản này dùng username/password; chưa tích hợp Google OAuth, reset mật khẩu qua email hoặc tải ảnh avatar. Avatar mặc định là chữ cái đầu họ và tên.
- `SESSION_SECRET` của bản cũ không còn được sử dụng; không cần thêm secret auth mới. Không bỏ TLS database hoặc đưa `DATABASE_URL` vào frontend.

**Phân quyền database:** public tables và private auth tables bật RLS, thu hồi toàn bộ quyền Data API của `anon`/`authenticated`. Chỉ backend truy cập bằng kết nối PostgreSQL phía server. Advisor có thể báo INFO [RLS Enabled No Policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy); đây là deny-by-default có chủ đích, không thêm policy public để xóa INFO.

## Cấu trúc code

```text
src/app/                  Routes, layout, stylesheet và API entry point
src/components/           Dashboard, hero, dialog, picker, discussion, comment tree/editor
src/lib/                  Kiểu dữ liệu dùng chung, validation, format và API client
src/server/api.ts         Điều phối endpoint, session và validation
src/server/repository.ts  Interface lưu trữ và các ràng buộc nghiệp vụ
src/server/stores.ts      Adapter memory/JSON với transaction một process
src/server/container.ts   Chọn adapter json/memory/postgres
src/server/postgres-repository.ts  SQL, transaction và nghiệp vụ PostgreSQL
src/server/database.ts    Pool nhỏ, TLS xác minh chứng chỉ, server-only DATABASE_URL
src/server/session.ts     Parse cookie ngẫu nhiên, thời hạn và thuộc tính bảo vệ
src/server/auth.ts        Đăng ký/đăng nhập, session rotation và auth rate limits
src/server/postgres-auth-store.ts  Credentials/session/buckets chỉ ở server
tests/                    Test repository, JSON, session và API
docs/                     API contract, cấu hình Supabase/Vercel, mock đã duyệt
supabase/migrations/      Schema đã áp dụng, phiên bản khớp lịch sử Supabase
public/assets/            Ảnh prism dùng trong canvas, không có fetch ảnh bên ngoài
```

File mock trước đây được giữ tại `docs/approved-mockup.html` làm tài liệu tham chiếu; không dùng nó làm entry point khi deploy. Dữ liệu localStorage của mock không tự động đưa lên backend. Dữ liệu chính của ứng dụng mới đi qua API; bản nháp và trạng thái UI giữ trong React khi chuyển trang.

## API và dữ liệu

Xem [API contract](docs/api.md), [kiến trúc và tích hợp PostgreSQL](docs/architecture.md), [migration Supabase](supabase/migrations/20261016082442_initial_ideahub.sql) và [hướng dẫn thiết lập Supabase](docs/supabase-setup.md).

API có session cookie, giới hạn payload 16 KiB, validation chặt, kiểm tra origin cho mutation, lỗi có mã và giới hạn ghi theo phiên trong mỗi instance. Membership được thêm theo cách idempotent. Parent của bình luận phải thuộc cùng idea; nhánh tối đa 12 cấp trả lời. Các đoạn text được render qua React, không chèn HTML thô. GET dữ liệu phiên có `Cache-Control: no-store`.

Giới hạn hiện tại: chưa có realtime WebSocket, upload file, chỉnh sửa/xóa bài, moderation hay rate limit phân tán cho toàn bộ thao tác ghi (auth đã dùng limiter PostgreSQL). Polling chỉ là refresh HTTP; backend JSON hỗ trợ một process local, không dùng nhiều process đồng thời trên cùng file. PostgreSQL adapter dùng transaction và unique constraints; không tự seed dữ liệu demo lên DB.

## Kiểm tra

`npm run check` chạy typecheck và các test nghiệp vụ, HTTP auth, scrypt và SQL contract trên PostgreSQL nhúng. Bao gồm phiên khách bị từ chối ghi, username trùng, rotation/revocation, expiry, lỗi đăng nhập chung, payload/origin, quyền schema private và limiter chia sẻ giữa instance. Một test pg driver ngoài chỉ chạy khi có `TEST_DATABASE_URL` riêng.

`npm run build` tạo production bundle. Vercel tự deploy khi main cập nhật. `/api/health` kiểm tra kết nối PostgreSQL. Không có secret thật hoặc dữ liệu runtime trong repo.

Responsive dùng khung nội dung giới hạn trên desktop, header/search hai hàng trên điện thoại, card một cột, form cuộn theo viewport, touch targets, safe area và sidebar thảo luận dạng drawer. Nhánh bình luận sâu thu gọn phần thụt lề trên điện thoại để giữ chiều rộng đọc.

Tài liệu chính thức: [Next.js App Router](https://nextjs.org/docs/app), [Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers), [Vercel Functions](https://vercel.com/docs/functions), [Vercel Storage](https://vercel.com/docs/storage).
