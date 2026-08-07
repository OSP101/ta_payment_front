"use client";
import useSWR, { mutate } from "swr";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Megaphone, Send, Image as ImageIcon, X, Trash2, Pencil,
  Pin, PinOff, Eye, EyeOff, CalendarClock, Clock, AlertTriangle,
  Info, PartyPopper, Newspaper, Radio, Sparkles, Check, Plus,
  Globe, Mail, Target, Users, Paperclip, Play, FileText,
  List, ListOrdered, Link as LinkIcon, AlignCenter, AlignLeft, AlignRight,
  ChevronDown,
} from "lucide-react";
import { Tabs, toast } from "@heroui/react";
import { api, errMessage } from "../../lib/api";
import ShareButtons from "../../components/ShareButtons";
import type { Attachment } from "../../components/AttachmentGallery";
import RichText from "../../components/RichText";
import {
  PageHeader, Panel, Button, TextInput, TextArea, FieldGroup,
  Chip, EmptyState, Modal, Alert,
} from "../../components/ui";

// ============================================================================
// Types + constants
// ============================================================================

type Category = "info" | "news" | "warning" | "urgent" | "event";
type Status = "draft" | "scheduled" | "live" | "expired";

interface Ann {
  id: string;
  title: string;
  body: string;
  category: Category;
  audience: string[];
  pinned: boolean;
  cover_image_key?: string | null;
  cover_image_url?: string | null;
  published_at?: string | null;
  expires_at?: string | null;
  announced_at?: string | null;
  created_at?: string;
  updated_at?: string;
  status: Status;
  is_public?: boolean;
  target_course_ids?: string[];
  target_user_ids?: string[];
  target_filters?: string[];
  /** How many people it actually reached. Filled by /announcements/:id. */
  audience_count?: number;
  recipients?: Recipient[];
  attachments?: Attachment[];
}

interface Recipient {
  email: string;
  name?: string;
  user_id?: string | null;
  status: "pending" | "sent" | "skipped" | "failed";
  sent_at?: string | null;
  error?: string;
}

const ROLES = [
  { value: "ta",       label: "TA" },
  { value: "lecturer", label: "อาจารย์" },
  { value: "staff",    label: "เจ้าหน้าที่" },
  { value: "admin",    label: "Admin" },
] as const;

// Category metadata drives icon, chip tone, and the mailer prefix on the
// backend. Keep the value list in sync with backend `validCategories`.
const CATEGORIES: {
  value: Category; label: string; icon: React.ReactNode;
  tone: "info" | "success" | "warn" | "danger" | "brand"; description: string;
}[] = [
  { value: "info",    label: "ข้อมูลทั่วไป", icon: <Info size={14} />,        tone: "info",   description: "ข่าวสารทั่วไปที่ต้องการให้ทราบ" },
  { value: "news",    label: "ข่าวประชาสัมพันธ์", icon: <Newspaper size={14} />, tone: "brand",  description: "ข่าวใหม่หรือประกาศจากคณะ/สาขา" },
  { value: "event",   label: "กิจกรรม / อบรม",  icon: <PartyPopper size={14} />, tone: "success",description: "งาน กิจกรรม หรืออบรมที่มีวันจัด" },
  { value: "warning", label: "แจ้งเตือน",       icon: <AlertTriangle size={14} />, tone: "warn",  description: "เตือนให้ปฏิบัติภายในกำหนด" },
  { value: "urgent",  label: "ด่วน",           icon: <Radio size={14} />,       tone: "danger", description: "เรื่องเร่งด่วน ต้องการความสนใจทันที" },
];

// Publish timing. The three modes used to be stacked radios each carrying its
// own paragraph — a whole screenful for one choice. As chips with a single line
// of help for whichever is selected, it is one row.
const PUBLISH_MODES: { value: Draft["publishMode"]; label: string; description: string }[] = [
  { value: "now",       label: "เผยแพร่ทันที",   description: "โพสต์และส่งการแจ้งเตือนทันที" },
  { value: "scheduled", label: "ตั้งเวลา",        description: "ระบบจะเผยแพร่และแจ้งเตือนตามเวลาที่ตั้งไว้" },
  { value: "draft",     label: "เก็บเป็นฉบับร่าง", description: "เก็บไว้ในแท็บฉบับร่าง ไม่ส่งการแจ้งเตือน" },
];

const CAT_META: Record<Category, typeof CATEGORIES[number]> = Object.fromEntries(
  CATEGORIES.map(c => [c.value, c]),
) as Record<Category, typeof CATEGORIES[number]>;

// Cover image constraints — mirrored on the backend and shown to the user.
const IMG = {
  maxBytes: 5 * 1024 * 1024,
  maxWidth: 1600,
  maxHeight: 900,
  minWidth: 800,
  aspectHint: "16:9",
  accept: "image/jpeg,image/png,image/webp",
  acceptLabel: "JPEG, PNG, WebP",
};

// ============================================================================
// Composer state
// ============================================================================

/** Children take the state setter itself: several of them update from async
 *  callbacks (uploads), where a captured `draft` would be stale by the time it
 *  lands and would drop a file that finished first. */
type SetDraft = React.Dispatch<React.SetStateAction<Draft>>;

interface Draft {
  id?: string;
  title: string;
  body: string;
  category: Category;
  audience: string[];
  pinned: boolean;
  cover_image_key: string | null;
  cover_image_url: string | null;
  publishMode: "now" | "scheduled" | "draft";
  publishedAt: string; // datetime-local value
  expires: boolean;
  expiresAt: string;   // datetime-local value
  // Original ISO published_at of the item being edited — preserved so editing
  // an already-live announcement doesn't reset its publish time to "now".
  originalPublishedAt?: string | null;
  isPublic: boolean;
  /** Named people. Everyone here holds an account — announcements are system
   *  notices, so there is no free-typed outside address. */
  targetUsers: { id: string; name: string; email: string }[];
  targetCourses: { id: string; label: string }[];
  targetFilters: string[];
  audienceCount: number;
  attachments: Attachment[];
}

const emptyDraft: Draft = {
  title: "",
  body: "",
  category: "info",
  audience: ["ta", "lecturer", "staff"],
  pinned: false,
  cover_image_key: null,
  cover_image_url: null,
  publishMode: "now",
  publishedAt: "",
  expires: false,
  expiresAt: "",
  originalPublishedAt: null,
  isPublic: false,
  targetUsers: [],
  targetCourses: [],
  targetFilters: [],
  audienceCount: 0,
  attachments: [],
};

// ============================================================================
// Page
// ============================================================================

