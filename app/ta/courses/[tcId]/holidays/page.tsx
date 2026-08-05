"use client";
import { use } from "react";
import { MakeupScheduler } from "../../../../components/MakeupScheduler";

export default function TAHolidaysPage({ params }: { params: Promise<{ tcId: string }> }) {
  const { tcId } = use(params);
  return <MakeupScheduler tcId={tcId} viewer="ta" />;
}
