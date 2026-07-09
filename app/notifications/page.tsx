"use client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import NotificationsList from "../components/NotificationsList";

export default function NotificationsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[900px] mx-auto p-4 md:p-8">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground mb-3">
          <ArrowLeft size={14} /> กลับหน้าแรก
        </Link>
        <NotificationsList />
      </div>
    </div>
  );
}
