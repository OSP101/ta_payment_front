"use client";
import { mutate } from "swr";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Bell, CalendarClock, FileText, Image as ImageIcon, Mail, Pencil, Pin, RotateCcw, Save, ShieldCheck,
} from "lucide-react";
import { toast } from "@/app/lib/toast";
import { api, errMessage } from "../../lib/api";
import RichText from "../../components/RichText";
import AttachmentGallery from "../../components/AttachmentGallery";
import {
  Alert, Button, Chip, ConfirmDialog, DatePicker, FieldGroup, Panel, TextInput, TimePicker, Tip,
} from "../../components/ui";
import BodyEditor from "./BodyEditor";
import { AttachmentsField, CoverImageField } from "./MediaFields";
import { AudienceSection, describeRule, useAudiencePreview, useFilterOptions } from "./AudienceFields";
import PublishCheck from "./PublishCheck";
import Section from "./Section";
import {
  CATEGORIES, CAT_META, CategoryChip, LIST_KEY, buildPayload, fmtDateTime, fromLocalParts,
  mailSubject, plainText, ruleOf, todayLocal,
  type Ann, type Category, type Draft,
} from "./shared";

// ============================================================================
// Unsent work, kept in this browser
// ============================================================================

const storeKey = (id?: string) => `ta-announce-unsaved:${id ?? "new"}`;

