"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { Tip } from "../ui";

/**
 * Floating "back to top" button, bottom-right. Hidden until the reader has
 * scrolled past roughly one screen, so short pages never show it. Smooth
 * scroll unless the reader asked for reduced motion.
 */
export default function BackToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > window.innerHeight * 0.8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const toTop = () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <div
      className={
        "fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] end-4 z-30 transition-all duration-200 sm:bottom-6 sm:end-6 " +
        (show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0")
      }
    >
      <Tip content="กลับขึ้นบนสุด">
        <button
          type="button"
          onClick={toTop}
          aria-label="กลับขึ้นบนสุด"
          tabIndex={show ? 0 : -1}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-white text-foreground shadow-lg shadow-slate-900/10 hover:border-(--brand) hover:text-(--brand) transition-colors"
        >
          <ArrowUp size={20} aria-hidden="true" />
        </button>
      </Tip>
    </div>
  );
}
