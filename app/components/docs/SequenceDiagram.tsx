import { Database, Globe, Monitor, Mail } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import type { SeqItem, SeqParticipant, SequenceSpec } from "../../../content/docs/types";
import DocRichText, { DocInline } from "./DocRichText";
import { getT } from "../../lib/i18n/server";
import type { Vars } from "../../lib/i18n/core";

type T = (key: string, vars?: Vars) => string;

/**
 * A UML sequence diagram drawn with a CSS grid instead of an image, for the
 * same reasons as MoneyFlow/SystemMap: it stays sharp at any zoom and in
 * print, it uses the site's Thai font, and the text is real text (search,
 * copy, screen readers).
 *
 * Geometry: one grid column per participant, so a lifeline is the centre of
 * its column. A message is one grid row whose cell spans from the sender's
 * column to the receiver's; inside it, inline margins of (50/span)% put the
 * arrow's ends exactly on the two lifelines. Combined fragments get a row for
 * their tag/guard, one per `else`, and a short closing row; their frame is a
 * box placed over that row range. Activation bars are boxes over the rows
 * between a sync request and its reply.
 *
 * Wide screens and print get the diagram; phones and the docs drawer get the
 * same steps, same numbers, as an indented list.
 */

const BAR = 10; // activation bar width, px

const TONE: Record<NonNullable<SeqParticipant["tone"]>, { ink: string; soft: string; line: string }> = {
  ta:       { ink: "var(--tone-ta-ink)", soft: "var(--tone-ta-soft)", line: "var(--tone-ta-line)" },
  lecturer: { ink: "var(--tone-brand-ink)", soft: "var(--tone-brand-soft)", line: "var(--tone-brand-line)" },
  staff:    { ink: "var(--tone-staff-ink)", soft: "var(--tone-staff-soft)", line: "var(--tone-staff-line)" },
  brand:    { ink: "var(--tone-brand-ink)", soft: "var(--tone-brand-soft)", line: "var(--tone-brand-line)" },
  paper:    { ink: "var(--tone-muted-ink)", soft: "var(--tone-paper-soft)", line: "var(--tone-paper-line)" },
};

function toneOf(p: SeqParticipant) {
  return TONE[p.tone ?? (p.kind === "actor" ? "brand" : p.kind === "external" || p.kind === "db" ? "paper" : "brand")];
}

type Msg = Extract<SeqItem, { from: string }>;
type Frag = Extract<SeqItem, { frag: string }>;

/* ------------------------------------------------------------------ layout */

type Row =
  | { kind: "msg"; m: Msg; n: number; depth: number }
  | { kind: "note"; text: string; over: string[] }
  | { kind: "phase"; text: string }
  | { kind: "fragOpen"; frag: Frag["frag"]; guard: string; id: number }
  | { kind: "fragElse"; guard: string; id: number }
  | { kind: "fragClose"; id: number };

interface FragBox { id: number; frag: Frag["frag"]; depth: number; open: number; close: number; elses: number[]; lo: number; hi: number }

function participantsIn(items: SeqItem[], out: Set<string>) {
  for (const it of items) {
    if ("from" in it) { out.add(it.from); out.add(it.to); }
    else if ("note" in it) it.over.forEach((p) => out.add(p));
    else if ("frag" in it) it.branches.forEach((b) => participantsIn(b.items, out));
  }
  return out;
}

