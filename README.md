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
openssl rand -base64 48
```

Copy chuỗi vừa tạo vào `SESSION_SECRET` trong `.env.local`. Giữ `IDEAHUB_STORAGE=json` để dữ liệu local được ghi vào `data/ideahub.json`.

```bash
npm run dev
```

Mở http://localhost:3000. Lần đầu backend tạo 6 idea và bình luận mẫu. Mỗi trình duyệt có một danh tính khách riêng được xác định bằng cookie có chữ ký; “Của bạn” chỉ chứa idea do phiên khách đó tạo. Dữ liệu local được giữ qua lần khởi động tiếp theo; xóa thư mục `data/` để reset có chủ ý. Không commit dữ liệu runtime hoặc file `.env`.

```bash
npm run check   # TypeScript và kiểm thử backend
npm run build   # Build production
npm start      # Cần SESSION_SECRET trong môi trường production
```

## Deploy Vercel

1. Import repo `GitGud031005/ideahub` trong Vercel.
2. Chọn framework **Next.js**, Root Directory là root repo; Install Command `npm ci`, Build Command `npm run build`. Không đặt Output Directory thành `dist` và không chọn Static HTML.
3. Thêm biến môi trường cho Preview/Production:

   | Biến | Giá trị |
   | --- | --- |
   | `SESSION_SECRET` | Chuỗi ngẫu nhiên riêng, ít nhất 32 ký tự; dùng `openssl rand -base64 48` |
   | `IDEAHUB_STORAGE` | `memory` trong giai đoạn thử nghiệm chưa có DB |

4. Deploy. Không cần server Express riêng, API chạy trong cùng ứng dụng. Truy cập `/api/health` để kiểm tra runtime/storage, rồi mở dashboard và thử tạo idea.

**Chưa có database:** chế độ `memory` trên Vercel chỉ dùng thử. Dữ liệu có thể mất khi function khởi động lại, redeploy hoặc chuyển instance; các instance không chia sẻ dữ liệu. Không dùng JSON hoặc `/tmp` làm database trên Vercel. Cấu hình `json` trên Vercel được backend từ chối rõ ràng. Chỉ dùng cho người dùng thật sau khi thêm database và xác thực tài khoản.

**Phiên khách không phải hệ thống đăng nhập:** hiện chưa có đăng ký, email, OAuth, mật khẩu hoặc khôi phục tài khoản. Cookie HttpOnly có chữ ký ngăn sửa ID tùy ý; xóa cookie hoặc đổi trình duyệt sẽ tạo một danh tính khách khác. Khi tích hợp auth, thay lớp session và giữ nguyên việc lấy author từ server; không nhận `authorId` từ request body.

## Cấu trúc code

```text
src/app/                  Routes, layout, stylesheet và API entry point
src/components/           Dashboard, hero, dialog, picker, discussion, comment tree/editor
src/lib/                  Kiểu dữ liệu dùng chung, validation, format và API client
src/server/api.ts         Điều phối endpoint, session và validation
src/server/repository.ts  Interface lưu trữ và các ràng buộc nghiệp vụ
src/server/stores.ts      Adapter memory/JSON với transaction một process
src/server/container.ts   Chọn adapter; đây là điểm thay bằng database repository
src/server/session.ts     Cookie có chữ ký HMAC; secret chỉ chạy trên server
tests/                    Test repository, JSON, session và API
docs/                     API contract, hướng tích hợp DB, mock đã duyệt
public/assets/            Ảnh prism dùng trong canvas, không có fetch ảnh bên ngoài
```

File mock trước đây được giữ tại `docs/approved-mockup.html` làm tài liệu tham chiếu; không dùng nó làm entry point khi deploy. Dữ liệu localStorage của mock không tự động đưa lên backend. Dữ liệu chính của ứng dụng mới đi qua API; bản nháp và trạng thái UI giữ trong React khi chuyển trang.

## API và dữ liệu

Xem [API contract](docs/api.md), [kiến trúc và tích hợp PostgreSQL](docs/architecture.md), [migration Supabase](supabase/migrations/20261016000000_initial_ideahub.sql) và [hướng dẫn thiết lập Supabase](docs/supabase-setup.md).

API có session cookie, giới hạn payload 16 KiB, validation chặt, kiểm tra origin cho mutation, lỗi có mã và giới hạn ghi theo phiên trong mỗi instance. Membership được thêm theo cách idempotent. Parent của bình luận phải thuộc cùng idea; nhánh tối đa 12 cấp trả lời. Các đoạn text được render qua React, không chèn HTML thô. GET dữ liệu phiên có `Cache-Control: no-store`.

Giới hạn hiện tại: chưa có realtime WebSocket, upload file, chỉnh sửa/xóa bài, moderation hay rate limit dùng chung giữa các instance. Polling chỉ là refresh HTTP; backend JSON hỗ trợ một process local, không dùng nhiều process đồng thời trên cùng file. Khi có DB, thay adapter bằng transaction và unique constraints như tài liệu mô tả.

## Kiểm tra

Đã chạy TypeScript strict, 12 kiểm thử cho nghiệp vụ/API và build production. Test bao gồm tạo idea, tìm tiếng Việt không dấu, quyền sở hữu theo session, 30 lượt join đồng thời, parent khác phòng, giới hạn độ sâu, phân trang bình luận, rollback, JSON persistence, cookie bị sửa/hết hạn, lỗi validation/origin/body và rate limit.

Chưa chạy kiểm tra trực quan bằng browser trong môi trường thực hiện. Không có deployment Vercel nào được tạo tự động; repo đã sẵn sàng để import theo các bước trên.

Tài liệu chính thức: [Next.js App Router](https://nextjs.org/docs/app), [Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers), [Vercel Functions](https://vercel.com/docs/functions), [Vercel Storage](https://vercel.com/docs/storage).
