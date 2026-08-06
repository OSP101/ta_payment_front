"use client";
import useSWR, { mutate } from "swr";
import { useMemo, useState } from "react";
import { Tabs, InputGroup, Label, TextField, FieldError } from "@heroui/react";
import {
  Clock, CheckCircle2, Download, Clock3, Trash2, Eye, EyeOff, Shield, ChevronRight, Lock,
  AlertTriangle,
} from "lucide-react";
import { api } from "../../lib/api";
import { notify } from "../../lib/notify";
import {
  PageHeader, Panel, Button, IconButton, StatusChip, Spinner, Alert, TabLabel, Modal, Chip, SearchField,
} from "../../components/ui";
import { DataTable, type DataColumn } from "../../components/DataTable";
import { ReviewWorkspace } from "./ReviewWorkspace";
import { fmtDate, daysUntil, type Pending } from "./types";

type Bucket = "pending" | "approved";

const BUCKETS: { id: Bucket; label: string; icon: React.ReactNode }[] = [
  { id: "pending",  label: "รอตรวจ",     icon: <Clock size={14} /> },
  { id: "approved", label: "อนุมัติแล้ว", icon: <CheckCircle2 size={14} /> },
];

export default function ReviewPage() {
  const [bucket, setBucket] = useState<Bucket>("pending");
  const pending  = useSWR<Pending[]>("/ta-review?status=pending");
  const approved = useSWR<Pending[]>("/ta-review?status=approved");
  // TAs who saved the profile form but have not uploaded all three documents.
  // They are deliberately NOT in the pending queue — the officer has nothing to
  // review — but they must stay visible somewhere, or someone who stalls at 2 of
  // 3 files is invisible to staff until they happen to finish.
  const incomplete = useSWR<Pending[]>("/ta-review?status=incomplete");
  const counts = {
    pending:  pending.data?.length ?? 0,
    approved: approved.data?.length ?? 0,
  };

  // Which submitter the full-screen workspace opened on. null = closed. The
  // workspace keeps its own selection after that, so the officer can move
  // between people without returning to this list.
  const [workspaceFor, setWorkspaceFor] = useState<string | null>(null);

  // Password-gated re-download state. Non-null when the confirm modal is
  // open; carries just the target user id so the modal is self-contained.
  const [redownloadFor, setRedownloadFor] = useState<Pending | null>(null);

  function revalidateAll() {
    mutate("/ta-review?status=pending");
    mutate("/ta-review?status=approved");
    // Included because a decision can move somebody between these buckets: a
    // rejected document that the TA replaces leaves them briefly incomplete.
    mutate("/ta-review?status=incomplete");
  }

  return (
    <div>
      <PageHeader
        title="ตรวจสอบเอกสาร TA"
        description="กดที่ชื่อ TA เพื่อดูรายละเอียด ตรวจและอนุมัติ/ตีกลับเอกสารทีละไฟล์ เมื่ออนุมัติครบทั้ง 3 ไฟล์ ระบบจะอนุมัติผู้ใช้ให้อัตโนมัติ"
      />

      {/* Approval is now a by-product of approving the third document, so an
          officer can finish reviewing without ever downloading — and the files
          are purged after 7 days. This is the nudge that used to be implicit in
          the old combined "อนุมัติและดาวน์โหลด" click. */}
      <NotDownloadedNotice people={approved.data} />

      <Panel padded={false}>
        <Tabs
          selectedKey={bucket}
          onSelectionChange={k => setBucket(String(k) as Bucket)}
        >
          <Tabs.ListContainer>
            <Tabs.List aria-label="สถานะการตรวจสอบ" data-tour="review-tabs" className="px-4 pt-2">
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
              onOpen={id => setWorkspaceFor(id)}
              incomplete={incomplete.data}
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

      <ReviewWorkspace
        open={workspaceFor !== null}
        people={pending.data ?? []}
        initialUserId={workspaceFor}
        onClose={() => setWorkspaceFor(null)}
        onChanged={revalidateAll}
      />

      <RedownloadModal
        target={redownloadFor}
        onClose={() => setRedownloadFor(null)}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* "Don't forget to download" — approval no longer downloads anything          */
/* -------------------------------------------------------------------------- */

function NotDownloadedNotice({ people }: { people?: Pending[] }) {
  // ever_downloaded, NOT downloads_used. The bulk download is exempt from the
  // quota, so it leaves downloads_used at 0 — and this notice used to keep naming
  // people whose documents the officer had just saved in one bulk click. A
  // reminder that fires after you have complied is one you learn to ignore, and
  // the thing it guards is a 7-day purge.
  const pendingDownload = (people ?? []).filter(
    p => !p.all_files_deleted && !p.ever_downloaded,
  );
  if (pendingDownload.length === 0) return null;

  const names = pendingDownload.slice(0, 3).map(p => p.full_name).join(", ");
  const more = pendingDownload.length - 3;

  return (
    <div className="mb-4">
      <Alert
        status="warning"
        icon={<AlertTriangle size={18} />}
        title={`มี ${pendingDownload.length} คนที่อนุมัติแล้วแต่ยังไม่ได้ดาวน์โหลดเอกสาร`}
        description={`${names}${more > 0 ? ` และอีก ${more} คน` : ""} ไฟล์จะถูกลบอัตโนมัติภายใน 7 วันนับจากวันอนุมัติ กรุณาดาวน์โหลดเก็บไว้ก่อนถึงกำหนด`}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Pending bucket — one always-expanded card per user, no modal               */
/* -------------------------------------------------------------------------- */

function PendingList({
  data, loading, error, onRetry, onOpen, incomplete,
}: {
  data?: Pending[];
  loading: boolean;
  error?: unknown;
  onRetry?: () => void;
  onOpen: (userId: string) => void;
  /** Submitted-but-not-complete TAs, shown as a nudge list below the queue. */
  incomplete?: Pending[];
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
      <div data-tour="review-pending" className="mb-3">
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
        <ul className="divide-y divide-[var(--hairline)] rounded-lg border border-[var(--hairline)]">
          {filtered.map(u => (
            <li key={u.user_id}>
              {/* Clicking the name opens the full-screen workspace. The old
                  accordion expanded in place, which meant reviewing three
                  files across three drawers and then collapsing to reach the
                  next person. */}
              <button
                type="button"
                onClick={() => onOpen(u.user_id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-secondary"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-foreground/10 text-xs font-semibold">
                  {u.full_name.trim().charAt(0)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{u.full_name}</span>
                  <span className="block truncate text-xs text-muted">{u.email}</span>
                </span>
                {/* The queue mixes two states — never looked at yet, and sent
                    back and waiting on the TA. Without the chip they were
                    indistinguishable until the officer opened the row. */}
                <StatusChip status={u.status} />
                <ChevronRight size={16} className="shrink-0 text-muted" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <IncompleteList people={incomplete} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Owes documents — every TA who is not ready to review, in one place          */
/* -------------------------------------------------------------------------- */

/**
 * The queue above only lists TAs whose three documents are all in, because
 * opening someone with 1 of 3 files wastes the officer's click and there is
 * nothing to decide. That filtering is only safe if the people it removes stay
 * findable — hence this section.
 *
 * It covers every TA who still owes documents, INCLUDING the ones who never
 * opened the form. Those have no ta_profiles row at all, so before this they were
 * invisible on every screen: not in the queue, not in a rejected list, nowhere.
 * A TA who never starts is the most likely one to be forgotten, which makes them
 * the most important to show.
 *
 * Deliberately not a tab and not clickable: there is nothing to review, so the
 * only useful actions are reading the count and chasing the person. Making it
 * look like the queue would invite officers to open rows that have no documents.
 */
function IncompleteList({ people }: { people?: Pending[] }) {
  const [open, setOpen] = useState(false);
  if (!people || people.length === 0) return null;

  const notStarted = people.filter(u => (u.docs_in ?? 0) === 0).length;

  return (
    <div data-tour="review-incomplete" className="mt-4 rounded-lg border border-[var(--hairline)] bg-surface-secondary">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <Clock3 size={14} className="shrink-0 text-muted" />
        <span className="flex-1 text-sm">
          มี <span className="font-medium">{people.length}</span> คนยังส่งเอกสารไม่ครบ
          {notStarted > 0 && (
            <span className="text-muted"> ในนั้น {notStarted} คนยังไม่ส่งอะไรเลย</span>
          )}
        </span>
        <span className="text-xs text-muted">{open ? "ซ่อน" : "ดูรายชื่อ"}</span>
      </button>
      {open && (
        <ul className="divide-y divide-[var(--hairline)] border-t border-[var(--hairline)]">
          {people.map(u => {
            const n = u.docs_in ?? 0;
            return (
              <li key={u.user_id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{u.full_name}</span>
                  <span className="block truncate text-xs text-muted">{u.email}</span>
                </span>
                {/* "0/3" reads as progress on something started. For a TA who has
                    not opened the form at all, say so — it is a different
                    conversation from one who is a file short. */}
                <Chip tone={n === 0 ? "danger" : "warn"}>
                  {n === 0 ? "ยังไม่ส่งอะไรเลย" : `ส่งแล้ว ${n}/3`}
                </Chip>
              </li>
            );
          })}
        </ul>
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
            <DownloadCell person={u} onRedownload={onRedownload} />
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
/* Download quota — the bundle holds PII, so copies are rationed per round     */
/* -------------------------------------------------------------------------- */

// Falls back to "allowance available" when the server didn't send the fields
// (an older API build): the server is the enforcer, so a missing number must
// not disable a button the officer is in fact allowed to press.
function downloadsLeft(u: Pending): number | null {
  if (u.downloads_limit == null || u.downloads_used == null) return null;
  return Math.max(0, u.downloads_limit - u.downloads_used);
}

// DownloadCell is the whole actions cell: the download affordance plus the
// quota state.
//
// When the quota is spent the button is REMOVED rather than disabled. A greyed
// button invites clicking and explains nothing, and here there is nothing to
// try: the allowance is gone for this submission round and cannot be handed
// back. So the cell states that instead of showing a dead control.
function DownloadCell({
  person, onRedownload,
}: {
  person: Pending;
  onRedownload?: (u: Pending) => void;
}) {
  const left = downloadsLeft(person);

  if (left === 0) {
    return (
      <Chip tone="danger">
        <Lock size={12} /> ดาวน์โหลดครบ {person.downloads_limit} ครั้งแล้ว
      </Chip>
    );
  }

  return (
    <div className="inline-flex items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => onRedownload?.(person)}
        disabled={person.all_files_deleted}
      >
        <Lock size={14} /> ดาวน์โหลด
      </Button>
      {left !== null && !person.all_files_deleted && (
        <span className={"text-xs " + (left === 1 ? "text-warning-soft-foreground" : "text-muted")}>
          เหลือ {left}/{person.downloads_limit} ครั้ง
        </span>
      )}
    </div>
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
            เอกสารของ <span className="font-medium text-foreground">{target.full_name}</span> มีข้อมูลส่วนบุคคล (เลขบัตร ปชช. / เลขบัญชี)
            กรุณากรอกรหัสผ่านของคุณเพื่อยืนยันตัวตน
          </div>
          {/* Restated at the point of no return: this is the click that spends
              the allowance, and "เหลือ 1 ครั้ง" means something different here
              than it does on a row the officer is only scanning past. */}
          {downloadsLeft(target) !== null && (
            <Alert
              status={downloadsLeft(target) === 1 ? "warning" : "default"}
              icon={<Lock size={16} />}
              title={`ครั้งนี้จะเป็นครั้งที่ ${(target.downloads_used ?? 0) + 1} จาก ${target.downloads_limit}`}
              description={
                downloadsLeft(target) === 1
                  ? "เป็นครั้งสุดท้าย หลังจากนี้จะดาวน์โหลดไม่ได้อีก และไม่มีวิธีขอเพิ่ม กรุณาเก็บไฟล์ให้เรียบร้อย"
                  : "ระบบจำกัดจำนวนการดาวน์โหลดต่อ TA หนึ่งคน เพื่อคุมจำนวนสำเนาที่ออกจากระบบ ใช้ครบแล้วขอเพิ่มไม่ได้"
              }
            />
          )}
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
