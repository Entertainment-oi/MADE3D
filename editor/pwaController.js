import { dom, setStatus } from './dom.js';

export function initPWA() {
  if (typeof window === 'undefined') return;

  const syncOfflineBanner = () => {
    if (!dom.pwaOfflineBanner) return;
    dom.pwaOfflineBanner.hidden = navigator.onLine !== false;
  };

  window.addEventListener('online', () => {
    syncOfflineBanner();
    setStatus('Conexión restablecida.');
  });
  window.addEventListener('offline', syncOfflineBanner);

  syncOfflineBanner();

  if ('serviceWorker' in navigator) {
    import('virtual:pwa-register')
      .then(({ registerSW }) => {
        registerSW({
          immediate: true,
          onOfflineReady() {
            setStatus('App lista para usarse sin conexión.');
          },
        });
      })
      .catch(() => {
        // Ignore if running outside Vite dev/build environment
      });
  }
}
