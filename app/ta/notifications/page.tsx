"use client";
import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Panel, Button } from "../../components/ui";
import NotificationsList from "../../components/NotificationsList";
import { useTAApproval } from "../TAGate";

export default function TANotificationsPage() {
  const { approved } = useTAApproval();

  const banner = !approved ? (
    <Panel className="mb-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
          <AlertTriangle size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground">ยังไม่ได้ส่งเอกสาร</div>
          <div className="text-xs text-muted mt-0.5">
            กรอกข้อมูลและอัปโหลดเอกสารประกอบให้ครบ เพื่อปลดล็อกเมนูอื่น ๆ
          </div>
        </div>
        <Link href="/ta/documents">
          <Button variant="primary" size="sm">
            ไปที่เอกสาร <ArrowRight size={14} />
          </Button>
        </Link>
      </div>
    </Panel>
  ) : null;

  return <NotificationsList header={banner} />;
}
