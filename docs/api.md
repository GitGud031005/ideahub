# API contract v1

Base URL: `/api`. JSON UTF-8. Tất cả dữ liệu cá nhân hóa trả `Cache-Control: no-store`.

Khách có thể đọc idea mà không có cookie. `GET /api/session` trả user hoặc null; không tạo danh tính khách. Đăng ký/đăng nhập mới cấp cookie phiên. Client web sử dụng fetch cùng domain. Author luôn lấy từ session trên server; body có field không được khai báo sẽ bị từ chối.

| Method | Endpoint | Hành vi |
| --- | --- | --- |
| GET | `/health?cache=verify` | Kiểm tra cache bằng key tạm: cấu hình, read/write, hit, invalidation; không trả secret; tối đa 4 request/phút/instance |
| GET | `/health` | `{status, storage, persistent}`; postgres có query kiểm tra DB, lỗi kết nối trả 503; không thay thế kiểm tra session |
| GET | `/unread` | Cần đăng nhập; map `{ideaId: unreadCount}` chỉ của user trong session, không cache HTTP |
| POST | `/ideas/:id/read` | `{commentId}` snapshot đã tải; yêu cầu đã tham gia, mốc chỉ tiến lên |
| GET | `/session` | Lấy tài khoản hiện tại hoặc null; không tự tạo phiên |
| POST | `/auth/register` | `{username,fullName,password}`; tạo tài khoản và phiên, 201 |
| POST | `/auth/login` | `{username,password}`; cấp phiên mới, thu hồi cookie cũ, 200 |
| GET | `/auth/config` | Cờ `google` và `avatarUpload`, không trả credential |
| GET | `/auth/google/start?next=/ideas/:id` | Bắt đầu OIDC, đặt cookie state và redirect Google |
| GET | `/auth/google/callback` | Kiểm tra state/nonce/PKCE và ID token, tạo phiên và redirect |
| POST | `/auth/avatar` | Session + same-origin; multipart trường `avatar`, JPG/PNG/WebP tối đa 2 MB; trả session với avatar mới |
| GET | `/ideas/:id/recaps?offset=0` | Cần đăng nhập; file theo ngày/tuần, phân trang 50 file, cờ `aiConfigured` |
| GET | `/ideas/:id/recaps/:recapId` | Cần đăng nhập; nội dung bullet và ID bình luận nguồn; ràng buộc đúng phòng |
| POST | `/ideas/:id/recaps` | Không hỗ trợ tạo thủ công; trả 405 sau xác thực |
| GET | `/cron/recaps` | Chỉ Bearer `CRON_SECRET`; tác vụ ngày, tối đa 4 file mỗi lượt |
| POST | `/auth/profile` | Session + same-origin; `{name}`, chỉ sửa tên hiển thị |
| POST | `/auth/password` | Account bằng mật khẩu; `{currentPassword,newPassword}`, xác minh mật khẩu cũ và thu hồi phiên cũ |
| POST | `/auth/logout` | Thu hồi phiên và xóa cookie, 200 |
| GET | `/ideas?q=&view=all&sort=new&limit=24&cursor=...` | Danh sách, cursor trang kế tiếp và số lượng all/joined/mine |
| POST | `/ideas` | Tạo idea, creator đồng thời là thành viên; trả 201 |
| GET | `/ideas/:id` | Thông tin đầy đủ, `joined`/`mine` của phiên hiện tại |
| POST | `/ideas/:id/join` | Tham gia idempotent, trả idea đã cập nhật |
| GET | `/ideas/:id/comments?limit=100&cursor=...` | Bình luận phẳng, chronological; có parentId để UI dựng cây |
| GET | `/ideas/:id/comments/stream` | SSE yêu cầu đăng nhập: `comments-changed`, `auth-required`, `stream-error`; tự nối lại |
| POST | `/ideas/:id/comments` | Tạo bình luận/trả lời và tham gia idea nếu chưa tham gia; trả 201 |

## Tạo idea

```json
{
  "title": "Data crawling lab",
  "description": "Cùng xây pipeline thử nghiệm",
  "category": "Công nghệ",
  "tags": ["Python", "Data engineering"]
}
```

Title 1–80 ký tự sau trim; description 1–240; category là một trong `Công nghệ`, `Đời sống`, `Học tập`, `Thiết kế`, `Khác`. Tối đa 12 tags, mỗi tag 1–28 ký tự. Server loại trùng và thêm category vào tags, giữ tổng tối đa 12.

