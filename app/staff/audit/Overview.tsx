"use client";
import { ChevronRight, MonitorSmartphone, ShieldAlert, ShieldCheck } from "lucide-react";
import { Chip, Panel } from "../../components/ui";
import { Skel, SkelList } from "../../components/Skeletons";
import { RowBadges } from "./RowBadges";
import {
  NETWORK_LABEL, ROLE_LABEL, ago, shortDateTime,
  type Attention, type Session, type Summary,
} from "./types";

/* -------------------------------------------------------------------------- *
 * The overview — the answer to "is anything wrong?" before a single row is
 * read, and "who is in the system right now?" beside it.
 *
 * The first is a short list of what deserves a second look in the chosen
 * period: refusals, lock-outs, decisions that were undone, changes to
 * somebody's access. The server picks them and folds repeats ("wrong password
 * ×11" is one line), so a quiet week reads as one green sentence and a busy
 * one reads as a list short enough to go through.
 *
 * The second is the sessions that can still act — the "where you're logged in"
 * list. The trail can only answer that by reading every login backwards.
 * -------------------------------------------------------------------------- */

export function Overview({
  summary, sessions, currentSession, rangeLabel, onPick,
}: {
  summary?: Summary;
  sessions?: Session[];
  currentSession?: string;
  rangeLabel: string;
  onPick: (a: Attention) => void;
}) {
  const attention = summary?.attention ?? [];
  return (
    <div className="mb-3 grid gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Panel>
        <div className="mb-2 flex items-center gap-2 text-sm">
          {/* No verdict until the numbers are in — an all-clear shown over an
              empty summary would be a false one. */}
          {!summary ? (
            <Skel className="h-5 w-64" />
          ) : attention.length > 0 ? (
            <>
              <ShieldAlert size={18} className="shrink-0 text-warning" />
              <span className="font-semibold">
                มี {attention.length.toLocaleString("th-TH")} เรื่องที่ควรตรวจสอบ
                <span className="font-normal text-(--ink-3)"> ในช่วง{rangeLabel}</span>
              </span>
            </>
          ) : (
            <>
              <ShieldCheck size={18} className="shrink-0 text-success" />
              <span className="font-semibold">
                ไม่พบเรื่องที่ต้องตรวจสอบ
                <span className="font-normal text-(--ink-3)"> ในช่วง{rangeLabel}</span>
              </span>
            </>
          )}
        </div>

        {!summary ? (
          <SkelList items={3} />
        ) : attention.length === 0 ? (
          <p className="text-sm text-(--ink-3)">
            ไม่มีการเข้าระบบที่ล้มเหลวซ้ำ ๆ ไม่มีการย้อนหรือแก้สิ่งที่อนุมัติแล้ว
            และไม่มีการเปลี่ยนสิทธิ์ของบัญชีใด จากทั้งหมด {summary.events.toLocaleString("th-TH")} เหตุการณ์
          </p>
        ) : (
          <ul className="max-h-72 divide-y divide-(--border) overflow-y-auto">
            {attention.map(a => (
              <li key={`${a.action}/${a.actor_id ?? ""}`}>
                <button
                  type="button"
                  onClick={() => onPick(a)}
                  className="flex w-full items-start gap-2 rounded py-2 text-left outline-offset-2 hover:text-(--brand) focus-visible:outline-2 focus-visible:outline-(--brand)"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-snug">
                      <span className="min-w-0 break-words">{attentionSentence(a)}</span>
                      {a.count > 1 && (
                        <span className="rounded-full bg-(--surface-2) px-2 py-0.5 text-xs font-medium tabular-nums text-(--ink-2)">
                          {a.count.toLocaleString("th-TH")} ครั้ง
                        </span>
                      )}
                      <RowBadges row={a} />
                    </span>
                    <span className="mt-0.5 block text-xs text-(--ink-3)">
                      {[`ล่าสุด ${shortDateTime(a.last_at)}`, attentionHint(a)].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <ChevronRight size={16} className="mt-0.5 shrink-0 text-(--ink-4)" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel>
        <div className="mb-2 flex items-center gap-2 text-sm">
          <MonitorSmartphone size={18} className="shrink-0 text-(--ink-3)" />
          <span className="font-semibold">กำลังใช้งานอยู่ตอนนี้</span>
          {sessions && (
            <span className="text-(--ink-3)">{sessions.length.toLocaleString("th-TH")} เครื่อง</span>
          )}
        </div>
        {!sessions ? (
          <SkelList items={2} />
        ) : sessions.length === 0 ? (
          <p className="text-sm text-(--ink-3)">ไม่มีผู้ใช้ที่กำลังใช้งานระบบ</p>
        ) : (
          <ul className="max-h-72 divide-y divide-(--border) overflow-y-auto">
            {sessions.map(s => (
              <li key={s.id} className="py-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className="font-medium">{s.name}</span>
                  {s.id === currentSession && <Chip tone="brand">เครื่องนี้ (คุณ)</Chip>}
                  <span className="text-xs text-(--ink-3)">
                    {s.roles.map(r => ROLE_LABEL[r] ?? r).join(", ")}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-(--ink-3)">
                  {[
                    s.device || "ไม่ทราบอุปกรณ์",
                    s.network ? NETWORK_LABEL[s.network] : "",
                    `ใช้งานล่าสุด ${ago(s.last_activity_at)}`,
                  ].filter(Boolean).join(" · ")}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function attentionSentence(a: Attention): React.ReactNode {
  const who = a.actor_name || (a.actor_id ? "ผู้ใช้ที่ไม่มีชื่อในระบบ" : "");
  // The subject, unless it is the actor themself (a failed login is "about"
  // the same account that failed).
  const selfSubject = (a.entity === "user" || a.entity === "ta_profile") && a.entity_id === a.actor_id;
  const subject = a.subject_name && !selfSubject ? a.subject_name : "";
  return (
    <>
      {who && <span className="font-semibold">{who} </span>}
      <span>{a.label}</span>
      {subject && <span className="text-(--ink-2)"> · {subject}</span>}
      {!subject && a.subjects > 1 && (
        <span className="text-(--ink-2)"> · {a.subjects.toLocaleString("th-TH")} รายการ</span>
      )}
    </>
  );
}

/** What the count means. Many failures from one machine is usually one person
 *  getting it wrong; the same number from many machines is not. */
function attentionHint(a: Attention): string {
  if (a.outcome === "ok" || !a.action.startsWith("auth.")) return "";
  if (a.distinct_ips > 1) return `มาจาก ${a.distinct_ips.toLocaleString("th-TH")} ที่อยู่เครือข่าย ควรตรวจสอบ`;
  if (a.count > 1) return "ทั้งหมดมาจากเครื่องเดียว";
  return "";
}
