import type { Metadata } from "next";
import { Profile } from "@/components/profile";
export const metadata: Metadata = { title: "Hồ sơ" };
export default function ProfilePage() { return <Profile/>; }