export default function AnnouncePage() {
  const { data: list } = useSWR<Ann[]>("/announcements?scope=all");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [pending, setPending] = useState(false);
  const [tab, setTab] = useState("compose");
  const [confirmDelete, setConfirmDelete] = useState<Ann | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Pending action queued behind a "discard unsaved composer content?" confirm.
  const [confirmSwitch, setConfirmSwitch] = useState<{ run: () => void } | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);

  // The composer has content worth protecting if the user typed a title/body.
  function composerHasContent() {
    return draft.title.trim() !== "" || draft.body.trim() !== "";
  }

  // ---- derived counts for the header tabs ----------------------------------
  const counts = useMemo(() => {
    const c = { all: 0, live: 0, scheduled: 0, draft: 0, expired: 0 };
    (list ?? []).forEach(a => {
      c.all++;
      c[a.status] = (c[a.status] ?? 0) + 1;
    });
    return c;
  }, [list]);

  function resetDraft() { setDraft(emptyDraft); }

  function loadForEdit(a: Ann) {
    setDraft({
      id: a.id,
      title: a.title,
      body: a.body,
      category: a.category,
      audience: a.audience.length ? a.audience : ["ta", "lecturer", "staff"],
      pinned: a.pinned,
      cover_image_key: a.cover_image_key ?? null,
      cover_image_url: a.cover_image_url ?? null,
      publishMode: a.published_at
        ? (new Date(a.published_at) > new Date() ? "scheduled" : "now")
        : "draft",
      publishedAt: a.published_at ? toLocalInput(a.published_at) : "",
      expires: !!a.expires_at,
      expiresAt: a.expires_at ? toLocalInput(a.expires_at) : "",
      originalPublishedAt: a.published_at ?? null,
      isPublic: !!a.is_public,
      targetUsers: [],
      targetCourses: [],
      targetFilters: a.target_filters ?? [],
      audienceCount: 0,
      attachments: [],
    });
    // The list row has no recipient ledger; fetch the full record so editing
    // shows who is already on the list instead of an empty box.
    void api.get<Ann>(`/announcements/${a.id}`).then(full => {
      setDraft(d => d.id !== a.id ? d : {
        ...d,
        isPublic: !!full.is_public,
        targetFilters: full.target_filters ?? [],
        audienceCount: full.audience_count ?? 0,
        // Ids alone would render as raw UUIDs; the pickers below resolve them
        // to names on mount.
        targetUsers: (full.target_user_ids ?? []).map(id => ({ id, name: id, email: "" })),
        targetCourses: (full.target_course_ids ?? []).map(id => ({ id, label: id })),
        attachments: full.attachments ?? [],
      });
    }).catch(() => {});
    setTab("compose");
    // Scroll composer into view — the list can be long on wide screens.
    setTimeout(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
  }

  // Guarded entry points: warn before discarding unsaved composer content when
  // switching to edit another item or starting a fresh announcement.
  function guardedLoadForEdit(a: Ann) {
    if (draft.id !== a.id && composerHasContent()) {
      setConfirmSwitch({ run: () => loadForEdit(a) });
    } else {
      loadForEdit(a);
    }
  }
  function guardedNew() {
    if (composerHasContent()) {
      setConfirmSwitch({ run: () => { resetDraft(); setTab("compose"); } });
    } else {
      resetDraft();
      setTab("compose");
    }
  }

  // ---- payload assembly ----------------------------------------------------

  function buildPayload(): {
    id?: string; title: string; body: string; category: Category;
    audience: string[]; pinned: boolean; cover_image_key: string | null;
    published_at: string | null; expires_at: string | null;
    is_public: boolean; target_course_ids: string[];
    target_user_ids: string[]; target_filters: string[];
    attachments: Attachment[];
  } | { error: string } {
    const title = draft.title.trim();
    const body = draft.body.trim();
    if (!title) return { error: "กรุณากรอกหัวข้อ" };
    if (title.length > 200) return { error: "หัวข้อยาวเกิน 200 ตัวอักษร" };
    if (!body) return { error: "กรุณากรอกเนื้อหา" };
    if (body.length > 8000) return { error: "เนื้อหายาวเกิน 8000 ตัวอักษร" };

    let publishedAt: string | null = null;
    if (draft.publishMode === "now") {
      // Editing an already-published announcement must keep its original publish
      // time; only a brand-new "publish now" gets the current timestamp.
      publishedAt =
        draft.id && draft.originalPublishedAt &&
        new Date(draft.originalPublishedAt).getTime() <= Date.now()
          ? draft.originalPublishedAt
          : new Date().toISOString();
    }
    else if (draft.publishMode === "scheduled") {
      if (!draft.publishedAt) return { error: "กรุณาระบุวันเวลาที่จะเผยแพร่" };
      const d = new Date(draft.publishedAt);
      if (isNaN(+d)) return { error: "วันเวลาเผยแพร่ไม่ถูกต้อง" };
      if (d.getTime() <= Date.now() - 60_000) return { error: "เวลาที่ตั้งเผยแพร่ต้องอยู่ในอนาคต" };
      publishedAt = d.toISOString();
    }

    let expiresAt: string | null = null;
    if (draft.expires) {
      if (!draft.expiresAt) return { error: "กรุณาระบุวันหมดอายุ" };
      const d = new Date(draft.expiresAt);
      if (isNaN(+d)) return { error: "วันหมดอายุไม่ถูกต้อง" };
      if (publishedAt && d.getTime() <= new Date(publishedAt).getTime()) {
        return { error: "วันหมดอายุต้องอยู่หลังวันเผยแพร่" };
      }
      if (!publishedAt && d.getTime() <= Date.now()) {
        return { error: "วันหมดอายุต้องอยู่ในอนาคต" };
      }
      expiresAt = d.toISOString();
    }

    return {
      id: draft.id,
      title, body, category: draft.category,
      audience: draft.audience,
      pinned: draft.pinned,
      cover_image_key: draft.cover_image_key,
      published_at: publishedAt,
      expires_at: expiresAt,
      is_public: draft.isPublic,
      target_course_ids: draft.targetCourses.map(c => c.id),
      target_user_ids: draft.targetUsers.map(u => u.id),
      target_filters: draft.targetFilters,
      attachments: draft.attachments,
    };
  }

  async function submit() {
    const payload = buildPayload();
    if ("error" in payload) { toast.danger(payload.error); return; }
    setPending(true);
    try {
      await api.post("/announcements", payload);
      toast.success(draft.id ? "บันทึกการแก้ไขเรียบร้อย" : "สร้างประกาศเรียบร้อย");
      resetDraft();
      mutate("/announcements?scope=all");
    } catch (e) {
      toast.danger(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally { setPending(false); }
  }

  // ---- row actions ---------------------------------------------------------

  async function togglePublish(a: Ann) {
    try {
      if (a.status === "draft" || a.status === "expired") {
        await api.post(`/announcements/${a.id}/publish`);
        toast.success("เผยแพร่ประกาศแล้ว");
      } else {
        await api.post(`/announcements/${a.id}/unpublish`);
        toast.success("ยกเลิกการเผยแพร่แล้ว");
      }
      mutate("/announcements?scope=all");
    } catch (e) {
      toast.danger(e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ");
    }
  }

  async function togglePin(a: Ann) {
    try {
      await api.post("/announcements", { ...toUpsertPayload(a), pinned: !a.pinned });
      toast.success(a.pinned ? "ยกเลิกปักหมุดแล้ว" : "ปักหมุดไว้บนสุดแล้ว");
      mutate("/announcements?scope=all");
    } catch (e) {
      toast.danger(e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ");
    }
  }

  async function del(a: Ann) {
    setDeleting(true);
    try {
      await api.del(`/announcements/${a.id}`);
      toast.success("ลบประกาศแล้ว");
      mutate("/announcements?scope=all");
      if (draft.id === a.id) resetDraft();
      setConfirmDelete(null);
    } catch (e) {
      toast.danger(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    } finally {
      setDeleting(false);
    }
  }

  // ---- filtered list per tab -----------------------------------------------

  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const filtered = useMemo(() => {
    if (!list) return [];
    if (statusFilter === "all") return list;
    return list.filter(a => a.status === statusFilter);
  }, [list, statusFilter]);

  return (
    <div>
      <PageHeader
        title="ประชาสัมพันธ์"
        description="สร้าง กำหนดเวลา และเผยแพร่ประกาศไปยังผู้ใช้ตามกลุ่ม"
      />

      <Tabs selectedKey={tab} onSelectionChange={(k) => setTab(String(k))}>
        <Tabs.ListContainer>
          <Tabs.List data-tour="announce-tabs">
            <Tabs.Tab id="compose"><Sparkles size={14} /> เขียน / แก้ไข</Tabs.Tab>
            <Tabs.Tab id="manage">
              <Megaphone size={14} /> จัดการประกาศ
              <span className="ms-1 text-xs text-muted">({counts.all})</span>
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel id="compose">
          <div ref={editorRef} className="grid gap-4 lg:grid-cols-5 mt-4">
            <div data-tour="announce-composer" className="lg:col-span-3 space-y-4">
              <Composer draft={draft} setDraft={setDraft} />
              {/* Reads as the end of the form rather than two buttons adrift
                  under it, now that everything above sits in bordered blocks. */}
              <div className="flex flex-wrap items-center justify-end gap-2 rounded-xl border border-border bg-surface px-4 py-3">
                {draft.id && (
                  <Button variant="ghost" onPress={resetDraft}>
                    <X size={14} /> ยกเลิกการแก้ไข
                  </Button>
                )}
                <Button
                  variant="primary"
                  isPending={pending}
                  disabled={pending}
                  onPress={submit}
                >
                  <Send size={14} />
                  {draft.id
                    ? "บันทึกการแก้ไข"
                    : draft.publishMode === "now"
                    ? "เผยแพร่ตอนนี้"
                    : draft.publishMode === "scheduled"
                    ? "ตั้งเวลาเผยแพร่"
                    : "บันทึกแบบร่าง"}
                </Button>
              </div>
            </div>

            <div data-tour="announce-preview" className="lg:col-span-2">
              <Panel title="ตัวอย่างการแสดงผล" description="แสดงตามที่ผู้ใช้จะเห็นในหน้าประกาศ">
                <AnnouncementCardPreview draft={draft} />
              </Panel>
            </div>
          </div>
        </Tabs.Panel>

        <Tabs.Panel id="manage">
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <FilterChip active={statusFilter === "all"}    onClick={() => setStatusFilter("all")}>ทั้งหมด ({counts.all})</FilterChip>
              <FilterChip active={statusFilter === "live"}   onClick={() => setStatusFilter("live")}>เผยแพร่แล้ว ({counts.live})</FilterChip>
              <FilterChip active={statusFilter === "scheduled"} onClick={() => setStatusFilter("scheduled")}>รอเผยแพร่ ({counts.scheduled})</FilterChip>
              <FilterChip active={statusFilter === "draft"}  onClick={() => setStatusFilter("draft")}>ฉบับร่าง ({counts.draft})</FilterChip>
              <FilterChip active={statusFilter === "expired"} onClick={() => setStatusFilter("expired")}>หมดอายุ ({counts.expired})</FilterChip>
              <div className="flex-1" />
              <Button variant="secondary" size="sm" onPress={guardedNew}>
                <Plus size={14} /> ประกาศใหม่
              </Button>
            </div>

            <Panel padded={false}>
              {filtered.length === 0 ? (
                <EmptyState
                  icon={<Megaphone size={28} />}
                  title="ยังไม่มีประกาศในกลุ่มนี้"
                  description="กด ‘ประกาศใหม่’ เพื่อเริ่มเขียน"
                />
              ) : (
                <ul className="divide-y divide-[var(--hairline)]">
                  {filtered.map(a => (
                    <ManageRow
                      key={a.id}
                      a={a}
                      onEdit={() => guardedLoadForEdit(a)}
                      onDelete={() => setConfirmDelete(a)}
                      onTogglePublish={() => togglePublish(a)}
                      onTogglePin={() => togglePin(a)}
                    />
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </Tabs.Panel>
      </Tabs>

      <Modal
        open={!!confirmDelete}
        onClose={() => { if (!deleting) setConfirmDelete(null); }}
        title="ลบประกาศ?"
        icon={<Trash2 size={18} />}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onPress={() => setConfirmDelete(null)} disabled={deleting}>ยกเลิก</Button>
            <Button variant="danger" onPress={() => confirmDelete && del(confirmDelete)} disabled={deleting} isPending={deleting}>
              <Trash2 size={14} /> ลบ
            </Button>
          </div>
        }
      >
        <div className="text-sm">
          ลบประกาศ <span className="font-semibold">“{confirmDelete?.title}”</span> ออกจากระบบ?
          การกระทำนี้ไม่สามารถย้อนกลับได้ (การแจ้งเตือนที่ส่งไปแล้วจะยังอยู่ในกล่องขาเข้าของผู้ใช้)
        </div>
      </Modal>

      <Modal
        open={!!confirmSwitch}
        onClose={() => setConfirmSwitch(null)}
        title="ทิ้งเนื้อหาที่ยังไม่ได้บันทึก?"
        icon={<AlertTriangle size={18} />}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onPress={() => setConfirmSwitch(null)}>ยกเลิก</Button>
            <Button variant="danger" onPress={() => { confirmSwitch?.run(); setConfirmSwitch(null); }}>
              ทิ้งและดำเนินการต่อ
            </Button>
          </div>
        }
      >
        <div className="text-sm">
          มีเนื้อหาในตัวแก้ไขที่ยังไม่ได้บันทึก หากดำเนินการต่อ เนื้อหานี้จะหายไป ต้องการทิ้งหรือไม่?
        </div>
      </Modal>
    </div>
  );
}

// ============================================================================
// Composer
// ============================================================================

/**
 * One titled block of the composer.
 *
 * The form was a single card holding nine field groups at equal weight, so
 * nothing on it read as "start here" — everything asked for attention at once.
 * Four named blocks let an officer answer one question at a time: what am I
 * writing, who gets it, what is attached, when does it go out. The blocks that
 * are usually left alone collapse, so the screen opens short.
 */
function Section({
  icon, title, hint, summary, children,
  collapsible = false, defaultOpen = true,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  /** Shown at the right of the header: what is inside, without opening it. */
  summary?: React.ReactNode;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const head = (
    <>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-soft-foreground">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
      </span>
      {summary && <span className="shrink-0 text-xs text-muted">{summary}</span>}
    </>
  );

  return (
    <section className="rounded-xl border border-border bg-surface">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          className="flex w-full items-center gap-2.5 rounded-xl px-4 py-3 text-start transition-colors hover:bg-surface-secondary"
        >
          {head}
          <ChevronDown
            size={15}
            className={"shrink-0 text-muted transition-transform " + (open ? "rotate-180" : "")}
          />
        </button>
      ) : (
        <div className="flex items-center gap-2.5 px-4 py-3">{head}</div>
      )}
      {(!collapsible || open) && (
        <div className="space-y-4 border-t border-hairline px-4 py-4">{children}</div>
      )}
    </section>
  );
}

function Composer({ draft, setDraft }: { draft: Draft; setDraft: SetDraft }) {
  const setField = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft({ ...draft, [k]: v });
  const cat = CAT_META[draft.category];
  const mediaCount = draft.attachments.length + (draft.cover_image_key ? 1 : 0);
  const publishMeta = PUBLISH_MODES.find(m => m.value === draft.publishMode);

  return (
    <div className="space-y-3">
      {draft.id && (
        <div className="flex items-center gap-2 rounded-lg border border-accent bg-accent-soft px-3 py-2 text-sm text-accent-soft-foreground">
          <Pencil size={14} /> กำลังแก้ไขประกาศที่มีอยู่
        </div>
      )}

      <Section icon={<Pencil size={15} />} title="เนื้อหาประกาศ">
        <FieldGroup label={<span>หัวข้อ <span className="text-muted">({draft.title.length}/200)</span></span>}>
          <TextInput
            placeholder="หัวข้อประกาศ"
            value={draft.title}
            maxLength={200}
            onChange={e => setField("title", e.target.value)}
          />
        </FieldGroup>

        <FieldGroup label={<span>เนื้อหา <span className="text-muted">({draft.body.length}/8000)</span></span>}>
          <BodyEditor value={draft.body} onChange={v => setField("body", v)} />
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
                  onClick={() => setField("category", c.value)}
                  className={`chip inline-flex cursor-pointer items-center gap-1.5 transition ${on ? "chip-brand" : "chip-neutral"}`}
                >
                  {c.icon}{c.label}
                </button>
              );
            })}
          </div>
          {/* Only the chosen category needs explaining. Five descriptions on
              screen at once was most of what made this form feel crowded. */}
          <p className="text-xs text-muted">{cat.description}</p>
        </FieldGroup>
      </Section>

      <AudienceSection draft={draft} setDraft={setDraft} />

      {/* Keyed on the draft: loading an existing announcement for edit should
          re-decide whether this opens, and a stale upload error from the
          previous draft should not survive the switch. */}
      <Section
        key={draft.id ?? "new"}
        icon={<ImageIcon size={15} />}
        title="รูปภาพและไฟล์แนบ"
        hint="ไม่ใส่ก็ได้"
        collapsible
        defaultOpen={mediaCount > 0}
        summary={mediaCount > 0 ? `${mediaCount} ไฟล์` : "ยังไม่มีไฟล์"}
      >
        <CoverImageField draft={draft} setDraft={setDraft} />
        <AttachmentsField draft={draft} setDraft={setDraft} />
      </Section>

      <Section icon={<CalendarClock size={15} />} title="การเผยแพร่">
        <FieldGroup label="เผยแพร่เมื่อไหร่">
          <div className="flex flex-wrap gap-1.5">
            {PUBLISH_MODES.map(m => {
              const on = draft.publishMode === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setField("publishMode", m.value)}
                  className={`chip cursor-pointer transition ${on ? "chip-brand" : "chip-neutral"}`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted">{publishMeta?.description}</p>
          {draft.publishMode === "scheduled" && (
            <input
              type="datetime-local"
              className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground"
              value={draft.publishedAt}
              min={toLocalInput(new Date().toISOString())}
              onChange={e => setField("publishedAt", e.target.value)}
            />
          )}
        </FieldGroup>

        <FieldGroup label="วันหมดอายุ (ไม่บังคับ)" hint="ประกาศจะซ่อนจากฟีดหลังเวลานี้">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.expires}
              onChange={e => setField("expires", e.target.checked)}
            />
            ตั้งเวลาหมดอายุ
          </label>
          {draft.expires && (
            <input
              type="datetime-local"
              className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground"
              value={draft.expiresAt}
              min={draft.publishedAt || toLocalInput(new Date().toISOString())}
              onChange={e => setField("expiresAt", e.target.value)}
            />
          )}
        </FieldGroup>

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.pinned}
            onChange={e => setField("pinned", e.target.checked)}
          />
          <Pin size={14} /> ปักหมุดไว้บนสุดของฟีด
        </label>
      </Section>
    </div>
  );
}

// ============================================================================
// Body editor: a toolbar over a plain textarea
// ============================================================================

/**
 * The buttons insert the same tiny markup RichText renders, around whatever the
 * officer has selected. A textarea rather than a contenteditable surface on
 * purpose: what is stored is exactly what was typed, so there is no HTML from
 * the composer that a reader's browser could be asked to run.
 */
function BodyEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  /** Apply an edit and leave the caret where the officer would expect it. */
  const apply = (next: string, from: number, to: number) => {
    onChange(next);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(from, to);
    });
  };

  /**
   * Wrap the selection — or unwrap it, if it is already wrapped. Pressing the
   * bold button on text that is already bold should turn it off, the way it
   * does in every editor people use; without that the only way back is to
   * hunt down the stars by hand.
   */
  const surround = (mark: string, closing: string, placeholder: string) => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const picked = value.slice(a, b);

    // Already wrapped, either inside the selection or just outside it.
    if (picked.startsWith(mark) && picked.endsWith(closing) && picked.length > mark.length + closing.length) {
      const inner = picked.slice(mark.length, picked.length - closing.length);
      apply(value.slice(0, a) + inner + value.slice(b), a, a + inner.length);
      return;
    }
    if (value.slice(a - mark.length, a) === mark && value.slice(b, b + closing.length) === closing) {
      const next = value.slice(0, a - mark.length) + picked + value.slice(b + closing.length);
      apply(next, a - mark.length, a - mark.length + picked.length);
      return;
    }

    const body = picked || placeholder;
    const next = value.slice(0, a) + mark + body + closing + value.slice(b);
    apply(next, a + mark.length, a + mark.length + body.length);
  };

  // Line tools work on whole lines: a list marker in the middle of a sentence
  // is not what the button promises.
  const prefixLines = (make: (i: number) => string) => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const lineStart = value.lastIndexOf("\n", a - 1) + 1;
    const lineEnd = value.indexOf("\n", b) === -1 ? value.length : value.indexOf("\n", b);
    const chunk = value.slice(lineStart, lineEnd) || "รายการ";
    const marked = chunk.split("\n").map((l, i) => make(i) + l.replace(/^\s*(?:[-•]\s+|\d+[.)]\s+)/, "")).join("\n");
    apply(value.slice(0, lineStart) + marked + value.slice(lineEnd), lineStart, lineStart + marked.length);
  };

  const alignLine = (how: "center" | "right" | "left") => {
    const el = ref.current;
    if (!el) return;
    const a = el.selectionStart;
    let lineStart = value.lastIndexOf("\n", a - 1) + 1;
    // Clicking a second alignment on the same line replaces the first rather
    // than stacking a marker on top of it.
    const prevStart = lineStart === 0 ? -1 : value.lastIndexOf("\n", lineStart - 2) + 1;
    if (prevStart >= 0 && /^:::(center|right|left)\s*$/.test(value.slice(prevStart, lineStart - 1))) {
      lineStart = prevStart;
    }
    const lineFrom = lineStart === prevStart ? value.indexOf("\n", prevStart) + 1 : lineStart;
    const marker = `:::${how}\n`;
    const caret = lineStart + marker.length;
    apply(value.slice(0, lineStart) + marker + value.slice(lineFrom), caret, caret);
  };

  /**
   * Enter inside a list carries the list on, and Enter on an item left empty
   * ends it. Retyping "- " on every line is the kind of small friction that
   * makes people give up and write one long paragraph instead.
   */
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = ref.current;
    if (!el) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === "b") { e.preventDefault(); surround("**", "**", "ข้อความหนา"); return; }
      if (k === "i") { e.preventDefault(); surround("*", "*", "ข้อความเอียง"); return; }
      if (k === "k") { e.preventDefault(); surround("[", "](https://)", "ข้อความลิงก์"); return; }
    }
    if (e.key !== "Enter" || e.shiftKey) return;

    const a = el.selectionStart;
    if (a !== el.selectionEnd) return;
    const lineStart = value.lastIndexOf("\n", a - 1) + 1;
    const line = value.slice(lineStart, a);
    const bullet = /^(\s*)([-•])\s+(.*)$/.exec(line);
    const numbered = /^(\s*)(\d+)[.)]\s+(.*)$/.exec(line);
    if (!bullet && !numbered) return;

    e.preventDefault();
    const rest = (bullet ?? numbered)![3];
    if (rest.trim() === "") {
      // An empty item means "I am done with the list": drop the marker.
      apply(value.slice(0, lineStart) + "\n" + value.slice(a), lineStart + 1, lineStart + 1);
      return;
    }
    const marker = bullet
      ? `${bullet[1]}${bullet[2]} `
      : `${numbered![1]}${Number(numbered![2]) + 1}. `;
    const ins = "\n" + marker;
    apply(value.slice(0, a) + ins + value.slice(a), a + ins.length, a + ins.length);
  };

  /**
   * Pasting a URL over selected words turns them into a link, instead of
   * replacing the words with the URL — the one paste people get wrong most.
   */
  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    if (a === b) return;
    const pasted = e.clipboardData.getData("text/plain").trim();
    if (!/^https?:\/\/\S+$/.test(pasted)) return;
    e.preventDefault();
    const label = value.slice(a, b);
    const link = `[${label}](${pasted})`;
    apply(value.slice(0, a) + link + value.slice(b), a + link.length, a + link.length);
  };

  // The field grows with the announcement. A fixed 8 rows means a long notice
  // is written through a letterbox, which is where formatting mistakes hide.
  // Past the cap it scrolls — capping the height without that would put the
  // end of a long announcement out of reach.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 180), 640)}px`;
  }, [value]);

  // size-9 on a phone: a 28px button is a miss with a thumb. Desktop keeps the
  // tighter row, where the pointer is precise.
  const btn = "inline-flex size-9 items-center justify-center rounded-md border border-border text-xs text-ink-2 transition-colors hover:border-brand hover:text-brand sm:size-auto sm:px-2 sm:py-1";

  /**
   * preventDefault on mousedown keeps the caret in the textarea, so the field
   * is still where the officer left it after a button press.
   */
  const Tool = ({ title, onPress, children }: { title: string; onPress: () => void; children: React.ReactNode }) => (
    <button type="button" className={btn} title={title} onMouseDown={e => e.preventDefault()} onClick={onPress}>
      {children}
    </button>
  );

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1">
        <Tool title="ตัวหนา (⌘B)" onPress={() => surround("**", "**", "ข้อความหนา")}><b>ห</b></Tool>
        <Tool title="ตัวเอียง (⌘I)" onPress={() => surround("*", "*", "ข้อความเอียง")}><i>อ</i></Tool>
        <span className="mx-0.5 w-px bg-border" />
        <Tool title="รายการ" onPress={() => prefixLines(() => "- ")}><List size={13} /></Tool>
        <Tool title="รายการมีลำดับ" onPress={() => prefixLines(i => `${i + 1}. `)}><ListOrdered size={13} /></Tool>
        <span className="mx-0.5 w-px bg-border" />
        <Tool title="แนบลิงก์ (⌘K)" onPress={() => surround("[", "](https://)", "ข้อความลิงก์")}><LinkIcon size={13} /></Tool>
        <span className="mx-0.5 w-px bg-border" />
        <Tool title="จัดกึ่งกลาง" onPress={() => alignLine("center")}><AlignCenter size={13} /></Tool>
        <Tool title="ชิดขวา" onPress={() => alignLine("right")}><AlignRight size={13} /></Tool>
        <Tool title="ชิดซ้าย" onPress={() => alignLine("left")}><AlignLeft size={13} /></Tool>
      </div>
      {/* A native textarea, not the shared TextArea: the toolbar needs a ref to
          the element to place the caret, and the wrapper does not forward one.
          Classes mirror the other fields so it still reads as one form. */}
      <textarea
        ref={ref}
        rows={8}
        placeholder="ใส่รายละเอียดของประกาศ วางลิงก์ได้เลยระบบจะทำให้กดได้เอง"
        value={value}
        maxLength={8000}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        className="w-full resize-none overflow-y-auto rounded-lg border border-border bg-surface px-3 py-2 text-sm leading-6 text-foreground outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
      <p className="text-xs text-muted">
        เลือกข้อความแล้วกดปุ่มด้านบน
        {/* Keyboard shortcuts are noise on a phone — there is no keyboard to
            press them on. */}
        <span className="hidden sm:inline"> หรือใช้ ⌘B ⌘I ⌘K</span>
        {" · "}ขึ้นต้นบรรทัดด้วย - หรือ 1. แล้วกด Enter ระบบจะต่อรายการให้เอง
      </p>
    </div>
  );
}