List response: `{items: Idea[], total: number, counts: {all, joined, mine}, nextCursor: string|null}`. Query `q` tối đa 120 ký tự; `view=all|joined|mine`; `sort=new|popular`; limit 1–100. Trang đầu bỏ `cursor`; trang sau gửi nguyên `nextCursor` và giữ nguyên người xem, từ khóa, bộ lọc, cách sắp xếp. Cursor sai hoặc dùng cho truy vấn khác trả 400 `INVALID_CURSOR`. Các count không phụ thuộc từ khóa hoặc trang hiện tại.

Client web dùng keyset cursor theo thứ hạng, thời gian tạo và ID; tổng kết quả, thứ hạng theo số thành viên và bộ lọc đã tham gia được tính tại mốc thời gian trang đầu. Ý tưởng/lượt tham gia mới được thấy khi danh sách tải lại; không làm dịch vị trí giữa các trang đang xem. PostgreSQL giữ độ chính xác microsecond của cursor; JSON local ghi thời điểm tham gia mới và coi thành viên từ dữ liệu cũ là đã có trước mốc tải. Đây là mốc thời gian dữ liệu, không giữ mở một transaction xuyên nhiều HTTP request. `offset=0..100000` vẫn được hỗ trợ cho client cũ nhưng không dùng cùng cursor; client mới nên dùng cursor để tránh trang bị dịch khi có dữ liệu mới.

## Bình luận

```json
{ "text": "Mình có thể phụ trách phần làm sạch dữ liệu", "parentId": "m-1-0" }
```

Text 1–2000 ký tự sau trim. Bỏ `parentId` hoặc dùng `null` cho bình luận gốc. Parent phải tồn tại trong cùng idea. Reply depth tối đa 12; không có vote. Response comment: `{id, ideaId, parentId, author: {id,name,initial}, text, createdAt, readCursor}`. `readCursor` là bigint dạng chuỗi để UI chọn ID bình luận mới nhất cho xác nhận đã đọc; server không nhận cursor từ client.

List response: `{items: Comment[], total: number, nextCursor: string|null}`. Cursor là ID cuối của trang trước, không phải offset. Client tải các trang theo thứ tự để dựng cây đủ parent/child. Sắp xếp cũ/mới được thực hiện ở UI cho cả bình luận gốc và từng nhánh trả lời.

Client có thể gửi thêm `clientId` là UUID để hiển thị optimistic và thử gửi lại. Server dùng UUID này làm ID; cùng tác giả, idea, parent và nội dung trả lại bình luận đã lưu. Tái sử dụng ID với dữ liệu khác trả 409 `COMMENT_CONFLICT`. Editor không chờ phản hồi; từng tin nhắn có trạng thái đang gửi hoặc lỗi với nút thử lại. Hàng chờ được giữ trong bộ nhớ khi chuyển trang nội bộ, không tồn tại sau khi tải lại toàn trang.

SSE dùng cookie phiên cùng origin, `Cache-Control: private, no-store, no-transform`; event chỉ chứa `{}`. Client tải lại GET comments khi nhận `comments-changed`, kể cả lần đầu/reconnect để bù cập nhật bị lỡ. Backend kiểm tra số bình luận/thành viên mỗi giây; thay đổi ở phòng khác không phát event. Stream đóng sau tối đa 50 giây, báo `retry: 1000`; session được kiểm tra lại mỗi vòng. `auth-required` yêu cầu client đóng stream và đăng nhập lại; `stream-error` cho phép tự thử kết nối lại và dùng HTTP fallback. Không cần Supabase Realtime hoặc mở quyền Data API.

## Lỗi

```json
{
  "error": {
    "code": "VALIDATION",
    "message": "Kiểm tra lại nội dung đã nhập",
    "fields": { "title": ["Nhập tên ý tưởng"] }
  }
}
```

Các POST tạo/join/comment và GET bình luận yêu cầu tài khoản thật. Username 3–24 ký tự `a-z0-9_`, không phân biệt hoa thường; họ tên 2–80 ký tự; mật khẩu đăng ký 8–128 ký tự. Cookie HttpOnly, Secure production, SameSite=Lax, hết hạn 30 ngày; không trả token/hash mật khẩu trong JSON. Auth có limiter dùng chung PostgreSQL.

Status: 400 JSON/cursor/parent sai; 401 thiếu/hết phiên hoặc sai credentials; 409 username đã dùng; 403 origin không hợp lệ; 404 không tồn tại; 405 sai method; 413 body lớn hơn 16 KiB; 415 sai content type; 422 validation/depth; 429 quá số ghi; 503 cấu hình secret/storage chưa hợp lệ.

Mutation JSON phải có `Content-Type: application/json`. Request có Origin từ domain khác hoặc `Sec-Fetch-Site: cross-site` bị từ chối. Rate limit tạm thời 30 lần ghi/phút/phiên/instance; đây không phải giới hạn phân tán cho production.
