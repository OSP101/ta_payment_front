"use client";
import useSWR, { mutate } from "swr";
import { useEffect, useState } from "react";
import { Tabs } from "@heroui/react";
import {
  Check, X, FileText, Download, Eye, Clock,
  CheckCircle2, XCircle, ChevronLeft,
} from "lucide-react";
import { api } from "../../lib/api";
import {
  PageHeader, Panel, Button, StatusChip, EmptyState, Modal,
  TextArea, FieldGroup, Spinner,
} from "../../components/ui";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type Bucket = "pending" | "approved" | "rejected";

interface Pending {
  user_id: string;
  full_name: string;
  email: string;
  status: string;
  submitted_at?: string;
  verified_at?: string;
}
interface Doc {
  id: string;
  kind: string;
  filename: string;
  status: string;
  reject_reason?: string | null;
  size_bytes?: number;
}
interface DetailResp {
  documents: Doc[] | null;
  profile?: {
    status: string;
    reject_reason?: string | null;
    national_id?: string;
    bank_name?: string;
    account_no?: string;
    account_name?: string;
  } | null;
}

const BUCKETS: { id: Bucket; label: string; icon: React.ReactNode }[] = [
  { id: "pending",  label: "รอตรวจ",     icon: <Clock size={14} /> },
  { id: "approved", label: "อนุมัติแล้ว", icon: <CheckCircle2 size={14} /> },
  { id: "rejected", label: "ปฏิเสธ",     icon: <XCircle size={14} /> },
];

