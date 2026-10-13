// ── WebGL particle hero ──────────────────────────────────────────────
// Morphs a cloud of particles into the text "Biray Sütçüoğlu".
// Falls back gracefully to the plain <h1> when WebGL is unavailable
// or the user prefers reduced motion.

import * as THREE from 'three';

const TEXT = 'Biray Sütçüoğlu';
const FONT_STACK = "'Instrument Serif', 'Iowan Old Style', Georgia, serif";

const canvas = document.getElementById('hero-particles');
const main = document.querySelector('main');

// ── Bail out early on unsupported / reduced-motion environments ──────
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (!canvas || !main || prefersReduced || !hasWebGL()) {
  // Nothing to do — the <h1> remains visible as the fallback.
} else {
  init();
}

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext &&
      (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

function init() {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 1, 1, 0, -1000, 1000);

  // ── Shaders ────────────────────────────────────────────────────────
  const vertexShader = /* glsl */`
    attribute vec3 aTarget;
    uniform float uProgress;
    uniform float uSize;
    uniform vec2  uMouse;
    uniform float uRepel;
    varying float vAlpha;

    void main() {
      // Morph from the scattered start position to the text target.
      vec3 pos = mix(position, aTarget, uProgress);

      // Push particles away from the cursor (screen-space, in pixels).
      vec2 toMouse = pos.xy - uMouse;
      float d = length(toMouse);
      float force = uRepel * exp(-(d * d) / (2.0 * 70.0 * 70.0));
      pos.xy += normalize(toMouse + 0.0001) * force;

      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      gl_PointSize = uSize;
      vAlpha = 1.0;
    }
  `;

  const fragmentShader = /* glsl */`
    uniform vec3 uColor;
    varying float vAlpha;

    void main() {
      // Round, soft-edged particle.
      vec2 c = gl_PointCoord - 0.5;
      float d = length(c);
      if (d > 0.5) discard;
      float a = smoothstep(0.5, 0.05, d);
      gl_FragColor = vec4(uColor, a * vAlpha);
    }
  `;

  const uniforms = {
    uProgress: { value: 0 },
    uSize: { value: 2.0 },
    uMouse: { value: new THREE.Vector2(-9999, -9999) },
    uRepel: { value: 0 },
    uColor: { value: new THREE.Color(0xffffff) },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  let points = null;
  let targetCount = 0;

  // ── Build geometry from sampled text pixels ────────────────────────
  function build() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;

    renderer.setSize(w, h, false);
    camera.left = -w / 2;
    camera.right = w / 2;
    camera.top = h / 2;
    camera.bottom = -h / 2;
    camera.updateProjectionMatrix();

    const targets = sampleText(TEXT, w, h);
    targetCount = targets.length;
    if (targetCount === 0) return;

    const start = new Float32Array(targetCount * 3);
    const target = new Float32Array(targetCount * 3);
    const spread = Math.max(w, h) * 0.6;

    for (let i = 0; i < targetCount; i++) {
      const i3 = i * 3;
      // Random cloud start position.
      start[i3]     = (Math.random() - 0.5) * spread;
      start[i3 + 1] = (Math.random() - 0.5) * spread;
      start[i3 + 2] = (Math.random() - 0.5) * spread * 0.4;
      // Text target position.
      target[i3]     = targets[i].x;
      target[i3 + 1] = targets[i].y;
      target[i3 + 2] = 0;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(start, 3));
    geometry.setAttribute('aTarget', new THREE.BufferAttribute(target, 3));

    if (points) {
      points.geometry.dispose();
      scene.remove(points);
    }
    points = new THREE.Points(geometry, material);
    scene.add(points);

    // Point size in device pixels (gl_PointSize ignores pixelRatio).
    const dpr = renderer.getPixelRatio();
    uniforms.uSize.value = Math.max(1.5, 2.2 * dpr);
  }

  // ── Sample the text into a list of {x, y} points (world units) ─────
  function sampleText(text, w, h) {
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const ctx = off.getContext('2d', { willReadFrequently: true });
    if (!ctx) return [];

    // Fit the text to ~92% of the canvas width.
    let fontSize = h * 0.9;
    ctx.font = `${fontSize}px ${FONT_STACK}`;
    const maxWidth = w * 0.92;
    const measured = ctx.measureText(text).width;
    if (measured > maxWidth) {
      fontSize *= maxWidth / measured;
      ctx.font = `${fontSize}px ${FONT_STACK}`;
    }

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2);

    const data = ctx.getImageData(0, 0, w, h).data;
    const pts = [];
    const step = 3; // sample every 3rd pixel — density vs. perf tradeoff

    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const alpha = data[(y * w + x) * 4 + 3];
        if (alpha > 128) {
          // Convert pixel coords (origin top-left) to centered world coords.
          pts.push({ x: x - w / 2, y: h / 2 - y });
        }
      }
    }
    return pts;
  }

  // ── Theme awareness ────────────────────────────────────────────────
  // Particles are white on the dark theme; on the light theme white would
  // be invisible, so we switch to a near-black that matches the text color.
  function applyTheme() {
    const isLight = document.documentElement.classList.contains('light');
    uniforms.uColor.value.set(isLight ? 0x1a1a2e : 0xffffff);
    // Additive blending glows on dark; on light it would wash out, so use
    // normal alpha blending there instead.
    material.blending = isLight ? THREE.NormalBlending : THREE.AdditiveBlending;
    material.needsUpdate = true;
  }
  applyTheme();
  new MutationObserver(applyTheme).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });

  // ── Mouse interaction ──────────────────────────────────────────────
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    uniforms.uMouse.value.set(x - rect.width / 2, rect.height / 2 - y);
    uniforms.uRepel.value = 26;
  });
  canvas.addEventListener('mouseleave', () => {
    uniforms.uMouse.value.set(-9999, -9999);
    uniforms.uRepel.value = 0;
  });

  // ── Resize (debounced) ─────────────────────────────────────────────
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      build();
      uniforms.uProgress.value = 1; // keep text formed after resize
    }, 150);
  });

  // ── Reveal the canvas only once we're ready to draw ────────────────
  main.classList.add('webgl-active');

  // ── Animation loop ─────────────────────────────────────────────────
  const DURATION = 2200; // ms for the cloud → text morph
  let startTime = 0;
  let running = true;

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function frame(now) {
    if (!running) return;
    if (!startTime) startTime = now;

    const t = Math.min((now - startTime) / DURATION, 1);
    uniforms.uProgress.value = easeOutCubic(t);

    // Ease the repulsion back down so particles settle after a nudge.
    uniforms.uRepel.value *= 0.94;

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  // Pause rendering when the tab is hidden (saves battery).
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      running = false;
    } else if (!running) {
      running = true;
      startTime = 0;
      requestAnimationFrame(frame);
    }
  });

  // Wait for the webfont so the sampled glyphs match the real heading.
  const ready = document.fonts && document.fonts.ready
    ? document.fonts.ready
    : Promise.resolve();

  ready.then(() => {
    build();
    requestAnimationFrame(frame);
  });
}
