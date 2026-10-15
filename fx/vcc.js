/* ============================================================
   derj-website-vCC — FX layer (performance pass)
   Palette picker + 3D hue-tint + light element-level glitch +
   lightning strobe + legal popups + underground trigger.

   Removed for speed (they made everything janky over the WebGL
   scene): per-letter DOM splitting, per-frame hit-testing and the
   full-screen mix-blend-mode overlays (tint/scan/beams/burst).
   ============================================================ */
(function () {
  "use strict";
  if (window.__vccLoaded) return;
  window.__vccLoaded = true;

  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var root = document.documentElement;

  /* ---------------- palettes ---------------- */
  var PALETTES = [
    { n: "Seagreen · Magenta", a: "#1f8a5b", b: "#ff2db8" },
    { n: "Mint · Violet",      a: "#74ffb0", b: "#8a2be2" },
    { n: "Blau · Amber",       a: "#0b1e6b", b: "#ffb000" },
    { n: "Blau · Grün",        a: "#0b1e6b", b: "#00e676" },
    { n: "Yellow · Pink",      a: "#ffe600", b: "#ff5fa2" },
    { n: "Red · White",        a: "#ff2d2d", b: "#f4f4f6" },
    { n: "Red · Blue",         a: "#ff2d2d", b: "#2d6bff" },
    { n: "Amber · Magenta",    a: "#ffb000", b: "#ff2db8" },
    { n: "Teal · Orange",      a: "#00b3a4", b: "#ff7a18" },
    { n: "Cyan · Red",         a: "#00e5ff", b: "#ff2d55" },
    { n: "Lime · Purple",      a: "#b6ff00", b: "#9b00ff" },
    { n: "Petrol · Magenta",   a: "#0a3333", b: "#ff3660" }
  ];
  var palIdx = parseInt(localStorage.getItem("derj-pal") || "11", 10);
  if (!(palIdx >= 0 && palIdx < PALETTES.length)) palIdx = 11;
  var COLA = PALETTES[palIdx].a, COLB = PALETTES[palIdx].b;

  function mk(tag, id, cls) { var e = document.createElement(tag); if (id) e.id = id; if (cls) e.className = cls; return e; }
  function hexToHue(hex) {
    var h = hex.replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (!d) return 0;
    var hue;
    if (mx === r) hue = ((g - b) / d) % 6; else if (mx === g) hue = (b - r) / d + 2; else hue = (r - g) / d + 4;
    hue *= 60; if (hue < 0) hue += 360;
    return hue;
  }
  function hexMix(hex, withHex, t) {
    function p(h) { h = h.replace("#", ""); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
    var a = p(hex), b = p(withHex);
    return "#" + a.map(function (v, i) { return ("0" + Math.round(v + (b[i] - v) * t).toString(16)).slice(-2); }).join("");
  }
  function hexToRgb(h) {
    h = h.replace("#", "");
    return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
  }
  /* recolour a canvas texture in place: saturated pixels -> nearest palette colour,
     keeping their brightness so shading/gradients survive. Original kept once. */
  function tintTexture(t, A, B, key) {
    if (!t || !t.image || !t.image.getContext || t.__vccPal === key) return;
    var img = t.image, ctx;
    try { ctx = img.getContext("2d"); } catch (e) { return; }
    if (!ctx || !img.width) return;
    var w = img.width, h = img.height;
    try { if (!t.__vccOrig) t.__vccOrig = ctx.getImageData(0, 0, w, h); } catch (e) { return; }
    var src = t.__vccOrig.data;
    var out = ctx.createImageData(w, h), d = out.data;
    var ca = hexToRgb(A), cb = hexToRgb(B);
    for (var i = 0; i < src.length; i += 4) {
      var r = src[i], g = src[i + 1], b = src[i + 2], al = src[i + 3];
      var mx = Math.max(r, g, b), mn = Math.min(r, g, b), df = mx - mn;
      if (!mx || df / mx < 0.2 || mx < 45) { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = al; continue; }
      var hh = 0; if (mx === r) hh = ((g - b) / df) % 6; else if (mx === g) hh = (b - r) / df + 2; else hh = (r - g) / df + 4;
      hh *= 60; if (hh < 0) hh += 360;
      var dRed = Math.abs(((hh - RED_ANCHOR + 540) % 360) - 180), dBlue = Math.abs(((hh - BLUE_ANCHOR + 540) % 360) - 180);
      var C = dBlue <= dRed ? ca : cb, lum = mx / 255;
      d[i] = Math.round(C[0] * 255 * lum); d[i + 1] = Math.round(C[1] * 255 * lum); d[i + 2] = Math.round(C[2] * 255 * lum); d[i + 3] = al;
    }
    ctx.putImageData(out, 0, 0);
    t.needsUpdate = true;
    t.__vccPal = key;
  }
  var BASE_HUE = 353.7; /* the site's default "hot" red (#ff4b5c) */
  /* The 3D scene has exactly two accent families: a blue (~237deg) and the hot red (~354deg).
     Assign them to the palette by ROLE (blue -> A, red -> B) instead of nearest-hue:
     nearest-hue collapsed the whole scene onto one colour for palettes whose B hue sits
     between the two scene hues (mint/violet, yellow/pink, lime/purple, blau/gruen, ...). */
  var BLUE_ANCHOR = 237, RED_ANCHOR = 354;
  var sceneCanvas = null;
  /* recolour the 3D directly: map the scene's two accent hues onto the palette colours */
  function tintScene(colB) {
    var A = COLA;
    var st = window.__r3f;
    if (!st || !st.scene) {
      /* scene not built yet -> retry a few times */
      if (!tintScene._t || performance.now() - tintScene._t > 200) {
        tintScene._t = performance.now();
        setTimeout(function () { tintScene(colB); }, 300);
      }
      return;
    }
    var palKey = A + "|" + colB;
    st.scene.traverse(function (o) {
      var m = o.material; if (!m) return;
      var cs = [];
      if (m.color) cs.push(m.color);
      if (m.emissive) cs.push(m.emissive);
      /* hue+saturation from CLAMPED rgb: some scene colours are HDR/over-driven
         (r,g,b > 1), where Color.getHSL() returns garbage (negative saturation),
         which used to freeze those materials as "neutral". */
      function rgbToHS(c) {
        var r = Math.min(1, Math.max(0, c.r)), g = Math.min(1, Math.max(0, c.g)), b = Math.min(1, Math.max(0, c.b));
        var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
        if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
        return { h: h, s: mx ? d / mx : 0 };
      }
      function nearest(c) {
        if (!c || !c.setStyle) return;
        if (c.__vccH === undefined) {
          var hs = rgbToHS(c);
          c.__vccH = hs.h; c.__vccS = hs.s;
        }
        if (c.__vccS < 0.25) return;              /* greys/white/black stay neutral */
        var dRed = Math.abs(((c.__vccH - RED_ANCHOR + 540) % 360) - 180);
        var dBlue = Math.abs(((c.__vccH - BLUE_ANCHOR + 540) % 360) - 180);
        c.setStyle(dBlue <= dRed ? A : colB);
      }
      for (var i = 0; i < cs.length; i++) nearest(cs[i]);
      if (m.uniforms) {
        for (var k in m.uniforms) {
          var u = m.uniforms[k]; if (!u) continue;
          var v = u.value;
          if (v && v.isColor) nearest(v);
          else if (v && v.length && v[0] && v[0].isColor) { for (var q = 0; q < v.length; q++) nearest(v[q]); }
        }
      }
      if (o.isInstancedMesh && o.instanceColor) {
        var ic = o.instanceColor, cnt = ic.count;
        if (!ic.__vccH) {
          ic.__vccH = new Float32Array(cnt); ic.__vccS = new Float32Array(cnt);
          for (var t = 0; t < cnt; t++) {
            var rr = ic.getX(t), gg = ic.getY(t), bb = ic.getZ(t);
            var mx = Math.max(rr, gg, bb), mn = Math.min(rr, gg, bb), dd = mx - mn, hh = 0;
            if (dd) { if (mx === rr) hh = ((gg - bb) / dd) % 6; else if (mx === gg) hh = (bb - rr) / dd + 2; else hh = (rr - gg) / dd + 4; hh *= 60; if (hh < 0) hh += 360; }
            ic.__vccH[t] = hh; ic.__vccS[t] = mx ? dd / mx : 0;
          }
        }
        for (var t2 = 0; t2 < cnt; t2++) {
          if (ic.__vccS[t2] < 0.25) continue;   /* keep neutral instance colours */
          var dRi = Math.abs(((ic.__vccH[t2] - RED_ANCHOR + 540) % 360) - 180);
          var dBi = Math.abs(((ic.__vccH[t2] - BLUE_ANCHOR + 540) % 360) - 180);
          var prgb = hexToRgb(dBi <= dRi ? A : colB);
          ic.setXYZ(t2, prgb[0], prgb[1], prgb[2]);
        }
        ic.needsUpdate = true;
        if (m.needsUpdate !== undefined) m.needsUpdate = true;
      }
      var maps = [m.map, m.emissiveMap, m.alphaMap];
      for (var mi = 0; mi < maps.length; mi++) tintTexture(maps[mi], A, colB, palKey);
      if (m.needsUpdate !== undefined) m.needsUpdate = true;
    });
  }

  /* ---------------- palette UI ---------------- */
  var pal = mk("div", "vcc-pal");
  var chip = mk("button", "vcc-chip");
  chip.type = "button";
  chip.title = "Farbpalette wählen";
  chip.setAttribute("aria-label", "Farbpalette wählen");
  var menu = mk("div", "vcc-menu");
  PALETTES.forEach(function (p, i) {
    var o = mk("div", null, "vcc-opt");
    o.style.background = "linear-gradient(90deg," + p.a + "," + p.b + ")";
    o.innerHTML = '<span class="sw" style="color:' + p.b + ';background:linear-gradient(135deg,' + p.a + ' 0 50%,' + p.b + ' 50% 100%)"></span>' + p.n;
    o.addEventListener("click", function () { applyPalette(i, true); menu.classList.remove("open"); });
    menu.appendChild(o);
  });
  pal.appendChild(chip);
  pal.appendChild(menu);

  function markActive() { [].forEach.call(menu.children, function (o, i) { o.classList.toggle("active", i === palIdx); }); }
  function applyPalette(i, save) {
    palIdx = i;
    var A = PALETTES[i].a, B = PALETTES[i].b;
    COLA = A; COLB = B;
    root.style.setProperty("--colA", A);
    root.style.setProperty("--colB", B);
    root.style.setProperty("--neon", B);
    /* flip the whole DOM too, not just the overlay */
    root.style.setProperty("--color-acid", A);
    root.style.setProperty("--color-hot", B);
    /* alpha/tint derivatives for the bundle's hard-coded accents (.chip-major, .rays-bg) */
    root.style.setProperty("--colA-lt", hexMix(A, "#ffffff", 0.62));
    root.style.setProperty("--colA-55", A + "8c");
    root.style.setProperty("--colB-16", B + "29");
    chip.style.background = "linear-gradient(135deg," + A + " 0 50%," + B + " 50% 100%)";
    tintScene(B);
    if (save) localStorage.setItem("derj-pal", String(i));
    markActive();
  }
  chip.addEventListener("click", function (e) { e.stopPropagation(); menu.classList.toggle("open"); });
  document.addEventListener("click", function (e) {
    if (!e.target.closest || !e.target.closest("#vcc-pal")) menu.classList.remove("open");
  });

  /* ---------------- lightning strobe (rare, cheap) ---------------- */
  var strobe = mk("div", "vcc-strobe");
  function fireLightning() {
    if (reduce) return;
    var flashes = 2 + ((Math.random() * 3) | 0), i = 0;
    (function step() {
      if (i++ >= flashes) { strobe.style.opacity = "0"; return; }
      strobe.style.transition = "none";
      strobe.style.opacity = String(0.16 + Math.random() * 0.4);
      setTimeout(function () {
        strobe.style.opacity = "0";
        setTimeout(step, 40 + Math.random() * 90);
      }, 28 + Math.random() * 40);
    })();
  }
  var stormTimer = 0;
  function scheduleStorm() {
    clearTimeout(stormTimer);
    stormTimer = setTimeout(function () {
      if (document.hidden) return scheduleStorm();
      fireLightning();
      scheduleStorm();
    }, 10000 + Math.random() * 15000);
  }
  addEventListener("keydown", function (e) { if (e.key === "g" || e.key === "G") fireLightning(); });

  /* ---------------- text glitch (per-letter, throttled) ---------------- */
  var GL_FONTS = ['"VT323",monospace', '"Major Mono Display",monospace', '"Syne Mono",monospace',
    '"Black Ops One",cursive', '"Wallpoet",cursive', '"Orbitron",sans-serif',
    '"Chakra Petch",sans-serif', '"Anton",sans-serif'];
  function rFont() { return GL_FONTS[(Math.random() * GL_FONTS.length) | 0]; }

  function splitLetters(node) {
    [].slice.call(node.childNodes).forEach(function (ch) {
      if (ch.nodeType === 3) {
        var text = ch.textContent;
        if (!/\S/.test(text)) return;
        var frag = document.createDocumentFragment(), word = null;
        for (var k = 0; k < text.length; k++) {
          var c = text[k];
          if (c === " " || c === "\n" || c === "\t") {
            if (word) { frag.appendChild(word); word = null; }
            frag.appendChild(document.createTextNode(c));
          } else {
            if (!word) { word = document.createElement("span"); word.className = "vcc-word"; }
            var s = document.createElement("span"); s.className = "vcc-gl"; s.textContent = c;
            word.appendChild(s);
          }
        }
        if (word) frag.appendChild(word);
        node.replaceChild(frag, ch);
      } else if (ch.nodeType === 1 && !/^(SCRIPT|STYLE|INPUT|TEXTAREA|SELECT|CANVAS|SVG|PATH|IFRAME|BUTTON)$/.test(ch.tagName)) {
        if (ch.classList && ch.classList.contains("vcc-copy")) return;
        splitLetters(ch);
      }
    });
  }
  function chaos(s, colorize, strong) {
    s.style.fontFamily = rFont();
    s.style.display = "inline-block";
    var skewMax = strong ? 9 : (s.dataset.heading === "1" ? 1.0 : 4.0);
    s.style.transform = "skewX(" + (Math.random() * skewMax * 2 - skewMax).toFixed(1) + "deg)";
    if (strong) s.style.transform += " translate(" + Math.round(Math.random() * 10 - 5) + "px," + Math.round(Math.random() * 10 - 5) + "px)";
    if (colorize) {
      var a = Math.random() < 0.5;
      s.classList.toggle("blipA", a);
      s.classList.toggle("blip", !a);
    }
  }
  function reset(s) {
    s.style.fontFamily = ""; s.style.transform = "";
    s.classList.remove("blip", "blipA");
  }

  var glEls = [];
  var live = new Set();
  function collect() {
    var sel = "h1,h2,h3,h4,h5,p,li,a,span[class]";
    var out = [];
    [].forEach.call(document.querySelectorAll(sel), function (el) {
      if (el.closest("form") || el.closest("#vcc-pal") || el.closest("button") || el.closest("#vcc-ug") || el.closest(".vcc-copy")) return;
      if (el.closest("#root") === null && !el.closest("#root")) return;
      if (el.querySelector(".vcc-gl")) return;
      var txt = el.textContent || "";
      if (txt.trim().length < 2 || txt.length > 220) return;
      var r = el.getBoundingClientRect();
      if (r.width === 0) return;
      out.push(el);
    });
    return out;
  }

  function titleText(t) {
    var c = t.cloneNode(true);
    [].forEach.call(c.querySelectorAll(".vcc-copy,.vcc-reg"), function (n) { n.parentNode && n.parentNode.removeChild(n); });
    return (c.textContent || "").replace(/\s+/g, " ").replace(/[\u00ae]/g, "").trim();
  }
  function tagTitle() {
    var t = document.querySelector("#hero h1");
    if (!t) return;
    var txt = titleText(t);
    if (!txt) return;
    if (t.getAttribute("data-text") !== txt) t.setAttribute("data-text", txt);
    if (!t.classList.contains("vcc-title")) t.classList.add("vcc-title");
    if (!t.querySelector(".vcc-copy")) {
      ["vcc-c1", "vcc-c2", "vcc-c3"].forEach(function (c) {
        var s = document.createElement("span");
        s.className = "vcc-copy " + c;
        s.setAttribute("aria-hidden", "true");
        s.textContent = txt;
        t.appendChild(s);
      });
    }
  }

  function initGlitch() {
    if (reduce) return;
    (function attempt(n) {
      var list = collect();
      if (!list.length && n < 25) return setTimeout(function () { attempt(n + 1); }, 400);
      list.forEach(function (el) {
        try {
          splitLetters(el);
          el._letters = [].slice.call(el.querySelectorAll(".vcc-gl"));
          if (el.matches("h1,h2,h3")) el._letters.forEach(function (s) { s.dataset.heading = "1"; });
          if (el.classList.contains("vcc-title")) el._letters.forEach(function (s) { s.dataset.title = "1"; });
          glEls.push(el);
        } catch (e) {}
      });
      /* self-heal: React may re-render and wipe our spans */
      setInterval(function () {
        if (document.hidden) return;
        tagTitle();
        var fresh = collect();
        if (fresh.length) {
          fresh.slice(0, 30).forEach(function (el) {
            try {
              splitLetters(el);
              el._letters = [].slice.call(el.querySelectorAll(".vcc-gl"));
              if (el.classList.contains("vcc-title")) el._letters.forEach(function (s) { s.dataset.title = "1"; });
              glEls.push(el);
            } catch (e) {}
          });
        }
      }, 6000);
      runGlitch();
    })(0);
  }

  function runGlitch() {
    /* idle colour-blotch glitches on visible text */
    setInterval(function () {
      if (document.hidden) return;
      for (var k = 0; k < 3; k++) {
        var el = glEls[(Math.random() * glEls.length) | 0];
        if (!el || !el._letters || !el._letters.length) continue;
        var r = el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight) continue;
        var s = el._letters[(Math.random() * el._letters.length) | 0];
        if (!s || live.has(s)) continue;
        var cls = Math.random() < 0.5 ? "blip" : "blipA";
        s.classList.add(cls);
        if (Math.random() < 0.5) s.style.fontFamily = rFont();
        (function (s, cls) {
          setTimeout(function () {
            if (!live.has(s)) { s.classList.remove(cls); s.style.fontFamily = ""; }
          }, 120 + Math.random() * 180);
        })(s, cls);
      }
    }, 520);

    /* hover: morphing blob zone around the cursor (throttled + rect-cached) */
    var R = 52;
    var lobes = [{ k: 3, a: 0.35, p: 0 }, { k: 5, a: 0.22, p: 2 }, { k: 2, a: 0.18, p: 4 }];
    var tick = 0;
    function regen() {
      var n = 3 + ((Math.random() * 2) | 0); lobes = [];
      for (var i = 0; i < n; i++) lobes.push({ k: 2 + ((Math.random() * 4) | 0), a: 0.12 + Math.random() * 0.3, p: Math.random() * 6.28 });
    }
    function blobR(ang, t) {
      var m = 1;
      for (var i = 0; i < lobes.length; i++) m += lobes[i].a * Math.sin(lobes[i].k * ang + lobes[i].p + t * 0.7);
      return R * m;
    }
    var lastSeen = new Map(), fadeMs = 450, mx = -999, my = -999;
    addEventListener("pointermove", function (e) { mx = e.clientX; my = e.clientY; }, { passive: true });
    addEventListener("pointerleave", function () { mx = -999; my = -999; });
    var rectsDirty = true, lastScan = 0;
    function markDirty() { rectsDirty = true; }
    addEventListener("scroll", markDirty, { passive: true });
    addEventListener("resize", markDirty);

    function frame(now) {
      requestAnimationFrame(frame);
      if (document.hidden || mx < -900) { live.clear(); return; }
      if (now - lastScan < 68) return;
      lastScan = now;
      var t = now / 1000;
      if (++tick > 34) { tick = 0; regen(); }
      var seen = new Set(), lim = R * 1.6;
      for (var i = 0; i < glEls.length; i++) {
        var el = glEls[i];
        if (!el._letters || !el._letters.length) continue;
        var r = el.__rect;
        if (rectsDirty || !r) { r = el.__rect = el.getBoundingClientRect(); }
        if (r.width === 0 || r.bottom < -lim || r.top > innerHeight + lim) continue;
        if (mx < r.left - lim || mx > r.right + lim || my < r.top - lim || my > r.bottom + lim) continue;
        for (var j = 0; j < el._letters.length; j++) {
          var s = el._letters[j], b = s.getBoundingClientRect();
          var dx = mx - (b.left + b.width / 2), dy = my - (b.top + b.height / 2);
          if (Math.sqrt(dx * dx + dy * dy) < blobR(Math.atan2(dy, dx), t)) seen.add(s);
        }
      }
      rectsDirty = false;
      seen.forEach(function (s) {
        lastSeen.set(s, performance.now());
        if (Math.random() < (s.dataset.heading === "1" ? 0.35 : 0.6)) chaos(s, true);
      });
      lastSeen.forEach(function (ts, s) {
        if (!seen.has(s) && performance.now() - ts > fadeMs) { reset(s); lastSeen.delete(s); }
      });
      live.clear();
      lastSeen.forEach(function (_, s) { live.add(s); });
    }
    requestAnimationFrame(frame);

    /* TV flicker on the hero title while hovering it */
    var tries = 0;
    var tv = setInterval(function () {
      var hero = document.querySelector("h1");
      if (hero) { if (!hero.classList.contains("vcc-title")) hero.classList.add("vcc-tv-host"); clearInterval(tv); }
      else if (++tries > 40) clearInterval(tv);
    }, 500);

    /* hero title: per-letter chaos bursts + zap sparks (frequent, heavy) */
    setInterval(function () {
      if (document.hidden) return;
      var t = document.querySelector(".vcc-title");
      if (!t || !t._letters || !t._letters.length) return;
      var n = 2 + ((Math.random() * 5) | 0);
      for (var i = 0; i < n; i++) {
        var s = t._letters[(Math.random() * t._letters.length) | 0];
        if (!s) continue;
        chaos(s, true, true);
        (function (s) { setTimeout(function () { reset(s); }, 150 + Math.random() * 360); })(s);
      }
    }, 900);
    setInterval(function () {
      if (document.hidden) return;
      var t = document.querySelector(".vcc-title");
      if (!t) return;
      t.classList.add("vcc-zap");
      setTimeout(function () { t.classList.remove("vcc-zap"); }, 460);
    }, 2400 + Math.random() * 2200);
  }

  /* ---------------- legal popups (Impressum / Datenschutz) ---------------- */
  var LEGAL = {
    im: {
      kicker: "Rechtliches",
      title: "Impressum",
      body:
        '<h4>Angaben gem\u00e4\u00df \u00a75 TMG</h4><p>[Vollst\u00e4ndiger Name]<br>[Stra\u00dfe Hausnummer]<br>[PLZ Ort], Deutschland</p>' +
        '<h4>Kontakt</h4><p>Telefon: [Telefonnummer]<br>E-Mail: booking@derj.de</p>' +
        '<h4>Umsatzsteuer</h4><p>USt-IdNr.: [falls vorhanden]</p>' +
        '<h4>Verantwortlich i.S.d. \u00a718 Abs.2 MStV</h4><p>[Name, Anschrift wie oben]</p>' +
        '<h4>Haftung f\u00fcr Inhalte</h4><p>Als Diensteanbieter sind wir gem\u00e4\u00df \u00a77 Abs.1 TMG f\u00fcr eigene Inhalte verantwortlich. Nach \u00a7\u00a78\u201310 TMG besteht keine Pflicht, fremde Informationen zu \u00fcberwachen.</p>' +
        '<h4>Haftung f\u00fcr Links</h4><p>F\u00fcr externe Inhalte wird keine Gew\u00e4hr \u00fcbernommen \u2014 verantwortlich ist der jeweilige Anbieter.</p>' +
        '<h4>Urheberrecht</h4><p>Alle Inhalte unterliegen dem deutschen Urheberrecht. Verwertung nur mit schriftlicher Zustimmung.</p>' +
        '<p class="vcc-edit">EDIT: echte Daten eintragen ([Name], [Adresse] usw. ersetzen).</p>'
    },
    ds: {
      kicker: "Rechtliches",
      title: "Datenschutz",
      body:
        '<h4>Verantwortlicher</h4><p>[Name, Anschrift], erreichbar unter booking@derj.de.</p>' +
        '<h4>Hosting / Server-Logs</h4><p>Beim Aufruf der Seite speichert der Hoster technische Daten (IP-Adresse, Datum/Uhrzeit, Browser). Grundlage: Art.6 Abs.1 lit.f DSGVO.</p>' +
        '<h4>Schriftarten</h4><p>Diese Seite bindet Schriftarten lokal ein (Self-Hosting). Die Schriftdateien werden direkt von unserem Server geladen \u2014 es werden keine Verbindungen zu Drittanbietern aufgebaut und keine IP-Adressen an Dritte \u00fcbermittelt.</p>' +
        '<h4>Kontaktformular</h4><p>Name, E-Mail und Nachricht dienen nur der Bearbeitung deiner Anfrage (Art.6 Abs.1 lit.b/f DSGVO) und werden danach gel\u00f6scht. Der Versand l\u00e4uft \u00fcber dein eigenes Mailprogramm.</p>' +
        '<h4>SoundCloud-Embed</h4><p>Der Player (iframe) \u00fcbertr\u00e4gt technische Daten an die SoundCloud Ltd. (Art.6 Abs.1 lit.f DSGVO).</p>' +
        '<h4>CDN-Bibliotheken</h4><p>Animationen laden Bibliotheken von unpkg.com / cdnjs.cloudflare.com \u2014 dabei geht die IP an den jeweiligen CDN-Anbieter.</p>' +
        '<h4>Cookies / lokaler Speicher</h4><p>Keine Tracking-Cookies. Deine Farbwahl wird nur lokal im Browser gespeichert (localStorage) und nicht \u00fcbertragen.</p>' +
        '<h4>Deine Rechte</h4><p>Auskunft, Berichtigung, L\u00f6schung, Einschr\u00e4nkung, Widerspruch, \u00dcbertragbarkeit (Art.15\u201321 DSGVO) + Beschwerde bei der Aufsichtsbeh\u00f6rde (BayLDA).</p>'
    }
  };
  function initLegal() {
    var modal = mk("div", "vcc-legal");
    modal.innerHTML =
      '<div class="vcc-legal-backdrop" data-close="1"></div>' +
      '<div class="vcc-legal-box" role="dialog" aria-modal="true">' +
      '<button class="vcc-legal-x" data-close="1" aria-label="Schlie\u00dfen">\u00d7</button>' +
      '<div class="vcc-legal-kicker" id="vcc-legal-kicker"></div>' +
      '<h3 id="vcc-legal-title"></h3>' +
      '<div class="vcc-legal-body" id="vcc-legal-body"></div>' +
      '</div>';
    document.body.appendChild(modal);
    var kicker = modal.querySelector("#vcc-legal-kicker");
    var title = modal.querySelector("#vcc-legal-title");
    var body = modal.querySelector("#vcc-legal-body");
    function open(kind) {
      var d = LEGAL[kind] || LEGAL.im;
      kicker.textContent = d.kicker;
      title.textContent = d.title;
      body.innerHTML = d.body;
      modal.classList.add("open");
    }
    function close() { modal.classList.remove("open"); }
    modal.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest("[data-close]")) close();
    });
    addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
    document.addEventListener("click", function (e) {
      var a = e.target.closest ? e.target.closest("a") : null;
      if (!a) return;
      var t = (a.textContent || "").trim().toLowerCase();
      var href = (a.getAttribute("href") || "").toLowerCase();
      var kind = null;
      if (t === "impressum" || href.indexOf("impressum") > -1) kind = "im";
      else if (t === "datenschutz" || href.indexOf("datenschutz") > -1) kind = "ds";
      if (!kind) return;
      e.preventDefault();
      e.stopPropagation();
      open(kind);
    }, true);
  }

  /* ---------------- underground: subtle bottom trigger ---------------- */
  function initUnderground() {
    var src = document.querySelector("button.btn-hot");
    if (!src) return;
    var ug = mk("button", "vcc-ug");
    ug.type = "button";
    ug.textContent = "\u2B21 Underground";
    ug.setAttribute("aria-label", "Underground Guestlist");
    ug.addEventListener("click", function () { try { src.click(); } catch (e) {} });
    document.body.appendChild(ug);
  }

  /* ---------------- boot ---------------- */
  function mount() {
    if (!document.body) return;
    document.body.appendChild(pal);
    document.body.appendChild(strobe);
    applyPalette(palIdx, false);
    /* re-apply after the scene finishes building + keep it in sync */
    setTimeout(function () { tintScene(COLB); }, 600);
    setTimeout(function () { tintScene(COLB); }, 1800);
    setInterval(function () { tintScene(COLB); }, 4000);
    tagTitle();
    setTimeout(tagTitle, 600);
    setTimeout(tagTitle, 1800);
    initGlitch();
    initLegal();
    initUnderground();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
  scheduleStorm();
})();
