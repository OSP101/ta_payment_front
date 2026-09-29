import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Footprints, Rocket } from "lucide-react";
import { notFound } from "next/navigation";
import { docHref, findPage, gettingStarted, sidebarSections } from "../../../content/docs/registry";
import { AUDIENCE_LABEL, type Audience } from "../../../content/docs/types";

const VALID: Audience[] = ["staff", "lecturer", "ta"];

export async function generateMetadata({ params }: { params: Promise<{ audience: string }> }): Promise<Metadata> {
  const { audience: raw } = await params;
  if (!VALID.includes(raw as Audience)) return {};
  return { title: `คู่มือ${AUDIENCE_LABEL[raw as Audience]}` };
}

const INTRO: Record<Audience, string> = {
  staff: "งานของเจ้าหน้าที่ใน COCO TAS เรียงตามลำดับจริงของแต่ละเทอม ตั้งแต่เปิดเทอมใหม่จนส่งเอกสารเบิกจ่ายเดือนสุดท้าย",
  lecturer: "งานของอาจารย์ใน COCO TAS ตั้งแต่กรอกตารางเวลาต้นเทอม จนอนุมัติบันทึกเวลาเดือนสุดท้ายและเซ็นเอกสาร",
  ta: "สิ่งที่ผู้ช่วยสอนต้องทำใน COCO TAS ตั้งแต่เข้าสู่ระบบครั้งแรกจนเงินเข้าบัญชี ทำตามลำดับนี้แล้วจะไม่ตกขั้นไหน",
  common: "",
};

/**
 * "Getting Started" landing per audience — the whole reason this manual
 * exists as a *platform* rather than a flat page list: a numbered path a
 * newcomer can follow start to finish, the way nextjs.org's own Getting
 * Started walks App Router from zero to a working page.
 */
export default async function AudienceHomePage({ params }: { params: Promise<{ audience: string }> }) {
  const { audience: raw } = await params;
  if (!VALID.includes(raw as Audience)) notFound();
  const audience = raw as Audience;

  const path = gettingStarted(audience);
  // The one-page walkthrough a newcomer is sent to (lecturer and TA only).
  const start = findPage(audience, "start");
  const sections = sidebarSections(audience);

  return (
    <div>
      <div className="mb-8">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft/50 px-3 py-1 text-xs font-medium text-accent-soft-foreground mb-3">
          <Rocket size={13} /> เริ่มต้นใช้งาน สำหรับ{AUDIENCE_LABEL[audience]}
        </div>
        <h1 className="text-3xl font-semibold text-foreground tracking-tight leading-tight">
          คู่มือ{AUDIENCE_LABEL[audience]}
        </h1>
        <p className="mt-3 text-base leading-7 text-muted max-w-[60ch]">{INTRO[audience]}</p>
      </div>

      {start && (
        <Link
          href={docHref(start, audience)}
          className="group mb-8 flex items-center gap-4 rounded-2xl border border-(--brand)/30 bg-accent-soft/40 px-5 py-4 hover:border-(--brand) hover:shadow-sm transition-all"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-(--brand) text-white">
            <Footprints size={22} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[17px] font-semibold text-foreground">ใช้งานครั้งแรก เริ่มที่นี่</div>
            <div className="text-sm text-muted mt-0.5">{start.description}</div>
          </div>
          <ArrowRight size={18} className="shrink-0 text-(--brand) transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      )}

      {path.length > 0 && (
        <h2 className="text-base font-semibold text-foreground mb-3">{start ? "หรือเลือกอ่านทีละหัวข้อ" : "เริ่มต้นใช้งาน"}</h2>
      )}
      {path.length > 0 && (
        <ol className="space-y-3 mb-10">
          {path.map((p, i) => (
            <li key={p.slug}>
              <Link
                href={docHref(p, audience)}
                className="group flex items-start gap-3 rounded-xl border border-border bg-white px-4 py-3.5 hover:border-(--brand) hover:shadow-sm transition-all"
              >
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-500 group-hover:bg-(--brand) group-hover:text-white transition-colors">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-foreground">{p.title}</div>
                  <div className="text-sm text-muted mt-0.5">{p.description}</div>
                </div>
                <ArrowRight size={16} className="mt-1.5 shrink-0 text-slate-300 group-hover:text-(--brand) transition-colors" />
              </Link>
            </li>
          ))}
        </ol>
      )}

      <div className="border-t border-border pt-6">
        <h2 className="text-base font-semibold text-foreground mb-3">หัวข้อทั้งหมด</h2>
        <div className="grid gap-6 sm:grid-cols-2">
          {sections.map(({ section, pages }) => (
            <div key={section}>
              <div className="text-xs font-semibold text-muted mb-1.5">{section}</div>
              <ul className="space-y-0.5">
                {pages.map((p) => (
                  <li key={`${p.audience}:${p.slug}`}>
                    <Link
                      href={docHref(p, audience)}
                      className="text-sm text-foreground/85 hover:text-(--brand) hover:underline underline-offset-2"
                    >
                      {p.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