// ============================================================================
// Attachments: photos, a clip, the PDF of the official notice
// ============================================================================

const MEDIA_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,application/pdf";

function AttachmentsField({ draft, setDraft }: { draft: Draft; setDraft: SetDraft }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setErr(null);
    const picked = Array.from(files);
    if (draft.attachments.length + picked.length > 20) {
      setErr("แนบไฟล์ได้ไม่เกิน 20 ไฟล์ต่อหนึ่งประกาศ");
      return;
    }
    setBusy(b => b + picked.length);
    // Uploaded one at a time so a rejected file names itself instead of
    // failing the whole batch anonymously.
    for (const file of picked) {
      const form = new FormData();
      form.append("file", file);
      try {
        const up = await api.upload<Attachment>("/announcements/upload-media", form);
        setDraft(d => ({ ...d, attachments: [...d.attachments, up] }));
      } catch (e) {
        setErr(`${file.name}: ${errMessage(e)}`);
      } finally {
        setBusy(b => b - 1);
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  const move = (i: number, dir: -1 | 1) => {
    const next = [...draft.attachments];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setDraft({ ...draft, attachments: next });
  };

  return (
    <FieldGroup
      label={<span className="inline-flex items-center gap-1.5"><Paperclip size={14} />ไฟล์แนบ (รูป วิดีโอ หรือ PDF)</span>}
      hint="รูปได้หลายรูป เรียงลำดับได้ · รูป ≤ 8MB · วิดีโอ ≤ 80MB · PDF ≤ 20MB"
    >
      <div className="space-y-2">
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={MEDIA_ACCEPT}
          className="hidden"
          onChange={e => void addFiles(e.target.files)}
        />
        <Button variant="ghost" size="sm" onPress={() => fileRef.current?.click()} isDisabled={busy > 0}>
          <Plus size={13} />{busy > 0 ? `กำลังอัปโหลด… (${busy})` : "เพิ่มไฟล์"}
        </Button>

        {err && <div className="text-xs text-danger">{err}</div>}

        {!!draft.attachments.length && (
          <ul className="space-y-1.5">
            {draft.attachments.map((a, i) => (
              <li key={a.storage_key} className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2 py-1.5">
                {a.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.url} alt="" className="size-9 shrink-0 rounded object-cover" />
                ) : (
                  <span className="flex size-9 shrink-0 items-center justify-center rounded bg-accent-soft text-accent-soft-foreground">
                    {a.kind === "video" ? <Play size={14} /> : <FileText size={14} />}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-xs">{a.filename}</span>
                <button type="button" aria-label="เลื่อนขึ้น" onClick={() => move(i, -1)}
                  className="px-1 text-ink-3 hover:text-brand disabled:opacity-30" disabled={i === 0}>↑</button>
                <button type="button" aria-label="เลื่อนลง" onClick={() => move(i, 1)}
                  className="px-1 text-ink-3 hover:text-brand disabled:opacity-30" disabled={i === draft.attachments.length - 1}>↓</button>
                <button type="button" aria-label={`เอา ${a.filename} ออก`}
                  onClick={() => setDraft({ ...draft, attachments: draft.attachments.filter(x => x.storage_key !== a.storage_key) })}
                  className="px-1 text-ink-3 hover:text-danger">
                  <X size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </FieldGroup>
  );
}

// ============================================================================
// Reach: public link + extra email recipients
// ============================================================================

/**
 * Everything that answers "who gets this": the role chips, the optional
 * narrowing rules, the resulting head-count, and the public link.
 *
 * These four used to sit in three different places on the form — roles near the
 * top, the count and the narrowing rules at the bottom under a rule, the public
 * toggle below that. They are one decision, so they are now one block, and the
 * count sits directly under the controls that move it.
 */
function AudienceSection({ draft, setDraft }: { draft: Draft; setDraft: SetDraft }) {
  const setField = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft({ ...draft, [k]: v });
  const { data: filterOpts } = useSWR<{ items: { value: string; label: string }[] }>(
    "/announcements/audience-filters",
  );

  // Who this rule reaches, answered by the server that will do the sending —
  // so the number on screen is the number of people, not an estimate.
  const rule = useMemo(() => ({
    roles: draft.audience,
    course_ids: draft.targetCourses.map(c => c.id),
    user_ids: draft.targetUsers.map(u => u.id),
    filters: draft.targetFilters,
  }), [draft.audience, draft.targetCourses, draft.targetUsers, draft.targetFilters]);
  const ruleKey = JSON.stringify(rule);
  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setPreviewing(true);
    const t = setTimeout(() => {
      api.post<AudiencePreview>("/announcements/preview-audience", JSON.parse(ruleKey))
        .then(p => { if (!cancelled) setPreview(p); })
        .catch(() => { if (!cancelled) setPreview(null); })
        .finally(() => { if (!cancelled) setPreviewing(false); });
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [ruleKey]);

  return (
    <Section
      icon={<Users size={15} />}
      title="ส่งถึงใคร"
      summary={preview ? (preview.total === 0 ? "ยังไม่ถึงใคร" : `${preview.total} คน`) : undefined}
    >
      <FieldGroup label="กลุ่มผู้รับ" hint="ผู้รับจะได้รับการแจ้งเตือนในระบบและทางอีเมล">
        <div className="flex flex-wrap gap-2">
          {ROLES.map(r => {
            const on = draft.audience.includes(r.value);
            return (
              <button
                key={r.value}
                type="button"
                onClick={() => setField("audience", on ? draft.audience.filter(x => x !== r.value) : [...draft.audience, r.value])}
                className={`chip cursor-pointer transition ${on ? "chip-brand" : "chip-neutral"}`}
                aria-pressed={on}
              >
                {on ? <Check size={12} className="me-1 inline" /> : null}
                {r.label}
              </button>
            );
          })}
        </div>
      </FieldGroup>

      <NarrowingRules draft={draft} setDraft={setDraft} filterOpts={filterOpts?.items ?? []} />

      <AudienceSummary preview={preview} loading={previewing} />

      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={draft.isPublic}
          onChange={e => setField("isPublic", e.target.checked)}
        />
        <span className="text-sm">
          <span className="inline-flex items-center gap-1.5 font-medium"><Globe size={14} />เปิดให้บุคคลทั่วไปอ่านได้</span>
          <span className="mt-0.5 block text-xs text-muted">
            สร้างลิงก์สาธารณะสำหรับแชร์ลง Facebook หรือ LINE เปิดอ่านได้โดยไม่ต้องเข้าสู่ระบบ
            (เห็นเฉพาะหัวข้อและเนื้อหา ไม่เห็นว่าส่งถึงใครบ้าง)
          </span>
        </span>
      </label>
    </Section>
  );
}

/**
 * The narrowing rules, folded away until wanted.
 *
 * Two search boxes and a row of condition chips is the single biggest thing on
 * the form, and most announcements go to whole roles and never touch it. It
 * opens by itself when the draft already carries rules, so editing an targeted
 * announcement never hides the reason it reaches so few people.
 */
function NarrowingRules({
  draft, setDraft, filterOpts,
}: {
  draft: Draft;
  setDraft: SetDraft;
  filterOpts: { value: string; label: string }[];
}) {
  const count = draft.targetCourses.length + draft.targetUsers.length + draft.targetFilters.length;
  const [open, setOpen] = useState(count > 0);

  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start transition-colors hover:bg-surface-secondary"
      >
        <Target size={14} className="shrink-0 text-muted" />
        <span className="flex-1 text-sm">เจาะกลุ่มให้แคบลง</span>
        <span className="shrink-0 text-xs text-muted">{count > 0 ? `${count} เงื่อนไข` : "ไม่บังคับ"}</span>
        <ChevronDown size={14} className={"shrink-0 text-muted transition-transform " + (open ? "rotate-180" : "")} />
      </button>

      {open && (
        <div className="space-y-3 border-t border-hairline p-3">
          <p className="text-xs text-muted">
            เลือกได้หลายอย่างพร้อมกัน กลุ่มบทบาท วิชา และรายชื่อจะรวมกัน
            ส่วนเงื่อนไขด้านล่างจะกรองให้แคบลงอีกชั้น
          </p>

          <CoursePicker draft={draft} setDraft={setDraft} />
          <PeoplePicker draft={draft} setDraft={setDraft} />

          <div>
            <div className="mb-1.5 text-xs text-ink-2">เฉพาะคนที่เข้าเงื่อนไข</div>
            <div className="flex flex-wrap gap-1.5">
              {filterOpts.map(f => {
                const on = draft.targetFilters.includes(f.value);
                return (
                  <button
                    key={f.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setDraft(d => ({
                      ...d,
                      targetFilters: on
                        ? d.targetFilters.filter(x => x !== f.value)
                        : [...d.targetFilters, f.value],
                    }))}
                    className={`chip cursor-pointer transition ${on ? "chip-brand" : "chip-neutral"}`}
                  >
                    {on ? <Check size={11} className="me-1 inline" /> : null}{f.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface AudiencePreview {
  total: number;
  everyone: boolean;
  names: { id: string; name: string; email: string }[];
}

/** The count is the point of the whole targeting UI: confirm, don't trust. */
function AudienceSummary({ preview, loading }: { preview: AudiencePreview | null; loading: boolean }) {
  if (!preview) {
    return <div className="h-14 animate-pulse rounded-lg border border-border bg-surface-secondary" />;
  }
  const tone = preview.total === 0
    ? "border-amber-300 bg-amber-50/70"
    : preview.everyone
      ? "border-sky-300 bg-sky-50/70"
      : "border-border bg-surface-secondary";
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${tone} ${loading ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <Users size={14} className="text-ink-3" />
        <span className="text-sm font-semibold text-ink-1">
          {preview.total === 0 ? "ไม่มีใครเข้าเงื่อนไขนี้" : `จะส่งถึง ${preview.total} คน`}
        </span>
        {preview.everyone && preview.total > 0 && (
          <span className="text-xs text-sky-800">ทุกคนในระบบ (ยังไม่ได้เจาะกลุ่ม)</span>
        )}
      </div>
      {preview.total > 0 && (
        <div className="mt-1 line-clamp-2 text-xs text-muted">
          {preview.names.map(n => n.name).join(" · ")}
          {preview.total > preview.names.length && ` และอีก ${preview.total - preview.names.length} คน`}
        </div>
      )}
      {preview.total === 0 && (
        <div className="mt-0.5 text-xs text-amber-800">
          ลองผ่อนเงื่อนไขลง มิฉะนั้นประกาศนี้จะไม่ถึงใครเลย
        </div>
      )}
    </div>
  );
}

/** Pick teaching courses; everyone attached to them is reached. */
function CoursePicker({ draft, setDraft }: { draft: Draft; setDraft: SetDraft }) {
  const [q, setQ] = useState("");
  const search = useDebounced(q, 300);
  const { data } = useSWR<{ id: string; code: string; name_th: string }[]>(
    search.trim().length >= 2 ? `/teaching-courses` : null,
  );
  const matches = (data ?? [])
    .filter(c => `${c.code} ${c.name_th}`.toLowerCase().includes(search.trim().toLowerCase()))
    .slice(0, 8);

  return (
    <div>
      <div className="mb-1.5 text-xs text-ink-2">เฉพาะวิชา (อาจารย์และผู้ช่วยสอนของวิชานั้น)</div>
      <TextInput placeholder="พิมพ์รหัสหรือชื่อวิชา…" value={q} onChange={e => setQ(e.target.value)} />
      {!!matches.length && (
        <ul className="mt-1 rounded-lg border border-border bg-surface">
          {matches.map(c => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  if (!draft.targetCourses.some(x => x.id === c.id)) {
                    setDraft({ ...draft, targetCourses: [...draft.targetCourses, { id: c.id, label: `${c.code} ${c.name_th}` }] });
                  }
                  setQ("");
                }}
                className="w-full px-3 py-1.5 text-start text-sm hover:bg-accent-soft"
              >
                <b>{c.code}</b> <span className="text-muted">{c.name_th}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!!draft.targetCourses.length && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {draft.targetCourses.map(c => (
            <span key={c.id} className="chip chip-brand inline-flex items-center gap-1">
              {c.label}
              <button type="button" aria-label={`เอา ${c.label} ออก`}
                onClick={() => setDraft({ ...draft, targetCourses: draft.targetCourses.filter(x => x.id !== c.id) })}
                className="text-brand/70 hover:text-brand">
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Pick named people — including exactly one, for a private notice. */
function PeoplePicker({ draft, setDraft }: { draft: Draft; setDraft: SetDraft }) {
  const [q, setQ] = useState("");
  const search = useDebounced(q, 300);
  const { data: found } = useSWR<{ items: PickUser[] }>(
    search.trim().length >= 2 ? `/users?search=${encodeURIComponent(search.trim())}&limit=8` : null,
  );

  return (
    <div>
      <div className="mb-1.5 text-xs text-ink-2">เฉพาะรายชื่อ (ระบุคนเดียวก็ได้)</div>
      <TextInput placeholder="ค้นหาชื่อหรืออีเมลของคนในระบบ…" value={q} onChange={e => setQ(e.target.value)} />
      {!!found?.items?.length && (
        <ul className="mt-1 rounded-lg border border-border bg-surface">
          {found.items.map(u => (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => {
                  if (!draft.targetUsers.some(x => x.id === u.id)) {
                    setDraft({ ...draft, targetUsers: [...draft.targetUsers, { id: u.id, name: formatName(u), email: u.email }] });
                  }
                  setQ("");
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-start text-sm hover:bg-accent-soft"
              >
                <span className="truncate">{formatName(u)}</span>
                <span className="shrink-0 text-xs text-muted">{u.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!!draft.targetUsers.length && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {draft.targetUsers.map(u => (
            <span key={u.id} className="chip chip-brand inline-flex items-center gap-1">
              {u.name}
              <button type="button" aria-label={`เอา ${u.name} ออก`}
                onClick={() => setDraft({ ...draft, targetUsers: draft.targetUsers.filter(x => x.id !== u.id) })}
                className="text-brand/70 hover:text-brand">
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

interface PickUser {
  id: string;
  title?: string | null;
  first_name: string;
  last_name: string;
  email: string;
}

function formatName(u: PickUser): string {
  return `${u.title ?? ""}${u.first_name} ${u.last_name}`.trim();
}

/** Returns `value` after it has stopped changing for `ms`. */
function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return settled;
}

// ============================================================================
// Cover-image field: drag-drop, client resize, validation, preview
// ============================================================================

function CoverImageField({ draft, setDraft }: { draft: Draft; setDraft: SetDraft }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    if (!IMG.accept.split(",").includes(file.type)) {
      setError(`รองรับเฉพาะไฟล์ ${IMG.acceptLabel}`);
      return;
    }
    if (file.size > IMG.maxBytes) {
      setError("ไฟล์ใหญ่เกิน 5MB ระบบจะพยายามย่อขนาดให้อัตโนมัติ");
    }
    setUploading(true);
    try {
      const resized = await resizeImage(file);
      const form = new FormData();
      form.append("file", resized, resized.name);
      const res = await api.upload<{ key: string; url: string }>("/announcements/upload-image", form);
      setDraft({ ...draft, cover_image_key: res.key, cover_image_url: res.url });
      toast.success("อัปโหลดรูปสำเร็จ");
    } catch (e) {
      setError(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setUploading(false);
    }
  }

  return (
    <FieldGroup
      label={<span>รูปหน้าปก <span className="text-muted">(ไม่บังคับ)</span></span>}
      hint={
        <span>
          แนะนำอัตราส่วน {IMG.aspectHint} ขนาด {IMG.maxWidth}×{IMG.maxHeight}px, ขั้นต่ำ {IMG.minWidth}px แนวกว้าง
          รองรับ {IMG.acceptLabel} ไม่เกิน 5MB (ระบบย่ออัตโนมัติ)
        </span>
      }
    >
      {draft.cover_image_url ? (
        <div className="relative rounded-xl overflow-hidden border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={draft.cover_image_url}
            alt="cover preview"
            className="w-full aspect-video object-cover bg-surface-secondary"
          />
          <div className="absolute top-2 right-2 flex gap-1.5">
            <Button variant="secondary" size="sm" onPress={() => fileRef.current?.click()}>
              <ImageIcon size={13} /> เปลี่ยนรูป
            </Button>
            <Button
              variant="danger-soft"
              size="sm"
              onPress={() => setDraft({ ...draft, cover_image_key: null, cover_image_url: null })}
            >
              <Trash2 size={13} /> เอาออก
            </Button>
          </div>
        </div>
      ) : (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) upload(f);
          }}
          className={
            "rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition " +
            (dragging ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-secondary")
          }
          onClick={() => fileRef.current?.click()}
        >
          <div className="w-12 h-12 rounded-xl bg-surface-secondary text-muted flex items-center justify-center mx-auto mb-2">
            <ImageIcon size={22} />
          </div>
          <div className="text-sm font-medium">
            {uploading ? "กำลังอัปโหลด…" : "ลากรูปมาวางหรือคลิกเพื่อเลือก"}
          </div>
          <div className="text-xs text-muted mt-1">
            {IMG.acceptLabel} • ≤ 5MB • {IMG.maxWidth}×{IMG.maxHeight}px
          </div>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept={IMG.accept}
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          // Reset so choosing the same file twice still fires onChange.
          e.currentTarget.value = "";
        }}
      />
      {error && (
        <Alert status="warning" title={error} icon={<AlertTriangle size={14} />} />
      )}
    </FieldGroup>
  );
}

// ============================================================================
// Preview + manage row + small helpers
// ============================================================================

function AnnouncementCardPreview({ draft }: { draft: Draft }) {
  const meta = CAT_META[draft.category];
  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      {draft.cover_image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={draft.cover_image_url} alt="" className="w-full aspect-video object-cover" />
      )}
      <div className="p-4">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <Chip tone={meta.tone}>
            <span className="inline-flex items-center gap-1">{meta.icon}{meta.label}</span>
          </Chip>
          {draft.pinned && (
            <Chip tone="brand"><span className="inline-flex items-center gap-1"><Pin size={11}/>ปักหมุด</span></Chip>
          )}
          {draft.publishMode === "scheduled" && draft.publishedAt && (
            <Chip tone="info">
              <span className="inline-flex items-center gap-1">
                <CalendarClock size={11} /> {new Date(draft.publishedAt).toLocaleString("th-TH")}
              </span>
            </Chip>
          )}
          {draft.publishMode === "draft" && <Chip tone="neutral">ฉบับร่าง</Chip>}
        </div>
        <div className="text-base font-semibold text-foreground">
          {draft.title || <span className="text-muted">หัวข้อ…</span>}
        </div>
        {/* The same renderer the readers get, so the preview cannot promise a
            layout the announcement will not actually have. */}
        {draft.body
          ? <RichText body={draft.body} className="mt-2 text-sm text-foreground/80" />
          : <div className="mt-2 text-sm text-muted">เนื้อหา…</div>}
        <div className="mt-3 flex flex-wrap gap-1">
          {draft.audience.map(r => {
            const label = ROLES.find(x => x.value === r)?.label ?? r;
            return <Chip key={r} tone="neutral">{label}</Chip>;
          })}
        </div>
      </div>
    </div>
  );
}

function ManageRow({
  a, onEdit, onDelete, onTogglePublish, onTogglePin,
}: {
  a: Ann;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePublish: () => void;
  onTogglePin: () => void;
}) {
  const meta = CAT_META[a.category] ?? CAT_META.info;
  const [sending, setSending] = useState(false);

  // Only offered once the announcement is live: mailing people about a draft
  // sends them to a page that is not there yet, and the server refuses it.
  async function resend() {
    setSending(true);
    try {
      const r = await api.post<{ sent: number; skipped: number }>(`/announcements/${a.id}/send-email`);
      toast.success(
        r.sent > 0
          ? `ส่งอีเมลแล้ว ${r.sent} ฉบับ`
          : "ไม่มีใครค้างอยู่ ทุกคนในรายชื่อได้รับอีเมลแล้ว",
      );
    } catch (e) {
      toast.danger(errMessage(e));
    } finally {
      setSending(false);
    }
  }
  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        {a.cover_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={a.cover_image_url} alt="" className="w-20 h-14 rounded-lg object-cover shrink-0 border border-border" />
        ) : (
          <div className="w-20 h-14 rounded-lg bg-accent-soft text-accent-soft-foreground flex items-center justify-center shrink-0">
            <Megaphone size={16} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip tone={meta.tone}><span className="inline-flex items-center gap-1">{meta.icon}{meta.label}</span></Chip>
            <StatusChip status={a.status} publishedAt={a.published_at ?? null} />
            {a.pinned && <Chip tone="brand"><span className="inline-flex items-center gap-1"><Pin size={11}/>ปักหมุด</span></Chip>}
            {a.is_public && <Chip tone="info"><span className="inline-flex items-center gap-1"><Globe size={11}/>สาธารณะ</span></Chip>}
          </div>
          <div className="font-medium text-sm mt-1 truncate">{a.title}</div>
          <div className="text-xs text-muted mt-0.5 line-clamp-2">{a.body}</div>
          <div className="flex flex-wrap gap-1.5 mt-1.5 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1">
              <Clock size={11} />
              {a.published_at
                ? `เผยแพร่ ${new Date(a.published_at).toLocaleString("th-TH")}`
                : "ยังไม่เผยแพร่"}
            </span>
            {a.expires_at && (
              <span className="inline-flex items-center gap-1">
                • หมดอายุ {new Date(a.expires_at).toLocaleString("th-TH")}
              </span>
            )}
            <span>• กลุ่ม: {a.audience.map(r => ROLES.find(x => x.value === r)?.label ?? r).join(", ") || "-"}</span>
          </div>
          {a.status === "live" && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <ShareButtons id={a.id} title={a.title} isPublic={!!a.is_public} size="sm" />
              <button
                type="button"
                onClick={resend}
                disabled={sending}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-ink-2 transition-colors hover:border-brand hover:text-brand disabled:opacity-40"
              >
                <Mail size={12} />{sending ? "กำลังส่ง…" : "ส่งอีเมลถึงรายชื่อที่เพิ่ม"}
              </button>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <Button variant="ghost" size="sm" onPress={onEdit}><Pencil size={13} /> แก้ไข</Button>
          <Button variant="ghost" size="sm" onPress={onTogglePin}>
            {a.pinned ? <><PinOff size={13} /> ยกเลิกปักหมุด</> : <><Pin size={13} /> ปักหมุด</>}
          </Button>
          <Button variant="ghost" size="sm" onPress={onTogglePublish}>
            {a.status === "live" || a.status === "scheduled"
              ? <><EyeOff size={13} /> ยกเลิกเผยแพร่</>
              : <><Eye size={13} /> เผยแพร่</>}
          </Button>
          <Button variant="ghost" size="sm" onPress={onDelete}>
            <Trash2 size={13} className="text-danger" /> <span className="text-danger">ลบ</span>
          </Button>
        </div>
      </div>
    </li>
  );
}

function StatusChip({ status, publishedAt }: { status: Status; publishedAt: string | null }) {
  const map: Record<Status, { tone: "success"|"info"|"neutral"|"warn"; label: string }> = {
    live:      { tone: "success", label: "เผยแพร่แล้ว" },
    scheduled: { tone: "info",    label: publishedAt ? `รอเผยแพร่ ${new Date(publishedAt).toLocaleString("th-TH", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : "รอเผยแพร่" },
    draft:     { tone: "neutral", label: "ฉบับร่าง" },
    expired:   { tone: "warn",    label: "หมดอายุ" },
  };
  const m = map[status];
  return <Chip tone={m.tone}>{m.label}</Chip>;
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`chip cursor-pointer transition ${active ? "chip-brand" : "chip-neutral"}`}
    >
      {children}
    </button>
  );
}

// ============================================================================
// Utilities
// ============================================================================

// Convert an existing announcement into the composer payload shape so the
// pin toggle can reuse the shared upsert endpoint without dropping fields.
function toUpsertPayload(a: Ann) {
  return {
    id: a.id,
    title: a.title,
    body: a.body,
    category: a.category,
    audience: a.audience,
    pinned: a.pinned,
    cover_image_key: a.cover_image_key ?? null,
    published_at: a.published_at ?? null,
    expires_at: a.expires_at ?? null,
    // is_public/recipients are deliberately absent: the server reads a missing
    // field as "leave it alone". Sending a default here would let the pin
    // button switch off an announcement's share link and delete everyone still
    // queued for email.
  };
}


// ISO -> local `YYYY-MM-DDTHH:MM` string suitable for <input type="datetime-local">
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Client-side resize to keep upload under 5MB and cap dimensions to IMG.maxWidth×maxHeight.
// Returns the resized File; falls back to the original if canvas is unavailable
// or the file already fits within the box.
async function resizeImage(file: File): Promise<File> {
  if (typeof window === "undefined") return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, IMG.maxWidth / bmp.width, IMG.maxHeight / bmp.height);
    if (scale >= 1 && file.size <= IMG.maxBytes) return file;
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, w, h);
    // Prefer WebP for smaller size, but fall back to JPEG on older browsers.
    const outType = "image/webp";
    const blob: Blob | null = await new Promise(res => canvas.toBlob(res, outType, 0.86));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: outType });
  } catch {
    return file;
  }
}

