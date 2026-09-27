"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";
import type { Me } from "../lib/api";

/**
 * Tiled name/email/time watermark over every page an admin or staff account
 * opens, so a screenshot of payment data says whose session it came from.
 * Mounted once in the root layout, which hands over the server's /me only when
 * that account is admin/staff — that is also what keeps the SWR fetch below
 * off /login and the public /p pages, where a 401 would redirect.
 *
 * This is a deterrent, not a control: anything drawn in the browser can be
 * taken out with DevTools. What it does do is put itself back when removed or
 * restyled, so hiding it takes more than deleting one node. It covers the
 * sidebar, header, modals and print (fixed + print-color-adjust), never
 * catches a click, and is left out of exported files by design — those must
 * match the college's own forms.
 */
export default function StaffWatermark({ initial }: { initial: Me | null }) {
  // Live copy so a name edited on /account shows up without a reload.
  const { data: me } = useSWR<Me>(initial ? "/me" : null, { fallbackData: initial ?? undefined });
  const now = useMinuteClock();

  const isStaff = !!me && (me.roles.includes("admin") || me.roles.includes("staff"));
  const name = me ? [me.title, `${me.first_name} ${me.last_name}`].filter(Boolean).join(" ").trim() : "";
  const email = me?.email ?? "";
  const stamp = now ? formatStamp(now) : "";

  useEffect(() => {
    // The /docs-embed iframe sits inside a page that already carries one.
    if (!isStaff || !stamp || window.self !== window.top) return;
    let disposed = false;
    let layer: HTMLDivElement | null = null;
    let observer: MutationObserver | null = null;

    const mount = (tile: string, size: number) => {
      observer?.disconnect();
      layer?.remove();
      const el = document.createElement("div");
      el.setAttribute("aria-hidden", "true");
      for (const [k, v] of Object.entries(layerStyle(tile, size))) el.style.setProperty(k, v, "important");
      document.body.appendChild(el);
      layer = el;
      const expected = el.style.cssText;
      // Rebuild only when the layer is actually gone or visibly restyled. Not
      // on any attribute change: react-aria stamps aria-hidden/inert on every
      // body child while a modal is open and re-stamps nodes that appear, so
      // reacting to that recreated the layer forever and froze the tab.
      observer = new MutationObserver(() => {
        if (disposed) return;
        const gone = !el.isConnected;
        const restyled = el.style.cssText !== expected || el.hasAttribute("hidden") || el.className !== "";
        if (gone || restyled) mount(tile, size);
      });
      observer.observe(document.body, { childList: true });
      observer.observe(el, { attributes: true, attributeFilter: ["style", "class", "hidden"] });
    };

    renderTile([name, email, stamp]).then(({ url, size }) => {
      if (!disposed) mount(url, size);
    });
    return () => {
      disposed = true;
      observer?.disconnect();
      layer?.remove();
    };
  }, [isStaff, name, email, stamp]);

  return null;
}

// Starts null so the server render and first client render agree.
function useMinuteClock(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    let id: number;
    const tick = () => {
      setNow(new Date());
      id = window.setTimeout(tick, 60_000 - (Date.now() % 60_000));
    };
    id = window.setTimeout(tick, 60_000 - (Date.now() % 60_000));
    return () => window.clearTimeout(id);
  }, []);
  return now;
}

// 26/09/2569 18:49 — th-TH already counts years in พ.ศ.
function formatStamp(d: Date): string {
  const date = d.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date} ${time}`;
}

const TILE_W = 300;
const TILE_H = 190;

function layerStyle(tile: string, size: number): Record<string, string> {
  return {
    position: "fixed",
    inset: "0",
    "z-index": "2147483647",
    "pointer-events": "none",
    display: "block",
    visibility: "visible",
    opacity: "1",
    transform: "none",
    "background-image": `url("${tile}")`,
    "background-repeat": "repeat",
    "background-size": `${size}px ${(size * TILE_H) / TILE_W}px`,
    "print-color-adjust": "exact",
    "-webkit-print-color-adjust": "exact",
  };
}

// Drawn on a canvas rather than as SVG text: an SVG background image cannot use
// the page's web font, and Kanit is what makes the Thai name legible.
async function renderTile(lines: string[]): Promise<{ url: string; size: number }> {
  const family = getComputedStyle(document.documentElement).getPropertyValue("--font-kanit").trim() || "sans-serif";
  try {
    await document.fonts.load(`14px ${family}`, "กขค");
  } catch {
    // Falls back to the system Thai font; still readable.
  }
  const scale = Math.max(2, Math.ceil(window.devicePixelRatio || 1));
  const canvas = document.createElement("canvas");
  canvas.width = TILE_W * scale;
  canvas.height = TILE_H * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.translate(TILE_W / 2, TILE_H / 2);
  ctx.rotate((-25 * Math.PI) / 180);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(100, 116, 139, 0.16)";
  const fonts = [`500 14px ${family}`, `400 12px ${family}`, `400 11px ${family}`];
  const offsets = [-18, 0, 17];
  lines.forEach((text, i) => {
    ctx.font = fonts[i];
    ctx.fillText(text, 0, offsets[i]);
  });
  return { url: canvas.toDataURL("image/png"), size: TILE_W };
}
