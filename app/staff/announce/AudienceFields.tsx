"use client";
import useSWR from "swr";
import { useEffect, useMemo, useState } from "react";
import { Check, Globe, Users, X } from "lucide-react";
import { api } from "../../lib/api";
import { Skel } from "../../components/Skeletons";
import { TextInput, Tip } from "../../components/ui";
import Section from "./Section";
import {
  ROLES, roleLabel, ruleOf, ruleIsEmpty,
  type AudiencePreview, type AudienceRule, type Draft, type SetDraft,
} from "./shared";

// ============================================================================
// Who gets it
// ============================================================================

export interface FilterOption { value: string; label: string }

export function useFilterOptions(): FilterOption[] {
  const { data } = useSWR<{ items: FilterOption[] }>("/announcements/audience-filters");
  return data?.items ?? [];
}

/**
 * Who a rule reaches, answered by the server that will do the sending — so the
 * number on screen is the number of people, not an estimate.
 */
export interface AudiencePreviewState {
  preview: AudiencePreview | null;
  loading: boolean;
  /** The count could not be fetched. Publishing stays blocked until it can. */
  failed: boolean;
  retry: () => void;
}

export function useAudiencePreview(rule: AudienceRule): AudiencePreviewState {
  const key = JSON.stringify(rule);
  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const parsed = JSON.parse(key) as AudienceRule;
    setFailed(false);
    if (ruleIsEmpty(parsed)) {
      setPreview({ total: 0, everyone: false, empty: true, names: [] });
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      api.post<AudiencePreview>("/announcements/preview-audience", parsed)
        .then(p => { if (!cancelled) setPreview(p); })
        // A stale count is worse than none: it would sit beside a rule it no
        // longer describes. Clear it and say so.
        .catch(() => { if (!cancelled) { setPreview(null); setFailed(true); } })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [key, attempt]);
  return { preview, loading, failed, retry: () => setAttempt(n => n + 1) };
}

/**
 * The rule as one sentence. The server narrows: each of role, course and
 * condition cuts the group down, and named people are added on top. Saying it
 * back in words is how an officer catches a rule that does not mean what the
 * chips looked like.
 */
export function describeRule(d: Draft, filters: FilterOption[]): string {
  const rule = ruleOf(d);
  if (ruleIsEmpty(rule)) return "ยังไม่ได้เลือกผู้รับ";

  const hasGroup = rule.roles.length > 0 || rule.course_ids.length > 0 || rule.filters.length > 0;
  const parts: string[] = [];
  if (hasGroup) {
    const allRoles = rule.roles.length === 0 || rule.roles.length === ROLES.length;
    let who: string;
    if (allRoles) {
      who = rule.course_ids.length ? "อาจารย์และผู้ช่วยสอน" : rule.filters.length ? "ทุกคน" : "ทุกคนในระบบ";
    } else {
      who = rule.roles.map(roleLabel).join(" และ");
    }
    if (rule.course_ids.length) {
      who += "ของวิชา " + d.targetCourses.map(c => c.label.split(" ")[0]).join(", ");
    }
    if (rule.filters.length) {
      who += " เฉพาะคนที่เข้าเงื่อนไข " +
        rule.filters.map(f => `“${filters.find(x => x.value === f)?.label ?? f}”`).join(" และ ");
    }
    parts.push(who);
  }
  if (rule.user_ids.length) {
    parts.push(
      hasGroup
        ? `และอีก ${rule.user_ids.length} คนที่ระบุชื่อ`
        : d.targetUsers.length <= 3
          ? d.targetUsers.map(u => u.name).join(", ")
          : `${rule.user_ids.length} คนที่ระบุชื่อ`,
    );
  }
  return parts.join(" ");
}

const chip = (on: boolean) => `chip cursor-pointer transition ${on ? "chip-brand" : "chip-neutral"}`;

