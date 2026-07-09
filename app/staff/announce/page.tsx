"use client";
import useSWR, { mutate } from "swr";
import { useMemo, useRef, useState } from "react";
import {
  Megaphone, Send, Image as ImageIcon, X, Trash2, Pencil,
  Pin, PinOff, Eye, EyeOff, CalendarClock, Clock, AlertTriangle,
  Info, PartyPopper, Newspaper, Radio, Sparkles, Check, Plus,
} from "lucide-react";
import { Tabs, toast } from "@heroui/react";
import { api } from "../../lib/api";
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
    });
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
  } | { error: string } {
    const title = draft.title.trim();
    const body = draft.body.trim();
    if (!title) return { error: "กรุณากรอกหัวข้อ" };
    if (title.length > 200) return { error: "หัวข้อยาวเกิน 200 ตัวอักษร" };
    if (!body) return { error: "กรุณากรอกเนื้อหา" };
    if (body.length > 8000) return { error: "เนื้อหายาวเกิน 8000 ตัวอักษร" };
    if (draft.audience.length === 0) return { error: "เลือกกลุ่มผู้รับอย่างน้อยหนึ่งกลุ่ม" };

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
          <Tabs.List>
            <Tabs.Tab id="compose"><Sparkles size={14} /> เขียน / แก้ไข</Tabs.Tab>
            <Tabs.Tab id="manage">
              <Megaphone size={14} /> จัดการประกาศ
              <span className="ms-1 text-xs text-muted">({counts.all})</span>
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel id="compose">
          <div ref={editorRef} className="grid gap-4 lg:grid-cols-5 mt-4">
            <div className="lg:col-span-3 space-y-4">
              <Composer draft={draft} setDraft={setDraft} />
              <div className="flex flex-wrap gap-2 justify-end">
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

            <div className="lg:col-span-2">
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

function Composer({ draft, setDraft }: { draft: Draft; setDraft: (d: Draft) => void }) {
  const setField = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft({ ...draft, [k]: v });

  return (
    <Panel title={draft.id ? "แก้ไขประกาศ" : "สร้างประกาศใหม่"}>
      <div className="space-y-4">
        <FieldGroup label={<span>หัวข้อ <span className="text-muted">({draft.title.length}/200)</span></span>}>
          <TextInput
            placeholder="หัวข้อประกาศ"
            value={draft.title}
            maxLength={200}
            onChange={e => setField("title", e.target.value)}
          />
        </FieldGroup>

        <FieldGroup label={<span>เนื้อหา <span className="text-muted">({draft.body.length}/8000)</span></span>}>
          <TextArea
            rows={7}
            placeholder="ใส่รายละเอียดของประกาศ (ขึ้นบรรทัดใหม่จะแสดงจริงในหน้าฟีด)"
            value={draft.body}
            maxLength={8000}
            onChange={e => setField("body", e.target.value)}
          />
        </FieldGroup>

        <FieldGroup label="หมวดหมู่">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {CATEGORIES.map(c => {
              const on = draft.category === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setField("category", c.value)}
                  className={
                    "px-2.5 py-2 rounded-lg border text-xs flex flex-col items-start gap-1 transition text-start " +
                    (on
                      ? "border-accent bg-accent-soft text-accent-soft-foreground"
                      : "border-border bg-surface hover:bg-surface-secondary")
                  }
                  aria-pressed={on}
                >
                  <span className="flex items-center gap-1.5 font-medium">
                    {c.icon} {c.label}
                  </span>
                  <span className="text-[11px] text-muted leading-snug">{c.description}</span>
                </button>
              );
            })}
          </div>
        </FieldGroup>

        <FieldGroup label="กลุ่มผู้รับ" hint="ผู้รับจะได้รับการแจ้งเตือนในระบบและทางอีเมล">
          <div className="flex gap-2 flex-wrap">
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

        <CoverImageField draft={draft} setDraft={setDraft} />

        <div className="grid gap-3 sm:grid-cols-2">
          <FieldGroup label="กำหนดการเผยแพร่">
            <div className="flex flex-col gap-2">
              {(["now", "scheduled", "draft"] as const).map(m => (
                <label key={m} className="flex items-start gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    className="mt-1"
                    checked={draft.publishMode === m}
                    onChange={() => setField("publishMode", m)}
                  />
                  <span>
                    <span className="font-medium">
                      {m === "now" ? "เผยแพร่ทันที" : m === "scheduled" ? "ตั้งเวลาเผยแพร่" : "บันทึกเป็นฉบับร่าง"}
                    </span>
                    <span className="block text-xs text-muted">
                      {m === "now"
                        ? "โพสต์และส่งการแจ้งเตือนทันที"
                        : m === "scheduled"
                        ? "ระบบจะเผยแพร่และแจ้งเตือนตามเวลาที่ตั้งไว้"
                        : "เก็บไว้ในแท็บฉบับร่าง ไม่ส่งการแจ้งเตือน"}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            {draft.publishMode === "scheduled" && (
              <input
                type="datetime-local"
                className="mt-2 h-9 rounded-lg border border-border bg-surface px-3 text-sm text-foreground w-full"
                value={draft.publishedAt}
                min={toLocalInput(new Date().toISOString())}
                onChange={e => setField("publishedAt", e.target.value)}
              />
            )}
          </FieldGroup>

          <FieldGroup label="วันหมดอายุ (ไม่บังคับ)" hint="ประกาศจะซ่อนจากฟีดหลังเวลานี้">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
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
                className="mt-2 h-9 rounded-lg border border-border bg-surface px-3 text-sm text-foreground w-full"
                value={draft.expiresAt}
                min={draft.publishedAt || toLocalInput(new Date().toISOString())}
                onChange={e => setField("expiresAt", e.target.value)}
              />
            )}
          </FieldGroup>
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={draft.pinned}
            onChange={e => setField("pinned", e.target.checked)}
          />
          <Pin size={14} /> ปักหมุดไว้บนสุดของฟีด
        </label>
      </div>
    </Panel>
  );
}

// ============================================================================
// Cover-image field: drag-drop, client resize, validation, preview
// ============================================================================

function CoverImageField({ draft, setDraft }: { draft: Draft; setDraft: (d: Draft) => void }) {
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
      setError("ไฟล์ใหญ่เกิน 5MB — ระบบจะพยายามย่อขนาดให้อัตโนมัติ");
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
          แนะนำอัตราส่วน {IMG.aspectHint} — ขนาด {IMG.maxWidth}×{IMG.maxHeight}px, ขั้นต่ำ {IMG.minWidth}px แนวกว้าง
          — รองรับ {IMG.acceptLabel} — ไม่เกิน 5MB (ระบบย่ออัตโนมัติ)
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
        <div className="text-sm text-foreground/80 mt-2 whitespace-pre-wrap">
          {draft.body || <span className="text-muted">เนื้อหา…</span>}
        </div>
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

