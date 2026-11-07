"use client";
import { useState } from "react";
import Link from "next/link";
import useSWR, { mutate } from "swr";
import { filenameFromCD } from "./ExportPreviewBody";
import { Download, CalendarRange } from "lucide-react";
import { apiFetch, apiUrl, errMessage } from "../lib/api";
import { notify } from "../lib/notify";
import { Panel, Button, Chip, EmptyState } from "./ui";
import { useI18n } from "../lib/i18n/client";
import type { TermProgressOverview } from "./DocumentProgressBoard";

export function MonthlyPayoutPanel({termId}:{termId:string}) {
 const {t}=useI18n();
 const key=`/document-progress?term_id=${termId}`;
 const {data,error}=useSWR<TermProgressOverview>(key);
 const [picked,setPicked]=useState<number|null>(null);
 const [busy,setBusy]=useState(false);
 const months=(data?.rounds??[]).filter(r=>r.year_month);
 const current=months.find(r=>r.round===picked)??months.find(r=>r.period_closed&&!r.all_exported)??months[0];
 async function download(){
  if(!current?.year_month)return;
  setBusy(true);
  try{
   const response=await apiFetch(apiUrl(`/exports/terms/${termId}/monthly-payout.zip?months=${current.year_month}`),{method:"POST",credentials:"include"});
   if(!response.ok){const result=await response.json().catch(()=>null);throw new Error(result?.error??result?.message??t("ออกชุดเบิกไม่สำเร็จ"));}
   const blob=await response.blob();const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filenameFromCD(response.headers.get("Content-Disposition"))??`TA-payout-${current.year_month}.zip`;a.click();URL.revokeObjectURL(url);
   await mutate(key);void mutate(k=>typeof k==="string"&&(k.includes("/exports/")||k.includes("/submission-periods/")));
   notify.success(t("ดาวน์โหลดชุดเบิกประจำเดือนแล้ว"));
  }catch(e){notify.error(errMessage(e));}finally{setBusy(false);}
 }
 return <Panel title={t("ชุดเบิกประจำเดือน")} description={t("ตรวจรายการให้ครบหลังปิดรับเวลา แล้วออกเอกสารรวมประจำเดือนเพื่อลงนามและส่งการเงิน")}>
  {error?<p className="text-danger-soft-foreground">{errMessage(error)}</p>:!data?<p>{t("กำลังโหลดข้อมูล…")}</p>:!current?<EmptyState title={t("ยังไม่มีเดือนสำหรับชุดเบิกใหม่")} description={t("ตั้งรอบส่งเวลารายเดือนก่อน เอกสารที่เคยออกแล้วให้ดำเนินการผ่านประวัติเดิม")} />:<div className="space-y-4">
   <div className="flex flex-wrap gap-2" aria-label={t("เลือกเดือนที่จะเบิก")}>{months.map(m=><Button key={m.round} size="sm" variant={m.round===current.round?"primary":"secondary"} onClick={()=>setPicked(m.round)}><CalendarRange size={14}/>{m.round_label}</Button>)}</div>
   <div className="flex flex-wrap items-center gap-3"><strong>{current.round_label}</strong><Chip tone={current.all_exported?"success":"warn"}>{current.all_exported?t("ออกชุดเบิกแล้ว"):current.period_closed?t("ปิดรับเวลาแล้ว"):t("ยังอยู่ในกรอบส่งเวลา")}</Chip><span className="text-sm text-muted">{t("ส่งออกแล้ว {done} / {total} วิชา",{done:current.exported_courses,total:current.total_courses})}</span></div>
   {!!current.unexported_courses.length&&<p className="text-sm">{t("รายวิชาที่ยังไม่ส่งออก")}: {current.unexported_courses.map(c=>c.code).join(", ")}</p>}
   <p className="text-xs text-muted">{t("รายชั่วโมงใช้เวลาที่ผ่านอนุมัติ ส่วนบัณฑิตศึกษาภาคพิเศษแบบเหมาจ่ายเบิกได้แม้ไม่มีบันทึกเวลา ระบบตรวจทุกวิชาอีกครั้งก่อนออกชุดรวม")}</p>
   <div className="flex flex-wrap items-center gap-3"><Button variant="primary" isPending={busy} disabled={busy||(!current.period_closed&&!current.all_exported)||current.total_courses===0} onClick={download}><Download size={16}/>{current.all_exported?t("ดาวน์โหลดชุดเดิม"):t("ออกชุดเบิกรวมของเดือน")}</Button><Link href="/staff/progress" className="text-sm text-brand underline">{t("อัปเดตความคืบหน้าเอกสาร")}</Link></div>
  </div>}
 </Panel>;
}
