import { normalize } from "./format";

export const MAX_IDEA_TAGS = 12;
export const IDEA_TAG_GROUPS = [
  {name:"Công nghệ & dữ liệu",tags:["Công nghệ","AI","Machine learning","Data science","Data engineering","Data crawling","Phân tích dữ liệu","Dữ liệu mở","Tự động hóa","IoT","Robot","An ninh mạng"]},
  {name:"Lập trình & sản phẩm số",tags:["Lập trình","Python","JavaScript","TypeScript","Web app","Mobile app","Frontend","Backend","API","Cloud","DevOps","Open source","No-code","SaaS","SQL","PostgreSQL","Cơ sở dữ liệu","React","Next.js","Blockchain","AR/VR"]},
  {name:"Kinh doanh & khởi nghiệp",tags:["Khởi nghiệp","Mô hình kinh doanh","Thương mại điện tử","Marketing","Thương hiệu","Bán hàng","Nghiên cứu thị trường","Quản lý sản phẩm","Chăm sóc khách hàng","Kinh tế chia sẻ","Doanh nghiệp xã hội","Chuyển đổi số"]},
  {name:"Tài chính & pháp lý",tags:["Tài chính cá nhân","Tiết kiệm","Đầu tư","Fintech","Thanh toán","Kế toán","Bảo hiểm","Pháp luật","Sở hữu trí tuệ","Quyền riêng tư","Quản trị","An toàn thông tin"]},
  {name:"Giáo dục & nghiên cứu",tags:["Học tập","Giáo dục","Tự học","Ngoại ngữ","Sách","Thư viện","Nghiên cứu","STEM","Kỹ năng mềm","Hướng nghiệp","Edtech","Học trực tuyến"]},
  {name:"Thiết kế & sáng tạo",tags:["Thiết kế","UI/UX","Thiết kế đồ họa","Thiết kế sản phẩm","Kiến trúc","Nội thất","Thời trang","Minh họa","Nhiếp ảnh","Video","Animation","3D"]},
  {name:"Nghệ thuật & truyền thông",tags:["Nghệ thuật","Âm nhạc","Điện ảnh","Viết lách","Kể chuyện","Podcast","Sáng tạo nội dung","Mạng xã hội","Báo chí","Xuất bản","Văn hóa","Di sản"]},
  {name:"Sức khỏe & chăm sóc",tags:["Sức khỏe","Sức khỏe tinh thần","Dinh dưỡng","Chăm sóc cá nhân","Y tế","Medtech","Chăm sóc người cao tuổi","Trẻ em","Gia đình","Thiền","Giấc ngủ","Tiếp cận cho mọi người"]},
  {name:"Môi trường & năng lượng",tags:["Môi trường","Phát triển bền vững","Tái chế","Kinh tế tuần hoàn","Năng lượng sạch","Biến đổi khí hậu","Bảo tồn","Đa dạng sinh học","Tiết kiệm nước","Không khí sạch","Giảm rác thải","Vật liệu xanh"]},
  {name:"Nông nghiệp & thực phẩm",tags:["Nông nghiệp","Nông nghiệp thông minh","Trồng trọt","Chăn nuôi","Thủy sản","Thực phẩm","An toàn thực phẩm","Nông sản","Nông nghiệp đô thị","Chuỗi cung ứng","Ẩm thực","Nấu ăn"]},
  {name:"Đời sống & cộng đồng",tags:["Đời sống","Cộng đồng","Tình nguyện","Thiện nguyện","Kết nối xã hội","Sống tối giản","Nhà thông minh","Tiện ích hằng ngày","Tiêu dùng thông minh","Thú cưng","Bình đẳng","Khác"]},
  {name:"Đô thị & di chuyển",tags:["Đô thị thông minh","Giao thông","Giao thông công cộng","Xe điện","Logistics","Bản đồ","Không gian công cộng","Nhà ở","Bất động sản","An toàn giao thông","Du lịch","Trải nghiệm địa phương"]},
  {name:"Thể thao & giải trí",tags:["Thể thao","Fitness","Chạy bộ","Đạp xe","Yoga","Hoạt động ngoài trời","Game","Esports","Board game","Sự kiện","Giải trí","Sở thích"]},
  {name:"Khoa học & kỹ thuật",tags:["Khoa học","Toán học","Vật lý","Hóa học","Sinh học","Công nghệ sinh học","Điện tử","Cơ khí","In 3D","Vật liệu mới","Hàng không vũ trụ","Thí nghiệm"]},
  {name:"Công việc & cộng tác",tags:["Teamwork","Tìm đồng đội","Năng suất","Quản lý dự án","Làm việc từ xa","Freelance","Tuyển dụng","Nhân sự","Đào tạo","Chia sẻ kiến thức","Mentoring","Tạo mẫu","MVP","Kiểm thử người dùng"]},
] as const;
export const IDEA_TAGS: readonly string[] = IDEA_TAG_GROUPS.flatMap(group=>[...group.tags]);
export const IDEA_TAG_SET: ReadonlySet<string> = new Set(IDEA_TAGS);
export function searchIdeaTags(query:string){
  const terms=normalize(query.trim()).split(/\s+/).filter(Boolean);
  return IDEA_TAG_GROUPS.map(group=>({name:group.name,tags:group.tags.filter(tag=>terms.every(term=>normalize(`${group.name} ${tag}`).includes(term)))})).filter(group=>group.tags.length);
}
