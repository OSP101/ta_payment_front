"use client";
// อาจารย์ผู้สอน — edit the course's lecturer roster after it has been opened.
// Until 15/09/2026 teaching_lecturers could only be written at course-open or
// import time (OpenCourseModal / ImportModal), with no way to correct it
// afterwards: an import that couldn't match an officer's name left the course
// with no lecturer at all, and that lecturer could never be attached later.
// This panel is the fix (TOR §3.2 ข.3) — it PUTs the whole roster via
// ReplaceLecturers, same all-or-nothing shape as the section-schedule editor.
import { useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import { Star, Pencil, X, Check } from "lucide-react";
import { api } from "../../../lib/api";
import { notify } from "../../../lib/notify";
import { Panel, Button, Chip, EmptyState, Tip } from "../../../components/ui";
import { Skel, SkelRegion } from "../../../components/Skeletons";
import {
  LecturerAutocomplete, lecturerName, type LecturerUser,
} from "../OpenCourseModal";

interface CurrentLecturer {
  id: string;
  first_name: string;
  last_name: string;
  is_primary: boolean;
}

export default function LecturerPanel({
  tcId, lecturers, loading,
}: {
  tcId: string;
  lecturers?: CurrentLecturer[];
  /** The course itself is still loading — draw the panel with placeholder chips. */
  loading?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  // ids in selection order; the FIRST id is always the primary lecturer —
  // same convention OpenCourseModal's Create uses, so "who is primary" reads
  // the same way whether a course was just opened or edited afterwards.
  const [ids, setIds] = useState<string[]>([]);

  const { data: lecturerData } = useSWR<{ items: LecturerUser[] }>(
    editing ? "/users?role=lecturer&limit=200" : null,
  );
  const allLecturers = useMemo(() => lecturerData?.items ?? [], [lecturerData]);
  const byId = useMemo(() => new Map(allLecturers.map(u => [u.id, u])), [allLecturers]);
  const current = lecturers ?? [];

  function startEdit() {
    // Seed from the current roster, primary first (matches how it's rendered).
    const sorted = [...current].sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0));
    setIds(sorted.map(l => l.id));
    setEditing(true);
  }

  function nameFor(id: string): string {
    const u = byId.get(id);
    if (u) return lecturerName(u);
    const c = current.find(l => l.id === id);
    return c ? `${c.first_name} ${c.last_name}`.trim() : id;
  }

  function makePrimary(id: string) {
    setIds(prev => [id, ...prev.filter(x => x !== id)]);
  }
  function remove(id: string) {
    setIds(prev => prev.filter(x => x !== id));
  }
  function add(id: string) {
    if (!id || ids.includes(id)) return;
    setIds(prev => [...prev, id]);
  }

  async function save() {
    if (ids.length === 0) {
      notify.error("ต้องเลือกอาจารย์ผู้สอนอย่างน้อย 1 คน");
      return;
    }
    setSaving(true);
    try {
      await api.put(`/teaching-courses/${tcId}/lecturers`, {
        lecturer_ids: ids,
        primary_id: ids[0],
      });
      await mutate(`/teaching-courses/${tcId}`);
      notify.success("บันทึกอาจารย์ผู้สอนแล้ว");
      setEditing(false);
    } catch (e) {
      notify.error(e);
    } finally {
      setSaving(false);
    }
  }

  const available = allLecturers.filter(u => !ids.includes(u.id));

  return (
    <Panel
      title="อาจารย์ผู้สอน"
      description={
        editing
          ? "อาจารย์คนแรก (ดาว) คืออาจารย์ผู้รับผิดชอบหลัก — เปลี่ยนได้ด้วยปุ่มดาวที่ชื่อ"
          : "แก้ไขได้เมื่อเปลี่ยนผู้สอน เพิ่มอาจารย์สอนร่วม หรือแก้ชื่อที่นำเข้าผิด"
      }
      actions={
        !editing && !loading && (
          <Button variant="secondary" size="sm" onClick={startEdit}>
            <Pencil size={14} />แก้ไขอาจารย์ผู้สอน
          </Button>
        )
      }
    >
      {loading ? (
        <SkelRegion className="flex flex-wrap gap-1.5">
          <Skel className="h-6 w-36 rounded-full" />
          <Skel className="h-6 w-32 rounded-full" />
        </SkelRegion>
      ) : !editing ? (
        current.length === 0 ? (
          <EmptyState
            title="ยังไม่มีอาจารย์ผู้สอน"
            description="วิชานี้อาจนำเข้าจากไฟล์ทะเบียนโดยจับคู่ชื่ออาจารย์ไม่ได้ — กด 'แก้ไขอาจารย์ผู้สอน' เพื่อเพิ่ม"
          />
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {current
              .slice()
              .sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0))
              .map(l => (
                <Chip key={l.id} tone={l.is_primary ? "brand" : "neutral"}>
                  {l.is_primary && (
                    <Tip content="อาจารย์ผู้รับผิดชอบหลัก">
                      <span className="me-1 inline-flex -mt-0.5 align-middle"><Star size={11} /></span>
                    </Tip>
                  )}
                  {`${l.first_name} ${l.last_name}`.trim()}
                </Chip>
              ))}
          </div>
        )
      ) : (
        <div>
          <LecturerAutocomplete items={available} onPick={add} />
          {ids.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {ids.map((id, i) => (
                <Chip key={id} tone={i === 0 ? "brand" : "neutral"}>
                  {i === 0 && (
                    <Tip content="อาจารย์ผู้รับผิดชอบหลัก">
                      <span className="me-1 inline-flex -mt-0.5 align-middle"><Star size={11} /></span>
                    </Tip>
                  )}
                  {nameFor(id)}
                  {i !== 0 && (
                    <Tip content="ตั้งเป็นอาจารย์ผู้รับผิดชอบหลัก"><button
                      type="button"
                      onClick={() => makePrimary(id)}
                      className="ms-1 inline-flex hover:text-[var(--brand)]"
                      aria-label={`ตั้ง ${nameFor(id)} เป็นอาจารย์ผู้รับผิดชอบหลัก`}
                    >
                      <Star size={11} />
                    </button></Tip>
                  )}
                  <Tip content={`เอา ${nameFor(id)} ออก`}><button
                    type="button"
                    onClick={() => remove(id)}
                    className="ms-1 inline-flex hover:text-danger"
                    aria-label={`เอา ${nameFor(id)} ออก`}
                  >
                    <X size={11} />
                  </button></Tip>
                </Chip>
              ))}
            </div>
          ) : (
            <div className="text-xs text-warning font-medium mt-2">
              ยังไม่ได้เลือกอาจารย์ ต้องเลือกอย่างน้อย 1 คน
            </div>
          )}
          <div className="flex gap-2 mt-3">
            <Button variant="primary" size="sm" onClick={save} isPending={saving} disabled={saving}>
              <Check size={14} />บันทึก
            </Button>
            <Button variant="tertiary" size="sm" onClick={() => setEditing(false)} disabled={saving}>
              ยกเลิก
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}
