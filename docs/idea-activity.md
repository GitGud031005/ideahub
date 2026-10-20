# Thứ tự hoạt động của ý tưởng

- Dashboard mặc định `sort=activity` (Tin nhắn mới nhất); vẫn chọn được Mới tạo nhất hoặc Nhiều người tham gia.
- API Idea có `lastCommentAt: string | null`, lấy tin mới nhất trong cả root và nhánh trả lời. Tin của chính mình và tin chỉ có tệp đều tính. Ghim, đọc tin hoặc tham gia không đổi thời gian này.
- Thứ tự activity giảm dần theo thời gian tin cuối; idea chưa có tin dùng thời gian tạo. Khi bằng nhau dùng ID tăng dần để phân trang ổn định.
- Cursor giữ mốc snapshot và thời gian xếp hạng đầy đủ microsecond trên PostgreSQL. Tin nhắn đến sau snapshot không làm trượt trang; lượt refetch bắt đầu từ trang đầu sẽ đưa idea vừa hoạt động lên đúng vị trí. Bộ lọc/tìm kiếm hoạt động như cũ.
- Dashboard refetch activity mỗi 5 giây khi tab đang mở, dừng poll danh sách khi mở form tạo idea; sort khác 30 giây. Query mặc định không poll tab nền. Không cache danh sách theo người xem qua Redis.
- Bên trái badge chưa đọc có thời gian tin gần nhất theo phút/giờ/ngày; không có tin thì ẩn. Thời gian tự cập nhật mỗi phút, badge 0 vẫn ẩn.
- Dùng index `comments_room_cursor_idx (idea_id,created_at,id)` hiện có cho truy vấn tin cuối; không cần schema migration hoặc quét nội dung tin trên frontend.
