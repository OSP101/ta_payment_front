"use client";
import useSWR, { mutate } from "swr";
import { useState } from "react";
import { Megaphone, Send } from "lucide-react";
import { api } from "../../lib/api";
import { PageHeader, Panel, Button, TextInput, TextArea, FieldGroup, Chip, EmptyState } from "../../components/ui";

interface Ann { id: string; title: string; body: string; audience: string[]; published_at?: string; }

const ROLES = [
  { value: "ta", label: "TA" },
  { value: "lecturer", label: "อาจารย์" },
  { value: "staff", label: "เจ้าหน้าที่" },
  { value: "admin", label: "Admin" },
];

export default function AnnouncePage() {
  const { data } = useSWR<Ann[]>("/announcements");
  const [form, setForm] = useState({ title: "", body: "", audience: ["ta", "lecturer", "staff"] });
  const [pending, setPending] = useState(false);

  async function submit() {
    if (!form.title.trim()) return;
    setPending(true);
    try {
      await api.post("/announcements", { ...form, published_at: new Date().toISOString() });
      setForm({ title: "", body: "", audience: ["ta", "lecturer", "staff"] });
      mutate("/announcements");
    } finally { setPending(false); }
  }

  return (
    <div>
      <PageHeader title="ประชาสัมพันธ์" description="เผยแพร่ประกาศไปยังกลุ่มผู้ใช้" />

      <div className="grid gap-4 lg:grid-cols-5">
        <Panel title="สร้างประกาศใหม่" className="lg:col-span-2">
          <div className="space-y-3">
            <FieldGroup label="หัวข้อ">
              <TextInput placeholder="หัวข้อประกาศ" value={form.title}
                         onChange={e => setForm({ ...form, title: e.target.value })} />
            </FieldGroup>
            <FieldGroup label="เนื้อหา">
              <TextArea rows={5} placeholder="เนื้อหาประกาศ" value={form.body}
                        onChange={e => setForm({ ...form, body: e.target.value })} />
            </FieldGroup>
            <FieldGroup label="กลุ่มผู้รับ">
              <div className="flex gap-2 flex-wrap">
                {ROLES.map(r => {
                  const on = form.audience.includes(r.value);
                  return (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setForm(f => ({
                        ...f,
                        audience: on ? f.audience.filter(x => x !== r.value) : [...f.audience, r.value],
                      }))}
                      className={`chip cursor-pointer transition ${on ? "chip-brand" : "chip-neutral"}`}
                    >
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </FieldGroup>
            <Button variant="primary" onClick={submit} disabled={pending || !form.title.trim()}>
              <Send size={14} /> เผยแพร่
            </Button>
          </div>
        </Panel>

        <Panel title="ประกาศที่เผยแพร่แล้ว" description={`${data?.length ?? 0} รายการ`} className="lg:col-span-3" padded={false}>
          {(!data || data.length === 0) ? (
            <EmptyState title="ยังไม่มีประกาศ" />
          ) : (
            <ul className="divide-y divide-[var(--hairline)]">
              {data.map(a => (
                <li key={a.id} className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[var(--brand-soft)] text-[var(--brand)] flex items-center justify-center shrink-0">
                      <Megaphone size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm">{a.title}</div>
                      <div className="text-xs text-[var(--ink-3)] mt-0.5">
                        {a.published_at ? new Date(a.published_at).toLocaleString("th-TH") : "-"}
                      </div>
                      <div className="text-sm text-[var(--ink-2)] mt-2 whitespace-pre-wrap">{a.body}</div>
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {a.audience.map(x => <Chip key={x} tone="neutral">{x}</Chip>)}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
