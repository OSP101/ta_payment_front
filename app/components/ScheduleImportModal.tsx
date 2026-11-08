"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, FileUp, Plus, Trash2 } from "lucide-react";
import { api, type Term } from "../lib/api";
import { icsToBlocks, applyClassKinds, type ClassKindRow } from "../lib/ics";
import {
  canConfirmScheduleImport,
  scheduleImportErrors,
  type ScheduleImportResult,
} from "../lib/scheduleImport";
import type { Block, BlockKind } from "./ScheduleGrid";
import { useI18n, msg } from "../lib/i18n/client";
import {
  Alert,
  Button,
  Chip,
  FieldGroup,
  IconButton,
  Modal,
  Select,
  TextInput,
  TimePicker,
} from "./ui";
const DAYS = [
  msg("อาทิตย์"),
  msg("จันทร์"),
  msg("อังคาร"),
  msg("พุธ"),
  msg("พฤหัสบดี"),
  msg("ศุกร์"),
  msg("เสาร์"),
];
const MAX_BYTES = 10 * 1024 * 1024;

export default function ScheduleImportModal({
  open,
  termId,
  term,
  onClose,
  onImport,
}: {
  open: boolean;
  termId: string;
  term?: Term;
  onClose: () => void;
  onImport: (result: ScheduleImportResult) => void;
}) {
  const { t } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [result, setResult] = useState<ScheduleImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [termConfirmed, setTermConfirmed] = useState(false);
  const request = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    request.current++;
    setFile(null);
    setResult(null);
    setError(null);
    setBusy(false);
    setConfirmed(false);
    setTermConfirmed(false);
    if (fileRef.current) fileRef.current.value = "";
    return () => {
      request.current++;
    };
  }, [open, termId]);
  useEffect(() => {
    if (!file || !/\.pdf$/i.test(file.name)) {
      setPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const errors = useMemo(
    () => scheduleImportErrors(result?.blocks ?? []),
    [result],
  );
  const yearBE =
    term &&
    (term.academic_year < 2400 ? term.academic_year + 543 : term.academic_year);
  const mismatch = !!(
    result?.academicYear &&
    term &&
    (result.academicYear !== yearBE || result.semester !== term.semester)
  );
  const canImport = canConfirmScheduleImport(
    result,
    confirmed && (!mismatch || termConfirmed),
    busy,
    termId,
  );
  async function handleFile(picked: File) {
    const current = ++request.current;
    setFile(picked);
    setResult(null);
    setError(null);
    setBusy(true);
    setConfirmed(false);
    setTermConfirmed(false);
    try {
      if (picked.size > MAX_BYTES)
        throw new Error(t("ไฟล์ต้องมีขนาดไม่เกิน 10 MB"));
      if (!/\.(pdf|ics)$/i.test(picked.name))
        throw new Error(t("กรุณาเลือกไฟล์ .pdf หรือ .ics"));
      let parsed: ScheduleImportResult;
      if (/\.pdf$/i.test(picked.name)) {
        const bytes = new Uint8Array(await picked.arrayBuffer());
        if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
          throw new Error(
            t("ไฟล์นี้ไม่ใช่ PDF ที่ถูกต้อง กรุณาส่งออกจาก REG อีกครั้ง"),
          );
        const { pdfToBlocks } = await import("../lib/regPdf");
        parsed = await pdfToBlocks(bytes, termId);
      } else
        parsed = { ...icsToBlocks(await picked.text(), termId), source: "ics" };
      if (request.current !== current) return;
      try {
        const table = await api.get<ClassKindRow[]>(
          `/class-kinds?term_id=${encodeURIComponent(termId)}`,
        );
        // Use known timetable matches only; never guess lecture/lab from chronological order.
        parsed = { ...parsed, ...applyClassKinds(parsed, table ?? []) };
      } catch {
        /* A missing timetable leaves editable, unspecified kinds. */
      }
      if (request.current !== current) return;
      if (!parsed.blocks.length)
        throw new Error(
          t("ไม่พบคาบเรียนที่นำเข้าได้ กรุณาตรวจไฟล์หรือกรอกตารางด้วยตนเอง"),
        );
      setResult(parsed);
      if (parsed.malformedSkipped)
        setError(
          t(
            "อ่านข้อมูลบางคาบไม่สำเร็จ กรุณาเลือกไฟล์ใหม่หรือกรอกตารางด้วยตนเอง ยังไม่สามารถนำเข้าบางส่วนได้",
          ),
        );
    } catch (e) {
      if (request.current === current)
        setError(
          e instanceof Error
            ? t(e.message)
            : t("อ่านไฟล์ไม่สำเร็จ กรุณาเลือกไฟล์ใหม่"),
        );
    } finally {
      if (request.current === current) setBusy(false);
    }
  }
  function update(id: string, patch: Partial<Block>) {
    setConfirmed(false);
    setResult(
      (r) =>
        r && {
          ...r,
          blocks: r.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
        },
    );
  }
  function remove(id: string) {
    setConfirmed(false);
    setResult(
      (r) => r && { ...r, blocks: r.blocks.filter((b) => b.id !== id) },
    );
  }
  function add() {
    setConfirmed(false);
    setResult(
      (r) =>
        r && {
          ...r,
          blocks: [
            ...r.blocks,
            {
              id: `manual-${crypto.randomUUID()}`,
              term_id: termId,
              course_code: "",
              course_name: "",
              kind: "",
              sec_no: "",
              day_of_week: 1,
              start_time: "08:00",
              end_time: "09:00",
              note: "",
              is_wba: false,
            },
          ],
        },
    );
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("นำเข้าตารางเรียนจาก REG")}
      icon={<FileUp size={18} />}
      size="2xl"
      placement="top"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            {result
              ? t(
                  "จะแทนที่คาบเรียนทั้งหมดในภาคการศึกษานี้ด้วย {n} คาบที่นำเข้า",
                  { n: result.blocks.length },
                )
              : t("ตรวจและแก้ไขข้อมูลก่อนยืนยันนำเข้า")}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              {t("ยกเลิก")}
            </Button>
            <Button
              variant="primary"
              disabled={!canImport}
              onClick={() => {
                if (canImport && result) onImport(result);
              }}
            >
              {t("ยืนยันและนำเข้า")}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          {t(
            "เลือก PDF หรือ ICS ที่ส่งออกจาก REG ตรวจเทียบกับต้นฉบับ แล้วแก้ข้อมูลด้านล่างได้ทันที ข้อมูลจะยังไม่ถูกบันทึกจนกว่าจะยืนยันนำเข้า",
          )}
        </p>
        <FieldGroup label={t("ไฟล์ตารางเรียน (.pdf หรือ .ics)")}>
          <input
            ref={fileRef}
            aria-label={t("ไฟล์ตารางเรียน (.pdf หรือ .ics)")}
            type="file"
            accept=".pdf,.ics,application/pdf,text/calendar"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
            className="w-full text-sm file:mr-3 file:rounded-md file:border file:border-[var(--hairline)] file:bg-transparent file:px-3 file:py-2 file:text-inherit"
          />
        </FieldGroup>
        <div role="status" aria-live="polite">
          {busy && (
            <p className="text-sm text-muted">{t("กำลังอ่านตารางเรียน…")}</p>
          )}
        </div>
        {error && (
          <Alert
            status="danger"
            icon={<AlertTriangle size={16} />}
            title={error}
          />
        )}
        {result && (
          <>
            <p className="text-sm font-medium">
              {t("พบ {n} คาบ โปรดตรวจวัน เวลา วิชา กลุ่ม และห้อง", {
                n: result.blocks.length,
              })}
              {result.academicYear
                ? ` · ${result.semester}/${result.academicYear}`
                : ""}
            </p>
            {result.source === "pdf" && (
              <Alert
                status="warning"
                icon={<AlertTriangle size={16} />}
                title={t(
                  "เวลาใน PDF คำนวณจากตำแหน่งกรอบและประมาณเป็นช่วงละ 5 นาที โปรดตรวจเวลาเรียนทุกคาบกับต้นฉบับ ชื่อวิชาอาจถูกตัด และไฟล์ไม่ได้ระบุบรรยายหรือปฏิบัติการ",
                )}
              />
            )}
            {result.source === "ics" && (
              <p className="text-sm text-muted">
                {t(
                  "ข้ามการสอบ {exams} รายการ เวลานอกช่วง {range} รายการ และรวมเหตุการณ์ซ้ำ {duplicates} รายการ",
                  {
                    exams: result.examSkipped,
                    range: result.outOfRangeSkipped,
                    duplicates: result.duplicatesCollapsed,
                  },
                )}
              </p>
            )}
            {previewUrl && (
              <details className="rounded-md border border-[var(--hairline)] p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  {t("เปิด PDF ต้นฉบับเพื่อเทียบข้อมูล")}
                </summary>
                <a
                  className="mt-2 inline-block text-sm underline"
                  href={previewUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("เปิดต้นฉบับในแท็บใหม่")}
                </a>
                <iframe
                  title={t("PDF ตารางเรียนต้นฉบับ")}
                  src={previewUrl}
                  className="mt-3 h-96 w-full rounded-md border border-[var(--hairline)]"
                />
              </details>
            )}
            {mismatch && (
              <div className="flex flex-col gap-2">
                <Alert
                  status="warning"
                  title={t(
                    "ภาคเรียนใน PDF ({source}) ไม่ตรงกับภาคเรียนที่เลือก ({target})",
                    {
                      source: `${result.semester}/${result.academicYear}`,
                      target: `${term?.semester}/${yearBE}`,
                    },
                  )}
                />
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={termConfirmed}
                    onChange={(e) => {
                      setTermConfirmed(e.target.checked);
                      setConfirmed(false);
                    }}
                    className="mt-1 size-4 shrink-0"
                  />
                  {t(
                    "ยืนยันใช้ข้อมูลจากไฟล์นี้กับภาคเรียนที่เลือก แม้ภาคเรียนต่างกัน",
                  )}
                </label>
              </div>
            )}
            <div className="flex flex-col gap-4">
              {result.blocks.map((b, i) => (
                <section
                  key={b.id}
                  aria-label={t("คาบที่ {n}", { n: i + 1 })}
                  className="rounded-md border border-[var(--hairline)] p-3 sm:p-4"
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">
                        {t("คาบที่ {n}", { n: i + 1 })}
                      </span>
                      {result.reviewIds?.includes(b.id) && (
                        <Chip tone="warn">
                          {t("ตรวจเวลาที่ไม่ตรงครึ่งชั่วโมง")}
                        </Chip>
                      )}
                    </div>
                    <IconButton
                      label={t("ลบคาบที่ {n}", { n: i + 1 })}
                      onClick={() => remove(b.id)}
                    >
                      <Trash2 size={16} />
                    </IconButton>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <FieldGroup label={t("วัน")}>
                      <Select
                        aria-label={t("วัน คาบที่ {n}", { n: i + 1 })}
                        value={b.day_of_week}
                        onChange={(e) =>
                          update(b.id, { day_of_week: +e.target.value })
                        }
                      >
                        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                          <option key={d} value={d}>
                            {t(DAYS[d])}
                          </option>
                        ))}
                      </Select>
                    </FieldGroup>
                    <FieldGroup label={t("เวลาเริ่ม")}>
                      <TimePicker
                        label={t("เวลาเริ่ม คาบที่ {n}", { n: i + 1 })}
                        value={b.start_time}
                        onChange={(v) => update(b.id, { start_time: v })}
                        minValue="08:00"
                        maxValue="20:00"
                      />
                    </FieldGroup>
                    <FieldGroup label={t("เวลาสิ้นสุด")}>
                      <TimePicker
                        label={t("เวลาสิ้นสุด คาบที่ {n}", { n: i + 1 })}
                        value={b.end_time}
                        onChange={(v) => update(b.id, { end_time: v })}
                        minValue="08:00"
                        maxValue="20:00"
                      />
                    </FieldGroup>
                    <FieldGroup label={t("รหัสวิชา")}>
                      <TextInput
                        aria-label={t("รหัสวิชา คาบที่ {n}", { n: i + 1 })}
                        value={b.course_code}
                        maxLength={16}
                        onChange={(e) =>
                          update(b.id, {
                            course_code: e.target.value.toUpperCase(),
                          })
                        }
                      />
                    </FieldGroup>
                    <FieldGroup label={t("กลุ่ม")}>
                      <TextInput
                        aria-label={t("กลุ่ม คาบที่ {n}", { n: i + 1 })}
                        value={b.sec_no}
                        inputMode="numeric"
                        maxLength={8}
                        onChange={(e) =>
                          update(b.id, { sec_no: e.target.value })
                        }
                      />
                    </FieldGroup>
                    <FieldGroup label={t("ประเภท")}>
                      <Select
                        aria-label={t("ประเภท คาบที่ {n}", { n: i + 1 })}
                        value={b.kind}
                        onChange={(e) =>
                          update(b.id, { kind: e.target.value as BlockKind })
                        }
                      >
                        <option value="">{t("ไม่ระบุ")}</option>
                        <option value="lecture">{t("บรรยาย")}</option>
                        <option value="lab">{t("ปฏิบัติการ")}</option>
                      </Select>
                    </FieldGroup>
                    <div className="sm:col-span-2">
                      <FieldGroup label={t("ชื่อวิชา")}>
                        <TextInput
                          aria-label={t("ชื่อวิชา คาบที่ {n}", { n: i + 1 })}
                          value={b.course_name}
                          maxLength={120}
                          onChange={(e) =>
                            update(b.id, { course_name: e.target.value })
                          }
                        />
                      </FieldGroup>
                    </div>
                    <FieldGroup label={t("ห้อง / หมายเหตุ")}>
                      <TextInput
                        aria-label={t("ห้อง คาบที่ {n}", { n: i + 1 })}
                        value={b.note}
                        maxLength={200}
                        onChange={(e) => update(b.id, { note: e.target.value })}
                      />
                    </FieldGroup>
                  </div>
                  {result.rawById?.[b.id] && (
                    <details className="mt-3 text-sm text-muted">
                      <summary className="cursor-pointer">
                        {t("ข้อความที่อ่านจากต้นฉบับ")}
                      </summary>
                      <p className="mt-2 whitespace-pre-wrap break-words">
                        {result.rawById[b.id]}
                      </p>
                    </details>
                  )}
                  {errors.has(b.id) && (
                    <p role="alert" className="mt-3 text-sm text-danger">
                      {t(errors.get(b.id)!)}
                    </p>
                  )}
                </section>
              ))}
            </div>
            <Button variant="ghost" onClick={add}>
              <Plus size={16} />
              {t("เพิ่มคาบที่ขาด")}
            </Button>
            {errors.size > 0 && (
              <p role="alert" className="text-sm text-danger">
                {t("กรุณาแก้ข้อมูลที่แจ้งเตือนก่อนยืนยันนำเข้า")}
              </p>
            )}
            <label className="flex items-start gap-3 rounded-md border border-[var(--hairline)] p-3 text-sm">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={
                  busy ||
                  errors.size > 0 ||
                  !!result.malformedSkipped ||
                  (mismatch && !termConfirmed)
                }
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-1 size-4 shrink-0"
              />
              {t(
                "ฉันตรวจเทียบกับไฟล์ต้นฉบับและแก้ไขครบแล้ว ข้อมูลทุกคาบถูกต้อง และยืนยันให้แทนที่ตารางเดิมของภาคเรียนที่เลือก",
              )}
            </label>
          </>
        )}
      </div>
    </Modal>
  );
}