function layout(spec: SequenceSpec) {
  const col = new Map(spec.participants.map((p, i) => [p.id, i]));
  const rows: Row[] = [];
  const frags: FragBox[] = [];
  let n = 0;
  let fragId = 0;

  // Activation bars: a sync message opens one on its receiver (people don't
  // get bars), the receiver's next reply closes it; anything still open ends
  // on the participant's last message. Branches of a fragment are
  // alternatives, so each branch starts from the state the fragment was
  // entered with; a bar closed in one branch and reopened in the next is
  // drawn twice over the same lifeline and reads as one.
  const bars: { col: number; from: number; to: number }[] = [];
  let open = new Map<string, number[]>();
  const last = new Map<string, number>();
  const isActor = (id: string) => spec.participants.find((p) => p.id === id)?.kind === "actor";
  const copy = (m: Map<string, number[]>) => new Map([...m].map(([k, v]) => [k, [...v]]));
  const track = (m: Msg, i: number) => {
    const { from, to, kind = "sync" } = m;
    last.set(from, i); last.set(to, i);
    if (kind === "sync" && from !== to && !isActor(to)) {
      open.set(to, [...(open.get(to) ?? []), i]);
    } else if (kind === "reply") {
      const stack = open.get(from);
      if (stack?.length) bars.push({ col: col.get(from)!, from: stack.pop()!, to: i });
    }
  };

  const walk = (items: SeqItem[], depth: number) => {
    for (const it of items) {
      if ("from" in it) { track(it, rows.length); rows.push({ kind: "msg", m: it, n: ++n, depth }); }
      else if ("note" in it) rows.push({ kind: "note", text: it.note, over: it.over });
      else if ("phase" in it) rows.push({ kind: "phase", text: it.phase });
      else {
        const id = fragId++;
        const cols = [...participantsIn([it], new Set())].map((p) => col.get(p)!);
        const box: FragBox = { id, frag: it.frag, depth, open: 0, close: 0, elses: [], lo: Math.min(...cols), hi: Math.max(...cols) };
        frags.push(box);
        const entry = copy(open);
        it.branches.forEach((b, bi) => {
          if (bi > 0) open = copy(entry);
          if (bi === 0) { box.open = rows.length; rows.push({ kind: "fragOpen", frag: it.frag, guard: b.guard, id }); }
          else { box.elses.push(rows.length); rows.push({ kind: "fragElse", guard: b.guard, id }); }
          walk(b.items, depth + 1);
        });
        // a break leaves the interaction; whoever was busy before still is
        if (it.frag === "break") open = entry;
        box.close = rows.length;
        rows.push({ kind: "fragClose", id });
      }
    }
  };
  walk(spec.items, 0);

  // A frame drawn inside another frame over the same columns needs to sit
  // inside it, so widen each parent to cover its children's columns.
  for (const f of [...frags].reverse()) {
    for (const g of frags) {
      if (g.depth === f.depth - 1 && g.open < f.open && g.close > f.close) {
        g.lo = Math.min(g.lo, f.lo);
        g.hi = Math.max(g.hi, f.hi);
      }
    }
  }

  for (const [id, stack] of open) for (const s of stack) bars.push({ col: col.get(id)!, from: s, to: Math.max(s, last.get(id) ?? s) });

  const activeAt = (p: string, row: number) => {
    if (spec.activation === "none") return false;
    const c = col.get(p)!;
    return bars.some((b) => b.col === c && row > b.from && row <= b.to) || bars.some((b) => b.col === c && row === b.from);
  };

  return { col, rows, frags, bars, activeAt };
}

/* ------------------------------------------------------------- pieces */

function StickFigure({ color }: { color: string }) {
  return (
    <svg width="22" height="30" viewBox="0 0 22 30" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="5.5" r="4" />
      <path d="M11 9.5v10M3 13.5h16M11 19.5l-6 9M11 19.5l6 9" />
    </svg>
  );
}

function ParticipantHead({ p, small }: { p: SeqParticipant; small?: boolean }) {
  const tone = toneOf(p);
  if (p.kind === "actor") {
    return (
      <div className="flex flex-col items-center gap-1 text-center">
        {!small && <StickFigure color={tone.ink} />}
        <div
          className="rounded-md border px-2.5 py-1 text-[13px] font-semibold leading-tight"
          style={{ borderColor: tone.line, background: tone.soft, color: tone.ink }}
        >
          {p.label}
          {p.sub && !small && <div className="text-[11px] font-normal text-muted">{p.sub}</div>}
        </div>
      </div>
    );
  }
  const Icon = p.kind === "db" ? Database : p.kind === "external" ? (/mail|อีเมล|smtp/i.test(p.label) ? Mail : Globe) : Monitor;
  return (
    <div
      className={
        "mx-auto max-w-[95%] rounded-lg border px-2.5 py-1.5 text-center shadow-[0_1px_2px_rgba(15,23,42,0.05)] bg-white " +
        (p.kind === "external" ? "border-dashed" : "")
      }
      style={{ borderColor: tone.line }}
    >
      <div className="flex items-center justify-center gap-1.5 text-[13px] font-semibold leading-tight" style={{ color: tone.ink }}>
        <Icon size={14} className="shrink-0" aria-hidden="true" />
        <span>{p.label}</span>
      </div>
      {p.sub && !small && <div className="mt-0.5 text-[11px] leading-snug text-muted">{p.sub}</div>}
    </div>
  );
}

