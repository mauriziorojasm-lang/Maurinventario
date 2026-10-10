/* ==========================================================================
   video-saas-premium — 3D stage (Three.js) for premium SaaS films. ES module.
   Procedural iPhone with a canvas-drawn live UI on the
   screen, glossy icon tile, extruded SVG logo, studio lighting with reflections.

   Load with an importmap (pin the same three version in both entries):
     <script type="importmap">{ "imports": {
       "three": "https://cdn.jsdelivr.net/npm/three@0.181.2/build/three.module.js",
       "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.181.2/examples/jsm/" } }</script>
     <script type="module">
       import { createStage, makePhone, makeTile, makeExtrudedSVG, chatUI, bindTimeline, put } from "./kit/three-stage.js";
   Layering: DOM back layer → <canvas id="gl" style="width:1920px;height:1080px"> → DOM front layer.
   World units: camera z=22, fov 30 → 1 unit ≈ 91.5 px at 1080p (screen y = 540 − y·91.5).
   ========================================================================== */
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";

export { THREE };

export function createStage({ canvas, width = 1920, height = 1080, dpr = 2, fov = 30, z = 22, exposure = 1.05, rimColor = 0xbff5ec } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(dpr);                       // dpr 2 → crisp 4K renders (render with --resolution 4k)
  renderer.setSize(width, height, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(fov, width / height, 0.1, 200);
  camera.position.set(0, 0, z);
  const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(-6, 9, 10); scene.add(key);
  const rim = new THREE.DirectionalLight(rimColor, 1.2); rim.position.set(8, -2, -6); scene.add(rim);   // tint the rim with the brand
  return { renderer, scene, camera, render: () => renderer.render(scene, camera) };
}

/* rounded-rect Shape with true arcs */
export function rr(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0);
  s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
  return s;
}
export function flatUV(geo) {   // ShapeGeometry UVs are in shape units — remap to 0..1 for textures
  geo.computeBoundingBox(); const b = geo.boundingBox, p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - b.min.x) / (b.max.x - b.min.x), (p.getY(i) - b.min.y) / (b.max.y - b.min.y));
  uv.needsUpdate = true; return geo;
}
export const extrude = (shape, depth, bev, seg = 8) => {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bev, bevelSize: bev * 0.8, bevelSegments: seg, curveSegments: 48 });
  g.translate(0, 0, -depth / 2); return g;
};

/* iPhone: titanium frame, black bezel, canvas-texture screen, additive glass glare, frosted back + camera bump.
   Returns { group, ctx, canvas, texture, SW, SH }. Draw on ctx each frame, then texture.needsUpdate = true. */
export function makePhone(stage, { frame = 0xc4c7c3, back = 0xdfe3df, screenW = 1170, glare = 0.18 } = {}) {
  const W = 3.6, H = 7.6, D = 0.34, R = 0.62, g = new THREE.Group(); stage.scene.add(g);
  const ti = new THREE.MeshPhysicalMaterial({ color: frame, metalness: 1, roughness: 0.32, clearcoat: 0.3 });
  g.add(new THREE.Mesh(extrude(rr(W - 0.12, H - 0.12, R - 0.06), D, 0.07), ti));
  const face = (mat, z, inset = 0.04, r = 0.02) => { const m = new THREE.Mesh(new THREE.ShapeGeometry(rr(W - inset, H - inset, R - r), 64), mat); m.position.z = z; g.add(m); return m; };
  face(new THREE.MeshPhysicalMaterial({ color: 0x030303, roughness: 0.2, clearcoat: 1 }), D / 2 + 0.072);
  const SW = screenW, SH = Math.round(screenW * (H - 0.34) / (W - 0.34));
  const canvas = document.createElement("canvas"); canvas.width = SW; canvas.height = SH;
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8;
  const screen = new THREE.Mesh(flatUV(new THREE.ShapeGeometry(rr(W - 0.34, H - 0.34, R - 0.17), 64)), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
  screen.position.z = D / 2 + 0.074; g.add(screen);
  // glass: black + additive blending = only the environment reflection is added (keep opacity low or the UI washes out)
  face(new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.04, clearcoat: 1, transparent: true, opacity: glare, blending: THREE.AdditiveBlending, depthWrite: false }), D / 2 + 0.078);
  const bp = face(new THREE.MeshPhysicalMaterial({ color: back, roughness: 0.55, metalness: 0.1 }), -D / 2 - 0.072); bp.rotation.y = Math.PI;
  const bump = new THREE.Mesh(extrude(rr(1.45, 1.45, 0.38), 0.07, 0.03), new THREE.MeshPhysicalMaterial({ color: 0xd2d6d2, roughness: 0.3, metalness: 0.4, clearcoat: 1 }));
  bump.position.set(0.85, 2.85, -D / 2 - 0.12); g.add(bump);
  const lens = new THREE.MeshPhysicalMaterial({ color: 0x0a0c0c, roughness: 0.08, metalness: 0.5, clearcoat: 1 });
  [[0.55, 3.15], [0.55, 2.55], [1.15, 2.85]].forEach(([x, y]) => { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.12, 48), lens); l.rotation.x = Math.PI / 2; l.position.set(x, y, -D / 2 - 0.2); g.add(l); });
  [[1.9, 0.5], [1.1, 0.75], [0.25, 0.75]].forEach(([y, h], i) => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, h, 0.16), ti); b.position.set(i ? -W / 2 - 0.02 : W / 2 + 0.02, y, 0); g.add(b); });
  return { group: g, ctx: canvas.getContext("2d"), canvas, texture, SW, SH };
}

