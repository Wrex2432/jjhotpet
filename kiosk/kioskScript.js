/* HotPet — Kiosk logic (2025)
   - Default: Camera view ON
   - On QR scan: Character view ON (camera OFF), countdown to reset
   - Page background: scenic BG_1024x1536 by default (full page)
   - Character card mirrors Mobile (no QR toggle)
   - Accepts compact payload {u,n,t,s,d,p,m,q} or full keys
   - Supports tiny {i:index} -> looks up assets/pets.json
*/
(function () {
  const {
    $, show, hide, swap, startCamera, stopCamera, fetchJSON
  } = window.HotPet;

  // ----- Page background (scenic by default) -----
  (function setDefaultBg(){
    document.body.style.backgroundImage = 'url("../assets/backgrounds/BG_1024x1536.png")';
    document.body.style.backgroundRepeat = 'no-repeat';
    document.body.style.backgroundPosition = 'center center';
    document.body.style.backgroundSize = 'cover';
  })();

  // ----- Elements -----
  const viewCam   = $('#view-camera');
  const viewChar  = $('#view-character');

  const video     = $('#video');
  const canvas    = $('#canvas');
  const statusEl  = $('#kioskStatus');
  const cdEl      = $('#countdown');

  // Character UI
  const handleBadge = $('#handleBadge');
  const imgEl     = $('#petImage');
  const nameEl    = $('#petName');
  const typeEl    = $('#petType');
  const levelEl   = $('#levelChip');
  const xpFill    = $('#xpFill');
  const xpLabel   = $('#xpLabel');
  const quipEl    = $('#petQuip');

  // Controls
  const btnToggle = $('#btnToggleCam');
  const btnSim    = $('#btnSimulate');
  const btnReset  = $('#btnReset');
  const btnExtend = $('#btnExtend');

  // ----- State -----
  const DEFAULT_SHOW_SECONDS = 20;
  let remaining   = DEFAULT_SHOW_SECONDS;
  let countdownId = null;

  let stream      = null;
  let facingMode  = 'environment';
  let rafId       = null;

  let currentIndex = null; // set if QR sends {i:index}

  // ----- Helpers -----
  function setStatus(text){ statusEl.textContent = text; }

  function startCountdown() {
    clearInterval(countdownId);
    remaining = DEFAULT_SHOW_SECONDS;
    cdEl.textContent = remaining;
    countdownId = setInterval(() => {
      remaining--;
      cdEl.textContent = remaining;
      if (remaining <= 0) { resetToCamera(); }
    }, 1000);
  }

  function extendCountdown(sec = 10) {
    remaining += sec;
    cdEl.textContent = remaining;
  }

  function normPet(p){
    // Accepts full keys OR compact QR keys
    const u = p.UserName ?? p.u ?? p.userName ?? 'Guest';
    const n = p.PetName  ?? p.n ?? p.petName  ?? 'Pet';
    const t = p.PetType  ?? p.t ?? p.petType  ?? 'Default';
    const s = p.PetSpriteSrc ?? p.s ?? p.petSpriteSrc ?? '';
    const d = Number(p.DiscountLevel ?? p.d ?? p.discountLevel ?? 0);
    const pt= Number(p.PointsTotal   ?? p.p ?? p.Points ?? p.points ?? 0);
    const m = Number(p.MaxPointsNeedForNextLevel ?? p.m ?? p.max ?? 100);
    const q = p.Quips ?? p.q ?? '';

    return { UserName:u, PetName:n, PetType:t, PetSpriteSrc:s, DiscountLevel:d, PointsTotal:pt, MaxPointsNeedForNextLevel:m, Quips:q };
  }

  function renderCharacter(pet){
    handleBadge.textContent = '@' + pet.UserName;
    imgEl.src   = pet.PetSpriteSrc || '';
    nameEl.textContent = pet.PetName;
    typeEl.textContent = pet.PetType;
    levelEl.textContent = 'Lv. ' + pet.DiscountLevel;

    const max = Math.max(1, pet.MaxPointsNeedForNextLevel);
    const ratio = Math.max(0, Math.min(1, pet.PointsTotal / max));
    xpFill.style.width = (ratio * 100).toFixed(1) + '%';
    xpLabel.textContent = `${pet.PointsTotal} / ${max}`;

    quipEl.textContent = pet.Quips || '';
  }

async function resolvePayload(text){
  // Try to parse JSON
  let raw = null;
  try { raw = JSON.parse(text); } catch { /* not JSON */ }

  // If QR isn't JSON, synthesize something light so UI still renders
  if (!raw) {
    const txt = String(text || '');
    return normPet({
      UserName: 'Guest',
      PetName: txt.slice(0, 24) || 'Pet',
      PetSpriteSrc: '', // we'll try to fill from pets.json below
      DiscountLevel: 1,
      PointsTotal: 0,
      MaxPointsNeedForNextLevel: 100,
      Quips: ''
    });
  }

  // Normalize fields (accept compact or full keys)
  let pet = normPet(raw);

  // Try to capture the tiny index if provided
  const idx = (raw && Number.isInteger(raw.i)) ? raw.i : null;

  // If sprite is missing, try to resolve from pets.json
  if (!pet.PetSpriteSrc) {
    const pets = await fetchJSON('../assets/pets.json', []);
    let match = null;

    // 1) Index lookup
    if (idx !== null && pets[idx]) match = pets[idx];

    // 2) User+Name or Name-only match
    if (!match && pets.length) {
      match = pets.find(p =>
        (pet.UserName && p.UserName === pet.UserName && p.PetName === pet.PetName) ||
        (p.PetName === pet.PetName)
      );
    }

    if (match) {
      const m = normPet(match);
      pet.PetSpriteSrc = m.PetSpriteSrc || pet.PetSpriteSrc;
      // Fill any other missing fields from the canonical record
      if (!pet.PetType) pet.PetType = m.PetType;
      if (!pet.Quips) pet.Quips = m.Quips;
      if (!pet.MaxPointsNeedForNextLevel) pet.MaxPointsNeedForNextLevel = m.MaxPointsNeedForNextLevel;
    }
  }

  // Normalize relative asset paths so they work from /kiosk/
  if (pet.PetSpriteSrc && !/^https?:\/\//i.test(pet.PetSpriteSrc)) {
    // If it already starts with '../', leave as is; otherwise map assets/ -> ../assets/
    if (!pet.PetSpriteSrc.startsWith('../')) {
      pet.PetSpriteSrc = pet.PetSpriteSrc.replace(/^(\.\/)?assets\//, '../assets/');
      // If path is like 'character/Chub1.png', prefix with ../assets/
      if (!pet.PetSpriteSrc.startsWith('../')) {
        pet.PetSpriteSrc = '../assets/' + pet.PetSpriteSrc.replace(/^\.?\//, '');
      }
    }
  }

  return pet;
}


  function stopScanning() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  function startScanning() {
    stopScanning();
    const ctx = canvas.getContext('2d');

    const tick = () => {
      if (!stream || !video || video.readyState !== video.HAVE_ENOUGH_DATA) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      canvas.width  = video.videoWidth  || 640;
      canvas.height = video.videoHeight || 360;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, canvas.width, canvas.height, { inversionAttempts: 'attemptBoth' });

      if (code && code.data) {
        handleScanResult(code.data);
        return; // stop loop
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
  }

  async function showCamera() {
    try {
      setStatus('Starting camera…');
      stream = await startCamera(video, facingMode);
      setStatus('Scanner ready');
      startScanning();
    } catch (e) {
      console.error(e);
      setStatus('Camera failed: ' + (e && e.message ? e.message : String(e)));
    }
  }

  async function handleScanResult(text) {
    const pet = await resolvePayload(text);

    // Switch to character view
    stopScanning();
    if (stream) { stopCamera(stream); stream = null; }
    renderCharacter(pet);
    swap(viewChar, viewCam);
    setStatus('QR detected');
    startCountdown();
  }

  function resetToCamera() {
    clearInterval(countdownId);
    stopScanning();
    if (stream) { stopCamera(stream); stream = null; }
    hide(viewChar);
    show(viewCam);
    showCamera();
  }

  // ----- Events -----
  btnToggle.addEventListener('click', async () => {
    facingMode = (facingMode === 'environment') ? 'user' : 'environment';
    stopScanning();
    if (stream) { stopCamera(stream); stream = null; }
    await showCamera();
  });

  btnSim.addEventListener('click', () => {
    // Demo payload using compact keys
    const demo = {u:'Iza', n:'Chub Shrimp', t:'Chief Beef', s:'../assets/character/Chub1.png', d:3, p:1200, m:2000, q:'Smokin’ sizzle unlocked! More dips, more drip.'};
    handleScanResult(JSON.stringify(demo));
  });

  btnReset.addEventListener('click', resetToCamera);
  btnExtend.addEventListener('click', () => extendCountdown(10));

  // ----- Boot -----
  // Default: camera view visible, character view hidden
  show(viewCam);
  hide(viewChar);
  showCamera();
})();
