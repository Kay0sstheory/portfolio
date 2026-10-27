// Shared page behaviour: the faint moving light behind the glass, and the photo gallery where a page has one.

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

(function startGalleries() {
  const tabsElement = document.getElementById("gallery-tabs");
  if (!tabsElement) return;
  const galleries = window.PHOTO_GALLERIES || [];
  const gridElement = document.getElementById("photo-grid");
  const showAllButton = document.getElementById("show-all");
  const viewer = document.getElementById("viewer");
  const viewerImage = document.getElementById("viewer-image");
  const viewerCount = document.getElementById("viewer-count");
  const firstScreenful = 12;
  const requestedGallery = galleries.find(gallery => "#" + gallery.id === window.location.hash);
  let currentGallery = requestedGallery || galleries[0];
  let viewerIndex = 0;
  let lastFocused = null;

  if (!galleries.length) {
    gridElement.textContent = "The photos didn't load. Check that the photos folder sits next to this page.";
    return;
  }

  function renderTabs() {
    tabsElement.innerHTML = "";
    galleries.forEach(gallery => {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", String(gallery === currentGallery));
      tab.innerHTML = `${gallery.name}<span>${gallery.photos.length}</span>`;
      tab.addEventListener("click", () => { currentGallery = gallery; renderTabs(); renderGrid(false); });
      tabsElement.appendChild(tab);
    });
  }

  function renderGrid(showEverything) {
    const photos = showEverything ? currentGallery.photos : currentGallery.photos.slice(0, firstScreenful);
    gridElement.innerHTML = "";
    photos.forEach((photo, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-label", `Open ${currentGallery.name} photo ${index + 1}`);
      button.innerHTML = `<img src="${photo.thumb}" width="${photo.width}" height="${photo.height}" loading="lazy" decoding="async" alt="${currentGallery.name} photo ${index + 1}">`;
      button.addEventListener("click", () => openViewer(index));
      gridElement.appendChild(button);
    });
    showAllButton.hidden = currentGallery.photos.length <= photos.length;
    showAllButton.textContent = `Show all ${currentGallery.photos.length} ${currentGallery.name.toLowerCase()} photos`;
  }
  showAllButton.addEventListener("click", () => renderGrid(true));

  function showViewerPhoto() {
    const photo = currentGallery.photos[viewerIndex];
    viewerImage.src = photo.full;
    viewerImage.alt = `${currentGallery.name} photo ${viewerIndex + 1}`;
    viewerCount.textContent = `${currentGallery.name}  ${viewerIndex + 1} / ${currentGallery.photos.length}`;
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
  renderGrid(false);
})();
