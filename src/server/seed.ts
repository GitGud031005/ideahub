import type { Category, Comment } from "@/lib/domain";
import type { DataState } from "./state";

export function createSeed(now = Date.now()): DataState {
  const definitions: [string, string, Category, string, string, number, number, string[]][] = [
    ["Data crawling lab", "Cùng xây pipeline thu thập dữ liệu sản phẩm và giao thông, từ crawl đến làm sạch và trực quan hóa. Tìm đồng đội thích Python để thử nghiệm.", "Công nghệ", "Minh Anh", "MA", 8, 10, ["Công nghệ", "Data crawling", "Python", "Data engineering", "Web scraping", "BeautifulSoup", "Scrapy", "Playwright", "ETL", "Open data"]],
    ["Những góc học yên tĩnh", "Gom những góc học quanh trường, kèm wifi, ổ cắm và mức giá. Cùng tạo bản đồ để mỗi người đều tìm được chỗ ngồi phù hợp với mình.", "Đời sống", "Khánh An", "KA", 12, 32, ["Đời sống", "Không gian học", "Cộng đồng", "Bản đồ", "Cà phê", "Thư viện", "Wifi", "Review địa điểm"]],
    ["Đổi sách, nối câu chuyện", "Đăng một cuốn sách đã đọc, tìm người muốn đổi và hẹn trao tay trong trường. Cùng thiết kế cách để sách hay luôn có người đọc tiếp.", "Đời sống", "Thu Hà", "TH", 6, 60, ["Đời sống", "Sách", "Trao đổi", "Kết nối", "Đọc sách", "Sinh viên", "Sống xanh", "Book club"]],
    ["Trợ lý quản lý đồ án", "Một bảng chung cho deadline, phân công và tiến độ của cả nhóm. Tìm bạn cùng thiết kế, lập trình và thử nghiệm với những nhóm đồ án thật.", "Học tập", "Hải Đăng", "HD", 5, 120, ["Học tập", "Productivity", "Teamwork", "Web app", "Quản lý dự án", "Deadline", "UI/UX", "Open source", "Sinh viên"]],
    ["30 ngày làm điều mới", "Mỗi ngày dành 15 phút cho một kỹ năng bạn muốn thử. Chia sẻ tiến bộ, tìm người đồng hành và cùng giữ động lực suốt hành trình 30 ngày.", "Học tập", "An Nhiên", "AN", 9, 180, ["Học tập", "Thói quen", "Phát triển bản thân", "Thử thách", "Kỹ năng mới", "Tiếng Anh", "Sáng tạo", "Đồng hành"]],
    ["Một góc feedback thật lòng", "Mang một thiết kế đang làm dở và câu hỏi bạn còn băn khoăn. Cùng góp ý về bố cục, trải nghiệm và cách làm để phiên bản tiếp theo tốt hơn.", "Thiết kế", "Hà Phương", "HP", 4, 240, ["Thiết kế", "UI/UX", "Feedback", "Cộng đồng", "Portfolio", "Figma", "Typography", "Trải nghiệm", "Product design"]],
  ];
  const ideas = definitions.map(([title, description, category, name, initial, members, age, tags], index) => {
    const id = String(index + 1), authorId = `seed-author-${id}`;
    return { id, title, description, category, tags, creator: { id: authorId, name, initial }, createdAt: new Date(now - age * 60000).toISOString(), members: [authorId, ...Array.from({ length: members - 1 }, (_, n) => `seed-member-${id}-${n}`)] };
  });
  const comments: Comment[] = [];
  function add(ideaId: string, id: string, parentId: string | null, name: string, initial: string, text: string, order: number) {
    const idea = ideas.find(i => i.id === ideaId)!;
    comments.push({ id, ideaId, parentId, author: name === idea.creator.name ? idea.creator : { id: `seed-user-${id}`, name, initial }, text, createdAt: new Date(Date.parse(idea.createdAt) + order * 30000).toISOString() });
  }
  add("1", "m-1-0", null, "Minh Anh", "MA", "Mình muốn bắt đầu từ dữ liệu sản phẩm. Mọi người nghĩ nên chọn nguồn nào cho bản demo đầu tiên?", 1);
  add("1", "m-1-1", "m-1-0", "Hoàng Long", "HL", "Hay mình làm một pipeline nhỏ: thu thập → làm sạch → hiển thị. Có thể so sánh cách crawl trang tĩnh và trang động nữa.", 2);
  add("1", "seed-1-nam", "m-1-1", "Tuấn Nam", "TN", "Mình có thể thử crawl trang tĩnh trước, rồi so sánh với trang động. Nếu thống nhất schema đầu ra sớm thì cả nhóm sẽ dễ chia phần việc hơn.", 3);
  add("1", "seed-1-chi", null, "Linh Chi", "LC", "Mình muốn phụ trách phần làm sạch và trực quan hóa dữ liệu. Bản demo đầu tiên nên tập trung vào một nguồn để làm cho trọn vẹn nhé.", 4);
  add("1", "seed-1-minh", "seed-1-chi", "Minh Anh", "MA", "Hợp lý đó. Mình đề xuất bắt đầu từ dữ liệu sản phẩm, cùng chốt các trường cần lấy rồi chia việc ngay trong thread này.", 5);
  const starters = ["Mình đang gom các địa điểm quanh trường. Ai có góc học yêu thích thì chia sẻ vào đây nha!", "Mỗi người đăng một cuốn sách muốn đổi, kèm một lời giới thiệu ngắn nhé.", "Mình nghĩ bản đầu chỉ cần danh sách công việc, người phụ trách và deadline là đủ. Mọi người thấy sao?", "Ngày đầu tiên: dành 15 phút cho một việc bạn luôn muốn thử. Bạn chọn điều gì?", "Chào mọi người! Cứ chia sẻ thiết kế và nói rõ phần bạn muốn nhận góp ý nhé."];
  for (const [index, text] of starters.entries()) {
    const idea = ideas[index + 1];
    add(idea.id, `m-${idea.id}-0`, null, idea.creator.name, idea.creator.initial, text, 1);
    add(idea.id, `seed-${idea.id}-reply`, `m-${idea.id}-0`, "Phương Linh", "PL", "Mình có thể tham gia cùng. Cùng chốt một bản thử nghiệm nhỏ để bắt đầu nhé!", 2);
  }
  return { version: 1, ideas, comments };
}
