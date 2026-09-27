"use client";
// "ชุดข้อมูลนำเสนอผู้บริหาร" — one button in the simulator panel that loads a
// separate term of fictional courses for presenting the executive dashboard
// (internal/demo/scenario_presentation.go). Not a walkthrough step: it never
// touches the happy path's term, and running it again is a no-op.

import { useEffect, useState } from "react";
import { useSWRConfig } from "swr";
import { Button } from "@heroui/react";
import { Presentation } from "lucide-react";
import { demoLoadPresentation, demoPresentationStatus } from "../lib/api";

export default function DemoPresentationButton() {
  const { mutate } = useSWRConfig();
  const [loaded, setLoaded] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    demoPresentationStatus().then(r => setLoaded(r.loaded ? r.term_label : null)).catch(() => {});
  }, []);

  const load = async () => {
    setPending(true);
    setMessage(null);
    try {
      const r = await demoLoadPresentation();
      setMessage({ ok: true, text: r.message });
      const s = await demoPresentationStatus();
      setLoaded(s.loaded ? s.term_label : null);
      // The term picker and every dashboard read these.
      await mutate(k => typeof k === "string" && (k === "/terms" || k.startsWith("/dashboard")));
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "โหลดไม่สำเร็จ" });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="border-t border-border pt-4 flex flex-col gap-2">
      <div className="text-xs font-medium text-foreground">ชุดข้อมูลนำเสนอผู้บริหาร</div>
      <p className="text-xs text-muted">
        สร้างภาคเรียนแยกที่มีรายวิชาสมมติ 24 วิชาใน 6 หลักสูตร ครบทุกกรณีบนแดชบอร์ด ไม่กระทบเส้นทางหลัก
      </p>
      <Button size="sm" variant="secondary" fullWidth isPending={pending} isDisabled={!!loaded} onPress={load}>
        <Presentation size={14} />
        {loaded ? `โหลดแล้ว (ภาคเรียน ${loaded})` : "ชุดข้อมูลนำเสนอผู้บริหาร"}
      </Button>
      {loaded && !message && (
        <p className="text-xs text-muted">เลือกภาคเรียน {loaded} ที่มุมขวาบน แล้วเปิดแดชบอร์ดหรือมุมมองผู้บริหาร</p>
      )}
      {message && (
        <p role="status" className={`text-xs ${message.ok ? "text-emerald-800" : "text-red-700"}`}>{message.text}</p>
      )}
    </div>
  );
}
