/* HotPet — Kiosk logic
   Flow:
   - Default: Camera view ON, Character view OFF
   - On QR scan: Character view ON, Camera OFF, start countdown
   - Reset via countdown or button returns to Camera view
*/

(function () {
  const {
    $, show, hide, swap, startCamera, stopCamera
  } = window.HotPet;

  // Elements
  const viewCam   = $('#view-camera');
  const viewChar  = $('#view-character');

  const video     = $('#video');
  const canvas    = $('#canvas');
  const statusEl  = $('#kioskStatus');
  const cdEl      = $('#countdown');

  const imgEl     = $('#petImage');
  const nameEl    = $('#petName');
  const ownerEl   = $('#ownerName');
  const discEl    = $('#discountLevel');

  const btnToggle = $('#btnToggleCam');
  const btnSim    = $('#btnSimulate');
  const btnReset  = $('#btnReset');
  const btnExtend = $('#btnExtend');

  // State
  const DEFAULT_SHOW_SECONDS = 20;
  let remaining   = DEFAULT_SHOW_SECONDS;
  let countdownId = null;

  let stream      = null;
  let facingMode  = 'environment';
  let rafId       = null;

  // Utils
  function setStatus(text){ statusEl.textContent = text; }

  function startCountdown() {
    clearInterval(countdownId);
    remaining = DEFAULT_SHOW_SECONDS;
    cdEl.textContent = remaining;
    countdownId = setInterval(() => {
      remaining--;
      cdEl.textContent = remaining;
      if (remaining <= 0) {
        resetToCamera();
      }
    }, 1000);
  }

  function extendCountdown(sec = 10) {
    remaining += sec;
    cdEl.textContent = remaining;
  }

  function setCharacterView(data) {
    imgEl.src = data.petSpriteSrc;
    nameEl.textContent = data.petName;
    ownerEl.textContent = data.userName;
    discEl.textContent = data.discountLevel ?? 0;
  }

  function handleScanResult(text) {
    // Parse JSON payload if available; fallback: synthesize from plain text
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = {
        userName: 'Guest',
        petName: String(text).slice(0, 24),
        petSpriteSrc: 'https://picsum.photos/seed/' + encodeURIComponent(text) + '/480/480',
        discountLevel: 1
      };
    }

    // Show character view
    stopScanning();
    if (stream) { stopCamera(stream); stream = null; }
    setCharacterView(payload);
    swap(viewChar, viewCam);
    setStatus('QR detected');
    startCountdown();
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

      // Draw frame to canvas
      canvas.width  = video.videoWidth  || 640;
      canvas.height = video.videoHeight || 360;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Decode QR from pixel buffer
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, canvas.width, canvas.height, {
        inversionAttempts: 'attemptBoth'
      });

      if (code && code.data) {
        handleScanResult(code.data);
        return; // stop loop by not requesting next frame
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

  function resetToCamera() {
    clearInterval(countdownId);
    stopScanning();
    if (stream) { stopCamera(stream); stream = null; }
    hide(viewChar);
    show(viewCam);
    showCamera();
  }

  // --- Event bindings ---
  btnToggle.addEventListener('click', async () => {
    facingMode = (facingMode === 'environment') ? 'user' : 'environment';
    stopScanning();
    if (stream) { stopCamera(stream); stream = null; }
    await showCamera();
  });

  btnSim.addEventListener('click', () => {
    const demo = {
      userName: 'DemoUser',
      petName: 'Spark',
      petSpriteSrc: 'https://picsum.photos/seed/hotpet/480/480',
      discountLevel: 3
    };
    handleScanResult(JSON.stringify(demo));
  });

  btnReset.addEventListener('click', resetToCamera);
  btnExtend.addEventListener('click', () => extendCountdown(10));

  // --- Boot ---
  // Default: camera view visible, character view hidden
  show(viewCam);
  hide(viewChar);
  showCamera();
})();
