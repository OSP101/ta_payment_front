"use client";
import { useState } from "react";
import { ChevronDown, ChevronRight, Copy, Check, KeyRound, Link2, User } from "lucide-react";
import { Button, Modal, Tip } from "../../components/ui";
import { RowBadges } from "./RowBadges";
import {
  NETWORK_LABEL, ROLE_LABEL, actorText, changePhrase, fullDateTime, headline, subjectText,
  type Row, type Trace,
} from "./types";

/* -------------------------------------------------------------------------- *
 * One event, read twice.
 *
 * The top half is for the person who has to decide whether this row is a
 * problem: what happened, to what, by whom, from where, and what changed — in
 * words, with the reference to quote. The bottom half, folded away until asked
 * for, is every stored field exactly as the database holds it, for the
 * administrator who has to prove it.
 *
 * It used to be only the second half: twelve labelled identifiers and two JSON
 * blobs.
 * -------------------------------------------------------------------------- */

export function DetailModal({
  row, onClose, onTrace, onActor, technicalOpen = false,
}: {
  row: Row;
  onClose: () => void;
  onTrace: (t: Trace) => void;
  onActor: (id: string) => void;
  /** The investigation view opens with the raw fields already showing. */
  technicalOpen?: boolean;
}) {
  const [tech, setTech] = useState(technicalOpen);
  const { who, what } = headline(row);
  const subject = subjectText(row);
  const changes = row.changes ?? [];
  const isUpdate = changes.some(c => c.before !== null && c.after !== null);
  const where = [
    row.device,
    row.network ? NETWORK_LABEL[row.network] : "",
    row.ip ? `IP ${row.ip}` : "",
  ].filter(Boolean).join(" · ");

  const facts: [string, React.ReactNode][] = [
    ["เมื่อไร", fullDateTime(row.at)],
    ["ใคร", row.actor_kind === "user"
      ? `${actorText(row)}${row.actor_role ? ` (${ROLE_LABEL[row.actor_role] ?? row.actor_role})` : ""}`
      : row.actor_kind === "system" ? "ระบบทำงานอัตโนมัติ ไม่มีผู้ใช้กด"
      : row.actor_kind === "anonymous" ? "ผู้ที่ยังไม่ได้เข้าสู่ระบบ"
      : "ไม่ได้บันทึกผู้กระทำ (รายการรุ่นเก่า)"],
  ];
  if (row.automatic && row.actor_kind === "user") {
    facts[1] = ["ใคร", `ระบบทำเอง หลังจาก ${actorText(row)} สั่งงานที่เกี่ยวข้อง`];
  }
  if (subject) facts.push(["เกี่ยวกับ", subject]);
  facts.push(["จากที่ไหน", where || "ไม่ได้บันทึก"]);
  if (row.count > 1) facts.push(["จำนวน", `${row.count.toLocaleString("th-TH")} รายการในคราวเดียว (แสดงรายการล่าสุด)`]);

  return (
    <Modal open onClose={onClose} size="2xl" title="รายละเอียดเหตุการณ์">
      <div className="space-y-5">
        <div>
          <div className="text-base font-semibold leading-snug text-(--ink-1)">
            {who && <span>{who} </span>}
            <span>{what}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <RowBadges row={row} always />
            <CopyChip value={row.ref} label="เลขอ้างอิง" />
          </div>
        </div>

        <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-2 text-sm">
          {facts.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-(--ink-3)">{k}</dt>
              <dd className="min-w-0 break-words">{v}</dd>
            </div>
          ))}
        </dl>

        {(row.details?.length ?? 0) > 0 && (
          <div>
            <div className="mb-1 text-xs font-medium text-(--ink-3)">รายละเอียด</div>
            <ul className="space-y-0.5 text-sm">
              {row.details!.map((d, i) => <li key={i} className="break-words">{d}</li>)}
            </ul>
          </div>
        )}

        {changes.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-medium text-(--ink-3)">
              {isUpdate ? "สิ่งที่เปลี่ยน" : "ข้อมูลของรายการนี้"}
            </div>
            <div className="overflow-x-auto rounded-lg border border-(--border)">
              <table className="w-full text-sm">
                {isUpdate && (
                  <thead>
                    <tr className="bg-(--surface-2) text-left text-xs text-(--ink-3)">
                      <th className="px-3 py-1.5 font-medium">รายการ</th>
                      <th className="px-3 py-1.5 font-medium">ก่อน</th>
                      <th className="px-3 py-1.5 font-medium">หลัง</th>
                    </tr>
                  </thead>
                )}
                <tbody>
                  {changes.map(c => (
                    <tr key={c.key} className="border-t border-(--border) first:border-t-0 align-top">
                      <td className="px-3 py-1.5 text-(--ink-3) whitespace-nowrap">{c.label}</td>
                      {isUpdate ? (
                        <>
                          <td className="px-3 py-1.5 break-words text-(--ink-3)">{cell(c.before)}</td>
                          <td className="px-3 py-1.5 break-words font-medium">{cell(c.after)}</td>
                        </>
                      ) : (
                        <td className="px-3 py-1.5 break-words">{cell(c.after ?? c.before)}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {row.actor_id && (
            <Button variant="secondary" size="sm" onPress={() => { onActor(row.actor_id!); onClose(); }}>
              <User size={14} /> ทุกอย่างที่คนนี้ทำ
            </Button>
          )}
          {row.request_id && (
            <Button variant="secondary" size="sm"
              onPress={() => { onTrace({ kind: "request", id: row.request_id! }); onClose(); }}>
              <Link2 size={14} /> สิ่งที่เกิดพร้อมกันในครั้งนี้
            </Button>
          )}
          {row.session_id && (
            <Button variant="secondary" size="sm"
              onPress={() => { onTrace({ kind: "session", id: row.session_id! }); onClose(); }}>
              <KeyRound size={14} /> ทั้งหมดในการเข้าระบบครั้งนั้น
            </Button>
          )}
        </div>

        <div className="rounded-lg border border-(--border)">
          <button
            type="button"
            aria-expanded={tech}
            onClick={() => setTech(v => !v)}
            className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm text-(--ink-2) hover:bg-(--surface-2)"
          >
            {tech ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            ข้อมูลทางเทคนิค
            <span className="text-xs text-(--ink-3)">สำหรับผู้ดูแลระบบ</span>
          </button>
          {tech && (
            <div className="space-y-3 border-t border-(--border) px-3 py-3">
              <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1.5 text-sm">
                <Tech k="Action" v={row.action} />
                <Tech k="Entity" v={[row.entity, row.entity_id].filter(Boolean).join(" ")} />
                <Tech k="Actor ID" v={row.actor_id} />
                <Tech k="IP" v={row.ip} />
                <Tech k="User agent" v={row.user_agent} plain />
                <Tech k="Endpoint" v={row.method && row.path ? `${row.method} ${row.path}` : null} />
                <Tech k="Request ID" v={row.request_id} />
                <Tech k="Session ID" v={row.session_id} />
                <Tech k="Note" v={row.note} plain />
                <Tech k="เวลา (ISO)" v={row.at} />
              </dl>
              <Json label="ค่าก่อน (before)" value={row.before} />
              <Json label="ค่าหลัง (after)" value={row.after} />
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** An empty value is said, not shown as a blank cell that reads as a bug. */
function cell(v: string | null) {
  if (v === null) return <span className="text-(--ink-4)">ไม่ได้บันทึก</span>;
  if (v === "") return <span className="text-(--ink-4)">(ว่าง)</span>;
  return v;
}

function useCopied(): [boolean, (value: string) => void] {
  const [copied, setCopied] = useState(false);
  const copy = (value: string) => {
    navigator.clipboard?.writeText(value).then(
      () => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); },
      () => { /* clipboard refused: the value is on screen and selectable */ },
    );
  };
  return [copied, copy];
}

function CopyChip({ value, label }: { value: string; label: string }) {
  const [copied, copy] = useCopied();
  return (
    <Tip content={copied ? "คัดลอกแล้ว" : `คัดลอก${label}`}>
      <button
        type="button"
        onClick={() => copy(value)}
        className="inline-flex items-center gap-1.5 rounded-full border border-(--border) px-2.5 py-0.5 text-xs text-(--ink-2) hover:border-(--brand) hover:text-(--brand)"
      >
        <span className="text-(--ink-3)">{label}</span>
        <span className="font-mono">{value}</span>
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </button>
    </Tip>
  );
}

function Tech({ k, v, plain }: { k: string; v?: string | null; plain?: boolean }) {
  const [copied, copy] = useCopied();
  return (
    <div className="contents">
      <dt className="text-xs text-(--ink-3)">{k}</dt>
      <dd className="min-w-0">
        {v ? (
          <span className="flex items-start gap-1.5">
            <span className={`break-all text-xs ${plain ? "" : "font-mono"}`}>{v}</span>
            <Tip content={copied ? "คัดลอกแล้ว" : "คัดลอก"}>
              <button type="button" aria-label={`คัดลอก ${k}`}
                className="mt-0.5 shrink-0 text-(--ink-4) hover:text-(--brand)"
                onClick={() => copy(v)}>
                {copied ? <Check size={12} /> : <Copy size={12} />}
              </button>
            </Tip>
          </span>
        ) : (
          <span className="text-xs text-(--ink-4)">ไม่มี</span>
        )}
      </dd>
    </div>
  );
}

/** Shown even when empty, and says WHY it is empty — a pane that simply
 *  vanished made "nothing was recorded" look like "nothing changed". */
function Json({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <div className="mb-1 text-xs text-(--ink-3)">{label}</div>
      {value == null ? (
        <div className="rounded border border-dashed border-(--border) px-3 py-2 text-xs text-(--ink-3)">
          ไม่มีข้อมูล รายการประเภทนี้ไม่ได้บันทึกค่านี้
        </div>
      ) : (
        <pre className="max-h-64 overflow-auto rounded bg-(--surface-2) p-3 font-mono text-xs">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  );
}
