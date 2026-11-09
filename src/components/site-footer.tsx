import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import styles from "./site-footer.module.css";
export function SiteFooter({ onNavigate }: { onNavigate?: () => void }) {
  return <footer className={`ih-footer ${styles.footer}`}><div className={styles.inner}><Link className={styles.logo} href="/" aria-label="IdeaHub — trang chủ" onClick={onNavigate}>ideahub.</Link><Link className={styles.startup} href="/business-for-startup" onClick={onNavigate}>Business for Startup<ArrowUpRight size={18} aria-hidden="true"/></Link></div></footer>;
}
