// Shared page behaviour: the faint moving light behind the glass, the home page name that docks into the top bar, the photo gallery where a page has one, the photo slider's arrows, and edit mode (?edit).

(function startLight() {
  const canvas = document.getElementById("light");
  const gl = canvas && canvas.getContext("webgl", { antialias: false });
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!gl) return;

  const vertexSource = "attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }";
  const fragmentSource = `
    precision mediump float;
    uniform vec2 res; uniform float t; uniform float scroll;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main(){
      vec2 uv = gl_FragCoord.xy / res; float aspect = res.x / res.y; vec2 q = vec2(uv.x * aspect, uv.y);
      vec2 source = vec2(0.15 + 0.05 * sin(t * 0.07), 1.0 + scroll * 0.25);
      float light = exp(-length((uv - source) * vec2(aspect, 1.0)) * 2.2) * 0.22;
      float lines = smoothstep(0.985, 1.0, sin((q.x + q.y) * 140.0 + t * 0.3)) * 0.012;
      gl_FragColor = vec4(vec3(light + lines + hash(gl_FragCoord.xy + floor(t * 10.0)) * 0.02), 1.0);
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

(function dockHeroName() {
  const heroName = document.getElementById("hero-name");
  const navName = document.querySelector(".nav .home");
  if (!heroName || !navName) return;
  let start = null;
  let target = null;
  let framePending = false;

  // Measured with no transform applied; the top bar is sticky, so its spot on screen never changes.
  function measure() {
    heroName.style.transform = "";
    const nameBox = heroName.getBoundingClientRect();
    const navBox = navName.getBoundingClientRect();
    const scale = navBox.width / nameBox.width;
    start = { left: nameBox.left, top: nameBox.top + window.scrollY };
    target = { left: navBox.left, top: navBox.top + navBox.height / 2 - (nameBox.height * scale) / 2, scale };
    update();
  }

  // The name rides up with the page, shrinking and sliding sideways, and lands in the bar exactly
  // when its natural scroll would carry it there. Then the bar's own copy takes over: holding the
  // flying copy still against the scroll trails by a frame and visibly shakes.
  function update() {
    framePending = false;
    const travel = Math.max(1, start.top - target.top);
    const progress = Math.min(1, Math.max(0, window.scrollY / travel));
    const scale = 1 + (target.scale - 1) * progress;
    const shiftX = (target.left - start.left) * progress;
    const shiftY = (target.top - start.top) * progress + window.scrollY;
    heroName.style.transform = `translate(${shiftX}px, ${shiftY}px) scale(${scale})`;
    const docked = progress >= 1;
    heroName.style.visibility = docked ? "hidden" : "";
    navName.classList.toggle("is-docked", docked);
  }

  window.addEventListener("scroll", () => {
    if (!framePending) { framePending = true; requestAnimationFrame(update); }
  }, { passive: true });
  window.addEventListener("resize", measure);
  measure();
  document.fonts?.ready.then(measure);
})();

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
  let currentGallery = requestedGallery || galleries[0];
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

  function renderTabs() {
    tabsElement.innerHTML = "";
    galleries.forEach(gallery => {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", String(gallery === currentGallery));
      tab.innerHTML = `${gallery.name}<span>${gallery.photos.length}</span>`;
      tab.addEventListener("click", () => { currentGallery = gallery; renderTabs(); renderGrid(); });
      tabsElement.appendChild(tab);
    });
  }

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

  function renderGrid() {
    const photos = currentGallery.photos;
    const rowWidth = gridElement.clientWidth;
    const targetHeight = rowWidth < 600 ? 300 : 520;
    gridElement.innerHTML = "";
    splitIntoRows(photos, rowWidth, targetHeight).forEach(row => {
      const rowElement = document.createElement("div");
      rowElement.className = "photo-row";
      row.indexes.forEach(index => {
        const photo = photos[index];
        const button = document.createElement("button");
        button.type = "button";
        button.style.width = `${row.height * photo.width / photo.height}px`;
        button.style.height = `${row.height}px`;
        button.setAttribute("aria-label", `Open ${currentGallery.name} photo ${index + 1}`);
        button.innerHTML = `<img src="${photo.thumb}" loading="lazy" decoding="async" alt="${currentGallery.name} photo ${index + 1}">`;
        button.addEventListener("click", () => openViewer(index));
        rowElement.appendChild(button);
      });
      gridElement.appendChild(rowElement);
    });
  }
  let resizeTimer = null;
  window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(renderGrid, 150); });

  function showViewerPhoto() {
    const photos = currentGallery.photos;
    const photo = photos[viewerIndex];
    viewerImage.src = photo.full;
    viewerImage.alt = `${currentGallery.name} photo ${viewerIndex + 1}`;
    viewerCount.textContent = `${currentGallery.name}  ${viewerIndex + 1} / ${photos.length}`;
    // Load the neighbours now so stepping left or right is instant.
    [1, -1].forEach(offset => { new Image().src = photos[(viewerIndex + offset + photos.length) % photos.length].full; });
  }
  function step(direction) {
    const total = currentGallery.photos.length;
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
})();

// Edit mode stays on across pages once a page is opened with ?edit, until "Leave edit mode" is pressed.
(function loadEditorWhenAsked() {
  let editorOn = new URLSearchParams(location.search).has("edit");
  try {
    if (editorOn) localStorage.setItem("site-editor-on", "1");
    else editorOn = localStorage.getItem("site-editor-on") === "1";
  } catch (storageError) {
    console.warn("Edit mode can't remember itself between pages in this browser:", storageError);
  }
  if (!editorOn) return;
  const editorScript = document.createElement("script");
  editorScript.src = document.querySelector('script[src*="assets/site.js"]').src.replace(/site\.js(\?.*)?$/, "editor.js?v=" + Date.now());
  document.body.appendChild(editorScript);
})();
