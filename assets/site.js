// Shared page behaviour: the faint moving light behind the glass, the home page name and each page's heading that dock into the top bar, the photo gallery where a page has one, and the photo slider's arrows.

(function startLight() {
  const canvas = document.getElementById("light");
  const gl = canvas && canvas.getContext("webgl", { antialias: false });
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!gl) return;

  const vertexSource = "attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }";
  const fragmentSource = `
    precision mediump float;
    uniform vec2 res; uniform float t; uniform float scroll; uniform vec2 pointer; uniform vec3 tint; uniform float strength;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main(){
      vec2 uv = gl_FragCoord.xy / res; float aspect = res.x / res.y; vec2 q = vec2(uv.x * aspect, uv.y);
      vec2 source = vec2(0.15 + 0.05 * sin(t * 0.07), 1.0 + scroll * 0.25);
      float light = exp(-length((uv - source) * vec2(aspect, 1.0)) * 2.8) * strength;
      // A second, slower pool drifts across the lower right so the page never reads as flat black.
      vec2 drift = vec2(0.82 + 0.08 * sin(t * 0.05 + 1.3), 0.18 + 0.06 * cos(t * 0.04));
      light += exp(-length((uv - drift) * vec2(aspect, 1.0)) * 3.6) * strength * 0.45;
      // A soft spotlight trails the cursor.
      light += exp(-length((uv - pointer) * vec2(aspect, 1.0)) * 6.0) * strength * 0.35;
      float lines = smoothstep(0.985, 1.0, sin((q.x + q.y) * 140.0 + t * 0.3)) * 0.012;
      gl_FragColor = vec4(tint * (light + lines) + vec3(hash(gl_FragCoord.xy + floor(t * 10.0)) * 0.02), 1.0);
    }`;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }

  try {
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "p");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const resolutionUniform = gl.getUniformLocation(program, "res");
    const timeUniform = gl.getUniformLocation(program, "t");
    const scrollUniform = gl.getUniformLocation(program, "scroll");
    const pointerUniform = gl.getUniformLocation(program, "pointer");
    const tintUniform = gl.getUniformLocation(program, "tint");
    const strengthUniform = gl.getUniformLocation(program, "strength");

    // site.css sets the light's colour and brightness (--light-tint, --light-strength).
    let tint = [1, 1, 1];
    let strength = 0.4;
    function readLook() {
      const style = getComputedStyle(document.documentElement);
      const parsedTint = style.getPropertyValue("--light-tint").split(",").map(Number);
      if (parsedTint.length === 3 && parsedTint.every(Number.isFinite)) tint = parsedTint;
      const parsedStrength = parseFloat(style.getPropertyValue("--light-strength"));
      if (Number.isFinite(parsedStrength)) strength = parsedStrength;
    }
    readLook();
    let shownTint = [...tint];
    document.addEventListener("lookchange", () => { readLook(); draw(performance.now()); });

    // The spotlight sits exactly under the cursor; it rests near the top left on touch screens.
    let lightFramePending = false;
    const pointerTarget = [0.2, 0.85];
    const pointerNow = [0.2, 0.85];
    window.addEventListener("pointermove", event => {
      if (event.pointerType !== "mouse") return;
      pointerTarget[0] = event.clientX / window.innerWidth;
      pointerTarget[1] = 1 - event.clientY / window.innerHeight;
      if (!lightFramePending) { lightFramePending = true; requestAnimationFrame(now => { lightFramePending = false; draw(now); lastDraw = now; }); }
    }, { passive: true });

    // Hovering a build tints the light in that build's own colour; it eases back to white when the cursor leaves.
    let tintTarget = null;
    document.addEventListener("buildhover", event => { tintTarget = event.detail; });

    // Low resolution is invisible behind blur and grain, and keeps laptops and phones cool.
    const renderScale = 0.4;
    function resize() {
      canvas.width = Math.max(1, Math.round(window.innerWidth * renderScale));
      canvas.height = Math.max(1, Math.round(window.innerHeight * renderScale));
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    window.addEventListener("resize", resize);
    resize();

    const startTime = performance.now();
    let lastDraw = 0;
    function draw(now) {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      gl.uniform2f(resolutionUniform, canvas.width, canvas.height);
      gl.uniform1f(timeUniform, reduceMotion ? 20 : (now - startTime) / 1000);
      gl.uniform1f(scrollUniform, scrollable > 0 ? window.scrollY / scrollable : 0);
      pointerNow[0] = pointerTarget[0];
      pointerNow[1] = pointerTarget[1];
      const goal = tintTarget || tint;
      shownTint = shownTint.map((value, channel) => value + (goal[channel] - value) * (reduceMotion ? 1 : 0.12));
      gl.uniform2f(pointerUniform, pointerNow[0], pointerNow[1]);
      gl.uniform3f(tintUniform, shownTint[0], shownTint[1], shownTint[2]);
      gl.uniform1f(strengthUniform, strength);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    function loop(now) {
      if (!document.hidden && now - lastDraw > 33) { draw(now); lastDraw = now; }
      requestAnimationFrame(loop);
    }
    if (reduceMotion) { draw(performance.now()); window.addEventListener("scroll", () => draw(performance.now()), { passive: true }); }
    else requestAnimationFrame(loop);
  } catch (shaderError) {
    console.warn("Background light unavailable, page shows plain black instead:", shaderError);
  }
})();

