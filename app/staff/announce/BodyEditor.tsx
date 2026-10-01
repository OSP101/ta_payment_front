"use client";
import { useEffect, useRef } from "react";
import {
  List, ListOrdered, Link as LinkIcon, AlignCenter, AlignLeft, AlignRight,
} from "lucide-react";
import { Tip } from "../../components/ui";

/**
 * The buttons insert the same tiny markup RichText renders, around whatever the
 * officer has selected. A textarea rather than a contenteditable surface on
 * purpose: what is stored is exactly what was typed, so there is no HTML from
 * the composer that a reader's browser could be asked to run.
 */
export default function BodyEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  /** Apply an edit and leave the caret where the officer would expect it. */
  const apply = (next: string, from: number, to: number) => {
    onChange(next);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(from, to);
    });
  };

  /**
   * Wrap the selection — or unwrap it, if it is already wrapped. Pressing the
   * bold button on text that is already bold should turn it off, the way it
   * does in every editor people use; without that the only way back is to
   * hunt down the stars by hand.
   */
  const surround = (mark: string, closing: string, placeholder: string) => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const picked = value.slice(a, b);

    // Already wrapped, either inside the selection or just outside it.
    if (picked.startsWith(mark) && picked.endsWith(closing) && picked.length > mark.length + closing.length) {
      const inner = picked.slice(mark.length, picked.length - closing.length);
      apply(value.slice(0, a) + inner + value.slice(b), a, a + inner.length);
      return;
    }
    if (value.slice(a - mark.length, a) === mark && value.slice(b, b + closing.length) === closing) {
      const next = value.slice(0, a - mark.length) + picked + value.slice(b + closing.length);
      apply(next, a - mark.length, a - mark.length + picked.length);
      return;
    }

    const body = picked || placeholder;
    const next = value.slice(0, a) + mark + body + closing + value.slice(b);
    apply(next, a + mark.length, a + mark.length + body.length);
  };

  // Line tools work on whole lines: a list marker in the middle of a sentence
  // is not what the button promises.
  const prefixLines = (make: (i: number) => string) => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const lineStart = value.lastIndexOf("\n", a - 1) + 1;
    const lineEnd = value.indexOf("\n", b) === -1 ? value.length : value.indexOf("\n", b);
    const chunk = value.slice(lineStart, lineEnd) || "รายการ";
    const marked = chunk.split("\n").map((l, i) => make(i) + l.replace(/^\s*(?:[-•]\s+|\d+[.)]\s+)/, "")).join("\n");
    apply(value.slice(0, lineStart) + marked + value.slice(lineEnd), lineStart, lineStart + marked.length);
  };

  const alignLine = (how: "center" | "right" | "left") => {
    const el = ref.current;
    if (!el) return;
    const a = el.selectionStart;
    let lineStart = value.lastIndexOf("\n", a - 1) + 1;
    // Clicking a second alignment on the same line replaces the first rather
    // than stacking a marker on top of it.
    const prevStart = lineStart === 0 ? -1 : value.lastIndexOf("\n", lineStart - 2) + 1;
    if (prevStart >= 0 && /^:::(center|right|left)\s*$/.test(value.slice(prevStart, lineStart - 1))) {
      lineStart = prevStart;
    }
    const lineFrom = lineStart === prevStart ? value.indexOf("\n", prevStart) + 1 : lineStart;
    const marker = `:::${how}\n`;
    const caret = lineStart + marker.length;
    apply(value.slice(0, lineStart) + marker + value.slice(lineFrom), caret, caret);
  };

  /**
   * Enter inside a list carries the list on, and Enter on an item left empty
   * ends it. Retyping "- " on every line is the kind of small friction that
   * makes people give up and write one long paragraph instead.
   */
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = ref.current;
    if (!el) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === "b") { e.preventDefault(); surround("**", "**", "ข้อความหนา"); return; }
      if (k === "i") { e.preventDefault(); surround("*", "*", "ข้อความเอียง"); return; }
      if (k === "k") { e.preventDefault(); surround("[", "](https://)", "ข้อความลิงก์"); return; }
    }
    if (e.key !== "Enter" || e.shiftKey) return;

    const a = el.selectionStart;
    if (a !== el.selectionEnd) return;
    const lineStart = value.lastIndexOf("\n", a - 1) + 1;
    const line = value.slice(lineStart, a);
    const bullet = /^(\s*)([-•])\s+(.*)$/.exec(line);
    const numbered = /^(\s*)(\d+)[.)]\s+(.*)$/.exec(line);
    if (!bullet && !numbered) return;

    e.preventDefault();
    const rest = (bullet ?? numbered)![3];
    if (rest.trim() === "") {
      // An empty item means "I am done with the list": drop the marker.
      apply(value.slice(0, lineStart) + "\n" + value.slice(a), lineStart + 1, lineStart + 1);
      return;
    }
    const marker = bullet
      ? `${bullet[1]}${bullet[2]} `
      : `${numbered![1]}${Number(numbered![2]) + 1}. `;
    const ins = "\n" + marker;
    apply(value.slice(0, a) + ins + value.slice(a), a + ins.length, a + ins.length);
  };

  /**
   * Pasting a URL over selected words turns them into a link, instead of
   * replacing the words with the URL — the one paste people get wrong most.
   */
  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    if (a === b) return;
    const pasted = e.clipboardData.getData("text/plain").trim();
    if (!/^https?:\/\/\S+$/.test(pasted)) return;
    e.preventDefault();
    const label = value.slice(a, b);
    const link = `[${label}](${pasted})`;
    apply(value.slice(0, a) + link + value.slice(b), a + link.length, a + link.length);
  };

  // The field grows with the announcement. A fixed 8 rows means a long notice
  // is written through a letterbox, which is where formatting mistakes hide.
  // Past the cap it scrolls — capping the height without that would put the
  // end of a long announcement out of reach.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 180), 640)}px`;
  }, [value]);

  // size-9 on a phone: a 28px button is a miss with a thumb. Desktop keeps the
  // tighter row, where the pointer is precise.
  const btn = "inline-flex size-9 items-center justify-center rounded-md border border-border text-xs text-ink-2 transition-colors hover:border-brand hover:text-brand sm:size-auto sm:px-2 sm:py-1";

  /**
   * preventDefault on mousedown keeps the caret in the textarea, so the field
   * is still where the officer left it after a button press.
   */
  const Tool = ({ title, onPress, children }: { title: string; onPress: () => void; children: React.ReactNode }) => (
    <Tip content={title}><button type="button" className={btn} onMouseDown={e => e.preventDefault()} onClick={onPress}>
      {children}
    </button></Tip>
  );

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1">
        <Tool title="ตัวหนา (⌘B)" onPress={() => surround("**", "**", "ข้อความหนา")}><b>ห</b></Tool>
        <Tool title="ตัวเอียง (⌘I)" onPress={() => surround("*", "*", "ข้อความเอียง")}><i>อ</i></Tool>
        <span className="mx-0.5 w-px bg-border" />
        <Tool title="รายการ" onPress={() => prefixLines(() => "- ")}><List size={13} /></Tool>
        <Tool title="รายการมีลำดับ" onPress={() => prefixLines(i => `${i + 1}. `)}><ListOrdered size={13} /></Tool>
        <span className="mx-0.5 w-px bg-border" />
        <Tool title="แนบลิงก์ (⌘K)" onPress={() => surround("[", "](https://)", "ข้อความลิงก์")}><LinkIcon size={13} /></Tool>
        <span className="mx-0.5 w-px bg-border" />
        <Tool title="จัดกึ่งกลาง" onPress={() => alignLine("center")}><AlignCenter size={13} /></Tool>
        <Tool title="ชิดขวา" onPress={() => alignLine("right")}><AlignRight size={13} /></Tool>
        <Tool title="ชิดซ้าย" onPress={() => alignLine("left")}><AlignLeft size={13} /></Tool>
      </div>
      {/* A native textarea, not the shared TextArea: the toolbar needs a ref to
          the element to place the caret, and the wrapper does not forward one.
          Classes mirror the other fields so it still reads as one form. */}
      <textarea
        ref={ref}
        rows={8}
        placeholder="ใส่รายละเอียดของประกาศ วางลิงก์ได้เลยระบบจะทำให้กดได้เอง"
        value={value}
        maxLength={8000}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        className="w-full resize-none overflow-y-auto rounded-lg border border-border bg-surface px-3 py-2 text-sm leading-6 text-foreground outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
      <p className="text-xs text-muted">
        เลือกข้อความแล้วกดปุ่มด้านบน
        {/* Keyboard shortcuts are noise on a phone — there is no keyboard to
            press them on. */}
        <span className="hidden sm:inline"> หรือใช้ ⌘B ⌘I ⌘K</span>
        {" · "}ขึ้นต้นบรรทัดด้วย - หรือ 1. แล้วกด Enter ระบบจะต่อรายการให้เอง
      </p>
    </div>
  );
}