/* Glossy app-icon tile (brand colour) with a white extruded chat bubble + 3 dots. Returns { group, dots }. */
export function makeTile(stage, { color = 0x024a43, dotColor = 0x025951, size = 2.3 } = {}) {
  const g = new THREE.Group(); stage.scene.add(g);
  g.add(new THREE.Mesh(extrude(rr(size, size, size * 0.28), 0.5, 0.1, 10), new THREE.MeshPhysicalMaterial({ color, roughness: 0.16, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.03 })));
  const bub = new THREE.Shape(); bub.absarc(0, 0.06, 0.62, -Math.PI * 0.62, Math.PI * 1.32, false); bub.lineTo(-0.62, -0.62); bub.closePath();
  const b = new THREE.Mesh(extrude(bub, 0.16, 0.05), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.25, clearcoat: 1 })); b.position.z = 0.42; g.add(b);
  const dm = new THREE.MeshPhysicalMaterial({ color: dotColor, roughness: 0.3, clearcoat: 1 });
  const dots = [-0.27, 0, 0.27].map((x) => { const d = new THREE.Mesh(new THREE.SphereGeometry(0.085, 32, 16), dm); d.position.set(x, 0.06, 0.58); d.scale.z = 0.5; g.add(d); return d; });
  return { group: g, dots };   // animate: dots[i].position.z = 0.58 + max(0, sin(t*6 − i*0.9))*0.06
}

/* Extrude a logo SVG (filled paths). materials: { "#hexfill": Material } — path fill colours pick the material
   (gradient fills come back as black: give that path a flat fill in the string). center = [cx, cy] in SVG units. */
export function makeExtrudedSVG(stage, svg, { scale = 0.03, center = [0, 0], depth = 7, bevel = 1.1, materials = {}, fallback } = {}) {
  const outer = new THREE.Group(), inner = new THREE.Group(); outer.add(inner); stage.scene.add(outer);
  const def = fallback || new THREE.MeshPhysicalMaterial({ color: 0xf2f4f1, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08 });
  new SVGLoader().parse(svg).paths.forEach((p) => {
    const mat = materials["#" + p.color.getHexString()] || def;
    SVGLoader.createShapes(p).forEach((s) => inner.add(new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel / 2, bevelSegments: 8, curveSegments: 32 }), mat)));
  });
  inner.scale.set(scale, -scale, scale);   // SVG y is down
  inner.position.set(-center[0] * scale, center[1] * scale, -depth / 2 * scale);
  return outer;
}