(function dockHeadings() {
  // Home: the big name flies into the bar's name slot. Inner pages: the page heading flies into the slot after the dot.
  const heroName = document.getElementById("hero-name");
  const pageTitle = document.getElementById("page-title");
  if (heroName) dockIntoBar(heroName, document.querySelector(".nav .home"), document.querySelector(".nav .home"));
  if (pageTitle) dockIntoBar(pageTitle, document.querySelector(".nav-page-title"), document.querySelector(".nav-page"));
})();

function dockIntoBar(flying, slot, revealedWhenDocked) {
  if (!flying || !slot) return;
  let start = null;
  let target = null;
  let framePending = false;

  // Measured with no transform applied; the top bar is sticky, so its spot on screen never changes.
  function measure() {
    flying.style.transform = "";
    const flyingBox = flying.getBoundingClientRect();
    const slotBox = slot.getBoundingClientRect();
    const scale = slotBox.width / flyingBox.width;
    start = { left: flyingBox.left, top: flyingBox.top + window.scrollY };
    target = { left: slotBox.left, top: slotBox.top + slotBox.height / 2 - (flyingBox.height * scale) / 2, scale };
    update();
  }

  // The heading rides up with the page, shrinking and sliding sideways, and lands in the bar exactly
  // when its natural scroll would carry it there. Then the bar's own copy takes over: holding the
  // flying copy still against the scroll trails by a frame and visibly shakes.
  function update() {
    framePending = false;
    const travel = Math.max(1, start.top - target.top);
    const progress = Math.min(1, Math.max(0, window.scrollY / travel));
    const scale = 1 + (target.scale - 1) * progress;
    const shiftX = (target.left - start.left) * progress;
    const shiftY = (target.top - start.top) * progress + window.scrollY;
    flying.style.transform = `translate(${shiftX}px, ${shiftY}px) scale(${scale})`;
    const docked = progress >= 1;
    flying.style.visibility = docked ? "hidden" : "";
    revealedWhenDocked.classList.toggle("is-docked", docked);
  }

  window.addEventListener("scroll", () => {
    if (!framePending) { framePending = true; requestAnimationFrame(update); }
  }, { passive: true });
  window.addEventListener("resize", measure);
  measure();
  document.fonts?.ready.then(measure);
}

