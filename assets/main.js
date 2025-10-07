/* =========================
   HotPet — Core JS (2025)
   - DOM helpers
   - Fetch helpers
   - View toggling
   - Simple router (hash)
   - Optional camera helpers (used by kiosk later)
   ========================= */

(function () {
  // ---------- DOM ----------
  const $  = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  // Event helper (with optional delegation)
  function on(el, type, selectorOrHandler, maybeHandler) {
    if (!el) return;
    if (typeof selectorOrHandler === 'function') {
      el.addEventListener(type, selectorOrHandler);
      return;
    }
    const selector = selectorOrHandler;
    const handler  = maybeHandler;
    el.addEventListener(type, (e) => {
      const target = e.target.closest(selector);
      if (target && el.contains(target)) handler(e, target);
    });
  }

  // View toggling
  function show(el) { el?.classList.add('is-active'); }
  function hide(el) { el?.classList.remove('is-active'); }
  function swap(toShow, ...toHide) { show(toShow); toHide.forEach(hide); }

  // ---------- Utils ----------
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  function getQuery() {
    const p = new URLSearchParams(location.search);
    return Object.fromEntries(p.entries());
  }
  async function fetchJSON(url, fallback = []) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      console.warn('fetchJSON fallback for', url, e);
      return fallback;
    }
  }

  // Tiny hash router
  function onRoute(handler) {
    window.addEventListener('hashchange', handler);
    handler();
  }

  // ---------- Optional: Camera helpers (kiosk can call these) ----------
  async function startCamera(videoEl, facingMode = 'environment') {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode },
      audio: false
    });
    videoEl.srcObject = stream;
    return stream;
  }

  function stopCamera(stream) {
    if (!stream) return;
    stream.getTracks().forEach(t => t.stop());
  }

  // ---------- Expose on window for other pages to reuse ----------
  window.HotPet = {
    $, $$, on, show, hide, swap,
    sleep, getQuery, fetchJSON, onRoute,
    startCamera, stopCamera,
  };
})();
