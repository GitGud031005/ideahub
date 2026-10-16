"use client";
import { ErrorState } from "@/components/status";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <main className="ih-empty"><ErrorState error={new Error("Trang đang gặp sự cố, hãy thử lại")} retry={reset}/></main>; }
