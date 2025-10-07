
  // ------- MOBILE SCRIPT (pets list, current view, QR, adaptive deep-links) -------

  // Env detection
  const HOST_IS_DEV = ['127.0.0.1', 'localhost'].includes(location.hostname);
  const HOST_IS_LIVE_SERVER = HOST_IS_DEV && location.port === '5500'; // VS Code Live Server default
  const SUPPORTS_PATH_ROUTING = !HOST_IS_LIVE_SERVER; // assume true on Netlify/Vercel; false on Live Server

  // Helpers
  const els = (id) => document.getElementById(id);

  // Sections & elements
  const home = els('home'), list = els('list'), view = els('view');
  const currentHint = els('currentHint');
  const petGrid = els('petGrid'), petStats = els('petStats'), character = els('character');
  const goView = els('goView'), goList = els('goList');
  const backFromList = els('backFromList'), backFromView = els('backFromView');
  const btnShowQR = els('btnShowQR'), qrWrap = els('qrWrap'), qrImg = els('qrImg');

  // State
  let PETS = [];
  let currentIndex = Number(localStorage.getItem('hotpet:idx') || 0);
  let pendingIndex = parseDeepLinkIndex(); // deep-link override if present

  // Build a deep link URL for a pet (1..6), using the right style for the current host
  function buildDeepLink(n) {
    const base = getBasePath(); // e.g. "" or "/hotpet"
    if (SUPPORTS_PATH_ROUTING) {
      return `${location.origin}${base}/mobile/demopet${n}`;
    }
    // Fallback for Live Server (no rewrites): use hash
    return `${location.origin}${base}/mobile/index.html#demopet${n}`;
  }

  // Determine the "project base" portion of the path (handles subfolder hosting)
  function getBasePath() {
    const path = location.pathname;
    const idx = path.toLowerCase().lastIndexOf('/mobile');
    return idx >= 0 ? path.slice(0, idx) : '';
  }

  // Deep link parser: supports
  //  - /mobile/demopet1..6            (requires rewrites; works on Netlify/Vercel)
  //  - /mobile/index.html#demopet1..6 (works everywhere, incl. Live Server)
  //  - /mobile/index.html?demopet=1..6
  function parseDeepLinkIndex () {
    const clamp = (n) => Math.max(0, Math.min(5, n - 1));

    // 1) Hash (#demopet3)
    const hash = (location.hash || '').toLowerCase();
    let m = hash.match(/demopet(\d+)/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n)) return clamp(n);
    }

    // 2) Query (?demopet=3)
    const q = new URLSearchParams(location.search);
    const qn = parseInt(q.get('demopet'), 10);
    if (Number.isFinite(qn)) return clamp(qn);

    // 3) Path (/mobile/demopet3)
    const path = (location.pathname || '').toLowerCase();
    m = path.match(/\/mobile\/demopet(\d+)\b/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n)) return clamp(n);
    }

    return null;
  }

  // View switcher
  function show(section) {
    home.hidden = section !== 'home';
    list.hidden = section !== 'list';
    view.hidden = section !== 'view';
  }

  function currentPet() { return PETS[currentIndex]; }

  function updateHomeHint() {
    const p = currentPet();
    const link1 = buildDeepLink(1);
    currentHint.innerHTML = p
      ? `Current: ${p[0]} — ${p[1]} (Discount ${p[3]}/5, ${p[4]} pts)<br><span class="muted">Tip: deep link example → <a class="link" href="${link1}">${link1}</a></span>`
      : 'No pet selected yet.';
  }

  // Load pets.json (placed at ../assets/pets.json)
  async function loadPets() {
    try {
      const res = await fetch('../assets/pets.json', { cache: 'no-store' });
      PETS = await res.json();
    } catch (e) {
      console.error('Failed to load pets.json', e);
      PETS = [];
    }
    renderList();

    if (pendingIndex != null && PETS[pendingIndex]) {
      currentIndex = pendingIndex;
      localStorage.setItem('hotpet:idx', String(currentIndex));
      openView(); // jump straight to View current pet
    } else {
      updateHomeHint(); // normal home landing
    }
  }

  // Render the selectable pet cards
  function renderList() {
    petGrid.innerHTML = '';
    PETS.forEach((p, i) => {
      // p = [UserName, PetName, PetSpriteSrc, DiscountLevel, CurrentPoints]
      const card = document.createElement('div');
      card.className = 'pet';
      const demoLink = buildDeepLink(i + 1);
      card.innerHTML = `
        <img src="${p[2]}" alt="${p[1]} sprite" />
        <div style="font-weight:700">${p[1]}</div>
        <div class="muted" style="font-size:14px">${p[0]}</div>
        <div class="muted" style="font-size:12px">Discount ${p[3]}/5 • ${p[4]} pts</div>
        <div class="muted" style="font-size:12px; word-break:break-all;">Deep link: <a class="link" href="${demoLink}">${demoLink}</a></div>
        <button class="btn" data-i="${i}">Use this</button>
      `;
      card.querySelector('button').addEventListener('click', () => {
        currentIndex = i;
        localStorage.setItem('hotpet:idx', String(i));
        updateHomeHint();
        openView();
      });
      petGrid.appendChild(card);
    });
  }

  // Open "View current pet" screen
  function openView() {
    const p = currentPet();
    if (!p) return;
    petStats.textContent = `${p[0]} • ${p[1]} • Discount ${p[3]}/5 • ${p[4]} pts`;
    character.style.backgroundImage = `url('${p[2]}')`;
    qrWrap.hidden = true; // hide QR until user taps "Show QR"
    show('view');
  }

  // Build QR payload for the selected pet
  function makePayloadFor(pet) {
    const obj = {
      v: 1,
      userName: pet[0],
      petName: pet[1],
      petSprite: pet[2],
      discountLevel: pet[3],
      currentPoints: pet[4]
    };
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
    return `HOTPETV1:${b64}`;
  }

  // Show QR (hosted image for now; can swap with offline generator later)
  function showQR() {
    const p = currentPet();
    if (!p) return;
    const payload = makePayloadFor(p);
    const url = `https://quickchart.io/qr?size=600&margin=12&text=${encodeURIComponent(payload)}`;
    qrImg.src = url;
    qrWrap.hidden = false;

    // Also broadcast so kiosk can react without camera (dev/testing)
    HOTPET.send('mobile:show_qr', { code: payload });
  }

  // Wire navigation
  goView.addEventListener('click', openView);
  goList.addEventListener('click', () => show('list'));
  backFromList.addEventListener('click', (e) => { e.preventDefault(); show('home'); });
  backFromView.addEventListener('click', (e) => { e.preventDefault(); show('home'); });
  btnShowQR.addEventListener('click', showQR);

  // Boot
  show('home');
  loadPets();