const DOC_KIND_LABEL: Record<string, string> = {
  national_id:   "สำเนาบัตรประชาชน",
  bank_book:     "สำเนาสมุดบัญชีธนาคาร",
  creditor_form: "แบบฟอร์มเจ้าหนี้",
};

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function ReviewPage() {
  const [bucket, setBucket] = useState<Bucket>("pending");
  const key = `/ta-review?status=${bucket}`;
  const { data, isLoading } = useSWR<Pending[]>(key);
  const [selected, setSelected] = useState<Pending | null>(null);

  return (
    <div>
      <PageHeader
        title="ตรวจสอบเอกสาร TA"
        description="ตรวจสอบและอนุมัติเอกสารของผู้ช่วยสอนที่ส่งเข้ามา"
      />

      <Panel padded={false}>
        <Tabs
          selectedKey={bucket}
          onSelectionChange={k => setBucket(String(k) as Bucket)}
        >
          <Tabs.ListContainer>
            <Tabs.List aria-label="สถานะการตรวจสอบ" className="px-4 pt-2">
              {BUCKETS.map(b => (
                <Tabs.Tab key={b.id} id={b.id}>
                  <span className="inline-flex items-center gap-1.5">
                    {b.icon}{b.label}
                  </span>
                  <Tabs.Indicator />
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs.ListContainer>

          {BUCKETS.map(b => (
            <Tabs.Panel key={b.id} id={b.id}>
              <UserList
                data={bucket === b.id ? data : undefined}
                loading={bucket === b.id && isLoading}
                bucket={b.id}
                onSelect={setSelected}
              />
            </Tabs.Panel>
          ))}
        </Tabs>
      </Panel>

      <DetailModal
        user={selected}
        onClose={() => setSelected(null)}
        onChanged={() => mutate(key)}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* User list per tab                                                          */
/* -------------------------------------------------------------------------- */

function UserList({
  data, loading, bucket, onSelect,
}: {
  data?: Pending[];
  loading: boolean;
  bucket: Bucket;
  onSelect: (u: Pending) => void;
}) {
  if (loading) {
    return (
      <div className="py-12 flex items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!data || data.length === 0) {
    const emptyText = {
      pending:  "ไม่มีเอกสารที่รอตรวจ",
      approved: "ยังไม่มีรายการที่อนุมัติ",
      rejected: "ยังไม่มีรายการที่ถูกปฏิเสธ",
    }[bucket];
    return <EmptyState title={emptyText} />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <th>ชื่อ - นามสกุล</th>
            <th>อีเมล</th>
            <th>สถานะ</th>
            <th className="actions">การจัดการ</th>
          </tr>
        </thead>
        <tbody>
          {data.map(u => (
            <tr key={u.user_id}>
              <td className="font-medium">{u.full_name}</td>
              <td className="text-[var(--ink-3)]">{u.email}</td>
              <td><StatusChip status={u.status} /></td>
              <td className="actions">
                <Button variant="secondary" size="sm" onClick={() => onSelect(u)}>
                  <Eye size={14} /> ดู
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Detail modal                                                               */
/* -------------------------------------------------------------------------- */

type Mode =
  | { kind: "list" }
  | { kind: "reject-doc"; docId: string; filename: string }
  | { kind: "reject-profile" };

function DetailModal({
  user, onClose, onChanged,
}: {
  user: Pending | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const key = user ? `/ta-review/${user.user_id}/docs` : null;
  const { data, mutate: refetch, isLoading } = useSWR<DetailResp>(key);
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [reason, setReason] = useState("");

  useEffect(() => {
    setMode({ kind: "list" });
    setReason("");
  }, [user?.user_id]);

  function resetAndClose() {
    setMode({ kind: "list" });
    setReason("");
    onClose();
  }
  function backToList() {
    setMode({ kind: "list" });
    setReason("");
  }

  async function approveDoc(id: string) {
    await api.post(`/ta-review/docs/${id}`, { approve: true, reason: "" });
    await refetch();
    onChanged();
  }
  async function confirmRejectDoc() {
    if (mode.kind !== "reject-doc" || !reason.trim()) return;
    await api.post(`/ta-review/docs/${mode.docId}`, { approve: false, reason });
    backToList();
    await refetch();
    onChanged();
  }
  async function approveProfile() {
    if (!user) return;
    await api.post(`/ta-review/${user.user_id}/profile`, { approve: true, reason: "" });
    onChanged();
    resetAndClose();
  }
  async function confirmRejectProfile() {
    if (!user || !reason.trim()) return;
    await api.post(`/ta-review/${user.user_id}/profile`, { approve: false, reason });
    onChanged();
    resetAndClose();
  }

  const docs = data?.documents ?? [];
  const profile = data?.profile ?? null;
  const allApproved = docs.length > 0 && docs.every(d => d.status === "approved");
  const canFinalize = profile?.status === "submitted" || profile?.status === "needs_fix";

  // ---- Footer per mode -----------------------------------------------------
  let footer: React.ReactNode = null;
  if (mode.kind === "reject-doc") {
    footer = (
      <>
        <Button variant="ghost" onClick={backToList}>
          <ChevronLeft size={14} /> ย้อนกลับ
        </Button>
        <Button variant="danger" onClick={confirmRejectDoc} disabled={!reason.trim()}>
          <X size={14} /> ยืนยันปฏิเสธ
        </Button>
      </>
    );
  } else if (mode.kind === "reject-profile") {
    footer = (
      <>
        <Button variant="ghost" onClick={backToList}>
          <ChevronLeft size={14} /> ย้อนกลับ
        </Button>
        <Button variant="danger" onClick={confirmRejectProfile} disabled={!reason.trim()}>
          <X size={14} /> ตีกลับให้แก้ไข
        </Button>
      </>
    );
  } else {
    footer = (
      <>
        <Button variant="ghost" onClick={resetAndClose}>ปิด</Button>
        {canFinalize && (
          <>
            <Button variant="danger-soft" onClick={() => setMode({ kind: "reject-profile" })}>
              <X size={14} /> ตีกลับ
            </Button>
            <Button variant="primary" onClick={approveProfile} disabled={!allApproved}>
              <Check size={14} /> อนุมัติทั้งชุด
            </Button>
          </>
        )}
      </>
    );
  }

  const title = user
    ? (mode.kind === "reject-doc"
        ? "ปฏิเสธเอกสาร"
        : mode.kind === "reject-profile"
          ? "ตีกลับให้แก้ไข"
          : user.full_name)
    : "";

  return (
    <Modal
      open={!!user}
      onClose={resetAndClose}
      title={title}
      size="xl"
      footer={footer}
    >
      {mode.kind === "list" && (
        <>
          {user && (
            <div className="text-sm text-[var(--ink-3)] -mt-1 mb-4">{user.email}</div>
          )}

          {isLoading ? (
            <div className="py-10 flex items-center justify-center"><Spinner /></div>
          ) : (
            <div className="space-y-4">
              {profile && (
                <ProfileSummary profile={profile} />
              )}

              <div>
                <SectionHeader label="เอกสารที่แนบ" />
                {docs.length === 0 ? (
                  <div className="text-sm text-[var(--ink-3)] py-3">ยังไม่มีเอกสาร</div>
                ) : (
                  <ul className="border border-[var(--hairline)] rounded-xl overflow-hidden divide-y divide-[var(--hairline)]">
                    {docs.map(d => (
                      <DocRow
                        key={d.id}
                        doc={d}
                        readonly={!canFinalize}
                        onApprove={() => approveDoc(d.id)}
                        onReject={() => setMode({ kind: "reject-doc", docId: d.id, filename: d.filename })}
                      />
                    ))}
                  </ul>
                )}
              </div>

              {profile?.status === "rejected" && profile.reject_reason && (
                <div className="rounded-lg border border-danger/40 bg-danger-soft/60 px-4 py-3 text-sm">
                  <div className="font-medium text-danger-soft-foreground mb-1">เหตุผลที่ถูกปฏิเสธ</div>
                  <div className="text-[var(--ink-2)] whitespace-pre-wrap">{profile.reject_reason}</div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {mode.kind === "reject-doc" && (
        <div className="space-y-3">
          <div className="text-sm text-[var(--ink-2)]">
            เอกสาร: <span className="font-medium">{mode.filename}</span>
          </div>
          <FieldGroup label="เหตุผล (บังคับ)" hint="อธิบายให้ TA เข้าใจว่าต้องแก้ไขอะไร">
            <TextArea
              rows={5}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="เช่น ภาพเบลอ อ่านเลขบัญชีไม่ออก…"
            />
          </FieldGroup>
        </div>
      )}

      {mode.kind === "reject-profile" && (
        <div className="space-y-3">
          <div className="text-sm text-[var(--ink-2)]">
            ตีกลับเอกสารทั้งชุดของ <span className="font-medium">{user?.full_name}</span> ให้ TA แก้ไขและส่งใหม่
          </div>
          <FieldGroup label="เหตุผล (บังคับ)">
            <TextArea
              rows={5}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="สรุปสิ่งที่ต้องแก้ไขทั้งหมด…"
            />
          </FieldGroup>
        </div>
      )}
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Sub components                                                             */
/* -------------------------------------------------------------------------- */

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="text-xs font-medium uppercase tracking-wider text-[var(--ink-3)] mb-2">
      {label}
    </div>
  );
}

function ProfileSummary({
  profile,
}: {
  profile: NonNullable<DetailResp["profile"]>;
}) {
  const rows: [string, string | undefined][] = [
    ["เลขบัตรประชาชน", profile.national_id],
    ["ธนาคาร",         profile.bank_name],
    ["เลขที่บัญชี",     profile.account_no],
    ["ชื่อบัญชี",       profile.account_name],
  ];
  const filled = rows.filter(([, v]) => v && v.length > 0);
  if (filled.length === 0) return null;
  return (
    <div>
      <SectionHeader label="ข้อมูลบัญชี" />
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {filled.map(([k, v]) => (
          <div key={k} className="flex flex-col">
            <span className="text-xs text-[var(--ink-3)]">{k}</span>
            <span className="text-[var(--ink-1)] tabular-nums">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DocRow({
  doc, readonly, onApprove, onReject,
}: {
  doc: Doc;
  readonly: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const kindLabel = DOC_KIND_LABEL[doc.kind] ?? doc.kind;
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <FileText size={18} className="text-[var(--ink-3)] shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-[var(--ink-1)] truncate">{kindLabel}</div>
        <div className="text-xs text-[var(--ink-3)] truncate">{doc.filename}</div>
        {doc.status === "rejected" && doc.reject_reason && (
          <div className="mt-1 text-xs text-danger-soft-foreground">
            เหตุผล: {doc.reject_reason}
          </div>
        )}
      </div>
      <StatusChip status={doc.status} />
      <div className="flex items-center gap-1 shrink-0">
        <a href={`/api/v1/documents/${doc.id}/download`} target="_blank" rel="noreferrer">
          <Button variant="ghost" size="sm" aria-label="ดาวน์โหลด">
            <Download size={14} />
          </Button>
        </a>
        {!readonly && doc.status !== "approved" && (
          <Button variant="primary" size="sm" onClick={onApprove}>
            <Check size={14} /> ผ่าน
          </Button>
        )}
        {!readonly && doc.status !== "rejected" && (
          <Button variant="danger-soft" size="sm" onClick={onReject}>
            <X size={14} /> ไม่ผ่าน
          </Button>
        )}
      </div>
    </li>
  );
}
