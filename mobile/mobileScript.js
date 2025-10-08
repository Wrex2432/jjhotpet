/* mobileScript.js — HotPet Mobile (3-mode, pastel visuals)
   - Modes: Home, Current Pet, List, Backgrounds
   - Data shape (from pets.json):
     UserName, PetName, PetType, PetSpriteSrc, DiscountLevel, PointsTotal, MaxPointsNeedForNextLevel, Quips
   - Deep links: /mobile/demopetN (any N), ?demo=N, ?i=N
   - QR: centered; compact payload with fallback to {i} to avoid size overflow
*/

(function () {
  // ---------- DOM ----------
  const $  = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const viewHome = $('#viewHome');
  const viewPet  = $('#viewCurrentPet');
  const viewList = $('#viewList');
  const viewBG   = $('#viewBackgrounds');

  // header (user pill) — visible only in pet view
  const headerEl   = document.querySelector('.m-header');
  const usernameEl = $('#username');

  // home
  const btnCurrentPet   = $('#btnCurrentPet');
  const btnListPets     = $('#btnListPets');
  const btnBackgrounds  = $('#btnBackgrounds');

  // pet view
  const petSpriteEl = $('#petSprite');
  const petNameEl   = $('#petName');
  const petTypeEl   = $('#petType');
  const levelNumEl  = $('#levelNum');
  const xpNowEl     = $('#xpNow');
  const xpMaxEl     = $('#xpMax');
  const xpFillEl    = $('#xpFill');
  const petDescEl   = $('#petDesc');
  const btnBackHome1 = $('#btnBackHome1');

  // QR
  const btnToggleQR = $('#btnToggleQR');
  const qrHolder    = $('#qrHolder');

  // list & backgrounds
  const petsGrid     = $('#petsGrid');
  const btnBackHome2 = $('#btnBackHome2');
  const btnBackHome3 = $('#btnBackHome3');
  const bgButtons    = $$('.bg-card');

  // ---------- STATE ----------
  let pets = [];              // from ../assets/pets.json
  let currentIndex = 0;       // defaults to 0 (Iza)
  let qrVisible = false;

  // ---------- UTIL ----------
  const show = (el) => el?.classList.remove('hidden');
  const hide = (el) => el?.classList.add('hidden');

  function setView(which) {
    [viewHome, viewPet, viewList, viewBG].forEach(hide);
    switch (which) {
      case 'home': show(viewHome);  hide(headerEl); break;
      case 'pet':  show(viewPet);   show(headerEl); break;
      case 'list': show(viewList);  hide(headerEl); break;
      case 'bg':   show(viewBG);    hide(headerEl); break;
    }
  }

  function parseQuery() {
    const q = new URLSearchParams(location.search);
    const i = q.get('i') ?? q.get('demo');
    return { index: i != null ? Math.max(0, parseInt(i, 10) || 0) : null };
  }

  function parsePathDemo() {
    // Accept any demopetN (no upper limit)
    const m = location.pathname.match(/demopet(\d+)/i);
    return m ? Math.max(0, parseInt(m[1], 10) || 0) : null;
  }

  function pickInitialIndex() {
    // default → Iza (0)
    const fromPath = parsePathDemo();
    if (fromPath != null) return fromPath;
    const { index } = parseQuery();
    if (index != null) return index;
    return 0;
  }

  // ---------- QR payload (COMPACT + FALLBACK) ----------
  // Compact keys used by kiosk: { u, n, t, d, p, m, q, s? }
  // We intentionally omit 's' (sprite URL) if it's long; kiosk will resolve from pets.json.
  function compactPayloadFromPet(p) {
    const payload = {
      u: p.UserName ?? 'Guest',
      n: p.PetName ?? 'Pet',
      t: p.PetType ?? 'Default',
      d: Number(p.DiscountLevel ?? 0),
      p: Number(p.PointsTotal ?? 0),
      m: Number(p.MaxPointsNeedForNextLevel ?? 1000),
      q: p.Quips ?? ''
    };
    const sprite = p.PetSpriteSrc || '';
    // Only include s if it's a short/relative path (keeps QR tiny)
    if (sprite && !/^https?:/i.test(sprite) && sprite.length <= 80) {
      payload.s = sprite;
    }
    return payload;
  }

function textForQR() {
  // Always include a tiny payload the kiosk can resolve:
  //   { i } is enough to rebuild everything from pets.json.
  // Add very short hints (u, n) only if they keep it tiny.
  const pet = pets[currentIndex];
  const base = { i: currentIndex };

  if (pet) {
    const hint = {
      u: (pet.UserName || '').slice(0, 20),
      n: (pet.PetName  || '').slice(0, 24)
    };
    const withHints = JSON.stringify({ ...base, ...hint });
    // Stay safely under older qrcode.js limits (~1.5KB). We keep it < 120 bytes.
    if (withHints.length <= 120) return withHints;
  }

  return JSON.stringify(base);
}


  function ensureQRCode() {
    if (!window.QRCode) return;
    qrHolder.innerHTML = '';

    const text = textForQR();
    new QRCode(qrHolder, {
      text: textForQR(),
      width: 220,
      height: 220,
      correctLevel: QRCode.CorrectLevel.L // lowest ECC → highest capacity
    });

  }

  function toggleQR() {
    qrVisible = !qrVisible;
    btnToggleQR?.setAttribute('aria-pressed', String(qrVisible));
    if (qrVisible) {
      hide(petSpriteEl);
      show(qrHolder);
      ensureQRCode(); // generate for currentIndex/current pet
    } else {
      show(petSpriteEl);
      hide(qrHolder);
      qrHolder.innerHTML = '';
    }
  }

  function applyBackground(mode) {
    const key = 'hotpet-mobile-bg-mode';
    if (mode) localStorage.setItem(key, mode);
    const saved = localStorage.getItem(key) || 'gradient';

    if (saved === 'portrait') {
      document.body.style.background = `center/cover no-repeat url("../assets/backgrounds/BG_1024x1536.png")`;
    } else if (saved === 'landscape') {
      document.body.style.background = `center/cover no-repeat url("../assets/backgrounds/BG_1536x1024.png")`;
    } else {
      document.body.style.background = `radial-gradient(circle, rgba(240,210,155,1) 0%, rgba(235,156,140,1) 100%)`;
      document.body.style.backgroundSize = 'cover';
      document.body.style.backgroundRepeat = 'no-repeat';
      document.body.style.backgroundPosition = 'center';
    }
  }

  function renderPet(i) {
    const pet = pets[i];
    if (!pet) return;
    currentIndex = i;

    // Header pill (only shown in Pet view)
    if (usernameEl) {
      const uname = pet.UserName || 'user';
      usernameEl.textContent = `@${uname}`;
    }

    // Sprite
    if (petSpriteEl) {
      petSpriteEl.src = pet.PetSpriteSrc || '';
      petSpriteEl.alt = pet.PetName || 'Pet';
    }

    // Text
    if (petNameEl) petNameEl.textContent = pet.PetName || 'Pet';
    if (petTypeEl) petTypeEl.textContent = pet.PetType || '';

    // Level = DiscountLevel
    if (levelNumEl) levelNumEl.textContent = String(pet.DiscountLevel ?? 0);

    // XP bar → PointsTotal / MaxPointsNeedForNextLevel
    const ptsNow = Number(pet.PointsTotal ?? 0);
    const ptsMax = Math.max(1, Number(pet.MaxPointsNeedForNextLevel ?? 1000));
    if (xpNowEl) xpNowEl.textContent = String(ptsNow);
    if (xpMaxEl) xpMaxEl.textContent = String(ptsMax);
    if (xpFillEl) {
      const pct = Math.max(0, Math.min(100, (ptsNow / ptsMax) * 100));
      xpFillEl.style.width = `${pct}%`;
    }

    // Quip
    if (petDescEl) {
      petDescEl.textContent = pet.Quips || 'Hmmm… looking bland? Boil your way to a spicy level-up!';
    }

    // If QR visible, regenerate to match this pet
    if (qrVisible) {
      ensureQRCode();
      hide(petSpriteEl);
      show(qrHolder);
    }
  }

  function buildPetsGrid() {
    if (!petsGrid) return;
    petsGrid.innerHTML = '';

    pets.forEach((p, idx) => {
      const card = document.createElement('button');
      card.className = 'pet-card-mini';
      card.type = 'button';
      card.setAttribute('data-index', String(idx));

      const img = document.createElement('img');
      img.src = p.PetSpriteSrc || '';
      img.alt = p.PetName || `Pet ${idx + 1}`;

      card.appendChild(img);
      card.addEventListener('click', () => {
        renderPet(idx);
        setView('pet');
      });

      petsGrid.appendChild(card);
    });
  }

  async function loadPets() {
    const defaultPath = '../assets/pets.json';
    try {
      let path = defaultPath;
      if (window.HotPet && typeof window.HotPet.getPetsPath === 'function') {
        path = window.HotPet.getPetsPath();
      }
      const res = await fetch(path, { cache: 'no-store' });
      if (!res.ok) throw new Error('failed to load pets.json');
      const data = await res.json();

      // Expecting plain array; fallback supports { pets: [...] }
      pets = Array.isArray(data) ? data : (data?.pets || []);
    } catch (err) {
      console.error('[mobile] pets.json load error:', err);
      // Fallback demo list (Iza only) so UI stays functional
      pets = [{
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

  // ---------- EVENTS ----------
  function wireEvents() {
    // Mode buttons
    btnCurrentPet?.addEventListener('click', () => setView('pet'));
    btnListPets?.addEventListener('click', () => { buildPetsGrid(); setView('list'); });
    btnBackgrounds?.addEventListener('click', () => setView('bg'));

    // Back buttons
    btnBackHome1?.addEventListener('click', () => setView('home'));
    btnBackHome2?.addEventListener('click', () => setView('home'));
    btnBackHome3?.addEventListener('click', () => setView('home'));

    // QR toggle
    btnToggleQR?.addEventListener('click', toggleQR);

    // Background choices
    bgButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-bg') || 'gradient';
        applyBackground(mode);
      });
    });

    // Keep scenic backgrounds sized on orientation change
    window.addEventListener('orientationchange', () => {
      const saved = localStorage.getItem('hotpet-mobile-bg-mode');
      if (saved === 'portrait' || saved === 'landscape') applyBackground(saved);
    });
  }

  // ---------- INIT ----------
  async function init() {
    hide(headerEl);                // hidden by default (Home/List/BG)
    applyBackground();             // default radial / saved scenic
    await loadPets();

    // pick starting index (supports any demopetN)
    currentIndex = pickInitialIndex();
    currentIndex = Math.max(0, Math.min(currentIndex, pets.length - 1));
    renderPet(currentIndex);

    // If deep-linked → go straight to pet view, else stay on home
    const fromPath = parsePathDemo();
    const { index } = parseQuery();
    if (fromPath != null || index != null) setView('pet');
    else setView('home');

    wireEvents();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
