/* HotPet — Mobile script (theme + backgrounds + QR toggle)
   - Default page background: peach radial
   - Scenic background when chosen: full-page image (auto picks portrait/landscape)
   - Buttons/menus follow the dark mobile theme
   - XP label sits inside the bar on the right
   - Sprite <-> QR toggle with compact payload
   - Deep-links: /mobile/demopet1..6 or ?demo=N
   - Default pet: index 0 (Iza) if none chosen
*/
(function(){
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }

  function init(){
    const H = window.HotPet || {};
    const $  = H.$  || ((s, c=document)=>c.querySelector(s));
    const $$ = H.$$ || ((s, c=document)=>Array.from(c.querySelectorAll(s)));
    const swap = H.swap || ((showEl, ...hideEls)=>{ showEl?.classList.add('is-active'); hideEls.forEach(e=>e?.classList.remove('is-active')); });

    // Views
    const VIEWS = {
      home:        $('#view-home'),
      current:     $('#view-current'),
      list:        $('#view-list'),
      backgrounds: $('#view-backgrounds')
    };
    const modeNote = $('#modeNote');

    // UI refs
    const handleBadge = $('#handleBadge');
    const spriteImg   = $('#curPetImg');
    const petNameEl   = $('#curPetName');
    const petTypeEl   = $('#curPetType');
    const levelChip   = $('#levelChip');
    const xpFill      = $('#xpFill');
    const xpLabel     = $('#xpLabel');
    const quipEl      = $('#curQuip');

    // Buttons
    const btnShowCurrent  = $('#btnShowCurrent');
    const btnListPets     = $('#btnListPets');
    const btnBackgrounds  = $('#btnBackgrounds');
    const btnBackHome1    = $('#btnBackHome1');
    const btnBackHome2    = $('#btnBackHome2');
    const btnBackHome3    = $('#btnBackHome3');
    const btnToggleQR     = $('#btnToggleQR');

    // Background assets
    const BG_PORTRAIT  = '../assets/backgrounds/BG_1024x1536.png';
    const BG_LANDSCAPE = '../assets/backgrounds/BG_1536x1024.png';

    // State
    let currentPet = {
      UserName: 'Guest',
      PetName: 'Spark',
      PetType: 'Default',
      PetSpriteSrc: 'https://picsum.photos/seed/hotpet/512/512',
      DiscountLevel: 1,
      PointsTotal: 0,
      MaxPointsNeedForNextLevel: 100,
      Quips: ''
    };
    let currentIndex = null;
    let showingQR = false;
    let originalSpriteSrc = '';
    // bgMode: 'default' (peach radial) or 'scenic'
    let bgMode = 'default';

    // ---------- Backgrounds ----------
    function isPortrait(){
      return window.matchMedia('(orientation: portrait)').matches;
    }
    function applyPageBackground(){
      if (bgMode === 'default'){
        document.body.dataset.bg = 'default';
        document.body.style.backgroundImage = ''; // rely on CSS peach radial
      } else {
        document.body.dataset.bg = 'scenic';
        const src = isPortrait() ? BG_PORTRAIT : BG_LANDSCAPE;
        document.body.style.backgroundImage = `url("${src}")`;
      }
    }
    window.addEventListener('resize', ()=>{ if (bgMode === 'scenic') applyPageBackground(); });
    window.addEventListener('orientationchange', ()=>{ if (bgMode === 'scenic') applyPageBackground(); });

    // ---------- Rendering ----------
    function routeTo(name){
      swap(VIEWS[name], ...Object.values(VIEWS).filter(v => v !== VIEWS[name]));
      if (modeNote) modeNote.textContent = name[0].toUpperCase() + name.slice(1);
    }

    function setCurrentPet(p, idx=null){
      const n = {
        UserName: p?.UserName ?? p?.userName ?? 'Guest',
        PetName: p?.PetName ?? p?.petName ?? 'Pet',
        PetType: p?.PetType ?? p?.petType ?? 'Default',
        PetSpriteSrc: p?.PetSpriteSrc ?? p?.petSpriteSrc ?? '',
        DiscountLevel: Number(p?.DiscountLevel ?? p?.discountLevel ?? 0),
        PointsTotal: Number(p?.PointsTotal ?? p?.Points ?? p?.points ?? 0),
        MaxPointsNeedForNextLevel: Number(p?.MaxPointsNeedForNextLevel ?? p?.max ?? 100),
        Quips: p?.Quips ?? ''
      };
      currentPet = n;
      currentIndex = (typeof idx === 'number') ? idx : currentIndex;

      handleBadge && (handleBadge.textContent = '@' + n.UserName);
      if (!showingQR && spriteImg) spriteImg.src = n.PetSpriteSrc;

      petNameEl && (petNameEl.textContent = n.PetName);
      petTypeEl && (petTypeEl.textContent = n.PetType);
      levelChip && (levelChip.textContent = 'Lv. ' + n.DiscountLevel);

      const max = Math.max(1, n.MaxPointsNeedForNextLevel);
      const ratio = Math.max(0, Math.min(1, n.PointsTotal / max));
      xpFill && (xpFill.style.width = (ratio * 100).toFixed(1) + '%');
      xpLabel && (xpLabel.textContent = `${n.PointsTotal} / ${max}`);
      quipEl && (quipEl.textContent = n.Quips || '');
    }

    function onShowCurrent(){
      setCurrentPet(currentPet);
      routeTo('current');
    }

    // ---------- Sprite <-> QR toggle ----------
    function makeQRCodeDataURL(text, size=300){
      return new Promise((resolve, reject)=>{
        if (typeof window.QRCode !== 'function') return reject(new Error('QRCode lib missing'));
        const tmp = document.createElement('div');
        tmp.style.position = 'fixed';
        tmp.style.left = '-9999px';
        tmp.style.top = '-9999px';
        document.body.appendChild(tmp);
        try {
          // eslint-disable-next-line no-undef
          new QRCode(tmp, { text, width: size, height: size, correctLevel: QRCode.CorrectLevel.L });
          setTimeout(()=>{
            const c = tmp.querySelector('canvas');
            const i = tmp.querySelector('img');
            document.body.removeChild(tmp);
            if (c && c.toDataURL) return resolve(c.toDataURL('image/png'));
            if (i && i.src) return resolve(i.src);
            reject(new Error('QR render produced no canvas/img'));
          }, 0);
        } catch (e){
          document.body.removeChild(tmp);
          reject(e);
        }
      });
    }

    async function generateQRDataURL(){
      const p = currentPet;
      const tries = [
        {u:p.UserName,n:p.PetName,t:p.PetType,s:p.PetSpriteSrc,d:p.DiscountLevel,p:p.PointsTotal,m:p.MaxPointsNeedForNextLevel,q:p.Quips},
        {u:p.UserName,n:p.PetName,t:p.PetType,d:p.DiscountLevel,p:p.PointsTotal,m:p.MaxPointsNeedForNextLevel},
        {n:p.PetName,d:p.DiscountLevel,p:p.PointsTotal}
      ];
      if (typeof currentIndex === 'number' && currentIndex >= 0) tries.push({i: currentIndex});
      for (const obj of tries){
        try { return await makeQRCodeDataURL(JSON.stringify(obj), 300); }
        catch(_){ /* try next */ }
      }
      throw new Error('All QR payload attempts failed');
    }

    async function toggleSpriteQR(){
      if (!spriteImg || !btnToggleQR) return;
      if (!showingQR){
        originalSpriteSrc = spriteImg.src;
        btnToggleQR.disabled = true;
        try {
          const dataURL = await generateQRDataURL();
          spriteImg.src = dataURL;
          showingQR = true;
          btnToggleQR.textContent = 'Show Pet';
        } catch(e){ console.error('[HotPet] QR error:', e); }
        finally { btnToggleQR.disabled = false; }
      } else {
        spriteImg.src = originalSpriteSrc || currentPet.PetSpriteSrc;
        showingQR = false;
        btnToggleQR.textContent = 'Show QR';
      }
    }

    // ---------- Lists / Backgrounds ----------
    async function onListPets(){
      const pets = await (H.fetchJSON ? H.fetchJSON('../assets/pets.json', []) : fetch('../assets/pets.json').then(r=>r.json()).catch(()=>[]));
      const list = $('#petList'); if (!list) return;
      list.innerHTML = '';
      pets.forEach((p, idx)=>{
        const item = document.createElement('div');
        item.className = 'list__item';
        item.innerHTML = `
          <img class="list__thumb" src="${p.PetSpriteSrc}" alt=""/>
          <div style="flex:1;">
            <div><strong>${p.PetName}</strong> <span class="muted small">@${p.UserName}</span></div>
            <div class="small muted">Type: ${p.PetType ?? 'Default'}</div>
          </div>
          <button class="btn">Set as current</button>
        `;
        item.querySelector('button').addEventListener('click', ()=>{
          setCurrentPet(p, idx);
          if (showingQR){ showingQR = false; btnToggleQR && (btnToggleQR.textContent = 'Show QR'); }
          spriteImg && (spriteImg.src = p.PetSpriteSrc);
          routeTo('current');
        });
        list.appendChild(item);
      });
      routeTo('list');
    }

    function onBackgrounds(){
      const list = $('#bgList'); if (!list) return;
      list.innerHTML = '';

      const options = [
        { key: 'default', label: 'Default (Peach Radial)' },
        { key: 'scenic',  label: 'Scenic Path (Auto fit)' }
      ];

      options.forEach(opt=>{
        const thumb = (opt.key === 'default')
          ? 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56"><defs><radialGradient id="g" cx="50%" cy="20%" r="80%"><stop offset="0%" stop-color="%23ffe0c8"/><stop offset="50%" stop-color="%23ffd1b6"/><stop offset="100%" stop-color="%23ffc5a6"/></radialGradient></defs><rect width="56" height="56" fill="url(%23g)"/></svg>'
          : (isPortrait() ? BG_PORTRAIT : BG_LANDSCAPE);

        const item = document.createElement('div');
        item.className = 'list__item';
        item.innerHTML = `
          <img class="list__thumb" src="${thumb}" alt="${opt.label}"/>
          <div style="flex:1;">
            <div><strong>${opt.label}</strong></div>
            <div class="small muted">${opt.key==='scenic'?'Centered • Cover • No repeat':'Peach radial gradient'}</div>
          </div>
          <button class="btn">Use</button>
        `;
        item.querySelector('button').addEventListener('click', ()=>{
          bgMode = opt.key;
          applyPageBackground();
        });
        list.appendChild(item);
      });

      routeTo('backgrounds');
    }

    // ---------- Deep-links ----------
    function applyDemoPetFromPath(){
      const path = (location.pathname || '').toLowerCase();
      const hash = (location.hash || '').toLowerCase();
      const search = (location.search || '').toLowerCase();
      const find = (s) => (s && s.match(/demopet(\d+)/)) || null;
      let m = find(path) || find(hash);
      if (!m){
        const q = new URLSearchParams(search);
        const demo = q.get('demo');
        if (demo && /^\d+$/.test(demo)) m = [null, demo];
      }
      if (!m) return false;

      const idx = Math.max(1, parseInt(m[1],10)) - 1;
      (H.fetchJSON ? H.fetchJSON('../assets/pets.json', []) : fetch('../assets/pets.json').then(r=>r.json()).catch(()=>[]))
      .then(pets=>{
        if (!pets.length) return;
        const p = pets[idx % pets.length];
        if (!p) return;
        setCurrentPet(p, idx);
        routeTo('current');
      });
      return true;
    }

    async function preloadDefaultPetIfNeeded(){
      if (typeof currentIndex === 'number') return;
      const pets = await (H.fetchJSON ? H.fetchJSON('../assets/pets.json', []) : fetch('../assets/pets.json').then(r=>r.json()).catch(()=>[]));
      if (!pets.length) return;
      setCurrentPet(pets[0], 0); // Iza
    }

    // ---------- Wire ----------
    btnShowCurrent && btnShowCurrent.addEventListener('click', onShowCurrent);
    btnListPets    && btnListPets.addEventListener('click', onListPets);
    btnBackgrounds && btnBackgrounds.addEventListener('click', onBackgrounds);
    btnBackHome1   && btnBackHome1.addEventListener('click', ()=>routeTo('home'));
    btnBackHome2   && btnBackHome2.addEventListener('click', ()=>routeTo('home'));
    btnBackHome3   && btnBackHome3.addEventListener('click', ()=>routeTo('home'));
    btnToggleQR    && btnToggleQR.addEventListener('click', toggleSpriteQR);

    // ---------- Boot ----------
    applyPageBackground();                // start with default peach radial
    const linked = applyDemoPetFromPath();
    if (!linked) preloadDefaultPetIfNeeded();
    routeTo('home');
  }
})();
