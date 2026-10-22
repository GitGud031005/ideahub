import Link from "next/link";
export default function LessonNotFound() { return <div className="bfs-not-found"><span className="bfs-eyebrow">KHÔNG TÌM THẤY BÀI</span><h1>Bài này chưa có trong tài liệu</h1><p>Chọn một chương trong danh sách hoặc quay lại trang tổng quan.</p><Link className="bfs-primary" href="/business-for-startup">Xem các chương</Link></div>; }