(function startPhotoSliders() {
  // Each arrow moves one screenful of photos; past either end it wraps round to the other end.
  document.querySelectorAll(".photo-slider").forEach(slider => {
    const track = slider.querySelector(".slider-track");
    slider.querySelectorAll(".slider-arrow").forEach(arrow => arrow.addEventListener("click", () => {
      const direction = Number(arrow.dataset.direction);
      const lastPosition = track.scrollWidth - track.clientWidth;
      const atEnd = direction > 0 ? track.scrollLeft >= lastPosition - 2 : track.scrollLeft <= 2;
      const target = atEnd ? (direction > 0 ? 0 : lastPosition) : track.scrollLeft + direction * (track.clientWidth + 12);
      track.scrollTo({ left: target });
    }));
  });
})();

(function startGalleries() {
  const tabsElement = document.getElementById("gallery-tabs");
  if (!tabsElement) return;
  const galleries = window.PHOTO_GALLERIES || [];
  const gridElement = document.getElementById("photo-grid");
  const viewer = document.getElementById("viewer");
  const viewerImage = document.getElementById("viewer-image");
  const viewerCount = document.getElementById("viewer-count");
  const photoGap = 14;
  const requestedGallery = galleries.find(gallery => "#" + gallery.id === window.location.hash);
  let currentGallery = null;
  let viewerGallery = galleries[0];
  let viewerIndex = 0;
  let lastFocused = null;

  if (!galleries.length) {
    gridElement.textContent = "The photos didn't load. Check that the photos folder sits next to this page.";
    return;
  }

  // Plans the order as rows: each landscape shares a row with one portrait (alternating sides), leftover portraits go
  // three to a row, and the landscape rows are spread evenly between them. The viewer steps through this same order.
  function mixShapes(photos) {
    const portraits = photos.filter(photo => photo.height > photo.width);
    const landscapes = photos.filter(photo => photo.height <= photo.width);
    const pairedRows = [];
    landscapes.forEach((landscape, index) => {
      const partner = portraits.shift();
      const row = partner ? (index % 2 ? [landscape, partner] : [partner, landscape]) : [landscape];
      pairedRows.push(row);
    });
    const portraitRows = [];
    while (portraits.length) portraitRows.push(portraits.splice(0, 3));
    const totalRows = pairedRows.length + portraitRows.length;
    const ordered = [];
    for (let rowNumber = 0; rowNumber < totalRows; rowNumber++) {
      // Hand out paired rows at even spacing among all rows, starting with one.
      const pairedSoFar = Math.round((rowNumber + 1) * pairedRows.length / totalRows);
      const pairedBefore = Math.round(rowNumber * pairedRows.length / totalRows);
      const takePaired = (rowNumber === 0 && pairedRows.length) || (pairedSoFar > pairedBefore && pairedRows.length);
      ordered.push(...(takePaired ? pairedRows.shift() : portraitRows.shift() || pairedRows.shift()));
    }
    return ordered;
  }
  galleries.forEach(gallery => { gallery.photos = mixShapes(gallery.photos); });

  // One continuous page (2026-11-26): every gallery follows the last, Nature first; the tab bar stays pinned under the
  // top bar, marks the gallery on screen, and a tab glides the page to its gallery.
  const tabButtons = new Map();
  function renderTabs() {
    tabsElement.innerHTML = "";
    galleries.forEach(gallery => {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", String(gallery === currentGallery));
      tab.innerHTML = `${gallery.name}<span>${gallery.photos.length}</span>`;
      tab.addEventListener("click", () => scrollToGallery(gallery));
      tabsElement.appendChild(tab);
      tabButtons.set(gallery, tab);
    });
  }
  function markCurrent(gallery) {
    if (gallery === currentGallery) return;
    currentGallery = gallery;
    tabButtons.forEach((tab, tabGallery) => tab.setAttribute("aria-selected", String(tabGallery === gallery)));
    tabButtons.get(gallery)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    history.replaceState(null, "", "#" + gallery.id);
  }
  function pinnedHeight() { return tabsElement.getBoundingClientRect().bottom + 12; }
  function scrollToGallery(gallery, instant = false) {
    const section = document.getElementById("gallery-" + gallery.id);
    if (!section) return;
    const top = section.getBoundingClientRect().top + window.scrollY - pinnedHeight() + 2;
    if (window.siteLenis && !instant) window.siteLenis.scrollTo(top);
    else window.scrollTo({ top, behavior: instant ? "auto" : "smooth" });
    markCurrent(gallery);
  }
  function followScroll() {
    const line = pinnedHeight() + 40;
    let onScreen = galleries[0];
    galleries.forEach(gallery => {
      const section = document.getElementById("gallery-" + gallery.id);
      if (section && section.getBoundingClientRect().top <= line) onScreen = gallery;
    });
    markCurrent(onScreen);
  }
  let scrollQueued = false;
  window.addEventListener("scroll", () => {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(() => { scrollQueued = false; followScroll(); });
  }, { passive: true });

  // Fills each row edge to edge: photos are added at a target height until the row is too wide,
  // then the whole row is scaled down to fit exactly.
  function splitIntoRows(photos, rowWidth, targetHeight) {
    const rows = [];
    let row = [];
    let shapeTotal = 0;
    photos.forEach((photo, index) => {
      row.push(index);
      shapeTotal += photo.width / photo.height;
      const widthAtTarget = shapeTotal * targetHeight + photoGap * (row.length - 1);
      if (widthAtTarget >= rowWidth) {
        rows.push({ indexes: row, height: (rowWidth - photoGap * (row.length - 1)) / shapeTotal });
        row = [];
        shapeTotal = 0;
      }
    });
    if (row.length) {
      // A last row that is already mostly full is stretched to the edge too; a short one stays at the target height.
      const fullHeight = (rowWidth - photoGap * (row.length - 1)) / shapeTotal;
      rows.push({ indexes: row, height: fullHeight < targetHeight * 1.6 ? fullHeight : targetHeight });
    }
    return rows;
  }

  function renderGallery(gallery, rowWidth, targetHeight) {
    const section = document.createElement("section");
    section.className = "gallery-section";
    section.id = "gallery-" + gallery.id;
    section.innerHTML = `<h2 class="section-title">${gallery.name}</h2>`;
    const photos = gallery.photos;
    splitIntoRows(photos, rowWidth, targetHeight).forEach(row => {
      const rowElement = document.createElement("div");
      rowElement.className = "photo-row";
      row.indexes.forEach(index => {
        const photo = photos[index];
        const button = document.createElement("button");
        button.type = "button";
        button.style.width = `${row.height * photo.width / photo.height}px`;
        button.style.height = `${row.height}px`;
        button.setAttribute("aria-label", `Open ${gallery.name} photo ${index + 1}`);
        button.innerHTML = `<img src="${photo.thumb}" loading="lazy" decoding="async" alt="${gallery.name} photo ${index + 1}">`;
        button.addEventListener("click", () => { viewerGallery = gallery; openViewer(index); });
        rowElement.appendChild(button);
      });
      section.appendChild(rowElement);
    });
    return section;
  }
  function renderGrid() {
    const rowWidth = gridElement.clientWidth;
    const targetHeight = rowWidth < 600 ? 300 : 520;
    gridElement.innerHTML = "";
    galleries.forEach(gallery => gridElement.appendChild(renderGallery(gallery, rowWidth, targetHeight)));
  }
  let resizeTimer = null;
  window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(renderGrid, 150); });

  function showViewerPhoto() {
    const photos = viewerGallery.photos;
    const photo = photos[viewerIndex];
    viewerImage.src = photo.full;
    viewerImage.alt = `${viewerGallery.name} photo ${viewerIndex + 1}`;
    viewerCount.textContent = `${viewerGallery.name}  ${viewerIndex + 1} / ${photos.length}`;
    // Load the neighbours now so stepping left or right is instant.
    [1, -1].forEach(offset => { new Image().src = photos[(viewerIndex + offset + photos.length) % photos.length].full; });
  }
  function step(direction) {
    const total = viewerGallery.photos.length;
    viewerIndex = (viewerIndex + direction + total) % total;
    showViewerPhoto();
  }
  function openViewer(index) {
    lastFocused = document.activeElement;
    viewerIndex = index;
    showViewerPhoto();
    viewer.hidden = false;
    document.body.style.overflow = "hidden";
    document.getElementById("viewer-close").focus();
  }
  function closeViewer() {
    viewer.hidden = true;
    document.body.style.overflow = "";
    lastFocused?.focus();
  }
  document.getElementById("viewer-close").addEventListener("click", closeViewer);
  document.getElementById("viewer-previous").addEventListener("click", () => step(-1));
  document.getElementById("viewer-next").addEventListener("click", () => step(1));
  viewer.addEventListener("click", event => { if (event.target === viewer || event.target.tagName === "FIGURE") closeViewer(); });
  document.addEventListener("keydown", event => {
    if (viewer.hidden) return;
    if (event.key === "Escape") closeViewer();
    if (event.key === "ArrowRight") step(1);
    if (event.key === "ArrowLeft") step(-1);
  });
  let touchStartX = null;
  viewer.addEventListener("touchstart", event => { touchStartX = event.touches[0].clientX; }, { passive: true });
  viewer.addEventListener("touchend", event => {
    if (touchStartX === null) return;
    const distance = event.changedTouches[0].clientX - touchStartX;
    if (Math.abs(distance) > 50) step(distance < 0 ? 1 : -1);
    touchStartX = null;
  });

  renderTabs();
  renderGrid();
  if (requestedGallery) requestAnimationFrame(() => scrollToGallery(requestedGallery, true));
  else markCurrent(galleries[0]);
})();

