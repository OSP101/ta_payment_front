"use client";
import { AlertTriangle, Ban, CheckCircle2, Eye, XCircle } from "lucide-react";
import { Chip } from "../../components/ui";
import { OUTCOME_LABEL, type Row } from "./types";

/** The state of a row, said in a chip so the same colour always means the same
 *  thing on this screen: red is a failure or refusal, amber is "worth a second
 *  look", and an eye is somebody reading personal data.
 *
 *  A plain success shows nothing by default — on a list where nearly every row
 *  succeeded, a green chip on each would be the loudest thing on the page and
 *  say the least. `always` is for the detail view, where the answer to "did it
 *  work?" should be stated either way. */
export function RowBadges({ row, always = false }: { row: Pick<Row, "outcome" | "severity">; always?: boolean }) {
  return (
    <>
      {row.outcome === "failed" && (
        <Chip tone="danger"><XCircle size={12} />{OUTCOME_LABEL.failed}</Chip>
      )}
      {row.outcome === "denied" && (
        <Chip tone="danger"><Ban size={12} />{OUTCOME_LABEL.denied}</Chip>
      )}
      {row.outcome === "ok" && always && (
        <Chip tone="success"><CheckCircle2 size={12} />{OUTCOME_LABEL.ok}</Chip>
      )}
      {row.outcome === "ok" && row.severity === "danger" && (
        <Chip tone="danger"><AlertTriangle size={12} />สำคัญ</Chip>
      )}
      {row.outcome === "ok" && row.severity === "warn" && (
        <Chip tone="warn"><AlertTriangle size={12} />ควรตรวจ</Chip>
      )}
      {row.severity === "notice" && (
        <Chip tone="neutral"><Eye size={12} />ข้อมูลอ่อนไหว</Chip>
      )}
    </>
  );
}
