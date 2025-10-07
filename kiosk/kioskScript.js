
    // ===== ENV & deep link helper (for demo links) =====
    const HOST_IS_DEV = ['127.0.0.1', 'localhost'].includes(location.hostname);
    const HOST_IS_LIVE_SERVER = HOST_IS_DEV && location.port === '5500';
    const SUPPORTS_PATH_ROUTING = !HOST_IS_LIVE_SERVER;

    function getBasePath() {
      const path = location.pathname;
      const idx = path.toLowerCase().lastIndexOf('/kiosk');
      return idx >= 0 ? path.slice(0, idx) : '';
    }
    function buildMobileDeepLink(n) {
      const base = getBasePath();
      if (SUPPORTS_PATH_ROUTING) return `${location.origin}${base}/mobile/demopet${n}`;
      return `${location.origin}${base}/mobile/index.html#demopet${n}`;
    }
    (function renderDemoLinks(){
      const wrap = document.getElementById('demoLinks');
      const frag = document.createDocumentFragment();
      for (let i=1;i<=6;i++){
        const a = document.createElement('a');
        a.className = 'link';
        a.href = buildMobileDeepLink(i);
        a.textContent = `demopet${i}`;
        a.target = '_blank';
        frag.appendChild(a);
      }
      wrap.appendChild(frag);
    })();

    // ===== DOM refs =====
    const elScan = document.getElementById('scan');
    const elActive = document.getElementById('active');
    const elCam = document.getElementById('cam');
    const elStatus = document.getElementById('scanStatus');
    const elScanBadge = document.getElementById('scanBadge');
    const elPairLabel = document.getElementById('pairLabel');
    const elCountdown = document.getElementById('countdown');
    const elBigChar = document.getElementById('bigChar');
    const btnStart = document.getElementById('btnStart');
    const btnReset = document.getElementById('btnReset');
    const btnSim = document.getElementById('btnSim');
    const btnFlip = document.getElementById('btnFlip');
    const statsBox = document.querySelector('.stats');
    const qrCanvas = document.getElementById('qrCanvas');
    const qctx = qrCanvas.getContext('2d', { willReadFrequently: true });

    // ===== Runtime =====
    const SESSION_SECONDS = 20;              // seconds to show character before auto-reset
    let stream = null, detector = null, rafId = null, countdownId = null, jsqrId = null;
    let usingUserCam = false;                // false = environment (rear), true = user (front)
    let scanning = false;
    let useJsQR = false;

    // ===== State handling =====
    function goDefault() {
      // default = camera visible, character hidden, scanning OFF
      setStateScanningCard(true);
      setStateActiveCard(false);
      stopDetector();
      stopJsqrLoop();
      stopCountdown();
      elScanBadge.textContent = 'Idle';
      elStatus.textContent = 'Camera ready. Press “Start Scan”.';
    }

    function setStateScanningCard(visible) { elScan.hidden = !visible; }
    function setStateActiveCard(visible) { elActive.hidden = !visible; }

    function onValidScan(data) {
      // hide camera, show character
      setStateScanningCard(false);
      setStateActiveCard(true);
      stopDetector();
      stopJsqrLoop();
      bindActiveView(data);
      startCountdown();
      HOTPET.send('kiosk:paired', { code: data.code || data.petName || '' });
    }

    // ===== Camera =====
    async function startCamera () {
      stopCamera();
      const constraints = {
        video: { facingMode: usingUserCam ? 'user' : 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      };
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      elCam.srcObject = stream;
    }

    function stopCamera () {
      if (rafId) cancelAnimationFrame(rafId);
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
        stream = null;
      }
    }

    // ===== QR detection: BarcodeDetector (preferred) =====
    function startScanLoop() {
      useJsQR = !('BarcodeDetector' in window);
      if (useJsQR) {
        elStatus.textContent = 'Using jsQR decoder…';
        elScanBadge.textContent = 'Scanning…';
        startJsqrLoop();
        return;
      }

      detector = new BarcodeDetector({ formats: ['qr_code'] });
      elScanBadge.textContent = 'Scanning…';
      elStatus.textContent = 'Looking for QR…';
      scanning = true;

      const loop = async () => {
        try {
          if (!scanning) return;
          if (!elCam.videoWidth) { rafId = requestAnimationFrame(loop); return; }
          const codes = await detector.detect(elCam);
          if (codes && codes.length) {
            const raw = (codes[0].rawValue || '').trim();
            const data = parsePayload(raw);
            if (data) { scanning = false; onValidScan(data); return; }
          }
          rafId = requestAnimationFrame(loop);
        } catch (e) {
          console.warn('Detector error:', e);
          // fallback to jsQR if BD errors
          useJsQR = true;
          startJsqrLoop();
        }
      };
      scanning = true;
      rafId = requestAnimationFrame(loop);
    }

    function stopDetector () {
      scanning = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      detector = null;
      elScanBadge.textContent = 'Idle';
    }

    // ===== QR detection: jsQR fallback =====
    function startJsqrLoop() {
      stopJsqrLoop();
      scanning = true;
      elScanBadge.textContent = 'Scanning…';
      // choose a working size for canvas sampling
      const vw = elCam.videoWidth || 1280;
      const vh = elCam.videoHeight || 720;
      const targetW = 640;                   // downscale for speed
      const targetH = Math.round(vh * (targetW / vw));
      qrCanvas.width = targetW;
      qrCanvas.height = targetH;

      const step = () => {
        if (!scanning) return;
        try {
          if (elCam.readyState >= 2) {
            qctx.drawImage(elCam, 0, 0, targetW, targetH);
            const img = qctx.getImageData(0, 0, targetW, targetH);
            const result = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
            if (result && result.data) {
              const data = parsePayload(result.data.trim());
              if (data) { scanning = false; onValidScan(data); return; }
            }
          }
        } catch (e) {
          // keep trying
        }
        jsqrId = requestAnimationFrame(step);
      };
      jsqrId = requestAnimationFrame(step);
    }
    function stopJsqrLoop() {
      if (jsqrId) cancelAnimationFrame(jsqrId);
      jsqrId = null;
      scanning = false;
    }

    // ===== Payload parsing & view binding =====
    // Accept HOTPETV1:<base64json> (preferred), fallback: A–Z0–9 (4–8)
    function parsePayload (raw) {
      const m = raw.match(/^HOTPETV1[:\- ]?([A-Za-z0-9+/=]+)$/);
      if (m) {
        try {
          const json = decodeURIComponent(escape(atob(m[1])));
          const obj = JSON.parse(json);
          if (obj && obj.v === 1) return obj; // {userName, petName, petSprite, discountLevel, currentPoints}
        } catch {}
      }
      const m2 = raw.match(/^[A-Z0-9]{4,8}$/i);
      if (m2) return { v: 0, code: m2[0].toUpperCase() };
      return null;
    }

    function bindActiveView (data) {
      const title = data.code ? data.code : `${data.userName || 'Guest'} — ${data.petName || 'Pet'}`;
      document.getElementById('pairLabel').textContent = title;

      if (data.petSprite) {
        elBigChar.style.background = `#0f1218 center/cover no-repeat url('${data.petSprite}')`;
      } else {
        elBigChar.style.background = 'radial-gradient(circle at 35% 30%, #fff7 0 20%, #0000 21%), linear-gradient(180deg, #60a5fa 0%, #3b82f6 100%)';
      }

      const oldExtra = statsBox.querySelector('.extra-line');
      if (oldExtra) oldExtra.remove();
      const extra = document.createElement('div');
      extra.className = 'muted extra-line';
      extra.textContent = (data.v === 1)
        ? `Discount ${data.discountLevel}/5 • ${data.currentPoints} pts`
        : 'Legacy code payload';
      statsBox.appendChild(extra);
    }

    // ===== Countdown & reset =====
    function startCountdown () {
      let left = SESSION_SECONDS;
      elCountdown.textContent = left;
      stopCountdown();
      countdownId = setInterval(() => {
        left -= 1;
        elCountdown.textContent = left;
        if (left <= 0) doReset();
      }, 1000);
    }
    function stopCountdown () {
      if (countdownId) clearInterval(countdownId);
      countdownId = null;
    }
    function doReset () {
      stopCountdown();
      goDefault();
      HOTPET.send('kiosk:reset', { code: HOTPET.getSession() });
    }

    // ===== Controls =====
    btnStart.addEventListener('click', () => {
      startCamera().then(() => {
        elStatus.textContent = 'Camera ready. Scanning…';
        startScanLoop();
      }).catch(err => {
        console.error(err);
        elStatus.textContent = 'Camera permission denied or unavailable.';
      });
    });
    btnReset.addEventListener('click', doReset);
    btnSim.addEventListener('click', () => {
      onValidScan({
        v: 1,
        userName: 'Demo User',
        petName: 'Mochi',
        petSprite: 'https://api.dicebear.com/9.x/pixel-art/png?seed=Mochi&size=512',
        discountLevel: 2,
        currentPoints: 777
      });
    });
    btnFlip.addEventListener('click', async () => {
      usingUserCam = !usingUserCam;
      await startCamera().then(() => { if (scanning) startScanLoop(); });
    });

    // Optional: accept broadcast payloads (dev w/o camera)
    HOTPET.on((msg) => {
      if (msg.type === 'mobile:show_qr' && msg.payload?.code) {
        const data = parsePayload(msg.payload.code);
        // if (data) onValidScan(data); // enable if you want pairing without camera
      }
    });

    // ===== Boot & cleanup =====
    // Start camera preview immediately (no scan yet); character hidden
    startCamera().then(() => {
      elStatus.textContent = 'Camera ready. Press “Start Scan”.';
      goDefault();
    }).catch(() => {
      elStatus.textContent = 'Camera unavailable. You can Simulate Scan.';
      goDefault();
    });

    addEventListener('beforeunload', () => {
      stopDetector();
      stopJsqrLoop();
      stopCamera();
      stopCountdown();
    });