// Edit mode was retired; browsers that once switched it on still hold its notes, so clear them.
(function forgetRetiredEditMode() {
  try {
    Object.keys(localStorage)
      .filter((key) => key === "site-editor-on" || key.startsWith("site-editor:"))
      .forEach((key) => localStorage.removeItem(key));
  } catch (storageError) {
    console.warn("Couldn't clear old edit-mode notes in this browser:", storageError);
  }
})();

// Visitors who ask for less motion get the still image instead of a looping clip.
(() => {
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  document.querySelectorAll("video[autoplay]").forEach((video) => { video.removeAttribute("autoplay"); video.pause(); });
})();

(function contactForm() {
  // Sends the contact form without leaving the page, after cheap checks that turn away most automated spam.
  const form = document.getElementById("contact-form");
  if (!form) return;
  const status = document.getElementById("contact-status");
  const button = form.querySelector("button[type=submit]");
  const openedAt = Date.now();
  const tooFastMilliseconds = 4000;
  const cooldownMilliseconds = 10 * 60 * 1000;
  const cooldownKey = "contact-last-sent";

  function show(message, isProblem) {
    status.textContent = message;
    status.classList.toggle("problem", Boolean(isProblem));
  }
  function lastSentAt() {
    try { return Number(localStorage.getItem(cooldownKey)) || 0; } catch (error) { return 0; }
  }
  function rememberSent() {
    try { localStorage.setItem(cooldownKey, String(Date.now())); } catch (error) { /* private window: no cooldown, the server filter still applies */ }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (form.botcheck.checked) { show(status.dataset.sent); form.reset(); return; }
    if (Date.now() - openedAt < tooFastMilliseconds) { show("That was quick. Give it a few seconds and try again.", true); return; }
    if (Date.now() - lastSentAt() < cooldownMilliseconds) { show("Your last message already arrived. You can send another in a few minutes.", true); return; }
    button.disabled = true;
    show("Sending…");
    try {
      const response = await fetch(form.action, { method: "POST", headers: { Accept: "application/json" }, body: new FormData(form) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "send failed");
      rememberSent();
      form.reset();
      show(status.dataset.sent);
    } catch (error) {
      console.error("contact form:", error);
      show("It didn't send. Please try again, or email me at the address on the right.", true);
    } finally {
      button.disabled = false;
    }
  });
})();

