import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/providers";
import "@fontsource-variable/montserrat";
import "@fontsource-variable/montserrat/wght-italic.css";
import "./globals.css";
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };
export const metadata: Metadata = { title: { default: "IdeaHub — Nghĩ cùng nhau. Làm cùng nhau.", template: "%s — IdeaHub" }, description: "Hội tụ những tia sáng, mở lối cho ý tưởng. Cùng tìm đồng đội, góp ý và xây dựng những ý tưởng lớn." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body><Providers><div id="ih-app">{children}</div></Providers></body></html>;
}
