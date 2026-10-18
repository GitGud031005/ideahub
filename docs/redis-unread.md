# Tin chưa đọc và cache Redis

## Tin chưa đọc

- Mỗi membership lưu mốc đọc bền vững trong PostgreSQL. Tin của chính người xem không tính, trả lời trong các nhánh vẫn tính.
- Tài khoản vừa tham gia bắt đầu ở cuối lịch sử hiện có. Khi triển khai tính năng, thành viên cũ cũng bắt đầu từ lịch sử hiện tại, tránh báo hàng loạt tin cũ.
- Badge nằm trên nút chat của các idea đã tham gia, giới hạn hiển thị `99+`; nhãn trợ năng giữ số thật. Dashboard tự cập nhật mỗi 5 giây và khi lấy lại focus/kết nối.
- Khi phòng đang hiển thị và có focus, client xác nhận snapshot đã tải bằng ID bình luận có `readCursor` cao nhất. Tab ẩn không đánh dấu. Tab cũ không thể kéo mốc đọc lùi, tin đến sau snapshot vẫn chưa đọc.
- `GET /api/unread` chỉ trả map số chưa đọc cho user trong session. `POST /api/ideas/:id/read` chỉ nhận `{commentId}`, yêu cầu session, same-origin và membership. Không nhận user ID/cursor tùy ý.
- Ghi bình luận cùng phòng được tuần tự bằng row lock để sequence phản ánh thứ tự commit; request dùng marker theo ID nên không mất độ chính xác microsecond hoặc bigint qua JavaScript.

## Upstash Redis Free trên Vercel

Khuyến nghị Upstash: Redis qua HTTPS REST, không giữ kết nối TCP từ serverless. Theo trang https://upstash.com/pricing/redis tại 2026-10-18, Free khoảng 250 MB, 500K commands/tháng, 10 GB bandwidth. Bảng chi tiết có thể ghi 256 MB. Không tự nâng cấp sang gói trả phí.

1. Tạo Redis database **Free** trong https://console.upstash.com. Chọn region gần Vercel/Supabase.
2. Trong Vercel → Project → Settings → Environment Variables, thêm các giá trị **server-side** sau từ phần REST API của Upstash:

```env
UPSTASH_REDIS_REST_URL=https://your-database.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-rest-token
# Optional read cache: keep off for the current low-traffic deployment.
IDEAHUB_REDIS_CACHE=false
```

3. Áp dụng cho Production (và Preview nếu cần), rồi redeploy. Không thêm `NEXT_PUBLIC_`, không commit token hoặc gửi token qua chat.

Cache đọc **tắt mặc định**, kể cả khi đã đặt đủ credentials. Chỉ bật khi `IDEAHUB_REDIS_CACHE=true` và có đủ hai biến Redis; cần redeploy khi đổi cấu hình. Ở chế độ tắt, đọc/ghi ứng dụng không gọi Redis, kể cả invalidation khi đổi profile. PostgreSQL và cache frontend tiếp tục hoạt động bình thường.

`/api/health` trả riêng `cache.configured` (đã cấu hình provider) và `cache.enabled` (cache đọc đang bật). Mở `/api/health?cache=verify` để kiểm tra Redis thật: `cache.status=ok`, `readWrite`, `hit` và `invalidation` cùng là `true`, ngay cả khi `enabled=false`. Phép kiểm tra chủ động dùng namespace tạm riêng, TTL 15 giây và xóa key sau khi xong; không tăng revision của cache ứng dụng. Kết quả gộp/cache 60 giây mỗi warm instance, giới hạn 4 request/phút/instance. Không trả URL/token/key.

Trang bình luận được đọc bằng **một câu SQL/một snapshot**, thay cho 5 lượt gọi DB ở trang đầu hoặc 6 lượt khi có cursor. Kiểm tra phòng/cursor, tổng số, thông tin tác giả và trang bình luận đều cùng snapshot. Không cần transaction `BEGIN/COMMIT` riêng cho lượt đọc này.

## Phạm vi cache và tính nhất quán

- Các mục dưới đây chỉ áp dụng khi bật cache đọc. Container mặc định dùng trực tiếp `PostgresIdeaRepository`.
- `CachedIdeaRepository` cache trang bình luận 5 giây và số bình luận/thành viên dùng cho SSE 2 giây. Các phòng khác nhau/cursor/page size có key riêng.
- Cache không lưu session, mật khẩu, tài khoản đăng nhập, mốc đã đọc hoặc kết quả idea được cá nhân hóa. Unread query luôn lấy PostgreSQL trực tiếp.
- Tạo idea, join, bình luận hoặc đổi tên/avatar tăng revision để các instance không đọc lại namespace cũ. Loader đang chạy từ revision cũ không thể ghi đè cache của revision mới. Cache của bản sửa trực tiếp qua SQL hết hạn theo TTL.
- Nếu Redis hoặc invalidation lỗi, database write vẫn thành công. Mỗi warm instance bỏ qua cache trong 30 giây; TTL ngắn giới hạn dữ liệu cũ ở instance khác. Không có bảo đảm transaction chung giữa PostgreSQL và Redis.
- Request Redis timeout 1,2 giây, không retry tự động. Các cache miss cùng key trong một instance gộp thành một lần load. Không có distributed lock.
- Mỗi cache hit cần GET revision và GET value; cache miss thêm SET. SSE/auth vẫn có request và chi phí theo số người dùng; gói Free phù hợp thử nghiệm lưu lượng nhỏ, cần theo dõi commands trong Upstash.
