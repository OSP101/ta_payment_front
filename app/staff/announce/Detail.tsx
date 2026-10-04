"use client";
import useSWR, { mutate } from "swr";
import { useMemo, useState } from "react";
import {
  ArrowLeft, BellRing, CalendarClock, Clock, Eye, EyeOff, Globe, Mail, Megaphone,
  Pencil, Pin, PinOff, RefreshCw, Send, ShieldCheck, Trash2, Users,
} from "lucide-react";
import { toast } from "@/app/lib/toast";
import { api, errMessage } from "../../lib/api";
import RichText from "../../components/RichText";
import ShareButtons from "../../components/ShareButtons";
import AttachmentGallery from "../../components/AttachmentGallery";
import { Skel } from "../../components/Skeletons";
import { Button, Chip, ConfirmDialog, EmptyState, Tip } from "../../components/ui";
import { describeRule, useFilterOptions } from "./AudienceFields";
import {
  CategoryChip, LIST_KEY, StatusChip, draftFromAnn, fmtDateTime, toPinPayload,
  type Ann, type Recipient,
} from "./shared";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Everything about one announcement: what readers see, who it went to, and
 * what happened to each delivery. The buttons here act on this announcement
 * only, so they are named once instead of once per list row.
 */
export default function Detail({
  row, onBack, onEdit, onDeleted,
}: {
  /** The list row — shown at once while the full record loads. */
  row: Ann;
  /** Phones show the detail in place of the list; this goes back. */
  onBack: () => void;
  onEdit: (full: Ann, opts?: { check?: boolean }) => void;
  onDeleted: () => void;
}) {
  const key = `/announcements/${row.id}`;
  const { data: full } = useSWR<Ann>(key);
  const a = full ?? row;
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"delete" | "publish" | "remind" | "unpublish" | null>(null);
  const filterOpts = useFilterOptions();

  const refresh = () => Promise.all([mutate(LIST_KEY), mutate(key)]);

  async function run(name: string, fn: () => Promise<string>) {
    setBusy(name);
    try {
      const msg = await fn();
      toast.success(msg);
      await refresh();
    } catch (e) {
      toast.danger(errMessage(e));
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  }

  const publishNow = () => run("publish", async () => {
    await api.post(`${key}/publish`);
    return "เผยแพร่ประกาศแล้ว";
  });
  const unpublish = () => run("unpublish", async () => {
    await api.post(`${key}/unpublish`);
    return a.status === "scheduled" ? "ยกเลิกกำหนดเผยแพร่แล้ว กลับเป็นฉบับร่าง" : "ยกเลิกการเผยแพร่แล้ว กลับเป็นฉบับร่าง";
  });
  const togglePin = () => run("pin", async () => {
    await api.post("/announcements", toPinPayload(a, !a.pinned));
    return a.pinned ? "ยกเลิกปักหมุดแล้ว" : "ปักหมุดไว้บนสุดแล้ว";
  });
  const resend = () => run("resend", async () => {
    const r = await api.post<{ sent: number; failed: number }>(`${key}/send-email`);
    if (r.failed > 0) throw new Error(`ส่งสำเร็จ ${r.sent} คน ยังไม่สำเร็จ ${r.failed} คน ดูสาเหตุในรายชื่อด้านล่าง`);
    return r.sent > 0 ? `ส่งสำเร็จ ${r.sent} คน` : "ไม่มีรายการค้างส่ง";
  });
  const remind = () => run("remind", async () => {
    const r = await api.post<{ reminded: number }>(`${key}/remind`);
    return `เตือนซ้ำถึง ${r.reminded} คนที่ยังไม่เปิดอ่านแล้ว`;
  });

  async function del() {
    setBusy("delete");
    try {
      await api.del(key);
      toast.success("ลบประกาศแล้ว");
      setConfirm(null);
      onDeleted();
      await mutate(LIST_KEY);
    } catch (e) {
      toast.danger(errMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const total = a.audience_count ?? 0;
  const failed = a.failed_count ?? 0;
  const waiting = a.pending_count ?? 0;
  const read = a.read_count ?? 0;
  const delivered = Math.max(0, total - failed - waiting);
  const unread = Math.max(0, delivered - read);
  const remindedRecently = !!a.reminded_at && Date.now() - new Date(a.reminded_at).getTime() < DAY;
  const wasSent = a.status === "live" || a.status === "expired";

  // The saved rule, said in words — same sentence the composer shows.
  const sentence = full ? describeRule(draftFromAnn(full), filterOpts) : "";

  return (
    <div data-testid="announce-detail" data-tour="announce-detail" className="rounded-xl border border-border bg-surface">
      {/* Stays at the top of the pane's own scroll, so the actions are never
          a scroll away from the recipient table they act on. */}
      <div className="z-10 flex flex-wrap items-center gap-1.5 rounded-t-xl border-b border-hairline bg-surface px-4 py-3 lg:sticky lg:top-0">
        <Button variant="ghost" size="sm" onPress={onBack} className="lg:hidden">
          <ArrowLeft size={14} /> รายการ
        </Button>

        {a.status === "draft" && (
          <Button variant="primary" size="sm" onPress={() => full && onEdit(full, { check: true })} disabled={!full}>
            <ShieldCheck size={13} /> ตรวจและเผยแพร่
          </Button>
        )}
        {a.status === "scheduled" && (
          <Button variant="primary" size="sm" onPress={() => setConfirm("publish")} disabled={!!busy}>
            <Send size={13} /> เผยแพร่ตอนนี้
          </Button>
        )}
        <Button variant="secondary" size="sm" onPress={() => full && onEdit(full)} disabled={!full}>
          <Pencil size={13} /> {a.status === "expired" ? "แก้ไข / ต่ออายุ" : "แก้ไข"}
        </Button>
        {a.status === "live" && (
          <Button variant="ghost" size="sm" onPress={togglePin} isPending={busy === "pin"} disabled={!!busy}>
            {a.pinned ? <><PinOff size={13} /> ยกเลิกปักหมุด</> : <><Pin size={13} /> ปักหมุด</>}
          </Button>
        )}
        {(a.status === "live" || a.status === "scheduled") && (
          <Tip content={a.status === "live"
            ? "ซ่อนจากหน้าประกาศของผู้รับและกลับเป็นฉบับร่าง เผยแพร่ใหม่ได้โดยไม่แจ้งเตือนคนเดิมซ้ำ"
            : "ยกเลิกเวลาที่ตั้งไว้ และกลับเป็นฉบับร่าง"}>
            <Button variant="ghost" size="sm" onPress={() => setConfirm("unpublish")} isPending={busy === "unpublish"} disabled={!!busy}>
              <EyeOff size={13} /> {a.status === "live" ? "ยกเลิกเผยแพร่" : "ยกเลิกกำหนดการ"}
            </Button>
          </Tip>
        )}
        <span className="flex-1" />
        <Button variant="ghost" size="sm" onPress={() => setConfirm("delete")} disabled={!!busy}>
          <Trash2 size={13} className="text-danger" /> <span className="text-danger">ลบ</span>
        </Button>
      </div>

      <div className="space-y-5 p-4">
        {/* What readers see */}
        <article>
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <CategoryChip category={a.category} />
            <StatusChip status={a.status} publishedAt={a.published_at} />
            {a.pinned && <Chip tone="brand"><span className="inline-flex items-center gap-1"><Pin size={11} />ปักหมุด</span></Chip>}
            {a.is_public && <Chip tone="info"><span className="inline-flex items-center gap-1"><Globe size={11} />สาธารณะ</span></Chip>}
          </div>
          <h2 className="text-lg font-semibold text-foreground break-words">{a.title}</h2>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              {a.status === "scheduled" ? <CalendarClock size={11} /> : <Clock size={11} />}
              {a.published_at
                ? `${a.status === "scheduled" ? "จะเผยแพร่" : "เผยแพร่"} ${fmtDateTime(a.published_at)}`
                : "ยังไม่เผยแพร่"}
            </span>
            {a.expires_at && <span>{a.status === "expired" ? "หมดอายุเมื่อ" : "หมดอายุ"} {fmtDateTime(a.expires_at)}</span>}
            {a.updated_at && <span>แก้ไขล่าสุด {fmtDateTime(a.updated_at)}</span>}
          </div>
          {a.cover_image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.cover_image_url} alt="" className="mt-3 aspect-video w-full max-w-xl rounded-lg border border-border object-cover" />
          )}
          <RichText body={a.body} className="mt-3 text-sm text-foreground/85" />
          {!!a.attachments?.length && <div className="mt-3"><AttachmentGallery items={a.attachments} /></div>}
          {a.status === "live" && (
            <div className="mt-3">
              <ShareButtons id={a.id} title={a.title} isPublic={!!a.is_public} size="sm" />
            </div>
          )}
        </article>

        {/* Who it is for */}
        <section className="border-t border-hairline pt-4">
          <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Users size={14} /> ผู้รับ
          </h3>
          {!full ? <Skel className="h-4 w-2/3" /> : (
            <p className="text-sm text-ink-2">
              {sentence}
              {!wasSent && <span className="text-muted"> (รายชื่อจริงจะคำนวณตอนเผยแพร่)</span>}
            </p>
          )}
        </section>

        {/* What happened */}
        {wasSent && (
          <section className="border-t border-hairline pt-4" data-testid="delivery">
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Mail size={14} /> ผลการส่ง
            </h3>
            {total === 0 ? (
              <p className="text-sm text-muted">ไม่มีผู้รับในระบบ {a.is_public ? "ประกาศนี้อ่านได้ทางลิงก์สาธารณะ" : ""}</p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Meter
                    label="ส่งถึงแล้ว"
                    value={delivered}
                    total={total}
                    tone="bg-emerald-500"
                    note={failed + waiting > 0
                      ? [failed > 0 ? `ไม่สำเร็จ ${failed}` : "", waiting > 0 ? `รอส่ง ${waiting}` : ""].filter(Boolean).join(" · ")
                      : "ครบทุกคน"}
                    noteBad={failed > 0}
                  />
                  <Meter
                    label="เปิดอ่านแล้ว"
                    value={read}
                    total={delivered}
                    tone="bg-[var(--brand)]"
                    note={delivered > 0 && unread === 0 ? "ทุกคนเปิดอ่านแล้ว" : `ยังไม่เปิด ${unread}`}
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {failed + waiting > 0 && a.status === "live" && (
                    <Tip content="ลองส่งอีเมลอีกครั้งเฉพาะคนที่ยังไม่สำเร็จหรือค้างส่ง คนที่ได้รับแล้วไม่ถูกส่งซ้ำ">
                      <Button variant="secondary" size="sm" onPress={resend} isPending={busy === "resend"} disabled={!!busy}>
                        <RefreshCw size={13} /> ส่งซ้ำ {failed + waiting} คนที่ยังไม่สำเร็จ
                      </Button>
                    </Tip>
                  )}
                  {a.status === "live" && unread > 0 && (
                    <Tip content={remindedRecently
                      ? `เตือนซ้ำไปแล้วเมื่อ ${fmtDateTime(a.reminded_at)} เตือนได้อีกครั้งหลังผ่านไป 24 ชั่วโมง`
                      : "ส่งแจ้งเตือนและอีเมลอีกครั้งเฉพาะคนที่ยังไม่เปิดอ่าน"}>
                      <Button variant="secondary" size="sm" onPress={() => setConfirm("remind")} disabled={!!busy || remindedRecently}>
                        <BellRing size={13} /> เตือน {unread} คนที่ยังไม่อ่าน
                      </Button>
                    </Tip>
                  )}
                </div>
                {full?.recipients && <RecipientTable rows={full.recipients.filter(r => r.user_id)} />}
              </>
            )}
          </section>
        )}
      </div>

      <ConfirmDialog
        open={confirm === "delete"}
        onClose={() => setConfirm(null)}
        onConfirm={del}
        isPending={busy === "delete"}
        danger
        icon={<Trash2 size={18} />}
        title="ลบประกาศ?"
        message={
          <p className="text-sm text-muted">
            ลบ <span className="font-semibold text-foreground">“{a.title}”</span> พร้อมบันทึกผลการส่งทั้งหมด
            และย้อนกลับไม่ได้ การแจ้งเตือนที่ส่งไปแล้วจะยังอยู่ในกล่องของผู้รับ แต่เปิดอ่านไม่ได้อีก
          </p>
        }
        confirmLabel="ลบ"
      />
      <ConfirmDialog
        open={confirm === "unpublish"}
        onClose={() => setConfirm(null)}
        onConfirm={unpublish}
        isPending={busy === "unpublish"}
        danger
        icon={<EyeOff size={18} />}
        title={a.status === "live" ? "ยกเลิกการเผยแพร่?" : "ยกเลิกกำหนดเผยแพร่?"}
        message={a.status === "live"
          ? `“${a.title}” จะหายจากหน้าประกาศของผู้รับทุกคนทันที และกลับเป็นฉบับร่าง เผยแพร่ใหม่ได้ภายหลังโดยไม่แจ้งเตือนคนเดิมซ้ำ`
          : `ยกเลิกเวลาเผยแพร่ ${fmtDateTime(a.published_at)} ของ “${a.title}” และกลับเป็นฉบับร่าง ผู้รับจะไม่ได้รับประกาศจนกว่าจะตั้งเวลาหรือเผยแพร่ใหม่`}
        confirmLabel={a.status === "live" ? "ยกเลิกเผยแพร่" : "ยกเลิกกำหนดการ"}
        cancelLabel="ไม่ยกเลิก"
      />
      <ConfirmDialog
        open={confirm === "publish"}
        onClose={() => setConfirm(null)}
        onConfirm={publishNow}
        isPending={busy === "publish"}
        icon={<Send size={18} />}
        title="เผยแพร่ตอนนี้เลย?"
        message={`ประกาศนี้ตั้งเวลาไว้ ${fmtDateTime(a.published_at)} หากยืนยัน ผู้รับ (${sentence || "ตามกลุ่มที่ตั้งไว้"}) จะได้รับแจ้งเตือนและอีเมลทันที และเรียกคืนไม่ได้`}
        confirmLabel="เผยแพร่ตอนนี้"
      />
      <ConfirmDialog
        open={confirm === "remind"}
        onClose={() => setConfirm(null)}
        onConfirm={remind}
        isPending={busy === "remind"}
        icon={<BellRing size={18} />}
        title={`เตือน ${unread} คนที่ยังไม่เปิดอ่าน?`}
        message="ระบบจะส่งแจ้งเตือนและอีเมลอีกครั้งเฉพาะคนที่ยังไม่เปิดอ่านประกาศนี้ เตือนซ้ำได้วันละครั้งต่อประกาศ"
        confirmLabel="ส่งคำเตือน"
      />
    </div>
  );
}

function Meter({
  label, value, total, tone, note, noteBad,
}: {
  label: string; value: number; total: number; tone: string; note: string; noteBad?: boolean;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-ink-2">{label}</span>
        <span className="font-semibold text-foreground tabular-nums">{value} จาก {total}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-secondary" role="img" aria-label={`${label} ${value} จาก ${total}`}>
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <div className={`mt-1 text-xs ${noteBad ? "text-danger" : "text-muted"}`}>{note}</div>
    </div>
  );
}

type RecFilter = "all" | "problem" | "unread";

function RecipientTable({ rows }: { rows: Recipient[] }) {
  const [filter, setFilter] = useState<RecFilter>("all");
  const [showAll, setShowAll] = useState(false);
  const counts = useMemo(() => ({
    all: rows.length,
    problem: rows.filter(r => r.status === "failed" || r.status === "pending").length,
    unread: rows.filter(r => r.status === "sent" && !r.read_at).length,
  }), [rows]);
  const shown = useMemo(() => rows.filter(r =>
    filter === "all" ? true
      : filter === "problem" ? r.status === "failed" || r.status === "pending"
      : r.status === "sent" && !r.read_at,
  ), [rows, filter]);
  const visible = showAll ? shown : shown.slice(0, 30);

  const tabs: [RecFilter, string][] = [["all", "ทั้งหมด"], ["problem", "ยังไม่สำเร็จ"], ["unread", "ยังไม่อ่าน"]];

  return (
    <div className="mt-4">
      <div className="mb-2 flex flex-wrap gap-1.5">
        {tabs.map(([v, label]) => (
          <button
            key={v}
            type="button"
            aria-pressed={filter === v}
            onClick={() => { setFilter(v); setShowAll(false); }}
            className={`chip cursor-pointer transition ${filter === v ? "chip-brand" : "chip-neutral"}`}
          >
            {label} ({counts[v]})
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <div className="rounded-lg border border-border px-3 py-4 text-center text-sm text-muted">ไม่มีรายชื่อในกลุ่มนี้</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[30rem] text-sm">
            <thead>
              <tr className="bg-surface-secondary text-left text-xs text-muted">
                <th className="px-3 py-2 font-medium">ผู้รับ</th>
                <th className="px-3 py-2 font-medium">การส่ง</th>
                <th className="px-3 py-2 font-medium">เปิดอ่าน</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--hairline)]">
              {visible.map(r => (
                <tr key={r.user_id ?? r.email}>
                  <td className="px-3 py-2">
                    <div className="text-foreground">{r.name || r.email}</div>
                    {r.name && <div className="text-xs text-muted">{r.email}</div>}
                  </td>
                  <td className="px-3 py-2">
                    {r.status === "sent" && <Chip tone="success">ส่งแล้ว</Chip>}
                    {r.status === "pending" && <Chip tone="neutral">รอส่ง</Chip>}
                    {r.status === "skipped" && <Chip tone="neutral">ข้าม</Chip>}
                    {r.status === "failed" && (
                      <Tip content={r.error ? `อีเมลส่งไม่ผ่าน: ${r.error}\nการแจ้งเตือนในระบบส่งถึงแล้ว` : "อีเมลส่งไม่ผ่าน"}>
                        <span><Chip tone="danger">อีเมลไม่สำเร็จ</Chip></span>
                      </Tip>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-ink-2">
                    {r.read_at
                      ? <span className="inline-flex items-center gap-1"><Eye size={12} className="text-emerald-600" />{fmtDateTime(r.read_at)}</span>
                      : <span className="text-muted">ยังไม่เปิด</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {shown.length > visible.length && (
        <button type="button" className="mt-2 text-xs text-accent hover:underline" onClick={() => setShowAll(true)}>
          แสดงอีก {shown.length - visible.length} คน
        </button>
      )}
    </div>
  );
}

/** Shown in the detail column before anything is selected. */
export function DetailEmpty() {
  return (
    <div className="hidden rounded-xl border border-dashed border-border lg:block">
      <EmptyState
        icon={<Megaphone size={28} />}
        title="เลือกประกาศจากรายการ"
        description="เพื่อดูเนื้อหา ผู้รับ และผลการส่ง"
      />
    </div>
  );
}
