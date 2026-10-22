import { StartupShell } from "@/components/business-for-startup/shell";
import { SiteFooter } from "@/components/site-footer";
import { lessonCatalog, lessonGroups, searchEntries } from "@/content/business-for-startup";
import "./startup.css";
export default function BusinessLayout({ children }: { children: React.ReactNode }) {
  return <><StartupShell catalog={lessonCatalog} groups={lessonGroups} entries={searchEntries}>{children}</StartupShell><SiteFooter/></>;
}