function Head({ kind, dir }: { kind: "sync" | "reply" | "async"; dir: "right" | "left" }) {
  const style: CSSProperties = { position: "absolute", top: -5, [dir === "right" ? "right" : "left"]: -1 };
  const flip = dir === "left" ? "scale(-1,1) translate(-10,0)" : undefined;
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" style={style} aria-hidden="true">
      {kind === "sync"
        ? <path d="M0 0.5L10 5L0 9.5Z" fill="currentColor" transform={flip} />
        : <path d="M0.5 0.5L9.5 5L0.5 9.5" fill="none" stroke="currentColor" strokeWidth="1.5" transform={flip} />}
    </svg>
  );
}

function NumberPill({ n }: { n: number }) {
  return (
    <span className="me-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#0776bc] px-1 align-[1px] text-[10.5px] font-bold leading-none text-white">
      {n}
    </span>
  );
}

const FRAG_LABEL: Record<Frag["frag"], string> = { alt: "alt", opt: "opt", loop: "loop", par: "par", break: "break" };

/* ----------------------------------------------------------- wide view */

function Wide({ spec, t }: { spec: SequenceSpec; t: T }) {
  const { col, rows, frags, bars, activeAt } = layout(spec);
  const N = spec.participants.length;
  // grid rows: 1 = heads, 2..rows+1 = body, rows+2 = feet
  const R = (i: number) => i + 2;
  const footRow = rows.length + 2;

  const cells: ReactNode[] = [];

  spec.participants.forEach((p, i) => {
    cells.push(
      <div key={`h${p.id}`} style={{ gridColumn: i + 1, gridRow: 1, zIndex: 3 }} className="flex items-end justify-center px-1.5 pb-2">
        <ParticipantHead p={p} />
      </div>,
      <div key={`l${p.id}`} style={{ gridColumn: i + 1, gridRow: `2 / ${footRow}`, zIndex: 0 }} className="flex justify-center" aria-hidden="true">
        <div className="h-full w-0 border-l-[1.5px] border-dashed" style={{ borderColor: "var(--border-strong)" }} />
      </div>,
      <div key={`f${p.id}`} style={{ gridColumn: i + 1, gridRow: footRow, zIndex: 3 }} className="flex items-start justify-center px-1.5 pt-2" aria-hidden="true">
        <ParticipantHead p={p} small />
      </div>,
    );
  });

  for (const f of frags) {
    const inset = 6 + f.depth * 7;
    cells.push(
      <div
        key={`fr${f.id}`}
        aria-hidden="true"
        className="rounded-[3px] border-[1.5px]"
        style={{
          gridColumn: `${f.lo + 1} / ${f.hi + 2}`, gridRow: `${R(f.open)} / ${R(f.close) + 1}`, zIndex: 1,
          marginInline: inset, borderColor: "var(--tone-muted-ink)", opacity: 0.85,
        }}
      />,
    );
  }

  for (const b of spec.activation === "none" ? [] : bars) {
    const single = b.to === b.from;
    cells.push(
      <div
        key={`b${b.col}-${b.from}`}
        aria-hidden="true"
        className="mx-auto self-stretch rounded-[2px] border-[1.5px] bg-white"
        style={{
          gridColumn: b.col + 1, gridRow: single ? R(b.from) : `${R(b.from) + 1} / ${R(b.to) + 1}`, zIndex: 2, width: BAR,
          marginTop: single ? "auto" : -14, marginBottom: 4, height: single ? 20 : undefined,
          borderColor: toneOf(spec.participants[b.col]).ink,
        }}
      />,
    );
  }

  rows.forEach((r, i) => {
    const row = R(i);
    if (r.kind === "msg") {
      const a = col.get(r.m.from)!;
      const b = col.get(r.m.to)!;
      const kind = r.m.kind ?? "sync";
      const color = kind === "reply" ? "var(--tone-muted-ink)" : "var(--foreground)";
      if (a === b) {
        const left = a === N - 1; // last column: loop on the left side
        const off = activeAt(r.m.from, i) ? BAR / 2 : 0;
        cells.push(
          <div key={`m${i}`} style={{ gridColumn: left ? `${a} / ${a + 2}` : `${a + 1} / ${Math.min(a + 3, N + 1)}`, gridRow: row, zIndex: 3 }} className="py-1.5">
            <div
              className={"flex items-center gap-1.5 " + (left ? "flex-row-reverse" : "")}
              style={left
                ? { marginRight: `calc(${a === 0 ? 50 : 25}% + ${off}px)` }
                : { marginLeft: `calc(${50 / Math.min(2, N - a)}% + ${off}px)` }}
            >
              <svg width="34" height="26" viewBox="0 0 34 26" className="shrink-0" style={{ color, transform: left ? "scaleX(-1)" : undefined }} aria-hidden="true">
                <path d="M0 3H28V21H6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray={kind === "reply" ? "4 3" : undefined} />
                <path d="M7 16.5L1 21L7 25.5Z" fill="currentColor" />
              </svg>
              <div className={"text-[12.5px] leading-snug text-foreground " + (left ? "text-right" : "")}>
                <NumberPill n={r.n} />
                <DocInline text={r.m.text} />
              </div>
            </div>
          </div>,
        );
        return;
      }
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      const span = hi - lo + 1;
      const edge = 50 / span; // % of the cell from its edge to the outer lifelines
      const dir = b > a ? "right" : "left";
      const offFrom = activeAt(r.m.from, i) ? BAR / 2 : 0;
      const offTo = activeAt(r.m.to, i) ? BAR / 2 : 0;
      const offL = dir === "right" ? offFrom : offTo;
      const offR = dir === "right" ? offTo : offFrom;
      cells.push(
        <div key={`m${i}`} style={{ gridColumn: `${lo + 1} / ${hi + 2}`, gridRow: row, zIndex: 3 }} className="flex flex-col justify-end pb-2 pt-2">
          <div className="px-1.5 text-center text-[12.5px] leading-snug text-foreground" style={{ marginInline: `${edge}%` }}>
            <span className="box-decoration-clone rounded bg-white px-1">
              <NumberPill n={r.n} />
              <DocInline text={r.m.text} />
            </span>
          </div>
          <div
            className="relative mt-1"
            style={{ marginLeft: `calc(${edge}% + ${offL}px)`, marginRight: `calc(${edge}% + ${offR}px)`, color }}
            aria-hidden="true"
          >
            <div className={"border-t-[1.5px] " + (kind === "reply" ? "border-dashed" : "")} style={{ borderColor: "currentColor" }} />
            <Head kind={kind} dir={dir} />
          </div>
        </div>,
      );
    } else if (r.kind === "note") {
      const cs = r.over.map((p) => col.get(p)!);
      const lo = Math.min(...cs);
      const hi = Math.max(...cs);
      cells.push(
        <div key={`n${i}`} style={{ gridColumn: `${lo + 1} / ${hi + 2}`, gridRow: row, zIndex: 3 }} className="flex justify-center px-3 py-1.5">
          <div className="docs-seq-note relative max-w-full rounded-sm border px-2.5 py-1.5 text-[12px] leading-snug text-foreground">
            <DocInline text={r.text} />
          </div>
        </div>,
      );
    } else if (r.kind === "phase") {
      cells.push(
        <div key={`p${i}`} style={{ gridColumn: "1 / -1", gridRow: row, zIndex: 3 }} className="flex items-center gap-3 py-2.5">
          <span className="h-[3px] flex-1 border-y border-[var(--border-strong)]" aria-hidden="true" />
          <span className="rounded-full border border-[var(--tone-brand-line)] bg-white px-3 py-0.5 text-[12.5px] font-semibold text-[var(--tone-brand-ink)]">{r.text}</span>
          <span className="h-[3px] flex-1 border-y border-[var(--border-strong)]" aria-hidden="true" />
        </div>,
      );
    } else if (r.kind === "fragOpen") {
      const f = frags.find((x) => x.id === r.id)!;
      cells.push(
        <div key={`g${i}`} style={{ gridColumn: `${f.lo + 1} / ${f.hi + 2}`, gridRow: row, zIndex: 3, marginInline: 6 + f.depth * 7 }} className="flex items-start gap-2 pb-1">
          <span className="relative shrink-0 bg-white py-0.5 pl-1.5 pr-3.5 font-mono text-[11.5px] font-bold text-[var(--tone-muted-ink)]">
            <svg className="absolute inset-0 h-full w-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100" aria-hidden="true">
              <path d="M0 0H100V62L84 100H0Z" fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            </svg>
            {FRAG_LABEL[r.frag]}
          </span>
          <span className="mt-0.5 rounded bg-white px-1 text-[12px] font-medium leading-snug text-[var(--tone-muted-ink)]">
            [<DocInline text={r.guard} />]
          </span>
        </div>,
      );
    } else if (r.kind === "fragElse") {
      const f = frags.find((x) => x.id === r.id)!;
      cells.push(
        <div
          key={`g${i}`}
          style={{ gridColumn: `${f.lo + 1} / ${f.hi + 2}`, gridRow: row, zIndex: 3, marginInline: 6 + f.depth * 7 }}
          className="mt-1 border-t-[1.5px] border-dashed border-[var(--tone-muted-ink)] pb-1 pt-1"
        >
          <span className="ms-1.5 rounded bg-white px-1 text-[12px] font-medium leading-snug text-[var(--tone-muted-ink)]">
            [<DocInline text={r.guard} />]
          </span>
        </div>,
      );
    } else {
      cells.push(<div key={`c${i}`} style={{ gridColumn: "1 / -1", gridRow: row, height: 10 }} aria-hidden="true" />);
    }
  });

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-white print:overflow-visible">
      <div
        className="grid px-2 py-4 print:min-w-0"
        style={{ gridTemplateColumns: `repeat(${N}, minmax(8rem, 1fr))`, minWidth: `${N * 8}rem` }}
        aria-label={t("แผนภาพลำดับการทำงาน: {title}", { title: spec.title })}
      >
        {cells}
      </div>
    </div>
  );
}

