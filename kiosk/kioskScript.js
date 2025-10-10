/* HotPet — Kiosk
   - Works with a local pets.json copy inside /kiosk (PETS_URL = "./pets.json")
   - Hydrates full pet data via { i } from QR
   - Renders: @username pill, name, type, level, XP bar/labels, quip, sprite
   - Press "Q" to simulate a scan (index 0)
*/

(function () {
  // =========================
  // Config
  // =========================
  const PETS_URL       = '../assets/pets.json'; // <= kiosk-local copy
  const LOADING_SEC    = 0.1;           // spinner duration before showing pet
  const PET_VIEW_SEC   = 20;            // auto-return to camera after N seconds

  // =========================
  // DOM
  // =========================
  const $id = (id) => document.getElementById(id);

  // Views
  const viewCam  = $id('view-camera');
  const viewLoad = $id('view-loading');
  const viewPet  = $id('view-pet');

  // Camera
  const video  = $id('video');
  const canvas = $id('canvas');

  // Pet view (MUST match your mobile block IDs)
  const petSprite = $id('petSprite');
  const petName   = $id('petName');
  const petType   = $id('petType');
  const levelNum  = $id('levelNum');
  const xpFill    = $id('xpFill');
  const xpNow     = $id('xpNow');
  const xpMax     = $id('xpMax');
  const petDesc   = $id('petDesc');

  // Username pill (header you added)
  const usernameEl = $id('username');

  // Optional simulate button (invisible)
  const btnSim = $id('btnSimulate');

  // =========================
  // State
  // =========================
  let stream = null;
  let rafId  = null;
  let backTimer = null;

  // =========================
  // Utils
  // =========================
  function show(el){ el?.classList.remove('hidden'); el?.classList.add('is-active'); }
  function hide(el){ el?.classList.add('hidden'); el?.classList.remove('is-active'); }
  function toInt(v, def=0){ const n = Number(v); return Number.isFinite(n) ? (n|0) : def; }

  function normalizeSpritePath(src){
    if (!src) return '';
    if (/^https?:/i.test(src)) return src; // already absolute
    // if JSON already points to ../assets/..., keep it
    if (/^\.\.\/assets\//.test(src)) return src;
    // otherwise make it relative to /kiosk/ → ../assets/...
    return '../assets/' + String(src).replace(/^\.?\/?assets\//,'');
  }

  // =========================
  // Camera + Scanner
  // =========================
  async function startCamera() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'environment' }
      });
      video.srcObject = stream;
      await video.play();
      startScanning();
    } catch (err) {
      console.error('[kiosk] camera error:', err);
      alert('QR detection not supported in this browser.');
    }
  }
  function stopCamera() {
    if (stream) {
      for (const t of stream.getTracks()) t.stop();
      stream = null;
    }
    if (video) video.srcObject = null;
  }

  function startScanning(){
    stopScanning();
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }); // perf hint

    const tick = () => {
      if (!stream || !video || video.readyState !== video.HAVE_ENOUGH_DATA) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      canvas.width  = video.videoWidth  || 640;
      canvas.height = video.videoHeight || 480;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imgData.data, imgData.width, imgData.height, {
        inversionAttempts: 'dontInvert'
      });

      if (code && code.data) {
        console.log(code)
        onScan(code.data);
        return; // stop loop until we switch back
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }
  function stopScanning(){
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  // =========================
  // Views
  // =========================
  function showCameraView(){
    stopScanning();
    hide(viewLoad); hide(viewPet);
    show(viewCam);
    startCamera();
  }
  function showLoading(){
    stopScanning();
    hide(viewCam); hide(viewPet);
    show(viewLoad);
  }
  function clearPetTimer() {
    if (backTimer) { clearTimeout(backTimer); backTimer = null; }
  }
  function showPetView(pet){
    hide(viewCam); hide(viewLoad);
    renderPet(pet);
    show(viewPet);
    clearPetTimer();
    backTimer = setTimeout(showCameraView, PET_VIEW_SEC * 1000);
  }

  // =========================
  // Data: pets.json + resolve
  // =========================
  async function loadPets() {
    try {
      const res = await fetch(PETS_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      console.error('[kiosk] pets.json failed, using fallback', e);
      // Fallback sample so UI still renders
      return [{
        UserName: 'Iza',
        PetName: 'Chub Shrimp',
        PetType: 'Chief Beef',
        PetSpriteSrc: '../assets/character/Chub1.png',
        DiscountLevel: 3,
        PointsTotal: 1200,
        MaxPointsNeedForNextLevel: 2000,
        Quips: 'Smokin’ sizzle unlocked! More dips, more drip.'
      }];
    }
  }

  function normPet(p){
    return {
      UserName: p.UserName ?? p.u ?? '',
      PetName:  p.PetName  ?? p.n ?? '',
      PetType:  p.PetType  ?? p.t ?? '',
      PetSpriteSrc: p.PetSpriteSrc ?? p.s ?? '',
      DiscountLevel: toInt(p.DiscountLevel ?? p.d ?? 0),
      PointsTotal: toInt(p.PointsTotal ?? p.p ?? 0),
      MaxPointsNeedForNextLevel: toInt(p.MaxPointsNeedForNextLevel ?? p.m ?? 1000),
      Quips: p.Quips ?? p.q ?? ''
    };
  }

// Helper: parse index from a variety of QR formats
function parseIndexFromQR(text){
  const raw = String(text || '').trim();
  // try JSON first
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object' && Number.isInteger(obj.i)) return obj.i;
  } catch {}
  // URI-encoded JSON?
  try {
    const obj2 = JSON.parse(decodeURIComponent(raw));
    if (obj2 && typeof obj2 === 'object' && Number.isInteger(obj2.i)) return obj2.i;
  } catch {}
  // plain "7"
  const mNum = raw.match(/^\d+$/);
  if (mNum) return parseInt(mNum[0], 10);
  // "i=7" (with spaces allowed)
  const mI = raw.match(/^[iI]\s*=\s*(\d+)$/);
  if (mI) return parseInt(mI[1], 10);
  return null;
}

// REPLACE your resolvePayload with this:
async function resolvePayload(text){
  console.groupCollapsed('[kiosk] resolvePayload(index-only)');
  console.log('QR raw:', text);

  const idx = parseIndexFromQR(text);
  console.log('parsed index:', idx);

  if (!Number.isInteger(idx) || idx < 0) {
    console.warn('No valid index in QR payload.');
    console.groupEnd();
    return null;
  }

  const list = await loadPets();
  console.log('pets count:', Array.isArray(list) ? list.length : 0);

  const rec = Array.isArray(list) ? list[idx] : null;
  if (!rec) {
    console.warn('Index out of range for pets.json:', idx);
    console.groupEnd();
    return null;
  }

  // Take the dataset record AS SOURCE OF TRUTH
  const pet = normPet(rec);

  // Ensure sprite path resolves from /kiosk/
  pet.PetSpriteSrc = normalizeSpritePath(pet.PetSpriteSrc);

  console.log('resolved pet (final):', pet);
  console.groupEnd();
  return pet;
}


  // =========================
  // Render
  // =========================
function renderPet(p){
  try {
    // sprite
    if (petSprite) {
      petSprite.src = p.PetSpriteSrc || '';
      petSprite.alt = p.PetName || 'Pet';
    }

    // username pill
    if (usernameEl) usernameEl.textContent = p.UserName ? `@${p.UserName}` : '@player';

    // text fields (optional blocks)
    if (petName)  petName.textContent = p.PetName || '';
    if (petType)  petType.textContent = p.PetType || '';
    if (levelNum) levelNum.textContent = String(p.DiscountLevel ?? 0);

    // XP (only if the bar exists in DOM)
    if (xpFill || xpNow || xpMax) {
      const max = Math.max(1, toInt(p.MaxPointsNeedForNextLevel, 1000));
      const now = Math.max(0, toInt(p.PointsTotal, 0));
      const pct = Math.min(100, (now / max) * 100);

      if (xpFill) xpFill.style.width = pct.toFixed(1) + '%';
      if (xpNow)  xpNow.textContent  = String(now);
      if (xpMax)  xpMax.textContent  = String(max);
    }

    // quip
    if (petDesc) petDesc.textContent = p.Quips || '';
  } catch (e) {
    console.error('[kiosk] render error', e);
  }
}


  // =========================
  // Scan handling
  // =========================
  async function onScan(data){
    try {
      stopCamera();
      stopScanning();
      showLoading();
      const pet = await resolvePayload(data);
      console.log("log");
      console.log(pet);
      if (!pet) throw new Error('Bad QR payload');
      setTimeout(() => showPetView(pet), LOADING_SEC * 1000);
    } catch (e) {
      console.error('[kiosk] scan error', e);
      alert('Could not read QR — try again.');
      showCameraView();
    }
  }

  // =========================
  // Simulate
  // =========================
  function simulateScan(){
    const sample = JSON.stringify({ i: 0 }); // demo index 0
    onScan(sample);
  }

  // =========================
  // Events + Init
  // =========================
  btnSim?.addEventListener('click', simulateScan);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'q' || e.key === 'Q') simulateScan();
  });

  // Go
  showCameraView();
})();
