export default function FooterCredit({ onPhoto = false }: { onPhoto?: boolean }) {
  return (
    <span className="flex flex-col items-center justify-center gap-x-2 gap-y-1 text-center sm:flex-row sm:flex-wrap">
      <span>© {new Date().getFullYear()} College of Computing, Khon Kaen University</span>
      <span aria-hidden="true" className="hidden sm:inline">·</span>
      <span>
        Powered by{" "}
        <a
          href="https://osp101.com/"
          target="_blank"
          rel="noopener noreferrer"
          className={`rounded-sm text-sm font-bold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 ${onPhoto ? "text-[#bae6fd]" : "text-[#0776bc] dark:text-[#7dd3fc]"}`}
        >
          ITII Development Team
        </a>
      </span>
    </span>
  );
}
