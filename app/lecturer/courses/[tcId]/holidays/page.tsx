"use client";
import { use } from "react";
import { MakeupScheduler } from "../../../../components/MakeupScheduler";
import { OtherWaivers } from "./OtherWaivers";

export default function LecturerHolidaysPage({ params }: { params: Promise<{ tcId: string }> }) {
  const { tcId } = use(params);
  return (
    <>
      <MakeupScheduler tcId={tcId} viewer="lecturer" />
      <OtherWaivers tcId={tcId} />
    </>
  );
}
