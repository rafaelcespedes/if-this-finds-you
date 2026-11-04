// The library opens again without a connection once it has been opened with one (public/letters-sw.js). In the build
// only: the dev server's files change under it. Its scope is the library's address alone, so the tool is never in it.

export function keepForOffline() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const base = import.meta.env.BASE_URL;
  // after the page has loaded: the worker's own first fetches never compete with the letters'
  addEventListener('load', () => {
    // with site data blocked (Firefox), even reading navigator.serviceWorker throws: the library then just isn't kept
    // for offline, and nothing else changes
    let sw: ServiceWorkerContainer;
    try {
      sw = navigator.serviceWorker;
      if (!sw) return;
    } catch {
      return;
    }
    sw
      .register(`${base}letters-sw.js`, { scope: `${base}letters` })
      .then(() => sw.ready)
      .then((reg) => {
        // what this visit loaded before the worker was looking (the letters, the chunks, the faces): keep those too
        const keep = performance.getEntriesByType('resource').map((e) => e.name);
        reg.active?.postMessage({ keep });
      })
      .catch(() => {});
  }, { once: true });
}
