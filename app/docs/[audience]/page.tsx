import Link from "next/link";
import { ArrowRight, Rocket } from "lucide-react";
import { notFound } from "next/navigation";
import { docHref, gettingStarted, sidebarSections } from "../../../content/docs/registry";
import { AUDIENCE_LABEL, type Audience } from "../../../content/docs/types";

const VALID: Audience[] = ["staff", "lecturer", "ta"];

const INTRO: Record<Audience, string> = {
  staff: "เส้นทางของเจ้าหน้าที่ในระบบ COCO TAS: จากเปิดเทอมใหม่จนถึงส่งเอกสารเบิกจ่ายเดือนสุดท้าย เรียงตามลำดับงานจริงในแต่ละเทอม",
  lecturer: "เส้นทางของอาจารย์ในระบบ COCO TAS: จากกรอกตารางเวลาต้นเทอม ไปจนถึงอนุมัติบันทึกเวลาเดือนสุดท้ายและเซ็นเอกสาร",
  ta: "เส้นทางของผู้ช่วยสอนในระบบ COCO TAS: จากเข้าสู่ระบบครั้งแรกไปจนถึงเงินเข้าบัญชี ทำตามลำดับนี้เพื่อให้ทุกขั้นตอนครบถ้วน",
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
  const sections = sidebarSections(audience);

  return (
    <div>
      <div className="mb-8">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft/50 px-3 py-1 text-xs font-medium text-accent-soft-foreground mb-3">
          <Rocket size={13} /> เริ่มต้นใช้งาน · {AUDIENCE_LABEL[audience]}
        </div>
        <h1 className="text-3xl font-semibold text-foreground tracking-tight leading-tight">
          คู่มือการใช้งาน · {AUDIENCE_LABEL[audience]}
        </h1>
        <p className="mt-3 text-base leading-7 text-muted max-w-[60ch]">{INTRO[audience]}</p>
      </div>

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