/* WhatsApp/iOS-style chat drawing kit for a phone screen canvas. VW = design width in points (smaller = bigger UI). */
export function chatUI(ctx, SW, SH, { VW = 330, font = "SF, -apple-system, system-ui", accent = "#025951", bg = "#efe7de" } = {}) {
  const c = ctx, VH = SH * VW / SW, F = (w, z) => `${w} ${z}px ${font}`;
  const clamp = (v) => Math.max(0, Math.min(1, v)), eOut = (p) => 1 - Math.pow(1 - p, 3), eBack = (p) => { const s = 1.6; p -= 1; return p * p * ((s + 1) * p + s) + 1; };
  const api = { VW, VH, F, clamp, eOut, composeY: VH - 78 };
  api.begin = () => { c.setTransform(SW / VW, 0, 0, SW / VW, 0, 0); c.fillStyle = bg; c.fillRect(0, 0, VW, VH);
    c.fillStyle = "rgba(0,0,0,0.045)"; for (let y = 118, r = 0; y < VH - 80; y += 14, r++) for (let x = r % 2 ? 7 : 0; x < VW; x += 14) { c.beginPath(); c.arc(x, y, 0.9, 0, 6.2832); c.fill(); } };
  api.header = ({ name, sub, subColor = "#667781", avatar = "A", grad = ["#f0c49a", "#c9874f"] }) => {
    c.fillStyle = "#f7f7f5"; c.fillRect(0, 0, VW, 106); c.fillStyle = "rgba(0,0,0,0.08)"; c.fillRect(0, 106, VW, 0.6);
    c.fillStyle = "#111"; c.font = F(600, 15); c.textBaseline = "middle"; c.fillText("9:41", 30, 24);
    [0, 1, 2, 3].forEach((i) => c.fillRect(VW - 86 + i * 4.6, 28 - (i + 1) * 2.4, 3, (i + 1) * 2.4));
    c.globalAlpha = 0.4; c.strokeStyle = "#111"; c.lineWidth = 1; c.beginPath(); c.roundRect(VW - 54, 18.5, 23, 11, 3.5); c.stroke(); c.globalAlpha = 1;
    c.beginPath(); c.roundRect(VW - 52, 20.5, 17, 7, 2); c.fill();
    c.fillStyle = "#000"; c.beginPath(); c.roundRect(VW / 2 - 52, 10, 104, 30, 15); c.fill();   // dynamic island
    c.strokeStyle = accent; c.lineWidth = 2.3; c.lineCap = "round"; c.lineJoin = "round"; c.beginPath(); c.moveTo(21, 66); c.lineTo(13, 75); c.lineTo(21, 84); c.stroke();
    const gr = c.createLinearGradient(34, 57, 68, 93); gr.addColorStop(0, grad[0]); gr.addColorStop(1, grad[1]);
    c.fillStyle = gr; c.beginPath(); c.arc(50, 75, 18, 0, 6.2832); c.fill();
    c.fillStyle = "#fff"; c.font = F(600, 16); c.textAlign = "center"; c.fillText(avatar, 50, 76); c.textAlign = "left";
    c.fillStyle = "#111b21"; c.font = F(600, 16.5); c.fillText(name, 78, 67);
    c.fillStyle = subColor; c.font = F(400, 12.5); c.fillText(sub, 78, 86);
    c.strokeStyle = accent; c.lineWidth = 1.8; c.beginPath(); c.roundRect(VW - 82, 68, 19, 14, 3); c.moveTo(VW - 63, 75); c.lineTo(VW - 56, 70); c.lineTo(VW - 56, 80); c.closePath(); c.stroke();
    c.beginPath(); c.moveTo(VW - 34, 67); c.quadraticCurveTo(VW - 36, 81, VW - 21, 84); c.stroke();
  };
  api.compose = () => { const cy = api.composeY; c.fillStyle = "#f7f7f5"; c.fillRect(0, cy, VW, 78);
    c.fillStyle = "#fff"; c.beginPath(); c.roundRect(44, cy + 11, VW - 98, 36, 18); c.fill(); c.strokeStyle = "rgba(0,0,0,0.07)"; c.lineWidth = 1; c.stroke();
    c.strokeStyle = accent; c.lineWidth = 2.2; c.beginPath(); c.moveTo(22, cy + 21); c.lineTo(22, cy + 37); c.moveTo(14, cy + 29); c.lineTo(30, cy + 29); c.stroke();
    c.fillStyle = accent; c.beginPath(); c.arc(VW - 28, cy + 29, 18, 0, 6.2832); c.fill(); };
  // bubble pops in with progress p (0→1); returns the height it occupies (stack bottom-up: yb -= bubble(...)+8)
  api.bubble = (text, side, yb, p, time, ticks) => {
    if (p <= 0) return 0;
    c.font = F(400, 16.5); const w = Math.max(c.measureText(text).width + 24, 100), h = 54, x = side === "out" ? VW - w - 10 : 10, y = yb - h;
    c.save(); const a = eBack(clamp(p)), ox = side === "out" ? x + w : x;
    c.globalAlpha = clamp(p * 2); c.translate(ox, yb); c.scale(0.7 + 0.3 * a, 0.7 + 0.3 * a); c.translate(-ox, -yb + (1 - eOut(clamp(p))) * 10);
    c.shadowColor = "rgba(0,0,0,0.10)"; c.shadowBlur = 2; c.shadowOffsetY = 1;
    c.fillStyle = side === "out" ? "#d9fdd3" : "#ffffff"; c.beginPath(); c.roundRect(x, y, w, h, side === "out" ? [16, 16, 5, 16] : [16, 16, 16, 5]); c.fill(); c.shadowColor = "transparent";
    c.fillStyle = "#111b21"; c.textBaseline = "alphabetic"; c.fillText(text, x + 12, y + 25);
    c.font = F(400, 11); c.fillStyle = "#667781"; c.textAlign = "right"; c.fillText(time, x + w - (ticks ? 30 : 10), y + 46); c.textAlign = "left";
    if (ticks) { c.strokeStyle = ticks > 0.5 ? "#53bdeb" : "#8696a0"; c.lineWidth = 1.5; c.lineCap = "round"; c.lineJoin = "round";   // ✓✓ grey → blue
      const tx = x + w - 26, ty = y + 38; c.beginPath(); c.moveTo(tx, ty + 4); c.lineTo(tx + 3, ty + 7); c.lineTo(tx + 9, ty); c.moveTo(tx + 6, ty + 6.5); c.lineTo(tx + 7, ty + 7); c.lineTo(tx + 13, ty); c.stroke(); }
    c.restore(); return h * eOut(clamp(p));
  };
  api.typing = (yb, p, t) => { if (p <= 0) return 0; const a = eOut(clamp(p)); c.save(); c.globalAlpha = a;
    c.fillStyle = "#fff"; c.beginPath(); c.roundRect(10, yb - 40, 66, 40, [16, 16, 16, 5]); c.fill();
    [0, 1, 2].forEach((i) => { const b = Math.max(0, Math.sin(t * 9 - i * 0.9)); c.fillStyle = `rgba(134,150,160,${0.55 + 0.45 * b})`; c.beginPath(); c.arc(28 + i * 15, yb - 20 - b * 3.5, 4, 0, 6.2832); c.fill(); });
    c.restore(); return 48 * a; };
  api.chip = (text, yb, p) => { if (p <= 0) return 0; c.font = F(500, 11.5); const w = c.measureText(text).width + 22;
    c.save(); c.globalAlpha = eOut(clamp(p)); c.fillStyle = "rgba(255,255,255,0.92)"; c.beginPath(); c.roundRect((VW - w) / 2, yb - 24, w, 24, 8); c.fill();
    c.fillStyle = "#54656f"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(text, VW / 2, yb - 12); c.restore(); c.textAlign = "left"; return 32 * eOut(clamp(p)); };
  return api;
}

/* Apply a state object { x, y, z, rx, ry, rz, s, v } to a mesh/group (v > 0.5 = visible). */
export const put = (o, m) => { m.visible = o.v > 0.5; m.position.set(o.x, o.y, o.z); m.rotation.set(o.rx, o.ry, o.rz); m.scale.setScalar(o.s); };

/* Drive the 3D from HyperFrames time: a separate paused GSAP timeline `t3` (tweens plain state objects, absolute times)
   is seeked on every hf-seek and on the root timeline's updates, then render(time) draws. Create t3 with
   `new gsap.core.Timeline({ paused: true })` (gsap.timeline() trips the "timeline not registered" lint). */
export function bindTimeline(t3, render) {
  const go = (time) => { t3.seek(time, false); render(time); };
  window.addEventListener("hf-seek", (e) => go(e.detail.time));
  const root = window.__timelines && window.__timelines.main;
  if (root) {   // chain, don't replace: Rive / other layers (kit/capas.js) listen to the same callback
    const prev = root.eventCallback("onUpdate");
    root.eventCallback("onUpdate", function () { if (prev) prev.apply(this, arguments); go(root.time()); });
  }
  go(window.__hfThreeTime || 0);
}
