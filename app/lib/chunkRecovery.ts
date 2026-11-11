/** Shared by the early inline handler and React's error boundary. */
export function reloadAfterChunkFailure(): boolean {
  try {
    const key = "ta-payment:chunk-reload-at";
    const now = Date.now();
    const previous = Number(window.sessionStorage.getItem(key));
    if (previous && now - previous < 120_000) return false;
    window.sessionStorage.setItem(key, String(now));
    window.location.reload();
    return true;
  } catch {
    // Without storage, keep a manual fallback rather than risk a reload loop.
    return false;
  }
}

export function isChunkFailure(message: string): boolean {
  return /ChunkLoadError|Failed to load chunk|Loading (?:CSS )?chunk \S+ failed|(?:Failed to fetch|error loading) dynamically imported module|Importing a module script failed/i.test(message);
}

// Inline so a missing bundle cannot prevent recovery before hydration.
export function buildChunkRecoveryScript(): string {
  return String.raw`(() => {
    var reloadOnce = ${reloadAfterChunkFailure.toString()};
    var isChunkFailure = ${isChunkFailure.toString()};
    var shown = false;
    function show() {
      if (shown || !document.body) return;
      shown = true;
      var english = document.documentElement.lang === 'en';
      var bar = document.createElement('div');
      bar.setAttribute('role', 'alert');
      bar.style.cssText = 'position:fixed;z-index:2147483000;bottom:16px;left:16px;right:16px;max-width:560px;margin:auto;padding:16px;border-radius:12px;background:#0f172a;color:#fff;font:14px/1.5 system-ui;box-shadow:0 4px 24px #0006;display:flex;gap:16px;align-items:center';
      var text = document.createElement('span');
      text.textContent = english ? 'This page could not load completely. Please reload.' : 'โหลดหน้าเว็บไม่ครบ กรุณาโหลดใหม่อีกครั้ง';
      var button = document.createElement('button');
      button.type = 'button';
      button.textContent = english ? 'Reload' : 'โหลดใหม่';
      button.style.cssText = 'cursor:pointer;padding:8px 16px;border:0;border-radius:8px;background:#fff;color:#0f172a;white-space:nowrap';
      button.onclick = function () { window.location.reload(); };
      bar.appendChild(text);
      bar.appendChild(button);
      document.body.appendChild(bar);
    }
    function recover() {
      if (reloadOnce()) return;
      if (document.body) show();
      else document.addEventListener('DOMContentLoaded', show, { once: true });
    }
    window.addEventListener('unhandledrejection', function (event) {
      var reason = event.reason;
      if (isChunkFailure(reason && reason.message ? reason.message : String(reason))) recover();
    });
    window.addEventListener('error', function (event) {
      var element = event.target;
      if (element && /^(SCRIPT|LINK)$/.test(element.tagName || '') && String(element.src || element.href || '').indexOf('/_next/static/') !== -1) recover();
      else if (isChunkFailure(event.message || '')) recover();
    }, true);
  })();`;
}
