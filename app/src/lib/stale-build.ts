// A new version of the site replaces every file the build names by its content: a tab opened before it still asks for
// the old ones, which are gone, so whatever it loads on demand (a letter, the font download, sharing, the video)
// fails. Vite reports each such failure as `vite:preloadError`; a worker started on demand fails to start. The page
// then reloads once, onto the new version (the tool's letter is in its address, so it comes back as it was).
// A second failure soon after is left to the page's own message (a real outage), so it can never loop; offline, the
// page never reloads (the library's offline copy keeps working).
const KEY = 'seedhand:reloaded-for-update';
const AGAIN_AFTER_MS = 60_000;

/** Reload onto the new version, unless that was just tried (or can't be remembered, or the device is offline).
 * True when the page is reloading. */
export function reloadForNewVersion(): boolean {
  if (navigator.onLine === false) return false;
  try {
    const last = Number(sessionStorage.getItem(KEY)) || 0;
    if (Date.now() - last < AGAIN_AFTER_MS) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // no way to remember the reload, so no way to stop a loop: leave it to the page
    return false;
  }
  location.reload();
  return true;
}

/** A worker's script that couldn't load (a plain error event, no message), as opposed to an error inside it. */
export const workerDidNotLoad = (e: Event) => !(e instanceof ErrorEvent) || !e.message;

export function reloadOnNewVersion() {
  window.addEventListener('vite:preloadError', (e) => {
    if (reloadForNewVersion()) e.preventDefault();
  });
}
