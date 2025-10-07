/* HotPet — Mobile logic
   Home -> (Current Pet | Pet List | Backgrounds)
   - Current Pet: QR hidden by default
   - "Show QR" hides pet card and shows only the QR view
   - Deep links: /mobile/demopet1..6 set current pet
*/

(function(){
  const {
    $, $$, show, hide, swap, fetchJSON
  } = window.HotPet;

  const VIEWS = {
    home:        $('#view-home'),
    current:     $('#view-current'),
    list:        $('#view-list'),
    backgrounds: $('#view-backgrounds')
  };

  const modeNote = $('#modeNote');

  // Current pet elements
  const petCard   = $('#petCard');
  const qrOnly    = $('#qrOnly');
  const qrBox     = $('#qr');

  // Buttons
  $('#btnShowCurrent').addEventListener('click', onShowCurrent);
  $('#btnListPets').addEventListener('click', onListPets);
  $('#btnBackgrounds').addEventListener('click', onBackgrounds);

  $('#btnBackHome1').addEventListener('click', () => routeTo('home'));
  $('#btnBackHome1b').addEventListener('click', () => routeTo('home'));
  $('#btnBackHome2').addEventListener('click', () => routeTo('home'));
  $('#btnBackHome3').addEventListener('click', () => routeTo('home'));

  $('#btnToggleQR').addEventListener('click', () => {
    buildQR();
    hide(petCard);
    show(qrOnly);
  });
  $('#btnHideQR').addEventListener('click', () => {
    hide(qrOnly);
    show(petCard);
  });

  // State
  let currentPet = {
    userName: 'Guest',
    petName: 'Spark',
    petSpriteSrc: 'https://picsum.photos/seed/hotpet/300/300',
    discountLevel: 1
  };

  function routeTo(name){
    swap(VIEWS[name], ...Object.values(VIEWS).filter(v => v !== VIEWS[name]));
    modeNote.textContent = name[0].toUpperCase() + name.slice(1);
  }

  function setCurrentPet(p){
    currentPet = p;
    $('#curPetImg').src = p.petSpriteSrc;
    $('#curPetName').textContent = p.petName;
    $('#curOwner').textContent = p.userName;
    $('#curDisc').textContent = p.discountLevel ?? 0;
  }

  function buildQR(){
    qrBox.innerHTML = '';
    const payload = JSON.stringify(currentPet);
    new QRCode(qrBox, { text: payload, width: 280, height: 280 });
  }

  function onShowCurrent(){
    setCurrentPet(currentPet);
    // Ensure QR is hidden by default
    hide(qrOnly);
    show(petCard);
    routeTo('current');
  }

  async function onListPets(){
    const pets = await fetchJSON('../assets/pets.json', []);
    const list = $('#petList');
    list.innerHTML = '';

    pets.forEach(p => {
      const item = document.createElement('div');
      item.className = 'list__item';
      item.innerHTML = `
        <img class="list__thumb" src="${p.PetSpriteSrc}" alt=""/>
        <div style="flex:1;">
          <div><strong>${p.PetName}</strong> <span class="muted small">by ${p.UserName}</span></div>
          <div class="small muted">Discount: ${p.DiscountLevel}</div>
        </div>
        <button class="btn">Set as current</button>
      `;
      item.querySelector('button').addEventListener('click', () => {
        setCurrentPet({
          userName: p.UserName,
          petName: p.PetName,
          petSpriteSrc: p.PetSpriteSrc,
          discountLevel: p.DiscountLevel
        });
        routeTo('current');
      });
      list.appendChild(item);
    });

    routeTo('list');
  }

  async function onBackgrounds(){
    // Fallback list in case index.json not present
    const bgs = await fetchJSON('../assets/backgrounds/index.json', ['bg1.jpg','bg2.jpg','bg3.jpg']);
    const list = $('#bgList');
    list.innerHTML = '';

    bgs.forEach(file => {
      const url = '../assets/backgrounds/' + file;
      const item = document.createElement('div');
      item.className = 'list__item';
      item.innerHTML = `
        <img class="list__thumb" src="${url}" alt="bg"/>
        <div style="flex:1;">
          <div><strong>${file}</strong></div>
          <div class="small muted">Tap to use as page background</div>
        </div>
        <button class="btn">Use</button>
      `;
      item.querySelector('button').addEventListener('click', ()=>{
        document.body.style.backgroundImage = 'url('+url+')';
        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundPosition = 'center';
      });
      list.appendChild(item);
    });

    routeTo('backgrounds');
  }

  // Deep links like /mobile/demopet1..6
  function applyDemoPetFromPath(){
    const path = location.pathname.toLowerCase();
    const m = path.match(/demopet(\d+)/);
    if (!m) return;
    const idx = parseInt(m[1],10) - 1;

    fetchJSON('../assets/pets.json', []).then(pets => {
      if (!pets.length) return;
      const p = pets[idx % pets.length];
      if (!p) return;
      setCurrentPet({
        userName: p.UserName,
        petName: p.PetName,
        petSpriteSrc: p.PetSpriteSrc,
        discountLevel: p.DiscountLevel
      });
      routeTo('current');
    });
  }

  // Boot
  applyDemoPetFromPath();
  routeTo('home');
})();
