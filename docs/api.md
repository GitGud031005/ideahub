# API contract v1

Base URL: `/api`. JSON UTF-8. Tất cả dữ liệu cá nhân hóa trả `Cache-Control: no-store`.

Trước khi gọi endpoint ý tưởng, gọi `GET /api/session` và giữ cookie trả về. Client web sử dụng fetch cùng domain. Author luôn lấy từ session trên server; body có field không được khai báo sẽ bị từ chối.

| Method | Endpoint | Hành vi |
| --- | --- | --- |
| GET | `/health` | `{status, storage, persistent}`; không thay thế kiểm tra session/config |
| GET | `/session` | Lấy/tạo phiên khách, cookie HttpOnly + SameSite=Lax; Secure ở production |
| GET | `/ideas?q=&view=all&sort=new&limit=24&offset=0` | Danh sách và số lượng all/joined/mine |
| POST | `/ideas` | Tạo idea, creator đồng thời là thành viên; trả 201 |
| GET | `/ideas/:id` | Thông tin đầy đủ, `joined`/`mine` của phiên hiện tại |
| POST | `/ideas/:id/join` | Tham gia idempotent, trả idea đã cập nhật |
| GET | `/ideas/:id/comments?limit=100&cursor=...` | Bình luận phẳng, chronological; có parentId để UI dựng cây |
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

List response: `{items: Idea[], total: number, counts: {all, joined, mine}}`. Query `q` tối đa 120 ký tự; `view=all|joined|mine`; `sort=new|popular`; limit 1–100, offset 0–100000. Các count không phụ thuộc từ khóa hoặc trang hiện tại.

## Bình luận

```json
{ "text": "Mình có thể phụ trách phần làm sạch dữ liệu", "parentId": "m-1-0" }
```

Text 1–2000 ký tự sau trim. Bỏ `parentId` hoặc dùng `null` cho bình luận gốc. Parent phải tồn tại trong cùng idea. Reply depth tối đa 12; không có vote. Response comment: `{id, ideaId, parentId, author: {id,name,initial}, text, createdAt}`.

List response: `{items: Comment[], total: number, nextCursor: string|null}`. Cursor là ID cuối của trang trước, không phải offset. Client tải các trang theo thứ tự để dựng cây đủ parent/child. Đổi thứ tự root cũ/mới được thực hiện ở UI; thứ tự trả lời trong nhánh luôn theo thời gian.

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

Status: 400 JSON/cursor/parent sai; 401 thiếu hoặc hết phiên; 403 origin không hợp lệ; 404 không tồn tại; 405 sai method; 413 body lớn hơn 16 KiB; 415 sai content type; 422 validation/depth; 429 quá số ghi; 503 cấu hình secret/storage chưa hợp lệ.

Mutation JSON phải có `Content-Type: application/json`. Request có Origin từ domain khác hoặc `Sec-Fetch-Site: cross-site` bị từ chối. Rate limit tạm thời 30 lần ghi/phút/phiên/instance; đây không phải giới hạn phân tán cho production.