export function AudienceSection({
  draft, setDraft, audience,
}: {
  draft: Draft;
  setDraft: SetDraft;
  audience: AudiencePreviewState;
}) {
  const { preview, loading } = audience;
  const filterOpts = useFilterOptions();
  const allRoles = draft.audience.length === ROLES.length;
  const toggleRole = (r: string) => setDraft(d => ({
    ...d,
    audience: d.audience.includes(r) ? d.audience.filter(x => x !== r) : [...d.audience, r],
  }));

  return (
    <Section
      icon={<Users size={15} />}
      title="ส่งถึงใคร"
      summary={preview && !preview.empty ? `${preview.total} คน` : undefined}
    >
      <div>
        <div className="mb-1.5 text-sm font-medium text-foreground">กลุ่มผู้รับ</div>
        <div className="flex flex-wrap gap-2">
          {ROLES.map(r => {
            const on = draft.audience.includes(r.value);
            return (
              <button key={r.value} type="button" aria-pressed={on} onClick={() => toggleRole(r.value)} className={chip(on)}>
                {on ? <Check size={12} className="me-1 inline" /> : null}{r.label}
              </button>
            );
          })}
          <span className="mx-0.5 w-px self-stretch bg-border" />
          <button
            type="button"
            aria-pressed={allRoles}
            onClick={() => setDraft(d => ({ ...d, audience: allRoles ? [] : ROLES.map(r => r.value) }))}
            className={chip(allRoles)}
          >
            {allRoles ? <Check size={12} className="me-1 inline" /> : null}ทุกกลุ่ม
          </button>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-border p-3">
        <div className="text-sm font-medium text-foreground">
          จำกัดให้แคบลง <span className="font-normal text-muted">(ไม่บังคับ)</span>
        </div>
        <CoursePicker draft={draft} setDraft={setDraft} />
        <div>
          <div className="mb-1.5 text-xs text-ink-2">เฉพาะคนที่เข้าเงื่อนไข (เลือกหลายข้อ = ต้องเข้าทุกข้อ)</div>
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
                    targetFilters: on ? d.targetFilters.filter(x => x !== f.value) : [...d.targetFilters, f.value],
                  }))}
                  className={chip(on)}
                >
                  {on ? <Check size={11} className="me-1 inline" /> : null}{f.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <PeoplePicker draft={draft} setDraft={setDraft} />

      {audience.failed ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50/70 px-3 py-2.5 text-sm text-amber-900">
          นับจำนวนผู้รับไม่สำเร็จ
          <button type="button" className="font-medium text-accent hover:underline" onClick={audience.retry}>ลองอีกครั้ง</button>
        </div>
      ) : (
        <AudienceSummary sentence={describeRule(draft, filterOpts)} preview={preview} loading={loading} isPublic={draft.isPublic} />
      )}

      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={draft.isPublic}
          onChange={e => { const v = e.target.checked; setDraft(d => ({ ...d, isPublic: v })); }}
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

/** The sentence and the count sit together, directly under the controls that
 *  move them: confirm, don't trust. */
