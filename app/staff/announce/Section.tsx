"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * One titled block of the composer.
 *
 * The form was a single card holding nine field groups at equal weight, so
 * nothing on it read as "start here" — everything asked for attention at once.
 * Four named blocks let an officer answer one question at a time: what am I
 * writing, who gets it, what is attached, when does it go out. The blocks that
 * are usually left alone collapse, so the screen opens short.
 */
export default function Section({
  icon, title, hint, summary, children,
  collapsible = false, defaultOpen = true,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  /** Shown at the right of the header: what is inside, without opening it. */
  summary?: React.ReactNode;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const head = (
    <>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-soft-foreground">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
      </span>
      {summary && <span className="shrink-0 text-xs text-muted">{summary}</span>}
    </>
  );

  return (
    <section className="rounded-xl border border-border bg-surface">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          className="flex w-full items-center gap-2.5 rounded-xl px-4 py-3 text-start transition-colors hover:bg-surface-secondary"
        >
          {head}
          <ChevronDown
            size={15}
            className={"shrink-0 text-muted transition-transform " + (open ? "rotate-180" : "")}
          />
        </button>
      ) : (
        <div className="flex items-center gap-2.5 px-4 py-3">{head}</div>
      )}
      {(!collapsible || open) && (
        <div className="space-y-4 border-t border-hairline px-4 py-4">{children}</div>
      )}
    </section>
  );
}
