"use client";
import useSWR, { mutate } from "swr";
import { useMemo, useState } from "react";
import { Tabs, InputGroup, Label, TextField, FieldError } from "@heroui/react";
import {
  Clock, CheckCircle2, Download, Clock3, Trash2, Eye, EyeOff, Shield,
} from "lucide-react";
import { api } from "../../lib/api";
import { notify } from "../../lib/notify";
import {
  PageHeader, Panel, Button, IconButton, StatusChip, Spinner, Alert, TabLabel, Modal, Chip, SearchField,
} from "../../components/ui";
import { DataTable, type DataColumn } from "../../components/DataTable";
import { ReviewRow } from "./ReviewRow";
import { PreviewDrawer } from "./PreviewDrawer";
import { DOC_KIND_LABEL, fmtDate, daysUntil, type Pending, type Doc } from "./types";

type Bucket = "pending" | "approved";

const BUCKETS: { id: Bucket; label: string; icon: React.ReactNode }[] = [
  { id: "pending",  label: "รอตรวจ",     icon: <Clock size={14} /> },
  { id: "approved", label: "อนุมัติแล้ว", icon: <CheckCircle2 size={14} /> },
];

export default function ReviewPage() {
  const [bucket, setBucket] = useState<Bucket>("pending");
  const pending  = useSWR<Pending[]>("/ta-review?status=pending");
  const approved = useSWR<Pending[]>("/ta-review?status=approved");
  const counts = {
    pending:  pending.data?.length ?? 0,
    approved: approved.data?.length ?? 0,
  };

  // Drawer preview state — a single doc from a single user at a time.
  const [preview, setPreview] = useState<
    { userId: string; doc: Doc } | null
  >(null);
  const [drawerBusy, setDrawerBusy] = useState(false);

  // Password-gated re-download state. Non-null when the confirm modal is
  // open; carries just the target user id so the modal is self-contained.
  const [redownloadFor, setRedownloadFor] = useState<Pending | null>(null);

  function revalidateAll() {
    mutate("/ta-review?status=pending");
    mutate("/ta-review?status=approved");
  }

  // Approve / reject straight from the preview drawer footer — same endpoints
  // the file card uses; the row's SWR key is revalidated so both views agree.
  async function approveFromDrawer() {
    if (!preview || drawerBusy) return;
    setDrawerBusy(true);
    try {
      await api.post(`/ta-review/docs/${preview.doc.id}`, { approve: true, reason: "" });
      notify.success("อนุมัติเอกสารแล้ว");
      mutate(`/ta-review/${preview.userId}/docs`);
      revalidateAll();
      setPreview(null);
    } catch (e) {
      notify.error(e);
    } finally {
      setDrawerBusy(false);
    }
  }

  async function rejectFromDrawer(reason: string) {
    if (!preview || drawerBusy) return;
    setDrawerBusy(true);
    try {
      await api.post(`/ta-review/${preview.userId}/reject-batch`, {
        items: [{ doc_id: preview.doc.id, reason }],
      });
      notify.success("ตีกลับเอกสารเรียบร้อยแล้ว");
      mutate(`/ta-review/${preview.userId}/docs`);
      revalidateAll();
      setPreview(null);
    } catch (e) {
      notify.error(e);
    } finally {
      setDrawerBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="ตรวจสอบเอกสาร TA"
        description="กดที่ชื่อ TA เพื่อดูรายละเอียด — ตรวจและอนุมัติ/ตีกลับเอกสารทีละไฟล์ เมื่อผ่านครบทุกไฟล์จึงยืนยันอนุมัติผู้ใช้"
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
                  <TabLabel icon={b.icon} count={counts[b.id]} active={bucket === b.id}>
                    {b.label}
                  </TabLabel>
                  <Tabs.Indicator />
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs.ListContainer>

          <Tabs.Panel id="pending">
            <PendingList
              data={pending.data}
              loading={pending.isLoading}
              error={pending.error}
              onRetry={() => pending.mutate()}
              onPreview={(userId, doc) => setPreview({ userId, doc })}
              onChanged={revalidateAll}
            />
          </Tabs.Panel>
          <Tabs.Panel id="approved">
            <DecidedTable
              data={approved.data}
              loading={approved.isLoading}
              error={approved.error}
              onRetry={() => approved.mutate()}
              bucket="approved"
              onRedownload={u => setRedownloadFor(u)}
            />
          </Tabs.Panel>
        </Tabs>
      </Panel>

      <PreviewDrawer
        userId={preview?.userId ?? null}
        doc={
          preview
            ? {
                id: preview.doc.id,
                filename: preview.doc.filename,
                kind: preview.doc.kind,
                kindLabel: DOC_KIND_LABEL[preview.doc.kind] ?? preview.doc.kind,
                status: preview.doc.status,
              }
            : null
        }
        busy={drawerBusy}
        onApprove={approveFromDrawer}
        onReject={rejectFromDrawer}
        onClose={() => { if (!drawerBusy) setPreview(null); }}
      />

      <RedownloadModal
        target={redownloadFor}
        onClose={() => setRedownloadFor(null)}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Pending bucket — one always-expanded card per user, no modal               */
/* -------------------------------------------------------------------------- */

function PendingList({
  data, loading, error, onRetry, onPreview, onChanged,
}: {
  data?: Pending[];
  loading: boolean;
  error?: unknown;
  onRetry?: () => void;
  onPreview: (userId: string, doc: Doc) => void;
  onChanged: () => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return data ?? [];
    return (data ?? []).filter(u =>
      `${u.full_name} ${u.email}`.toLowerCase().includes(needle),
    );
  }, [data, q]);

  if (loading) {
    return <div className="p-6 flex justify-center"><Spinner /></div>;
  }
  if (error) {
    return (
      <div className="p-4">
        <Alert
          status="danger"
          title="โหลดข้อมูลไม่สำเร็จ"
          action={onRetry ? (
            <Button variant="secondary" size="sm" onClick={onRetry}>ลองใหม่</Button>
          ) : undefined}
        />
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="mb-3">
        <SearchField
          value={q}
          onChange={setQ}
          ariaLabel="ค้นหาชื่อ / อีเมล"
          placeholder="ค้นหาชื่อ / อีเมล…"
        />
      </div>
      {filtered.length === 0 ? (
        <div className="text-sm text-muted py-6 text-center">
          {q ? "ไม่พบผลลัพธ์" : "ไม่มีเอกสารที่รอตรวจ"}
        </div>
      ) : (
        filtered.map(u => (
          <ReviewRow
            key={u.user_id}
            user={u}
            onPreview={d => onPreview(u.user_id, d)}
            onChanged={onChanged}
          />
        ))
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Approved / Rejected buckets — compact table, no per-row expansion needed   */
/* -------------------------------------------------------------------------- */

function DecidedTable({
  data, loading, error, onRetry, bucket, onRedownload,
}: {
  data?: Pending[];
  loading: boolean;
  error?: unknown;
  onRetry?: () => void;
  bucket: Bucket;
  /** Only set for the approved bucket — the parent handles password gating. */
  onRedownload?: (u: Pending) => void;
}) {
  const emptyText = {
    pending:  "ไม่มีเอกสารที่รอตรวจ",
    approved: "ยังไม่มีรายการที่อนุมัติ",
  }[bucket];

  const columns: DataColumn<Pending>[] = [
    {
      id: "name", label: "ชื่อ - นามสกุล", sortable: true, isRowHeader: true,
      sortValue: u => u.full_name,
      className: "font-medium",
      render: u => u.full_name,
    },
    {
      id: "email", label: "อีเมล", sortable: true,
      sortValue: u => u.email,
      className: "text-muted",
      render: u => u.email,
    },
    {
      id: "status", label: "สถานะ",
      render: u => <StatusChip status={u.status} />,
    },
    {
      id: "verified_at", label: "วันที่ตรวจ",
      className: "text-muted",
      render: u => fmtDate(u.verified_at),
    },
    ...(bucket === "approved"
      ? [{
          id: "expires_at", label: "อายุไฟล์",
          render: (u: Pending) => <RetentionChip user={u} />,
        } satisfies DataColumn<Pending>]
      : []),
    ...(onRedownload
      ? [{
          id: "actions", label: <span className="sr-only">การจัดการ</span>,
          className: "text-right" as const,
          render: (u: Pending) => (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onRedownload(u)}
              disabled={u.all_files_deleted}
            >
              <Download size={14} /> ZIP
            </Button>
          ),
        } satisfies DataColumn<Pending>]
      : []),
  ];

  return (
    <div className="p-4">
      <DataTable
        ariaLabel="รายชื่อ TA"
        rows={data}
        loading={loading}
        error={error}
        onRetry={onRetry}
        rowKey={u => u.user_id}
        searchFn={u => `${u.full_name} ${u.email}`}
        searchPlaceholder="ค้นหาชื่อ / อีเมล…"
        initialSort={{ column: "verified_at", direction: "descending" }}
        pageSize={20}
        emptyTitle={emptyText}
        columns={columns}
      />
    </div>
  );
}

/** Small chip showing how many days remain before the retention job scrubs
 * this TA's approved doc files. Uses `earliest_expires_at` (min across the
 * three docs) so the officer sees the tightest deadline. */
function RetentionChip({ user }: { user: Pending }) {
  if (user.all_files_deleted) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted">
        <Trash2 size={12} /> ถูกลบแล้ว
      </span>
    );
  }
  if (!user.earliest_expires_at) {
    return <span className="text-xs text-muted">-</span>;
  }
  const days = daysUntil(user.earliest_expires_at);
  if (days <= 0) {
    return (
      <Chip tone="warn">
        <Clock3 size={12} /> หมดอายุแล้ว
      </Chip>
    );
  }
  // 3 days or less: highlight as warning so the officer notices before
  // the sweep runs.
  if (days <= 3) {
    return (
      <Chip tone="warn">
        <Clock3 size={12} /> เหลือ {days} วัน
      </Chip>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted">
      <Clock3 size={12} /> เหลือ {days} วัน
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Re-download confirm — password-gated because the ZIP contains PII          */
/* -------------------------------------------------------------------------- */

function RedownloadModal({
  target,
  onClose,
}: {
  target: Pending | null;
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Clear the form whenever the modal opens against a new user so a stale
  // password can't be reused across rows.
  useMemo(() => {
    if (target) {
      setPassword("");
      setShowPw(false);
      setErr(null);
    }
  }, [target]);

  async function submit() {
    if (!target || busy) return;
    if (!password) {
      setErr("กรุณากรอกรหัสผ่าน");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await api.post<{ zip_token: string }>(
        `/ta-review/${target.user_id}/zip-token`,
        { password },
      );
      window.location.assign(
        `/api/v1/ta-review/${target.user_id}/download.zip?token=${encodeURIComponent(res.zip_token)}`,
      );
      notify.success("กำลังดาวน์โหลด…");
      onClose();
    } catch (e) {
      // Show the server's message inline so the officer can retry without
      // losing modal state; a toast would be easy to miss with focus on
      // the password field.
      const msg = e instanceof Error ? e.message : "ยืนยันไม่สำเร็จ";
      setErr(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title="ยืนยันตัวตนก่อนดาวน์โหลด"
      icon={<Shield size={18} />}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>ยกเลิก</Button>
          <Button variant="primary" onClick={submit} disabled={busy || !password} isPending={busy}>
            <Download size={14} /> ยืนยันและดาวน์โหลด
          </Button>
        </>
      }
    >
      {target && (
        <div className="space-y-4">
          <div className="text-sm text-muted">
            ไฟล์ ZIP ของ <span className="font-medium text-foreground">{target.full_name}</span> มีข้อมูลส่วนบุคคล (เลขบัตร ปชช. / เลขบัญชี)
            กรุณากรอกรหัสผ่านของคุณเพื่อยืนยันตัวตน
          </div>
          <TextField
            name="officer-password"
            isRequired
            value={password}
            onChange={v => { setPassword(v); if (err) setErr(null); }}
            isInvalid={!!err}
          >
            <Label>รหัสผ่าน</Label>
            <InputGroup>
              <InputGroup.Input
                type={showPw ? "text" : "password"}
                autoComplete="current-password"
                autoFocus
                onKeyDown={e => { if (e.key === "Enter") submit(); }}
              />
              <InputGroup.Suffix className="pr-0">
                <IconButton
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPw(v => !v)}
                  label={showPw ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                >
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </IconButton>
              </InputGroup.Suffix>
            </InputGroup>
            {err && <FieldError>{err}</FieldError>}
          </TextField>
        </div>
      )}
    </Modal>
  );
}
