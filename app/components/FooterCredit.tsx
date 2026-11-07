export default function FooterCredit({ onPhoto = false }: { onPhoto?: boolean }) {
  return (
    <span
      className={`flex leading-relaxed ${onPhoto ? "flex-row items-center gap-x-2 whitespace-nowrap text-left text-[clamp(8px,0.7vw,12px)] text-white" : "flex-col items-center justify-center gap-x-3 gap-y-1 text-center text-xs sm:flex-row sm:flex-wrap"}`}
    >
      <span>© {new Date().getFullYear()} College of Computing, Khon Kaen University</span>
      <span aria-hidden="true" className={onPhoto ? "" : "hidden opacity-40 sm:inline"}>·</span>
      <DeveloperCredit onPhoto={onPhoto} />
    </span>
  );
}

/** Shared developer attribution for app and manual footers. */
export function DeveloperCredit({ onPhoto = false }: { onPhoto?: boolean }) {
  return (
    <span className={onPhoto ? "text-white" : "text-[11px] text-muted"}>
      Powered by{" "}
      <a
        href="https://osp101.com/"
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-block rounded-sm font-medium underline-offset-4 transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 ${onPhoto ? "text-white" : "text-muted hover:text-foreground"}`}
      >
        ITII Development Team
      </a>
    </span>
  );
}
