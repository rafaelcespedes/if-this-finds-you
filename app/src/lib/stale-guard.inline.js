// Inlined as the first script of every page (vite.config.ts staleGuard), before the page's own files are asked for.
// A new version of the site can arrive half-way: the page is from one version and its files from another, already
// gone (a deploy moved on in between). Then the page reloads once, onto the new version; if a reload in the last
// minute already tried, it says so instead of staying an empty sheet. lib/stale-build.ts does the same for files
// loaded later, with the same guard. Plain old JavaScript: it runs before anything else, in any browser.
(function () {
  var KEY = 'seedhand:reloaded-for-update';
  var seen = false;
  function say() {
    if (document.getElementById('site-updated')) return;
    var box = document.createElement('div');
    box.id = 'site-updated';
    box.setAttribute('role', 'alert');
    box.style.cssText = 'position:fixed;left:50%;bottom:max(24px,env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:2147483647;' +
      'max-width:calc(100vw - 32px);box-sizing:border-box;display:flex;flex-wrap:wrap;align-items:center;gap:12px 16px;padding:14px 16px;' +
      'background:#faf7f1;color:#1e1a16;border:1px solid #c9bfae;box-shadow:0 10px 30px -10px rgba(20,15,5,.35);' +
      'font:15px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif';
    var p = document.createElement('p');
    p.style.margin = '0';
    p.textContent = 'The site was just updated. Reload to get the new version.';
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = 'Reload';
    b.style.cssText = 'font:inherit;font-weight:600;padding:8px 14px;background:#1e1a16;color:#faf7f1;border:0;cursor:pointer';
    b.onclick = function () { location.reload(); };
    box.appendChild(p);
    box.appendChild(b);
    document.body.appendChild(box);
  }
  function failed(e) {
    var t = e && e.target;
    if (seen || !t || (t.tagName !== 'SCRIPT' && t.tagName !== 'LINK')) return;
    if ((t.src || t.href || '').indexOf('/assets/') === -1) return;
    seen = true;
    if (navigator.onLine === false) return;
    try {
      var last = Number(sessionStorage.getItem(KEY)) || 0;
      if (Date.now() - last > 60000) {
        sessionStorage.setItem(KEY, String(Date.now()));
        location.reload();
        return;
      }
    } catch (x) { /* no way to remember a reload: say so instead */ }
    if (document.body) say();
    else document.addEventListener('DOMContentLoaded', say);
  }
  // a file that doesn't load says so on its own element; the window hears it on the way down
  window.addEventListener('error', failed, true);
})();
