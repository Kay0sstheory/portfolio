// Edit mode: open any page with ?edit to pick things on screen and change their size, colour, width, position and words.
// Changes live only in this browser until "Copy my changes" is pasted to Claude, who makes them permanent in the site files.

(function startEditor() {
  // Saved tweaks are tied to the look they were made on; once the site is updated they are dropped,
  // so changes already built in are never applied a second time on top of themselves.
  const siteLook = (document.querySelector('link[href*="site.css"]')?.href.match(/v=(\w+)/) || [])[1] || "unversioned";
  const storageKey = "site-editor:" + location.pathname + ":" + siteLook;
  const state = loadState();
  let selected = null;
  let picking = true;
  let history = [];

  const overrideStyle = document.createElement("style");
  overrideStyle.id = "editor-overrides";
  document.head.appendChild(overrideStyle);

  const panel = document.createElement("aside");
  panel.className = "editor-panel";
  panel.innerHTML = `
    <style>
      .editor-panel { position: fixed; right: 16px; bottom: 16px; z-index: 100; width: 320px; max-height: calc(100vh - 32px); overflow: auto;
        background: rgba(16,16,16,.94); border: 1px solid rgba(255,255,255,.18); border-radius: 10px; padding: 14px; color: #f2f2f2;
        font: 14px/1.4 "Geist", Arial, sans-serif; box-shadow: 0 20px 50px rgba(0,0,0,.6); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); }
      .editor-panel.is-folded .editor-body { display: none; }
      .editor-panel h2 { margin: 0; font-size: 15px; font-weight: 600; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
      .editor-panel p { margin: 6px 0 0; color: #9a9a9a; font-size: 12px; }
      .editor-panel .editor-picked { margin: 12px 0 4px; padding: 8px 10px; border-radius: 6px; background: rgba(255,255,255,.06); font-size: 13px; }
      .editor-panel label { display: grid; grid-template-columns: 92px 1fr 52px; align-items: center; gap: 8px; margin-top: 10px; font-size: 13px; }
      .editor-panel label output { font-family: "Geist Mono", monospace; font-size: 12px; color: #9a9a9a; text-align: right; }
      .editor-panel input[type=range] { width: 100%; accent-color: #f2f2f2; }
      .editor-panel input[type=color] { width: 100%; height: 28px; border: 0; background: none; padding: 0; }
      .editor-panel button { font: inherit; font-size: 13px; color: #f2f2f2; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.16);
        border-radius: 6px; padding: 6px 10px; cursor: pointer; }
      .editor-panel button:hover { background: rgba(255,255,255,.16); }
      .editor-panel button.is-on { background: #f2f2f2; color: #000; }
      .editor-panel .editor-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; align-items: center; }
      .editor-panel .editor-move { display: grid; grid-template-columns: repeat(3, 34px); gap: 4px; }
      .editor-panel .editor-check { display: flex; gap: 8px; grid-template-columns: none; }
      .editor-panel textarea { width: 100%; height: 140px; margin-top: 10px; background: #000; color: #ddd; border: 1px solid #333; border-radius: 6px; font: 12px "Geist Mono", monospace; }
      .editor-hover { outline: 1px dashed rgba(120,180,255,.9) !important; outline-offset: 2px; }
      .editor-selected { outline: 2px solid #4ea1ff !important; outline-offset: 3px; cursor: move; user-select: none; }
      @media (max-width: 600px) { .editor-panel { left: 8px; right: 8px; bottom: 8px; width: auto; max-height: 55vh; } }
    </style>
    <h2>Edit mode <span><button type="button" data-action="fold">Hide</button></span></h2>
    <div class="editor-body">
      <p>Only you see this. Click anything on the page to change it. Drag it to move it.</p>
      <div class="editor-row">
        <button type="button" data-action="pick" class="is-on">Picking: On</button>
        <button type="button" data-action="undo">Undo</button>
        <button type="button" data-action="reset">Reset this page</button>
        <button type="button" data-action="leave">Leave edit mode</button>
      </div>
      <div class="editor-picked" id="editor-picked">Nothing picked yet.</div>
      <div id="editor-controls" hidden>
        <label class="editor-check"><input type="checkbox" id="editor-all"> <span id="editor-all-label">Change all like this</span></label>
        <label>Text size <input type="range" id="editor-size" min="8" max="140" step="1"><output id="editor-size-out"></output></label>
        <label>Boldness <input type="range" id="editor-weight" min="300" max="700" step="100"><output id="editor-weight-out"></output></label>
        <label>Colour <input type="color" id="editor-color"><output></output></label>
        <label>Brightness <input type="range" id="editor-opacity" min="20" max="100" step="5"><output id="editor-opacity-out"></output></label>
        <label>Width <input type="range" id="editor-width" min="120" max="1400" step="10"><output id="editor-width-out"></output></label>
        <label>Line spacing <input type="range" id="editor-line" min="0.9" max="2.4" step="0.05"><output id="editor-line-out"></output></label>
        <div class="editor-row"><span style="font-size:13px;width:92px">Move</span>
          <div class="editor-move">
            <span></span><button type="button" data-move="0,-4">↑</button><span></span>
            <button type="button" data-move="-4,0">←</button><button type="button" data-action="center">•</button><button type="button" data-move="4,0">→</button>
            <span></span><button type="button" data-move="0,4">↓</button><span></span>
          </div>
        </div>
        <div class="editor-row">
          <button type="button" data-action="words">Edit the words</button>
          <button type="button" data-action="clear">Undo all on this item</button>
        </div>
      </div>
      <div class="editor-row"><button type="button" data-action="copy">Copy my changes</button><span id="editor-count"></span></div>
      <textarea id="editor-output" hidden readonly></textarea>
    </div>`;
  document.body.appendChild(panel);
  const find = id => panel.querySelector("#" + id);

  function loadState() {
    try { return JSON.parse(localStorage.getItem(storageKey)) || { rules: {}, words: {} }; }
    catch (storageError) { console.warn("Edit mode could not read saved changes:", storageError); return { rules: {}, words: {} }; }
  }
  function saveState() {
    try { localStorage.setItem(storageKey, JSON.stringify(state)); }
    catch (storageError) { console.warn("Edit mode could not save changes in this browser:", storageError); }
    renderOverrides();
  }
  function remember() { history.push(JSON.stringify(state)); if (history.length > 100) history.shift(); }

  function renderOverrides() {
    overrideStyle.textContent = Object.entries(state.rules).map(([selector, properties]) =>
      `${selector} { ${Object.entries(properties).map(([name, value]) => `${name}: ${value} !important;`).join(" ")} }`).join("\n");
    Object.entries(state.words).forEach(([selector, text]) => {
      const element = document.querySelector(selector);
      if (element && element !== document.activeElement) element.textContent = text;
    });
    const total = Object.keys(state.rules).length + Object.keys(state.words).length;
    find("editor-count").textContent = total ? `${total} item${total === 1 ? "" : "s"} changed` : "";
  }

  // A selector that names exactly this element, counted from the nearest ancestor with an id.
  function exactSelector(element) {
    const parts = [];
    while (element && element !== document.body) {
      if (element.id) { parts.unshift("#" + element.id); break; }
      const tag = element.tagName.toLowerCase();
      const sameTag = Array.from(element.parentElement.children).filter(sibling => sibling.tagName === element.tagName);
      parts.unshift(sameTag.length > 1 ? `${tag}:nth-of-type(${sameTag.indexOf(element) + 1})` : tag);
      element = element.parentElement;
    }
    return parts.join(" > ");
  }
  function classPart(element) {
    return Array.from(element.classList).filter(name => !name.startsWith("editor-")).map(name => "." + name).join("");
  }
  // A selector for every element of the same kind, such as every build description.
  function familySelector(element) {
    const ownPart = element.tagName.toLowerCase() + classPart(element);
    const parentWithClass = element.parentElement.closest("[class]:not(.page)");
    return parentWithClass ? `${parentWithClass.tagName.toLowerCase()}${classPart(parentWithClass)} ${ownPart}` : ownPart;
  }
  function describe(element) {
    const text = (element.innerText || element.getAttribute("alt") || "").trim().replace(/\s+/g, " ");
    const kind = { H1: "Big heading", H2: "Heading", H3: "Small heading", P: "Paragraph", A: "Link", IMG: "Photo", LI: "List item",
                   SPAN: "Text", BUTTON: "Button", NAV: "Top bar", SECTION: "Section", FOOTER: "Footer" }[element.tagName] || "Block";
    return text ? `${kind}: “${text.slice(0, 48)}${text.length > 48 ? "…" : ""}”` : kind;
  }

  function currentSelector() {
    return find("editor-all").checked ? familySelector(selected) : exactSelector(selected);
  }
  function setProperty(name, value) {
    const selector = currentSelector();
    state.rules[selector] = { ...(state.rules[selector] || {}), [name]: value };
    saveState();
  }

  function select(element) {
    selected?.classList.remove("editor-selected");
    selected = element;
    selected.classList.add("editor-selected");
    find("editor-picked").textContent = describe(element);
    find("editor-controls").hidden = false;
    const familyCount = document.querySelectorAll(familySelector(element)).length;
    find("editor-all").checked = false;
    find("editor-all-label").textContent = `Change all like this (${familyCount} on this page)`;
    readControls();
  }
  function readControls() {
    const look = getComputedStyle(selected);
    const fontSize = parseFloat(look.fontSize);
    const lineHeight = look.lineHeight === "normal" ? 1.2 : parseFloat(look.lineHeight) / fontSize;
    find("editor-size").value = Math.round(fontSize); find("editor-size-out").textContent = Math.round(fontSize) + "px";
    find("editor-weight").value = look.fontWeight; find("editor-weight-out").textContent = look.fontWeight;
    find("editor-color").value = toHex(look.color);
    find("editor-opacity").value = Math.round(parseFloat(look.opacity) * 100); find("editor-opacity-out").textContent = find("editor-opacity").value + "%";
    find("editor-width").value = Math.round(selected.getBoundingClientRect().width); find("editor-width-out").textContent = find("editor-width").value + "px";
    find("editor-line").value = lineHeight.toFixed(2); find("editor-line-out").textContent = lineHeight.toFixed(2);
  }
  function toHex(color) {
    const channels = color.match(/\d+(\.\d+)?/g) || ["0", "0", "0"];
    return "#" + channels.slice(0, 3).map(channel => Math.round(Number(channel)).toString(16).padStart(2, "0")).join("");
  }

  function bindSlider(id, property, unit, format) {
    const slider = find(id);
    slider.addEventListener("pointerdown", remember);
    slider.addEventListener("input", () => {
      if (!selected) return;
      setProperty(property, slider.value + unit);
      find(id + "-out").textContent = format ? format(slider.value) : slider.value + unit;
    });
  }
  bindSlider("editor-size", "font-size", "px");
  bindSlider("editor-weight", "font-weight", "");
  bindSlider("editor-line", "line-height", "");
  find("editor-width").addEventListener("pointerdown", remember);
  find("editor-width").addEventListener("input", () => {
    if (!selected) return;
    setProperty("max-width", "none");
    setProperty("width", find("editor-width").value + "px");
    find("editor-width-out").textContent = find("editor-width").value + "px";
  });
  find("editor-opacity").addEventListener("pointerdown", remember);
  find("editor-opacity").addEventListener("input", () => {
    if (!selected) return;
    setProperty("opacity", String(find("editor-opacity").value / 100));
    find("editor-opacity-out").textContent = find("editor-opacity").value + "%";
  });
  find("editor-color").addEventListener("pointerdown", remember);
  find("editor-color").addEventListener("input", () => { if (selected) setProperty("color", find("editor-color").value); });

  function currentShift() {
    const translate = (state.rules[currentSelector()] || {}).translate || "0px 0px";
    return translate.split(" ").map(parseFloat);
  }
  function moveBy(deltaX, deltaY) {
    const [x, y] = currentShift();
    setProperty("translate", `${Math.round(x + deltaX)}px ${Math.round(y + deltaY)}px`);
  }

  panel.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.move) { remember(); const [x, y] = button.dataset.move.split(",").map(Number); moveBy(x, y); return; }
    const action = button.dataset.action;
    if (action === "fold") { panel.classList.toggle("is-folded"); button.textContent = panel.classList.contains("is-folded") ? "Show" : "Hide"; }
    if (action === "pick") { picking = !picking; button.classList.toggle("is-on", picking); button.textContent = `Picking: ${picking ? "On" : "Off"}`; }
    if (action === "undo" && history.length) { Object.assign(state, JSON.parse(history.pop())); saveState(); location.reload(); }
    if (action === "reset" && Object.keys(state.rules).length + Object.keys(state.words).length) {
      remember(); state.rules = {}; state.words = {}; saveState(); location.reload();
    }
    if (action === "center" && selected) { remember(); setProperty("translate", "0px 0px"); }
    if (action === "clear" && selected) {
      remember();
      delete state.rules[exactSelector(selected)]; delete state.rules[familySelector(selected)];
      const hadWords = delete state.words[exactSelector(selected)];
      saveState(); hadWords ? location.reload() : readControls();
    }
    if (action === "words" && selected) editWords();
    if (action === "copy") copyChanges();
    if (action === "leave") { try { localStorage.removeItem("site-editor-on"); } catch (storageError) { console.warn(storageError); } location.href = location.pathname; }
  });

  function editWords() {
    if (selected.children.length) {
      find("editor-picked").textContent = "This holds several pieces. Click the exact words you want to change.";
      return;
    }
    remember();
    picking = false;
    selected.contentEditable = "true";
    selected.focus();
    selected.addEventListener("blur", function finishWords() {
      selected.removeEventListener("blur", finishWords);
      selected.contentEditable = "false";
      state.words[exactSelector(selected)] = selected.textContent;
      picking = true;
      saveState();
    });
  }

  function copyChanges() {
    const styleLines = Object.entries(state.rules).map(([selector, properties]) =>
      `${selector} { ${Object.entries(properties).map(([name, value]) => `${name}: ${value};`).join(" ")} }`);
    const wordLines = Object.entries(state.words).map(([selector, text]) => `${selector} → "${text}"`);
    const report = [`Website changes from edit mode, page ${location.pathname}`,
      styleLines.length ? "Looks:\n" + styleLines.join("\n") : "", wordLines.length ? "Words:\n" + wordLines.join("\n") : ""]
      .filter(Boolean).join("\n\n");
    const output = find("editor-output");
    output.value = report;
    output.hidden = false;
    output.select();
    navigator.clipboard?.writeText(report).then(
      () => { find("editor-count").textContent = "Copied. Paste it to Claude."; },
      () => { find("editor-count").textContent = "Copy the text below and paste it to Claude."; });
  }

  // Picking: hover outlines, click selects (links don't open while picking), drag moves.
  document.addEventListener("mouseover", event => {
    if (!picking || panel.contains(event.target)) return;
    event.target.classList.add("editor-hover");
  });
  document.addEventListener("mouseout", event => event.target.classList?.remove("editor-hover"));
  document.addEventListener("click", event => {
    if (!picking || panel.contains(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    select(event.target);
  }, true);

  let drag = null;
  document.addEventListener("pointerdown", event => {
    if (!picking || !selected || event.target !== selected) return;
    remember();
    drag = { startX: event.clientX, startY: event.clientY, shift: currentShift() };
  });
  document.addEventListener("pointermove", event => {
    if (!drag) return;
    event.preventDefault();
    const x = drag.shift[0] + event.clientX - drag.startX;
    const y = drag.shift[1] + event.clientY - drag.startY;
    setProperty("translate", `${Math.round(x)}px ${Math.round(y)}px`);
  });
  document.addEventListener("pointerup", () => { drag = null; });
  document.addEventListener("dragstart", event => { if (picking) event.preventDefault(); });

  document.addEventListener("keydown", event => {
    if (!selected || selected.isContentEditable || panel.contains(document.activeElement)) return;
    const step = event.shiftKey ? 20 : 2;
    const moves = { ArrowUp: [0, -step], ArrowDown: [0, step], ArrowLeft: [-step, 0], ArrowRight: [step, 0] };
    if (moves[event.key]) { event.preventDefault(); remember(); moveBy(...moves[event.key]); }
    if (event.key === "Escape") { selected.classList.remove("editor-selected"); selected = null; find("editor-controls").hidden = true; }
  });

  renderOverrides();
})();