/* --------------------------------------------------------- narrow view */

function Narrow({ spec, t }: { spec: SequenceSpec; t: T }) {
  const name = new Map(spec.participants.map((p) => [p.id, p.label]));
  let n = 0;
  const list = (items: SeqItem[]): ReactNode => (
    <ol className="space-y-2">
      {items.map((it, i) => {
        if ("from" in it) {
          n += 1;
          const kind = it.kind ?? "sync";
          return (
            <li key={i} className="text-[13px] leading-relaxed">
              <NumberPill n={n} />
              <span className="font-semibold">{name.get(it.from)}</span>
              {it.from !== it.to && (
                <>
                  <span className={"mx-1 " + (kind === "reply" ? "text-muted" : "")} aria-label={t("ส่งถึง")}>{kind === "reply" ? "⇢" : "→"}</span>
                  <span className="font-semibold">{name.get(it.to)}</span>
                </>
              )}
              <span className="text-muted">: </span>
              <DocInline text={it.text} />
            </li>
          );
        }
        if ("note" in it) {
          return (
            <li key={i} className="docs-seq-note rounded-sm border px-2.5 py-1.5 text-[12.5px] leading-snug">
              <DocInline text={it.note} />
            </li>
          );
        }
        if ("phase" in it) {
          return <li key={i} className="pt-2 text-[13px] font-semibold text-[var(--tone-brand-ink)]">{it.phase}</li>;
        }
        return (
          <li key={i} className="rounded-md border border-[var(--border-strong)] p-2.5">
            {it.branches.map((b, bi) => (
              <div key={bi} className={bi > 0 ? "mt-2.5 border-t border-dashed border-[var(--border-strong)] pt-2" : ""}>
                <div className="mb-1.5 text-[12px] font-medium text-muted">
                  {bi === 0 && <span className="me-1.5 font-mono font-bold">{FRAG_LABEL[it.frag]}</span>}
                  [<DocInline text={b.guard} />]
                </div>
                {list(b.items)}
              </div>
            ))}
          </li>
        );
      })}
    </ol>
  );
  return (
    <div className="rounded-2xl border border-border bg-white p-4">
      <div className="mb-3 flex flex-wrap gap-1.5">
        {spec.participants.map((p) => (
          <span key={p.id} className="rounded-md border px-2 py-0.5 text-[12px] font-medium" style={{ borderColor: toneOf(p).line, color: toneOf(p).ink }}>
            {p.label}
          </span>
        ))}
      </div>
      {list(spec.items)}
    </div>
  );
}

