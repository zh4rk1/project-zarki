import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
  import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";

  const firebaseConfig = {
    apiKey: "AIzaSyDqMwsuA1vUZI8xEEszrtdVBSc9Pb2Xt4g",
  authDomain: "zhark1-project.firebaseapp.com",
  databaseURL: "https://zhark1-project-default-rtdb.firebaseio.com",
  projectId: "zhark1-project",
  storageBucket: "zhark1-project.firebasestorage.app",
  messagingSenderId: "77357565712",
  appId: "1:77357565712:web:1b94467a0fb21ecd3dc795",
  measurementId: "G-M5H21XEMLR"
  };

  const app = initializeApp(firebaseConfig);
  const db = getDatabase(app);

  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");
  const palette = document.getElementById("colorPalette");
  const shadesPalette = document.getElementById("shadesPalette");
  const countdownEl = document.getElementById("countdown");
  const loadOv = document.getElementById("loadingOverlay");
  const sideTools = document.getElementById("sideTools");
  const mainToolbar = document.getElementById("mainToolbar");
  const toolbarHandle = document.getElementById("toolbarHandle");
  const zoomInBt = document.getElementById("zoomIn");
  const zoomOutBt = document.getElementById("zoomOut");
  const onlineCountDot = document.querySelector("#onlineCountBar .dot");
  const maintenanceMsg = document.getElementById("maintenanceMsg");
  const errorMessage = document.getElementById("errorMessage");
  const topIcon = document.getElementById("topIcon");

  let scale = 20;
  let panX = innerWidth / 2;
  let panY = innerHeight / 2;
  let currentColor = "#000000";
  let selectedBaseColor = null;
  let previewPixel = null;
  let animationAngle = 0;
  let animationOffset = 0;
  let animationDir = 1;
  const pixelData = {};
  let cooldownDuration = 30000;
  let cooldownEnd = Number(localStorage.getItem('pixelCooldown')) || 0;
  let lastTouchDist = null;
  let currentTouchMode = null;

  const WORLD_MIN_X = -3535;
  const WORLD_MAX_X = 3535;
  const WORLD_MIN_Y = -3535;
  const WORLD_MAX_Y = 3535;
  const MAX_SCALE = 100;
  const MIN_SCALE = 1;

  let isToolbarOpen = false;
  let startY = 0;

  const toggleToolbar = (forceState) => {
    isToolbarOpen = forceState !== undefined ? forceState : !isToolbarOpen;
    if (isToolbarOpen) {
      mainToolbar.classList.add('open');
      sideTools.classList.add('pushed');
    } else {
      mainToolbar.classList.remove('open');
      sideTools.classList.remove('pushed');
    }
  };

  toolbarHandle.addEventListener('click', (e) => { e.stopPropagation(); toggleToolbar(); });

  mainToolbar.addEventListener('touchstart', (e) => { startY = e.touches[0].clientY; }, {passive: true});
  mainToolbar.addEventListener('touchend', (e) => {
    const endY = e.changedTouches[0].clientY;
    const diff = startY - endY;
    if (Math.abs(diff) > 30) {
      if (diff > 0 && !isToolbarOpen) toggleToolbar(true);
      else if (diff < 0 && isToolbarOpen) toggleToolbar(false);
    }
  }, {passive: true});

  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
  }

  function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
  }

  function generateShades(baseHexColor) {
    const shades = [];
    const baseRgb = hexToRgb(baseHexColor);
    for (let i = 3; i >= 1; i--) {
      const factor = i * 0.2;
      shades.push(rgbToHex(Math.round(baseRgb.r+(255-baseRgb.r)*factor), Math.round(baseRgb.g+(255-baseRgb.g)*factor), Math.round(baseRgb.b+(255-baseRgb.b)*factor)));
    }
    shades.push(baseHexColor);
    for (let i = 1; i <= 3; i++) {
      const factor = i * 0.2;
      shades.push(rgbToHex(Math.round(baseRgb.r*(1-factor)), Math.round(baseRgb.g*(1-factor)), Math.round(baseRgb.b*(1-factor))));
    }
    return shades;
  }

  function clampPan(currentPan, canvasDimension, worldMinCoord, worldMaxCoord, currentScale) {
    const worldWidthPx = (worldMaxCoord - worldMinCoord) * currentScale;
    if (worldWidthPx < canvasDimension) {
      return -worldMinCoord * currentScale + (canvasDimension - worldWidthPx) / 2;
    } else {
      return Math.min(-(worldMinCoord * currentScale), Math.max(canvasDimension - (worldMaxCoord * currentScale), currentPan));
    }
  }

  function applyPanLimits() {
    panX = clampPan(panX, canvas.width, WORLD_MIN_X, WORLD_MAX_X, scale);
    panY = clampPan(panY, canvas.height, WORLD_MIN_Y, WORLD_MAX_Y, scale);
  }

  onValue(ref(db, 'settings/pixelCooldownMs'), snap => {
    if (snap.exists()) cooldownDuration = Number(snap.val());
  });

  const colors = ['#FFFFFF', '#C0C0C0', '#808080', '#000000', '#FF0000', '#FF8C00', '#FFD700', '#ADFF2F', '#008000', '#00CED1', '#0000FF', '#4B0082', '#EE82EE', '#FF69B4', '#800080', '#A52A2A'];

  colors.forEach(c => {
    const d = document.createElement("div");
    d.className = "color-swatch";
    d.style.backgroundColor = c;
    d.dataset.color = c;
    d.onclick = () => {
      selectedBaseColor = c;
      currentColor = c;
      updateSelectedColor();
      displayShades(c);
    };
    palette.appendChild(d);
  });

  function displayShades(baseColor) {
    shadesPalette.innerHTML = '';
    const shades = generateShades(baseColor);
    shades.forEach(shade => {
      const d = document.createElement("div");
      d.className = "color-swatch";
      d.style.backgroundColor = shade;
      d.dataset.color = shade;
      d.onclick = () => {
        currentColor = shade;
        updateSelectedColor();
      };
      shadesPalette.appendChild(d);
    });
  }

  function updateSelectedColor() {
    document.querySelectorAll('#colorPalette .color-swatch').forEach(div => div.classList.toggle('selected', div.dataset.color === selectedBaseColor));
    document.querySelectorAll('#shadesPalette .color-swatch').forEach(div => div.classList.toggle('selected', div.dataset.color === currentColor));
  }

  if (colors.length > 0) {
    selectedBaseColor = colors[0];
    currentColor = colors[0];
    updateSelectedColor();
    displayShades(colors[0]);
  }

  function showError(msg) {
    errorMessage.textContent = msg;
    errorMessage.style.display = 'block';
    setTimeout(() => errorMessage.style.display = 'none', 3000);
  }

  function draw() {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const visibleMinX = Math.floor((-panX) / scale);
    const visibleMaxX = Math.ceil((canvas.width - panX) / scale);
    const visibleMinY = Math.floor((-panY) / scale);
    const visibleMaxY = Math.ceil((canvas.height - panY) / scale);

    for (const k in pixelData) {
      const [x, y] = k.split(',').map(Number);
      if (x >= visibleMinX && x <= visibleMaxX && y >= visibleMinY && y <= visibleMaxY) {
        ctx.fillStyle = pixelData[k];
        ctx.fillRect(x * scale + panX, y * scale + panY, scale, scale);
      }
    }

    if (previewPixel && Date.now() >= cooldownEnd) {
      const { x, y, color } = previewPixel;
      animationOffset += animationDir * 0.2;
      if (Math.abs(animationOffset) > 4) animationDir *= -1;
      animationAngle += 0.03;
      ctx.save();
      ctx.translate(x * scale + panX + scale / 2 + animationOffset, y * scale + panY + scale / 2);
      ctx.rotate(Math.sin(animationAngle) * 0.15);
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = color;
      ctx.fillRect(-scale / 2, -scale / 2, scale, scale);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  function animate() {
    draw();
    updateCooldownUI();
    requestAnimationFrame(animate);
  }
  animate();

  function formatTime(s) {
    const mins = Math.floor(s/60);
    const secs = s%60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  function updateCooldownUI() {
    const diff = Math.floor((cooldownEnd - Date.now()) / 1000);
    if (diff > 0) {
      countdownEl.style.display = 'block';
      countdownEl.innerHTML = `${Math.floor(diff/60).toString().padStart(2,'0')}<br>${(diff%60).toString().padStart(2,'0')}`;
    } else {
      countdownEl.style.display = 'none';
      if (cooldownEnd !== 0) {
          cooldownEnd = 0;
          localStorage.removeItem('pixelCooldown');
      }
    }
  }

  function placePixel(x, y) {
    if (Date.now() < cooldownEnd) {
      showError("Gözləmə müddəti bitməyib!");
      return;
    }
    if (x < WORLD_MIN_X || x > WORLD_MAX_X || y < WORLD_MIN_Y || y > WORLD_MAX_Y) {
      showError("Hüdud xarici!"); return;
    }
    pixelData[`${x},${y}`] = currentColor;
    set(ref(db, `pixels/${x}_${y}`), currentColor);
    cooldownEnd = Date.now() + cooldownDuration;
    localStorage.setItem('pixelCooldown', cooldownEnd);
    previewPixel = null;
  }

  let drag = false, sx = 0, sy = 0, lx = 0, ly = 0;
  canvas.addEventListener("mousedown", e => { drag = true; sx = e.clientX; sy = e.clientY; lx = panX; ly = panY; });
  canvas.addEventListener("mousemove", e => {
    if (!drag) return;
    panX = lx + (e.clientX - sx);
    panY = ly + (e.clientY - sy);
    applyPanLimits();
  });
  canvas.addEventListener("mouseup", e => {
    if (Math.abs(e.clientX - sx) < 5 && Math.abs(e.clientY - sy) < 5) {
      const r = canvas.getBoundingClientRect();
      const x = Math.floor(((e.clientX - r.left) * canvas.width / r.width - panX) / scale);
      const y = Math.floor(((e.clientY - r.top) * canvas.height / r.height - panY) / scale);
      
      if (Date.now() < cooldownEnd) {
          showError(`vaxtın bitməsini gözləyin`);
          previewPixel = null;
          return;
      }

      if (previewPixel && previewPixel.x === x && previewPixel.y === y) placePixel(x, y);
      else previewPixel = { x, y, color: currentColor };
    }
    drag = false;
  });

  function zoomAt(factor, cx = innerWidth / 2, cy = innerHeight / 2) {
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * factor));
    const wx = (cx - panX) / scale;
    const wy = (cy - panY) / scale;
    scale = newScale;
    panX = cx - wx * scale;
    panY = cy - wy * scale;
    applyPanLimits();
  }

  canvas.addEventListener("wheel", e => { e.preventDefault(); zoomAt(e.deltaY < 0 ? 1.1 : 0.9, e.clientX, e.clientY); }, { passive: false });
  zoomInBt.onclick = () => zoomAt(1.2);
  zoomOutBt.onclick = () => zoomAt(0.8);

  canvas.addEventListener("touchstart", e => {
    if (e.touches.length === 2) {
      lastTouchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      currentTouchMode = "zoom";
    } else {
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; lx = panX; ly = panY;
      currentTouchMode = "pan";
    }
  });

  canvas.addEventListener("touchmove", e => {
    if (currentTouchMode === "zoom" && e.touches.length === 2) {
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      zoomAt(dist / lastTouchDist, (e.touches[0].clientX + e.touches[1].clientX) / 2, (e.touches[0].clientY + e.touches[1].clientY) / 2);
      lastTouchDist = dist;
    } else if (currentTouchMode === "pan") {
      panX = lx + (e.touches[0].clientX - sx);
      panY = ly + (e.touches[0].clientY - sy);
      applyPanLimits();
    }
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener("touchend", e => {
    if (currentTouchMode === "pan" && Math.abs(e.changedTouches[0].clientX - sx) < 5 && Math.abs(e.changedTouches[0].clientY - sy) < 5) {
      const r = canvas.getBoundingClientRect();
      const x = Math.floor(((e.changedTouches[0].clientX - r.left) * canvas.width / r.width - panX) / scale);
      const y = Math.floor(((e.changedTouches[0].clientY - r.top) * canvas.height / r.height - panY) / scale);
      
      if (Date.now() < cooldownEnd) {
          showError(`vaxtın bitməsini gözləyin`);
          previewPixel = null;
          return;
      }

      if (previewPixel && previewPixel.x === x && previewPixel.y === y) placePixel(x, y);
      else previewPixel = { x, y, color: currentColor };
    }
    currentTouchMode = null;
  });

  onValue(ref(db, 'pixels'), snap => {
    const d = snap.val();
    if (d) {
      for (const k in d) pixelData[k.replace('_', ',')] = d[k];
      for (const k in pixelData) if (!d[k.replace(',', '_')]) delete pixelData[k];
    }
    loadOv.style.display = "none";
    canvas.style.display = "block";
    sideTools.style.display = "flex";
    topIcon.style.display = "block";
    applyPanLimits();
  });

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    applyPanLimits();
    draw();
  }
  window.addEventListener('resize', resize);
  resize();

  onValue(ref(db, "onlineUsers/statusColor"), snap => {
    if (snap.exists()) {
      const color = snap.val().toLowerCase();
      onlineCountDot.style.backgroundColor = color;
      if (color === "#ff0000" || color === "red") {
        maintenanceMsg.style.display = "block";
        canvas.style.display = "none";
        mainToolbar.style.display = "none";
        sideTools.style.display = "none";
        topIcon.style.display = "none";
      } else {
        maintenanceMsg.style.display = "none";
        if (loadOv.style.display === "none") {
          canvas.style.display = "block";
          mainToolbar.style.display = "flex";
          sideTools.style.display = "flex";
          topIcon.style.display = "block";
        }
      }
    }
  });
