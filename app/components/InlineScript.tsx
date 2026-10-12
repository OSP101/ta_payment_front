"use client";

/**
 * A blocking inline <script> for <head>, from Next's "preventing flash
 * before hydration" guide (node_modules/next/dist/docs/01-app/02-guides/
 * preventing-flash-before-hydration.md). The nonce goes out with the server
 * HTML only: the browser hides a nonce from the DOM once the page has loaded,
 * so a client value can never match it and React reports a hydration error.
 * The type switch keeps React from warning that it rendered a <script>.
 */
export default function InlineScript({ html, nonce }: { html: string; nonce?: string }) {
  const server = typeof window === "undefined";
  return (
    <script
      type={server ? "text/javascript" : "text/plain"}
      nonce={server ? nonce : undefined}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
