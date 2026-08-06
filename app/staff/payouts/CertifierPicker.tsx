"use client";
import { useState } from "react";
import useSWR, { mutate } from "swr";
import { AlertTriangle, BadgeCheck } from "lucide-react";
import { api, errMessage } from "../../lib/api";
import { notify } from "../../lib/notify";
import { Select } from "../../components/ui";

/**
 * Who signs the ผู้รับรอง block on this term's claim forms.
 *
 * The claim template carries three signatures — ผู้ปฏิบัติงาน, อาจารย์ผู้สอน,
 * and ผู้รับรอง — and the exporter used to put the LECTURER's name above the
 * third one, under a position line the template hardcodes as
 * "ตำแหน่ง หัวหน้าสาขาวิชาวิทยาการคอมพิวเตอร์". Every form therefore claimed the
 * course's own lecturer had certified it as head of department.
 *
 * It sits here, above the course list, because the certifier is one person for
 * the whole term rather than a per-course choice — putting it on each course's
 * export panel would ask the same question once per row and let the answers
 * disagree.
 *
 * Left alone it follows whoever holds the seat, so a new head of department is
 * picked up without anyone visiting this control.
 */

interface Officer {
  id: string;
  academic_prefix?: string;
  full_name: string;
  title: string;
  is_active: boolean;
  is_head: boolean;
}

interface Certifier {
  officer_id?: string;
  name: string;
  title_line: string;
  acting_for?: string;
  resolved: boolean;
}

export function CertifierPicker({ termId }: { termId: string }) {
  const key = `/exports/terms/${termId}/certifier`;
  const { data: current } = useSWR<Certifier>(key);
  const { data: officers } = useSWR<Officer[]>("/settings/admin-officers");
  const [saving, setSaving] = useState(false);

  const active = (officers ?? []).filter(o => o.is_active);
  const headSeat = active.find(o => o.is_head);

  async function choose(officerId: string) {
    setSaving(true);
    try {
      const next: Certifier = await api.put(key, { officer_id: officerId });
      await mutate(key, next, { revalidate: false });
      notify.success("บันทึกผู้รับรองแล้ว");
    } catch (e) {
      notify.error(errMessage(e));
    } finally {
      setSaving(false);
    }
  }

  if (!officers) return null;

  return (
    <div data-tour="payouts-certifier" className="w-full sm:w-[22rem]">
      <label className="mb-1 flex items-center gap-1 text-xs text-ink-2">
        <BadgeCheck size={12} /> ผู้รับรองในเอกสารเบิกจ่าย
      </label>
      <Select
        value={current?.officer_id ?? ""}
        onChange={e => void choose(e.target.value)}
        disabled={saving || active.length === 0}
        className="w-full"
      >
        {/* The empty option is not "none" — it is "follow the seat", which is
            the sane default and must stay reachable after a manual choice. */}
        <option value="">
          {headSeat
            ? `ตามตำแหน่ง ${headSeat.academic_prefix ?? ""}${headSeat.full_name}`
            : "ตามตำแหน่งหัวหน้าสาขา (ยังไม่มีในระบบ)"}
        </option>
        {active.map(o => (
          <option key={o.id} value={o.id}>
            {(o.academic_prefix ?? "")}{o.full_name} · {o.title}
          </option>
        ))}
      </Select>

      {current?.resolved && current.acting_for && (
        <div className="mt-1 rounded-md border border-amber-200 bg-amber-50/60 px-2 py-1.5 text-[11px] leading-tight text-amber-900">
          <div className="flex items-center gap-1 font-medium">
            <AlertTriangle size={11} /> ไม่ใช่หัวหน้าสาขา จะพิมพ์เป็น “รักษาการแทน”
          </div>
          {/* Shown as the form will print it, so the claim about authority can
              be checked before it is signed. */}
          <div className="mt-0.5 text-center">
            <div>({current.name})</div>
            <div>ตำแหน่ง {current.title_line} {current.acting_for}</div>
          </div>
        </div>
      )}

      {current && !current.resolved && (
        <p className="mt-1 text-[11px] text-amber-700">
          ยังไม่มีหัวหน้าสาขาในระบบ ช่องผู้รับรองในเอกสารจะเว้นว่างไว้ให้เซ็นเอง
        </p>
      )}
    </div>
  );
}