/* --------------------------------------------------------------- legend */

function Legend({ t, activation }: { t: T; activation: boolean }) {
  const Line = ({ dashed, head }: { dashed?: boolean; head: "fill" | "open" }) => (
    <svg width="40" height="10" viewBox="0 0 40 10" className="shrink-0 text-foreground" aria-hidden="true">
      <line x1="0" y1="5" x2="38" y2="5" stroke="currentColor" strokeWidth="1.5" strokeDasharray={dashed ? "4 3" : undefined} />
      {head === "fill"
        ? <path d="M30 0.5L39.5 5L30 9.5Z" fill="currentColor" />
        : <path d="M30.5 0.5L39 5L30.5 9.5" fill="none" stroke="currentColor" strokeWidth="1.5" />}
    </svg>
  );
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px] text-muted">
      <span className="inline-flex items-center gap-1.5"><Line head="fill" />{t("ส่งคำสั่งแล้วรอผล")}</span>
      <span className="inline-flex items-center gap-1.5"><Line dashed head="open" />{t("ตอบกลับ")}</span>
      <span className="inline-flex items-center gap-1.5"><Line head="open" />{t("แจ้งโดยไม่รอผล (อีเมล/แจ้งเตือน)")}</span>
      {activation && <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-4 w-[10px] rounded-[2px] border-[1.5px] border-[var(--tone-brand-ink)] bg-white" aria-hidden="true" />
        {t("ช่วงที่กำลังทำงาน")}
      </span>}
      <span className="inline-flex items-center gap-1.5">
        <span className="font-mono font-bold">alt</span>{t("เลือกทางใดทางหนึ่ง")}
        <span className="ms-2 font-mono font-bold">opt</span>{t("ทำเมื่อเข้าเงื่อนไข")}
        <span className="ms-2 font-mono font-bold">loop</span>{t("ทำซ้ำ")}
      </span>
    </div>
  );
}

export default async function SequenceDiagram({ spec }: { spec: SequenceSpec }) {
  const { t } = await getT();
  return (
    <figure className="my-4" aria-label={spec.title} data-sequence-diagram>
      <div className="mb-2 text-[15px] font-semibold text-foreground">{spec.title}</div>
      <div className="hidden md:block print:block"><Wide spec={spec} t={t} /></div>
      <div className="md:hidden print:hidden"><Narrow spec={spec} t={t} /></div>
      <div className="hidden md:block print:block"><Legend t={t} activation={spec.activation !== "none"} /></div>
      {spec.caption && (
        <figcaption className="mt-2 text-xs text-muted">
          <DocRichText body={spec.caption} />
        </figcaption>
      )}
    </figure>
  );
}
