"use client";

/**
 * A4-proportioned viewport for an embedded PDF.
 *
 * Every PDF this system displays is A4 portrait — the creditor form is
 * generated at 595.28 × 841.89 pt (internal/pdfgen/creditor.go), and the
 * documents TAs upload are scans of A4 paper. A fixed height, whether in pixels
 * (`h-[720px]`) or viewport units (`h-[62vh]`), is therefore always shorter
 * than the page actually is at any usable width: the form never fit, and the
 * reader had to scroll inside the viewer to see fields that belong to the same
 * glance — the exact thing a preview exists to avoid.
 *
 * Height follows width at the A4 ratio instead, so the page renders whole at
 * every screen size and the only scrolling left belongs to the page itself.
 *
 * Trade-off worth knowing: on a wide container the frame gets tall (width ×
 * 1.414). That is the point — the whole document is reachable by scrolling the
 * page, which readers do naturally, rather than by scrolling a nested viewer,
 * which they often don't notice at all.
 */
export default function PdfFrame({
  src,
  title,
  className = "",
}: {
  src: string;
  title: string;
  className?: string;
}) {
  // `view=Fit` fits the whole page, not just its width (`FitH`), which is what
  // makes the A4 box show one complete page. The toolbar and side panel are
  // turned off because their chrome is drawn inside the frame and would push
  // the page back out of view — reintroducing the scrollbar we just removed.
  //
  // Any fragment already on the URL is dropped: two `#` sections would leave
  // the viewer reading the first one and ignoring these directives.
  const viewerSrc = `${src.split("#")[0]}#toolbar=0&navpanes=0&view=Fit`;

  return (
    <iframe
      src={viewerSrc}
      title={title}
      className={`block aspect-[210/297] w-full bg-slate-50 ${className}`}
    />
  );
}
