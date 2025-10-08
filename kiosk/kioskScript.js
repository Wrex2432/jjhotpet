/* HotPet — Kiosk (cam → loading → pet; simulate via hidden button or 'Q')
   - Uses the SAME IDs as the mobile pet block:
     #petSprite, #petName, #petType, #levelNum, #xpFill, #xpNow, #xpMax, #petDesc
   - Accepts QR payloads:
       • Full keys: UserName, PetName, PetType, PetSpriteSrc, DiscountLevel, PointsTotal, MaxPointsNeedForNextLevel, Quips
       • Compact:   {u,n,t,s,d,p,m,q}
       • Index:     {i} or "i=3" or "3" → resolves from ../assets/pets.json
*/

(function () {
  // ---------- Config ----------
  const LOADING_SECONDS = 0.2;   // spinner duration
  const PET_SECONDS     = 25;    // time to show pet view before auto-reset
  const PETS_PATH       = '../assets/pets.json';

  // ---------- DOM ----------
  const $ = (s) => document.querySelector(s);
  const usernameEl = document.querySelector('#username');

  // Views
  const viewCam  = $('#view-camera');
  const viewLoad = $('#view-loading');
  const viewPet  = $('#view-pet');

  // Camera
  const video  = $('#video');
  const canvas = $('#canvas');

  // Pet view (MUST match mobile IDs)
  const imgEl    = $('#petSprite');
  const nameEl   = $('#petName');
  const typeEl   = $('#petType');
  const levelEl  = $('#levelNum');
  const xpFill   = $('#xpFill');
  const xpNowEl  = $('#xpNow');
  const xpMaxEl  = $('#xpMax');
  const quipEl   = $('#petDesc');

  // Simulate button (invisible)
  const btnSim   = $('#btnSimulate');

  // ---------- State ----------
  let stream = null;
  let rafId  = null;
  let backTimer = null;

  // ---------- Small utils ----------
  const show = (el) => { el?.classList.remove('hidden'); el?.classList.add('is-active'); };
  const hide = (el) => { el?.classList.add('hidden'); el?.classList.remove('is-active'); };



  function toInt(n, def=0){ n = Number(n); return Number.isFinite(n) ? n|0 : def; }

  // ---------- Camera ----------
  async function startCamera() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'environment' }
      });
      stream = s;
      video.srcObject = s;
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

  // ---------- Views ----------
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
    backTimer = setTimeout(showCameraView, PET_SECONDS * 1000);
  }

  // ---------- Data ----------
  async function loadPets() {
    try {
      const res = await fetch(PETS_PATH, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      console.error('[kiosk] pets.json failed, using fallback', e);
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
  function normTxt(s){
  return String(s||'')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,'')   // strip spaces/punct
    .trim();
}
function fileBase(s){
  return String(s||'').split('/').pop().toLowerCase();
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
  async function resolvePayload(text){
    let raw = null;

    // JSON? → parse
    try { raw = JSON.parse(text); } catch {}

    // not JSON? accept "3" or "i=3"
    if (!raw) {
      const plain = String(text).trim();
      const mNum = plain.match(/^\d+$/);
      const mI   = plain.match(/^[iI]\s*=\s*(\d+)$/);
      if (mNum) raw = { i: parseInt(mNum[0], 10) };
      else if (mI) raw = { i: parseInt(mI[1], 10) };
    }
    if (!raw) return null;

    let pet = normPet(raw);
    const idx = Number.isInteger(raw.i) ? raw.i : null;

    // If we only have partial data or index → hydrate from dataset
    // If we only have partial data or index → hydrate from dataset
if (!pet.PetSpriteSrc || idx !== null) {
  const list = await loadPets();
  let match = null;

  // 1) direct index
  if (idx !== null && list[idx]) match = list[idx];

  if (!match && list.length) {
    const wantName  = normTxt(pet.PetName);
    const wantUser  = normTxt(pet.UserName);
    const wantBase  = fileBase(pet.PetSpriteSrc);

    // 2) strong match by (UserName + PetName)
    match = list.find(x => normTxt(x.UserName) === wantUser && normTxt(x.PetName) === wantName) || null;

    // 3) match by PetName only (normalized)
    if (!match && wantName) {
      match = list.find(x => normTxt(x.PetName) === wantName) || null;
    }

    // 4) match by sprite filename (basename only)
    if (!match && wantBase) {
      match = list.find(x => fileBase(x.PetSpriteSrc) === wantBase) || null;
    }

    // 5) soft fallback: startsWith on name (lets "chonk" hit "chub" if they share prefix)
    if (!match && wantName) {
      match = list.find(x => normTxt(x.PetName).startsWith(wantName) || wantName.startsWith(normTxt(x.PetName))) || null;
    }
  }

  if (match) {
    const m = normPet(match);
    pet = { ...m, ...pet, PetSpriteSrc: pet.PetSpriteSrc || m.PetSpriteSrc };
  }
}


    // Make sprite URL absolute-ish relative to kiosk
    if (pet.PetSpriteSrc && !/^https?:/i.test(pet.PetSpriteSrc)) {
      if (!pet.PetSpriteSrc.startsWith('../')) {
        pet.PetSpriteSrc = '../assets/' + pet.PetSpriteSrc.replace(/^\.?\/?assets\//, '');
      }
    }
    return pet;
  }

  // ---------- Render (IDs match mobile) ----------
function renderPet(p){
  try {
    imgEl.src = p.PetSpriteSrc || '';
    imgEl.alt = p.PetName || 'Pet';

    // NEW: username pill
    if (usernameEl) usernameEl.textContent = p.UserName ? `@${p.UserName}` : '@player';

    nameEl.textContent  = p.PetName || '';
    typeEl.textContent  = p.PetType || '';
    levelEl.textContent = String(p.DiscountLevel ?? 0);

    const max = Math.max(1, toInt(p.MaxPointsNeedForNextLevel, 1000));
    const now = Math.max(0, toInt(p.PointsTotal, 0));
    const pct = Math.min(100, (now / max) * 100);
    xpFill.style.width = pct.toFixed(1) + '%';
    xpNowEl.textContent = String(now);
    xpMaxEl.textContent = String(max);

    quipEl.textContent = p.Quips || '';
  } catch (e) {
    console.error('[kiosk] render error', e);
  }
}


  // ---------- Scanning (jsQR) ----------
  function startScanning(){
    stopScanning();
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const tick = () => {
      if (!stream || !video || video.readyState !== video.HAVE_ENOUGH_DATA) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imgData.data, imgData.width, imgData.height, { inversionAttempts: 'dontInvert' });
      if (code?.data) {
        onScan(code.data);
        return;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }
  function stopScanning(){
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  async function onScan(data){
    try {
      stopCamera();
      stopScanning();
      showLoading();
      const pet = await resolvePayload(data);
      if (!pet) throw new Error('Bad QR payload');
      setTimeout(() => showPetView(pet), LOADING_SECONDS * 1000);
    } catch (e) {
      console.error('[kiosk] scan error', e);
      alert('Could not read QR — try again.');
      showCameraView();
    }
  }

  // ---------- Simulate ----------
  async function simulateScan(){
    const sample = JSON.stringify({ i: 0 }); // demo index 0
    onScan(sample);
  }

  // ---------- Events ----------
  btnSim?.addEventListener('click', simulateScan);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'q' || e.key === 'Q') simulateScan();
  });

  // ---------- Init ----------
  showCameraView();
})();