function readStored(id?: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(storeKey(id));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

function writeStored(id: string | undefined, d: Draft | null) {
  try {
    if (d) window.localStorage.setItem(storeKey(id), JSON.stringify(d));
    else window.localStorage.removeItem(storeKey(id));
  } catch {
    // Private mode or a full quota: the composer still works, it just cannot
    // bring the text back after a reload.
  }
}

// ============================================================================
// Starting points for the notices that go out every month
// ============================================================================

const TEMPLATES: { label: string; apply: Partial<Draft> }[] = [
  {
    label: "ตามเอกสารผู้ช่วยสอน",
    apply: {
      category: "warning", audience: ["ta"], targetFilters: ["ta_missing_documents"],
      title: "ขอให้ส่งเอกสารประกอบการเบิกจ่ายให้ครบ",
      body: "เรียน ผู้ช่วยสอน\n\nระบบพบว่าท่านยังส่งเอกสารประกอบการเบิกจ่ายไม่ครบ ขอให้ดำเนินการดังนี้\n\n- สำเนาบัตรประจำตัวประชาชน\n- สำเนาหน้าสมุดบัญชีธนาคาร\n- แบบฟอร์มเจ้าหนี้\n\nกรุณาอัปโหลดในเมนูเอกสารของฉันภายในวันที่ **(ระบุวันที่)** เพื่อให้เบิกจ่ายค่าตอบแทนได้ตามรอบ",
    },
  },
  {
    label: "ตามตารางเรียนผู้ช่วยสอน",
    apply: {
      category: "warning", audience: ["ta"], targetFilters: ["ta_missing_schedule"],
      title: "ขอให้บันทึกตารางเรียนของตนเอง",
      body: "เรียน ผู้ช่วยสอน\n\nท่านยังไม่ได้บันทึกตารางเรียนของภาคการศึกษานี้ ระบบจึงยังไม่เปิดให้ลงเวลาปฏิบัติงาน\n\nกรุณาบันทึกตารางเรียนในเมนูตารางเรียนภายในวันที่ **(ระบุวันที่)**",
    },
  },
  {
    label: "ตามอาจารย์อนุมัติเวลา",
    apply: {
      category: "warning", audience: ["lecturer"], targetFilters: ["lecturer_pending_worklog"],
      title: "มีบันทึกเวลาปฏิบัติงานของผู้ช่วยสอนรอการอนุมัติ",
      body: "เรียน อาจารย์ผู้สอน\n\nมีบันทึกเวลาปฏิบัติงานของผู้ช่วยสอนในรายวิชาของท่านรอการอนุมัติ ขอความกรุณาตรวจสอบและอนุมัติภายในวันที่ **(ระบุวันที่)** เพื่อให้จัดทำเอกสารเบิกจ่ายได้ทันรอบ",
    },
  },
  {
    label: "ประกาศทั่วไปถึงทุกคน",
    apply: { category: "info", audience: ["ta", "lecturer", "staff", "admin"], targetFilters: [], title: "", body: "" },
  },
];

// ============================================================================
// Composer
// ============================================================================

/**
 * The writing screen. Takes the whole page while it is open, so the form and
 * the preview can sit side by side, and returns to the list when it closes.
 *
 * Three ways out, each of which says what it does:
 *   บันทึกเป็นร่าง        saves, sends nothing
 *   ตรวจและเผยแพร่        opens the pre-publish check, which sends
 *   บันทึกการแก้ไข        for a notice already out; sends only if the
 *                         audience changed, and then asks first
 */
export default function Composer({
  initial, existing, autoCheck = false, onClose, onSaved,
}: {
  initial: Draft;
  /** Full saved record when editing; carries the recipient list. */
  existing?: Ann | null;
  /** Open the pre-publish check straight away ("ตรวจและเผยแพร่" from the detail pane). */
  autoCheck?: boolean;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [pending, setPending] = useState<"draft" | "publish" | null>(null);
  const [checkOpen, setCheckOpen] = useState(false);
  const [restorable, setRestorable] = useState<Draft | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const baseline = useRef(JSON.stringify(initial));
  const saved = useRef(false);

  const alreadyOut = initial.originalStatus === "live" || initial.originalStatus === "expired";
  const filterOpts = useFilterOptions();
  const rule = useMemo(() => ruleOf(draft), [draft]);
  const audience = useAudiencePreview(rule);
  const { preview, loading: previewLoading } = audience;
  const sentence = describeRule(draft, filterOpts);
  const ruleChanged = useMemo(
    () => normRule(ruleOf(draft)) !== normRule(ruleOf(initial)),
    [draft, initial],
  );
  const dirty = JSON.stringify(draft) !== baseline.current;

  // Offer back what was typed last time and never saved.
  useEffect(() => {
    const stored = readStored(initial.id);
    if (stored && JSON.stringify(stored) !== baseline.current) setRestorable(stored);
  }, [initial.id]);

  // Keep unsaved work in this browser, so closing the tab or pressing back
  // loses nothing and no "discard?" question is needed.
  useEffect(() => {
    if (saved.current) return;
    if (!dirty) return;
    const t = setTimeout(() => writeStored(initial.id, draft), 500);
    return () => clearTimeout(t);
  }, [draft, dirty, initial.id]);
  const latest = useRef(draft);
  latest.current = draft;
  useEffect(() => () => {
    if (!saved.current && JSON.stringify(latest.current) !== baseline.current) {
      writeStored(initial.id, latest.current);
    }
  }, [initial.id]);

  useEffect(() => {
    if (autoCheck) tryOpenCheck();
    // Only on mount: the detail pane asked for the check, once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft(d => ({ ...d, [k]: v }));

  async function save(asDraft: boolean) {
    const payload = buildPayload(draft, asDraft);
    if ("error" in payload) { toast.danger(payload.error); setCheckOpen(false); return; }
    setPending(asDraft ? "draft" : "publish");
    try {
      const res = await api.post<{ id: string }>("/announcements", payload);
      saved.current = true;
      writeStored(initial.id, null);
      toast.success(
        asDraft ? "บันทึกฉบับร่างแล้ว"
          : alreadyOut ? "บันทึกการแก้ไขแล้ว"
          : draft.when === "scheduled" ? "ตั้งเวลาเผยแพร่แล้ว"
          : "เผยแพร่ประกาศแล้ว",
      );
      await Promise.all([mutate(LIST_KEY), mutate(`/announcements/${res.id}`)]);
      setCheckOpen(false);
      onSaved(res.id);
    } catch (e) {
      toast.danger(errMessage(e));
    } finally {
      setPending(null);
    }
  }

  /** Validate first, so the check never opens on a form that cannot be sent. */
  function tryOpenCheck() {
    const payload = buildPayload(draft, false);
    if ("error" in payload) { toast.danger(payload.error); return; }
    // The check exists to show who gets it; without the count there is nothing to check.
    if (audience.failed) { audience.retry(); toast.danger("นับจำนวนผู้รับไม่สำเร็จ กำลังลองใหม่ กรุณากดอีกครั้ง"); return; }
    setCheckOpen(true);
  }

  function saveLiveEdit() {
    if (ruleChanged) tryOpenCheck();
    else void save(false);
  }

  function discard() {
    writeStored(initial.id, null);
    saved.current = true;
    onClose();
  }

  const cat = CAT_META[draft.category];
  const mediaCount = draft.attachments.length + (draft.cover_image_key ? 1 : 0);
  const untouchedNew = !initial.id && !draft.title && !draft.body;
  const scheduleAt = draft.when === "scheduled" ? fromLocalParts(draft.publishDate, draft.publishTime) : null;

  return (
    <div data-testid="announce-composer">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onPress={onClose}>
          <ArrowLeft size={14} /> กลับไปรายการประกาศ
        </Button>
        <span className="text-sm font-medium text-foreground">
          {initial.id ? "แก้ไขประกาศ" : "เขียนประกาศใหม่"}
        </span>
        {initial.originalStatus && initial.originalStatus !== "draft" && (
          <Chip tone={alreadyOut ? "success" : "info"}>
            {initial.originalStatus === "live" ? "เผยแพร่อยู่"
              : initial.originalStatus === "expired" ? "หมดอายุแล้ว" : "ตั้งเวลาไว้"}
          </Chip>
        )}
        <span className="flex-1" />
        {dirty && <span className="text-xs text-muted">เก็บสิ่งที่พิมพ์ไว้ในเบราว์เซอร์นี้แล้ว</span>}
      </div>

      {restorable && (
        <div className="mb-4">
          <Alert
            status="accent"
            icon={<RotateCcw size={14} />}
            title="มีเนื้อหาที่พิมพ์ค้างไว้จากครั้งก่อนและยังไม่ได้บันทึก"
            description={restorable.title ? `หัวข้อ “${restorable.title}”` : undefined}
            action={
              <div className="flex gap-2">
                <Button size="sm" variant="primary" onPress={() => { setDraft(restorable); setRestorable(null); }}>
                  นำกลับมา
                </Button>
                <Button size="sm" variant="tertiary" onPress={() => { writeStored(initial.id, null); setRestorable(null); }}>
                  ไม่ใช้
                </Button>
              </div>
            }
          />
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-5">
        <div className="min-w-0 space-y-3 lg:col-span-3">
          {untouchedNew && (
            <div className="rounded-xl border border-dashed border-border px-4 py-3">
              <div className="mb-2 text-xs text-muted">เริ่มจากแม่แบบ แล้วแก้ข้อความได้ตามต้องการ</div>
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATES.map(t => (
                  <button
                    key={t.label}
                    type="button"
                    className="chip chip-neutral cursor-pointer transition hover:border-brand"
                    onClick={() => setDraft(d => ({ ...d, ...t.apply }))}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Section icon={<Pencil size={15} />} title="เนื้อหาประกาศ">
            <FieldGroup label={<span>หัวข้อ <span className="text-muted">({draft.title.length}/200)</span></span>}>
              <TextInput
                placeholder="หัวข้อประกาศ"
                value={draft.title}
                maxLength={200}
                onChange={e => set("title", e.target.value)}
              />
            </FieldGroup>

            <FieldGroup label={<span>เนื้อหา <span className="text-muted">({draft.body.length}/8000)</span></span>}>
              <BodyEditor value={draft.body} onChange={v => set("body", v)} />
            </FieldGroup>

            <FieldGroup label="หมวดหมู่">
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map(c => {
                  const on = draft.category === c.value;
                  return (
                    <button
                      key={c.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set("category", c.value as Category)}
                      className={`chip inline-flex cursor-pointer items-center gap-1.5 transition ${on ? "chip-brand" : "chip-neutral"}`}
                    >
                      {c.icon}{c.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted">{cat.description}</p>
            </FieldGroup>
          </Section>

          <AudienceSection draft={draft} setDraft={setDraft} audience={audience} />
          {alreadyOut && ruleChanged && (
            <Alert
              status="warning"
              title="ผู้รับต่างจากตอนที่เผยแพร่"
              description="เมื่อบันทึก ระบบจะคำนวณรายชื่อผู้รับใหม่ คนที่เพิ่มเข้ามาจะได้รับแจ้งเตือน คนที่หลุดออกจะไม่เห็นประกาศนี้อีก จะมีหน้าตรวจให้ดูก่อน"
            />
          )}

          <Section
            icon={<ImageIcon size={15} />}
            title="รูปภาพและไฟล์แนบ"
            hint="ไม่ใส่ก็ได้ · พิมพ์ข้อความลงรูปจากแม่แบบเป็นรูปหน้าปกได้"
            collapsible
            defaultOpen={mediaCount > 0}
            summary={mediaCount > 0 ? `${mediaCount} ไฟล์` : "ยังไม่มีไฟล์"}
          >
            <CoverImageField draft={draft} setDraft={setDraft} />
            <AttachmentsField draft={draft} setDraft={setDraft} />
          </Section>

          <Section icon={<CalendarClock size={15} />} title="เวลาเผยแพร่">
            {alreadyOut ? (
              <p className="text-sm text-ink-2">
                เผยแพร่แล้วเมื่อ {fmtDateTime(initial.originalPublishedAt)}
                {initial.originalStatus === "expired" && " และหมดอายุแล้ว เลื่อนหรือเอาวันหมดอายุออกเพื่อให้กลับมาแสดง"}
              </p>
            ) : (
              <FieldGroup label="เผยแพร่เมื่อไหร่">
                <div className="flex flex-wrap gap-1.5">
                  {([["now", "ทันทีที่กดเผยแพร่"], ["scheduled", "ตั้งเวลา"]] as const).map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={draft.when === v}
                      onClick={() => set("when", v)}
                      className={`chip cursor-pointer transition ${draft.when === v ? "chip-brand" : "chip-neutral"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {draft.when === "scheduled" && (
                  <div className="flex flex-wrap items-center gap-2">
                    <DatePicker label="วันที่เผยแพร่" value={draft.publishDate} minValue={todayLocal()} onChange={v => set("publishDate", v)} />
                    <TimePicker label="เวลาเผยแพร่" value={draft.publishTime} onChange={v => set("publishTime", v)} />
                    <span className="text-xs text-muted">ระบบจะเผยแพร่และแจ้งเตือนเองตามเวลานี้</span>
                  </div>
                )}
              </FieldGroup>
            )}

            <FieldGroup label="วันหมดอายุ" hint="หลังเวลานี้ประกาศจะหายจากหน้าประกาศของผู้รับ">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={draft.expires} onChange={e => set("expires", e.target.checked)} />
                ตั้งวันหมดอายุ
              </label>
              {draft.expires && (
                <div className="flex flex-wrap items-center gap-2">
                  <DatePicker
                    label="วันหมดอายุ"
                    value={draft.expireDate}
                    minValue={draft.when === "scheduled" && draft.publishDate ? draft.publishDate : todayLocal()}
                    onChange={v => setDraft(d => ({ ...d, expireDate: v, expireTime: d.expireTime || "23:59" }))}
                  />
                  <TimePicker label="เวลาหมดอายุ" value={draft.expireTime} onChange={v => set("expireTime", v)} />
                </div>
              )}
            </FieldGroup>

            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.pinned} onChange={e => set("pinned", e.target.checked)} />
              <Pin size={14} /> ปักหมุดไว้บนสุดของหน้าประกาศ
            </label>
          </Section>
        </div>

        <div className="min-w-0 lg:col-span-2">
          <div className="space-y-3 lg:sticky lg:top-4">
            <Panel title="ผู้รับจะเห็นแบบนี้" description="หน้าประกาศในระบบ">
              <CardPreview draft={draft} />
            </Panel>
            <Panel title="แจ้งเตือนและอีเมล" description="ข้อความย่อที่ส่งออกไปพร้อมลิงก์เปิดอ่าน">
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <Bell size={14} className="mt-1 shrink-0 text-muted" />
                  <div className="min-w-0">
                    <div className="font-medium break-words">{mailSubject(draft.category, draft.title.trim() || "หัวข้อ…")}</div>
                    <div className="text-xs text-muted line-clamp-3 break-words">
                      {plainText(draft.body).slice(0, 240) || "เนื้อหา…"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted">
                  <Mail size={13} className="shrink-0" /> อีเมลใช้หัวเรื่องและข้อความเดียวกัน
                </div>
              </div>
            </Panel>
          </div>
        </div>
      </div>

      {/* The way out of the form. Sticky, so "who gets this" and the buttons
          are on screen together however long the announcement is. */}
      <div className="sticky bottom-3 z-10 mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-surface px-4 py-3 shadow-sm">
        <div className="min-w-0 flex-1 basis-56 text-sm">
          <span className="font-medium text-foreground">
            {audience.failed ? "นับจำนวนผู้รับไม่สำเร็จ"
              : !preview ? "กำลังนับผู้รับ…"
              : preview.empty ? "ยังไม่ได้เลือกผู้รับ"
              : `ส่งถึง ${preview.total} คน`}
          </span>
          {preview && !preview.empty && <span className="ms-2 text-xs text-muted">{sentence}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dirty && (
            <Tip content="ล้างสิ่งที่พิมพ์ไว้และกลับไปรายการ ประกาศที่บันทึกแล้วไม่ถูกแตะต้อง">
              <Button variant="ghost" onPress={() => setConfirmDiscard(true)} disabled={!!pending}>ทิ้งการแก้ไข</Button>
            </Tip>
          )}
          {alreadyOut ? (
            <Button variant="primary" onPress={saveLiveEdit} isPending={pending === "publish"} disabled={!!pending || !dirty}>
              <Save size={14} /> บันทึกการแก้ไข
            </Button>
          ) : (
            <>
              <Tip content="เก็บไว้ก่อน ยังไม่มีใครเห็นและไม่มีการแจ้งเตือน">
                <Button variant="secondary" onPress={() => void save(true)} isPending={pending === "draft"} disabled={!!pending}>
                  <FileText size={14} /> บันทึกเป็นร่าง
                </Button>
              </Tip>
              <Button variant="primary" onPress={tryOpenCheck} disabled={!!pending}>
                <ShieldCheck size={14} /> {scheduleAt || draft.when === "scheduled" ? "ตรวจและตั้งเวลา" : "ตรวจและเผยแพร่"}
              </Button>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        onConfirm={discard}
        danger
        title="ทิ้งสิ่งที่พิมพ์ไว้?"
        message={initial.id
          ? "การแก้ไขที่ยังไม่ได้บันทึกจะหายไป ประกาศจะกลับเป็นฉบับที่บันทึกไว้ล่าสุด"
          : "ข้อความที่พิมพ์ไว้จะหายไปและนำกลับมาไม่ได้"}
        confirmLabel="ทิ้ง"
        cancelLabel="เขียนต่อ"
      />

      <PublishCheck
        open={checkOpen}
        onClose={() => setCheckOpen(false)}
        onConfirm={() => void save(false)}
        pending={pending === "publish"}
        draft={draft}
        sentence={sentence}
        preview={preview}
        previewLoading={previewLoading}
        existing={existing}
      />
    </div>
  );
}

/** Order-independent form of a rule, for "did the audience change". */
function normRule(r: ReturnType<typeof ruleOf>): string {
  return JSON.stringify([
    [...r.roles].sort(), [...r.course_ids].sort(), [...r.user_ids].sort(), [...r.filters].sort(),
  ]);
}

function CardPreview({ draft }: { draft: Draft }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      {draft.cover_image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={draft.cover_image_url} alt="" className="aspect-video w-full object-cover" />
      )}
      <div className="p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <CategoryChip category={draft.category} />
          {draft.pinned && (
            <Chip tone="brand"><span className="inline-flex items-center gap-1"><Pin size={11} />ปักหมุด</span></Chip>
          )}
        </div>
        <div className="text-base font-semibold text-foreground break-words">
          {draft.title || <span className="text-muted">หัวข้อ…</span>}
        </div>
        {/* The same renderer the readers get, so the preview cannot promise a
            layout the announcement will not actually have. */}
        {draft.body
          ? <RichText body={draft.body} className="mt-2 text-sm text-foreground/80" />
          : <div className="mt-2 text-sm text-muted">เนื้อหา…</div>}
        {!!draft.attachments.length && (
          <div className="mt-3"><AttachmentGallery items={draft.attachments} /></div>
        )}
      </div>
    </div>
  );
}