// Build cards: play the short preview while the pointer is over the card (or it has keyboard focus).
document.querySelectorAll('.tile').forEach(tile => {
  const video = tile.querySelector('.tile-thumb video');
  if (!video || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const start = () => { video.currentTime = 0; video.play().then(() => tile.classList.add('is-playing')).catch(() => {}); };
  const stop = () => { tile.classList.remove('is-playing'); video.pause(); };
  tile.addEventListener('mouseenter', start); tile.addEventListener('focus', start);
  tile.addEventListener('mouseleave', stop); tile.addEventListener('blur', stop);
});

// Life pass (2026-11-26): sections rise in as they scroll into view, tiles glow
// under the cursor, and phones play tile previews when the tile is on screen. Visitors who ask for less motion get none of it.
(function bringPageToLife() {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Tiles: a soft light follows the cursor along the card's edge (site.css reads --spot-x / --spot-y).
  // Every build shares one glow colour (site.css --glow); the background light borrows it while a tile is hovered.
  function glowAsLight() {
    const hex = getComputedStyle(root).getPropertyValue("--glow").trim().replace("#", "");
    if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
    return [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  }
  document.querySelectorAll(".tile").forEach(tile => {
    tile.addEventListener("pointerenter", () => {
      document.dispatchEvent(new CustomEvent("buildhover", { detail: glowAsLight() }));
    });
    tile.addEventListener("pointerleave", () => document.dispatchEvent(new CustomEvent("buildhover", { detail: null })));
    tile.addEventListener("pointermove", event => {
      const box = tile.getBoundingClientRect();
      tile.style.setProperty("--spot-x", `${event.clientX - box.left}px`);
      tile.style.setProperty("--spot-y", `${event.clientY - box.top}px`);
    }, { passive: true });
  });

  if (reduceMotion) return;
  root.classList.add("motion-ok");

  // Everything after the heading rises in when it scrolls into view; items side by side follow each other by 60ms.
  const firstGroup = document.querySelectorAll(".hero .role-line, .page-head .lead, .build-head .tagline, .build-head .actions");
  firstGroup.forEach((element, index) => { element.classList.add("reveal"); element.style.setProperty("--delay", `${120 + index * 90}ms`); });
  const groups = document.querySelectorAll("main > *:not(.hero):not(.page-head):not(.build-head), .tiles > *, .timeline > *, .steps > *, .shots > *, footer");
  groups.forEach(element => element.classList.add("reveal"));
  document.querySelectorAll(".tiles, .timeline, .steps").forEach(list => {
    [...list.children].forEach((child, index) => child.style.setProperty("--delay", `${Math.min(index, 8) * 60}ms`));
  });

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-in");
      observer.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -8% 0px" });
  document.querySelectorAll(".reveal").forEach(element => observer.observe(element));

  // Phones have no hover, so a tile's preview plays while the tile sits mostly on screen.
  if (window.matchMedia("(hover: none)").matches) {
    const previewWatcher = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const video = entry.target.querySelector(".tile-thumb video");
        if (!video) return;
        if (entry.isIntersecting) video.play().then(() => entry.target.classList.add("is-playing")).catch(() => {});
        else { entry.target.classList.remove("is-playing"); video.pause(); }
      });
    }, { threshold: 0.7 });
    document.querySelectorAll(".tile").forEach(tile => previewWatcher.observe(tile));
  }
})();

// Smooth, slightly weighted scrolling like michaelandreuzza.com (Lenis); off for visitors who ask for less motion.
(function smoothScroll() {
  if (!window.Lenis || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  // Lenis 1.1 has no self-start option, so this loop drives it every frame; without it the wheel does nothing.
  const lenis = new Lenis({ lerp: 0.1 });
  window.siteLenis = lenis;  // the photo page's tabs glide with it
  function frame(time) { lenis.raf(time); requestAnimationFrame(frame); }
  requestAnimationFrame(frame);
})();
