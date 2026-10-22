import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
export function SiteFooter({ onNavigate }: { onNavigate?: () => void }) {
  return <footer className="ih-footer"><div className="ih-footer-inner"><span className="ih-footer-logo">ideahub.</span><Link className="ih-footer-startup" href="/business-for-startup" onClick={onNavigate}>Business for Startup<ArrowUpRight size={16} aria-hidden="true"/></Link></div></footer>;
}
