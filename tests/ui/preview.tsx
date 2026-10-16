// Isolated responsive fixtures: actual UI components; no production API writes.
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { Providers } from "../../src/components/providers";
import { Dashboard } from "../../src/components/dashboard";
import { Discussion } from "../../src/components/discussion";
import type { Account, Comment, Idea } from "../../src/lib/domain";
declare global { interface Window { __qaScene: string; __qaNavigate: (path: string) => void } }
const person: Account = { id: "qa-person", username: "minhan", name: "Nguyễn Minh An", initial: "NA" };
const tags = ["Công nghệ", "Data engineering", "Python", "Open source", "Thiết kế", "Teamwork", "PostgreSQL", "Tìm đồng đội", "Mobile", "Product", "Frontend", "Backend"];
const ideas: Idea[] = ["Phòng thí nghiệm Data Crawling", "Bản đồ không gian học tập", "Tủ sách trao đổi cộng đồng"].map((title, i) => ({ id: `qa-idea-${i}`, title, description: "Cùng xây một sản phẩm hữu ích, chia sẻ góc nhìn và tìm đồng đội để đưa ý tưởng thành hiện thực", category: "Công nghệ", tags, creator: person, createdAt: new Date().toISOString(), memberCount: 12, commentCount: 13, mine: false, joined: false }));
const comments: Comment[] = Array.from({ length: 13 }, (_, i) => ({ id: `qa-comment-${i}`, ideaId: ideas[0].id, parentId: i ? `qa-comment-${i - 1}` : null, author: i % 2 ? { id: "qa-other", name: "Trần Ngọc Bình", initial: "TB" } : person, text: i ? "Mình đồng ý. Cùng bắt đầu từ một phần nhỏ, rồi xây dựng và hoàn thiện từng bước nhé" : "Mình có thể phụ trách phần thu thập dữ liệu và xây dựng pipeline. Mọi người muốn bắt đầu từ nguồn nào?", createdAt: new Date().toISOString() }));
let current = window.__qaScene === "guest" ? null : person;
window.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof Request ? input.url : input.href, "https://fixture.ideahub.test"), path = url.pathname;
  if (!path.startsWith("/api/")) throw new Error("UI fixture blocked a non-mocked request");
  if (path === "/api/session") return Response.json({ user: current, storage: "postgres" });
  if (path === "/api/auth/logout") { current = null; return Response.json({ user: null, storage: "postgres" }); }
  if (path === "/api/ideas") return Response.json({ items: ideas, total: 3, counts: { all: 3, joined: 1, mine: 1 } });
  if (path.endsWith("/comments")) return Response.json({ items: comments, total: comments.length, nextCursor: null });
  if (path.endsWith("/join") && init?.method === "POST") return Response.json({ ...ideas[0], joined: true });
  if (path.startsWith("/api/ideas/")) return Response.json(ideas[0]);
  return Response.json({ error: { code: "QA_ONLY", message: "Đây là fixture UI; không gửi dữ liệu thật" } }, { status: 400 });
};
function App() {
  const [route, setRoute] = useState(window.__qaScene === "discussion" ? `/ideas/${ideas[0].id}` : "/");
  window.__qaNavigate = setRoute;
  return <Providers><div id="ih-app">{route.startsWith("/ideas/") ? <Discussion id={ideas[0].id}/> : <Dashboard/>}</div></Providers>;
}
createRoot(document.getElementById("root")!).render(<App/>);