function AudienceSummary({
  sentence, preview, loading, isPublic,
}: {
  sentence: string;
  preview: AudiencePreview | null;
  loading: boolean;
  isPublic: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  if (!preview) return <Skel className="h-14 w-full rounded-lg" />;

  const nobody = preview.total === 0;
  const tone = nobody
    ? "border-amber-300 bg-amber-50/70"
    : preview.everyone
      ? "border-sky-300 bg-sky-50/70"
      : "border-border bg-surface-secondary";
  const names = showAll ? preview.names : preview.names.slice(0, 12);

  return (
    <div data-testid="audience-summary" className={`rounded-lg border px-3 py-2.5 ${tone} ${loading ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-sm font-semibold text-ink-1">
          {preview.empty ? "ยังไม่ได้เลือกผู้รับ" : nobody ? "ไม่มีใครเข้าเงื่อนไขนี้" : `ส่งถึง ${preview.total} คน`}
        </span>
        {!preview.empty && <span className="text-xs text-ink-2">{sentence}</span>}
      </div>
      {preview.total > 0 && (
        <div className="mt-1 text-xs text-muted">
          {names.map(n => n.name).join(" · ")}
          {preview.total > names.length && (
            <>
              {" "}
              <button type="button" className="text-accent hover:underline" onClick={() => setShowAll(true)}>
                และอีก {preview.total - names.length} คน
              </button>
            </>
          )}
        </div>
      )}
      {nobody && (
        <div className="mt-0.5 text-xs text-amber-800">
          {preview.empty
            ? isPublic
              ? "ประกาศนี้จะอ่านได้ทางลิงก์สาธารณะเท่านั้น ไม่มีใครในระบบได้รับแจ้งเตือน"
              : "เลือกกลุ่มผู้รับ วิชา เงื่อนไข หรือระบุชื่อ อย่างน้อยหนึ่งอย่าง"
            : "ลองผ่อนเงื่อนไขลง ประกาศที่ไม่ถึงใครเลยจะเผยแพร่ไม่ได้"}
        </div>
      )}
    </div>
  );
}

/** Pick teaching courses; the group is cut down to people attached to them. */
function CoursePicker({ draft, setDraft }: { draft: Draft; setDraft: SetDraft }) {
  const [q, setQ] = useState("");
  const search = useDebounced(q, 300);
  const { data } = useSWR<{ id: string; code: string; name_th: string }[]>(
    search.trim().length >= 2 ? `/teaching-courses` : null,
  );
  const matches = useMemo(() => (data ?? [])
    .filter(c => `${c.code} ${c.name_th}`.toLowerCase().includes(search.trim().toLowerCase()))
    .slice(0, 8), [data, search]);

  return (
    <div>
      <div className="mb-1.5 text-xs text-ink-2">เฉพาะคนในวิชา (อาจารย์และผู้ช่วยสอนของวิชานั้น)</div>
      <TextInput placeholder="พิมพ์รหัสหรือชื่อวิชา…" value={q} onChange={e => setQ(e.target.value)} aria-label="ค้นหาวิชา" />
      {!!matches.length && (
        <ul className="mt-1 rounded-lg border border-border bg-surface">
          {matches.map(c => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  setDraft(d => d.targetCourses.some(x => x.id === c.id) ? d : {
                    ...d, targetCourses: [...d.targetCourses, { id: c.id, label: `${c.code} ${c.name_th}` }],
                  });
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
      {search.trim().length >= 2 && data && matches.length === 0 && (
        <div className="mt-1 text-xs text-muted">ไม่พบวิชาที่ตรงกับ “{search.trim()}”</div>
      )}
      <Picked
        items={draft.targetCourses.map(c => ({ id: c.id, label: c.label }))}
        onRemove={id => setDraft(d => ({ ...d, targetCourses: d.targetCourses.filter(x => x.id !== id) }))}
      />
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

const formatName = (u: PickUser) => `${u.title ?? ""}${u.first_name} ${u.last_name}`.trim();

/** Named people. Always reached, whatever the group above says. */
function PeoplePicker({ draft, setDraft }: { draft: Draft; setDraft: SetDraft }) {
  const [q, setQ] = useState("");
  const search = useDebounced(q, 300);
  const { data: found } = useSWR<{ items: PickUser[] }>(
    search.trim().length >= 2 ? `/users?search=${encodeURIComponent(search.trim())}&limit=8` : null,
  );

  return (
    <div>
      <div className="mb-1.5 text-sm font-medium text-foreground">
        เพิ่มรายบุคคล <span className="font-normal text-muted">(ส่งถึงเสมอ ไม่ขึ้นกับกลุ่มและเงื่อนไขด้านบน)</span>
      </div>
      <TextInput placeholder="ค้นหาชื่อหรืออีเมลของคนในระบบ…" value={q} onChange={e => setQ(e.target.value)} aria-label="ค้นหาบุคคล" />
      {!!found?.items?.length && (
        <ul className="mt-1 rounded-lg border border-border bg-surface">
          {found.items.map(u => (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => {
                  setDraft(d => d.targetUsers.some(x => x.id === u.id) ? d : {
                    ...d, targetUsers: [...d.targetUsers, { id: u.id, name: formatName(u), email: u.email }],
                  });
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
      {search.trim().length >= 2 && found && !found.items?.length && (
        <div className="mt-1 text-xs text-muted">ไม่พบบัญชีที่ตรงกับ “{search.trim()}”</div>
      )}
      <Picked
        items={draft.targetUsers.map(u => ({ id: u.id, label: u.name }))}
        onRemove={id => setDraft(d => ({ ...d, targetUsers: d.targetUsers.filter(x => x.id !== id) }))}
      />
    </div>
  );
}

function Picked({ items, onRemove }: { items: { id: string; label: string }[]; onRemove: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {items.map(it => (
        <span key={it.id} className="chip chip-brand inline-flex items-center gap-1">
          {it.label}
          <Tip content={`เอา ${it.label} ออก`}>
            <button type="button" aria-label={`เอา ${it.label} ออก`} onClick={() => onRemove(it.id)} className="text-brand/70 hover:text-brand">
              <X size={11} />
            </button>
          </Tip>
        </span>
      ))}
    </div>
  );
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
