// ===== hotpet core helpers =====
const HOTPET = (() => {
  const CHANNEL = new BroadcastChannel('hotpet');

  // session code helpers
  function makeCode(len = 4) {
    const alpha = 'ABCDEFGHJKMNPQRSTUWXYZ23456789';
    let s = '';
    for (let i = 0; i < len; i++) s += alpha[Math.floor(Math.random() * alpha.length)];
    return s;
  }
  function getSession() {
    let code = localStorage.getItem('hotpet:code');
    if (!code) {
      code = makeCode();
      localStorage.setItem('hotpet:code', code);
    }
    return code;
  }
  function setSession(code) {
    localStorage.setItem('hotpet:code', code);
  }

  function send(type, payload = {}) {
    CHANNEL.postMessage({ type, payload, at: Date.now() });
  }
  function on(fn) {
    CHANNEL.addEventListener('message', (ev) => fn(ev.data));
  }

  return { getSession, setSession, send, on };
})();

// year footer
(function initYear () {
  var y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();
})();

// shortcuts on home
(function initShortcuts () {
  const isRoot = location.pathname.endsWith('/') || location.pathname.endsWith('/index.html');
  if (!isRoot) return;
  addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'k') location.href = './kiosk/';
    if (e.key.toLowerCase() === 'm') location.href = './mobile/';
  });
})();
