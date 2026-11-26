// Monta um mapa aberto a partir de vários cômodos (cenas já preparadas pelo
// pipeline.mjs): portas entre eles, casca externa com janelas, telhado,
// quintal com cerca, árvores, arbustos e objetos, colisão e nascimentos.
// Uso: node compose.mjs config.json   (rodar a partir da pasta com node_modules)
import { Document, NodeIO } from '@gltf-transform/core';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import sharp from 'sharp';

const cfg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const HERE = path.dirname(new URL(import.meta.url).pathname);
const OUT = cfg.out;
fs.mkdirSync(OUT, { recursive: true });
const r3 = (v) => +v.toFixed(3);

// ---------- 1. cômodos com as portas recortadas ----------
const doorBox = (d) =>
  d.axis === 'x'
    ? [d.at[0] - 0.55, d.range[0], d.at[1] + 0.55, d.range[1]]
    : [d.range[0], d.at[0] - 0.55, d.range[1], d.at[1] + 0.55];
const approach = (d) =>
  d.axis === 'x'
    ? [d.at[0] - 1.5, d.range[0] - 0.35, d.at[1] + 1.5, d.range[1] + 0.35]
    : [d.range[0] - 0.35, d.at[0] - 1.5, d.range[1] + 0.35, d.at[1] + 1.5];

const rooms = [];
for (const r of cfg.rooms) {
  const base = JSON.parse(fs.readFileSync(r.cfg, 'utf8'));
  const [ox, oz] = r.offset;
  const floorY = base.floorY ?? 0;
  const [bx0, bz0, bx1, bz1] = base.bounds;
  const cuts = [];
  const keepClear = [];
  for (const d of cfg.doors) {
    const [x0, z0, x1, z1] = doorBox(d);
    const lb = [x0 - ox, z0 - oz, x1 - ox, z1 - oz];
    if (lb[2] < bx0 - 0.7 || lb[0] > bx1 + 0.7 || lb[3] < bz0 - 0.7 || lb[1] > bz1 + 0.7) continue;
    cuts.push([lb[0], floorY + 0.02, lb[1], lb[2], floorY + 2.15, lb[3]]);
    const [a0, c0, a1, c1] = approach(d);
    keepClear.push([a0 - ox, c0 - oz, a1 - ox, c1 - oz]);
  }
  const roomCfg = { ...base, out: `${OUT}/${r.key}`, cuts, contour: false, keepClear, clip: 0.42 };
  const file = `${OUT}/${r.key}.json`;
  fs.writeFileSync(file, JSON.stringify(roomCfg, null, 1));
  if (!cfg.skipRooms) {
    execSync(`node ${HERE}/pipeline.mjs ${file}`, { stdio: ['ignore', 'pipe', 'inherit'] });
    execSync(`bash ${HERE}/compress.sh ${OUT}/${r.key}`, { stdio: 'ignore' });
  }
  const map = JSON.parse(fs.readFileSync(`${OUT}/${r.key}/map.json`, 'utf8'));
  rooms.push({ ...r, base, map, ox, oz, floorY, H: map.wallHeight, world: [bx0 + ox, bz0 + oz, bx1 + ox, bz1 + oz] });
  console.log('cômodo', r.key, 'cortes', cuts.length, 'nascimentos', map.spawns.length);
}

// ---------- 2. geometria externa ----------
const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene('exterior');
doc.getRoot().setDefaultScene(scene);

async function texture(kind) {
  const N = 256;
  const px = Buffer.alloc(N * N * 3);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let c;
    const n = rnd();
    if (kind === 'plaster') { const v = 218 + (n - 0.5) * 16; c = [v, v - 8, v - 22]; }
    else if (kind === 'roof') { const line = y % 32 < 2 ? -18 : 0; const v = 62 + (n - 0.5) * 10 + line; c = [v, v + 2, v + 6]; }
    else if (kind === 'plinth') { const v = 128 + (n - 0.5) * 22; c = [v, v - 4, v - 10]; }
    else if (kind === 'wood') { const plank = x % 64 < 2 ? -30 : 0; const grain = Math.sin(y * 0.15 + (x % 64) * 0.9) * 8; const v = 112 + grain + plank + (n - 0.5) * 10; c = [v + 22, v, v - 26]; }
    else { const v = 240 + (n - 0.5) * 8; c = [v, v, v - 4]; }
    const k = (y * N + x) * 3;
    px[k] = Math.max(0, Math.min(255, c[0])); px[k + 1] = Math.max(0, Math.min(255, c[1])); px[k + 2] = Math.max(0, Math.min(255, c[2]));
  }
  return sharp(px, { raw: { width: N, height: N, channels: 3 } }).png().toBuffer();
}
const MATS = { plaster: 0.92, roof: 0.85, plinth: 0.9, wood: 0.75, trim: 0.6 };
const materials = {};
for (const [name, rough] of Object.entries(MATS)) {
  const tex = doc.createTexture(name).setImage(await texture(name)).setMimeType('image/png');
  materials[name] = doc.createMaterial(name).setBaseColorTexture(tex).setRoughnessFactor(rough).setMetallicFactor(0);
}
const geo = Object.fromEntries(Object.keys(MATS).map((m) => [m, { pos: [], nor: [], uv: [], idx: [] }]));
function quad(m, a, b, c, d, n, uvs) {
  const g = geo[m];
  const base = g.pos.length / 3;
  for (const p of [a, b, c, d]) g.pos.push(...p);
  for (let i = 0; i < 4; i++) g.nor.push(...n);
  g.uv.push(...uvs);
  g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}
/** Caixa com UV em metros (textura repete a cada 2 m). */
function box(m, x0, y0, z0, x1, y1, z1) {
  const s = 0.5;
  quad(m, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [x0 * s, y0 * s, x1 * s, y0 * s, x1 * s, y1 * s, x0 * s, y1 * s]);
  quad(m, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [x1 * s, y0 * s, x0 * s, y0 * s, x0 * s, y1 * s, x1 * s, y1 * s]);
  quad(m, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [z1 * s, y0 * s, z0 * s, y0 * s, z0 * s, y1 * s, z1 * s, y1 * s]);
  quad(m, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [z0 * s, y0 * s, z1 * s, y0 * s, z1 * s, y1 * s, z0 * s, y1 * s]);
  quad(m, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [x0 * s, z1 * s, x1 * s, z1 * s, x1 * s, z0 * s, x0 * s, z0 * s]);
  quad(m, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [x0 * s, z0 * s, x1 * s, z0 * s, x1 * s, z1 * s, x0 * s, z1 * s]);
}

const solids = []; // [x0, z0, x1, z1, base, topo] em coordenadas do mundo
const RES = 0.1;
/** Retângulos (along0, y0, along1, y1) que cobrem [a0,a1]×[0,top] menos os buracos. */
function rectsMinusHoles(a0, a1, top, holes) {
  const n = Math.max(1, Math.round((a1 - a0) / RES)), h = Math.max(1, Math.round(top / RES));
  const hole = new Uint8Array(n * h);
  for (const [h0, y0, h1, y1] of holes) {
    for (let j = Math.max(0, Math.round(y0 / RES)); j < Math.min(h, Math.round(y1 / RES)); j++)
      for (let i = Math.max(0, Math.round((h0 - a0) / RES)); i < Math.min(n, Math.round((h1 - a0) / RES)); i++) hole[j * n + i] = 1;
  }
  const used = new Uint8Array(n * h);
  const out = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i;
    if (hole[k] || used[k]) continue;
    let w = 1;
    while (i + w < n && !hole[k + w] && !used[k + w]) w++;
    let hh = 1;
    outer: while (j + hh < h) { for (let q = 0; q < w; q++) { const kk = (j + hh) * n + i + q; if (hole[kk] || used[kk]) break outer; } hh++; }
    for (let r = 0; r < hh; r++) for (let q = 0; q < w; q++) used[(j + r) * n + i + q] = 1;
    out.push([a0 + i * RES, j * RES, a0 + (i + w) * RES, (j + hh) * RES]);
  }
  return out;
}

const WALL_OFF = 0.45, WALL_T = 0.15, EAVE = 0.75;
const sideDefs = { xmin: ['z', 0, -1], xmax: ['z', 2, 1], zmin: ['x', 1, -1], zmax: ['x', 3, 1] };
for (const room of rooms) {
  const [wx0, wz0, wx1, wz1] = room.world;
  const top = room.H + 0.25;
  for (const [side, [alongAxis, idx, dir]] of Object.entries(sideDefs)) {
    const line = room.world[idx];
    const span = alongAxis === 'z' ? [wz0, wz1] : [wx0, wx1];
    // trechos cobertos por cômodos vizinhos (parede compartilhada)
    const covered = [];
    for (const other of rooms) {
      if (other === room) continue;
      const opp = { xmin: 2, xmax: 0, zmin: 3, zmax: 1 }[side];
      const gap = (other.world[opp] - line) * dir;
      if (gap < 0.2 || gap > 1.4) continue;
      const os = alongAxis === 'z' ? [other.world[1], other.world[3]] : [other.world[0], other.world[2]];
      const a = Math.max(span[0], os[0]), b = Math.min(span[1], os[1]);
      if (b > a) covered.push([a, b]);
    }
    // trechos externos (com folga nos cantos)
    let pieces = [[span[0] - WALL_OFF - WALL_T, span[1] + WALL_OFF + WALL_T]];
    for (const [a, b] of covered) {
      const next = [];
      for (const [p, q] of pieces) { if (b <= p || a >= q) next.push([p, q]); else { if (a > p) next.push([p, a]); if (b < q) next.push([b, q]); } }
      pieces = next;
    }
    // aberturas detectadas (janelas, vãos) e portas externas, em coordenadas do mundo
    const rep = room.map.sides[side];
    const shift = alongAxis === 'z' ? room.oz : room.ox;
    const holes = (room.holes?.[side] ?? rep?.holes ?? [])
      .filter(([a0, y0, a1, y1]) => (a1 - a0) >= 0.3 && (y1 - y0) >= 0.4)
      .map(([a0, y0, a1, y1]) => [a0 + shift, Math.max(0.35, y0), a1 + shift, Math.min(room.H - 0.2, y1)]);
    const doorHoles = [];
    for (const d of cfg.doors) {
      if (!d.exterior) continue;
      const planeAxis = d.axis; // 'x' = porta numa parede de x constante
      if ((planeAxis === 'x') !== (alongAxis === 'z')) continue;
      const near = Math.min(Math.abs(d.at[0] - line), Math.abs(d.at[1] - line));
      if (near > 0.8) continue;
      doorHoles.push([d.range[0], 0, d.range[1], 2.15]);
    }
    const p0 = dir > 0 ? line + WALL_OFF : line - WALL_OFF - WALL_T;
    const p1 = p0 + WALL_T;
    for (const [a0, a1] of pieces) {
      if (a1 - a0 < 0.05) continue;
      const vis = rectsMinusHoles(a0, a1, top, [...holes, ...doorHoles]);
      for (const [s0, y0, s1, y1] of vis) {
        // rodapé mais escuro até 0,35 m
        const parts = y0 < 0.35 && y1 > 0.35 ? [[y0, 0.35, 'plinth'], [0.35, y1, 'plaster']] : [[y0, y1, y1 <= 0.35 ? 'plinth' : 'plaster']];
        for (const [ya, yb, m] of parts) {
          if (alongAxis === 'z') box(m, p0, ya, s0, p1, yb, s1); else box(m, s0, ya, p0, s1, yb, p1);
        }
      }
      // colisão: parede inteira menos as portas
      for (const [s0, y0, s1, y1] of rectsMinusHoles(a0, a1, top, doorHoles)) {
        if (y0 > 2.4) continue;
        if (alongAxis === 'z') solids.push([p0, s0, p1, s1, y0, Math.min(y1, top)]); else solids.push([s0, p0, s1, p1, y0, Math.min(y1, top)]);
      }
      // moldura das janelas (peitoril branco)
      for (const [h0, y0, h1] of holes) {
        if (h1 <= a0 || h0 >= a1 || y0 < 0.5) continue;
        if (alongAxis === 'z') box('trim', p0 - 0.04 * (dir > 0 ? 0 : 1), y0 - 0.06, h0 - 0.05, p1 + 0.04 * (dir > 0 ? 1 : 0), y0, h1 + 0.05);
        else box('trim', h0 - 0.05, y0 - 0.06, p0 - 0.04 * (dir > 0 ? 0 : 1), h1 + 0.05, y0, p1 + 0.04 * (dir > 0 ? 1 : 0));
      }
    }
  }
  // telhado plano com beiral e faixa branca
  box('roof', wx0 - WALL_OFF - EAVE, top, wz0 - WALL_OFF - EAVE, wx1 + WALL_OFF + EAVE, top + 0.22, wz1 + WALL_OFF + EAVE);
  box('trim', wx0 - WALL_OFF - EAVE - 0.03, top + 0.12, wz0 - WALL_OFF - EAVE - 0.03, wx1 + WALL_OFF + EAVE + 0.03, top + 0.26, wz1 + WALL_OFF + EAVE + 0.03);
}

// vãos das portas: piso, batentes e verga
const minH = Math.min(...rooms.map((r) => r.H));
for (const d of cfg.doors) {
  const [a, b] = d.exterior ? [Math.min(d.at[0], d.at[1]) - 0.05, Math.max(d.at[0], d.at[1]) + 0.05] : d.at;
  const [r0, r1] = d.range;
  if (d.axis === 'x') {
    box('wood', a, 0, r0, b, 0.012, r1);
    box('trim', a, 0, r0 - 0.12, b, 2.15, r0); box('trim', a, 0, r1, b, 2.15, r1 + 0.12);
    box('plaster', a, 2.15, r0 - 0.12, b, minH + 0.25, r1 + 0.12);
    solids.push([a, r0 - 0.12, b, r0, 0, 2.15], [a, r1, b, r1 + 0.12, 0, 2.15]);
  } else {
    box('wood', r0, 0, a, r1, 0.012, b);
    box('trim', r0 - 0.12, 0, a, r0, 2.15, b); box('trim', r1, 0, a, r1 + 0.12, 2.15, b);
    box('plaster', r0 - 0.12, 2.15, a, r1 + 0.12, minH + 0.25, b);
    solids.push([r0 - 0.12, a, r0, b, 0, 2.15], [r1, a, r1 + 0.12, b, 0, 2.15]);
  }
}

// ---------- 3. quintal: limites, cerca ----------
let hx0 = Infinity, hz0 = Infinity, hx1 = -Infinity, hz1 = -Infinity;
for (const r of rooms) { hx0 = Math.min(hx0, r.world[0]); hz0 = Math.min(hz0, r.world[1]); hx1 = Math.max(hx1, r.world[2]); hz1 = Math.max(hz1, r.world[3]); }
const cx = (hx0 + hx1) / 2, cz = (hz0 + hz1) / 2;
const [YW, YD] = cfg.yard;
const yx0 = cx - YW / 2, yx1 = cx + YW / 2, yz0 = cz - YD / 2, yz1 = cz + YD / 2;
const fenceH = 1.25;
for (const [ax0, az0, ax1, az1] of [[yx0, yz0, yx1, yz0], [yx0, yz1, yx1, yz1], [yx0, yz0, yx0, yz1], [yx1, yz0, yx1, yz1]]) {
  const len = Math.hypot(ax1 - ax0, az1 - az0);
  const n = Math.ceil(len / 2);
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = ax0 + (ax1 - ax0) * t, z = az0 + (az1 - az0) * t;
    box('wood', x - 0.06, 0, z - 0.06, x + 0.06, fenceH + 0.1, z + 0.06);
  }
  for (const y of [0.45, 1.0]) {
    if (ax0 === ax1) box('wood', ax0 - 0.03, y, az0, ax0 + 0.03, y + 0.12, az1); else box('wood', ax0, y, az0 - 0.03, ax1, y + 0.12, az0 + 0.03);
  }
  // colisão alta (não dá para pular a cerca)
  if (ax0 === ax1) solids.push([ax0 - 0.25, az0 - 0.25, ax0 + 0.25, az1 + 0.25, 0, cfg.wallHeight]);
  else solids.push([ax0 - 0.25, az0 - 0.25, ax1 + 0.25, az0 + 0.25, 0, cfg.wallHeight]);
}

// grava a casca externa
const node = doc.createNode('exterior');
const mesh = doc.createMesh('exterior');
for (const [m, g] of Object.entries(geo)) {
  if (!g.idx.length) continue;
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(g.pos)).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(g.nor)).setBuffer(buffer))
    .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(g.uv)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(g.idx)).setBuffer(buffer))
    .setMaterial(materials[m]);
  mesh.addPrimitive(prim);
}
node.setMesh(mesh);
scene.addChild(node);
const io = new NodeIO();
await io.write(`${OUT}/exterior_raw.glb`, doc);
execSync(`npx gltf-transform webp ${OUT}/exterior_raw.glb ${OUT}/exterior_w.glb --quality 82 && npx gltf-transform meshopt ${OUT}/exterior_w.glb ${OUT}/exterior.glb`, { stdio: 'ignore' });

// ---------- 4. vegetação, objetos e nascimentos no quintal ----------
const houseBuf = (x, z, m) => x > hx0 - WALL_OFF - m && x < hx1 + WALL_OFF + m && z > hz0 - WALL_OFF - m && z < hz1 + WALL_OFF + m;
const occupied = []; // círculos [x, z, r]
const freeAt = (x, z, r) => occupied.every(([ox, oz, or]) => Math.hypot(ox - x, oz - z) >= or + r);
let seed = 17;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (count, r, ok, minDist = 0) => {
  const chosen = [];
  for (let n = 0; n < count; n++) {
    let best = null, bd = -1;
    for (let t = 0; t < 600; t++) {
      const x = yx0 + 1 + rnd() * (YW - 2), z = yz0 + 1 + rnd() * (YD - 2);
      if (!ok(x, z) || !freeAt(x, z, r)) continue;
      const d = Math.min(30, ...occupied.map(([ox, oz]) => Math.hypot(ox - x, oz - z)));
      if (d > bd) { bd = d; best = [x, z]; }
    }
    if (!best || bd < minDist) break;
    occupied.push([best[0], best[1], r]);
    chosen.push(best);
  }
  return chosen;
};
// portas externas: deixar o caminho livre
for (const d of cfg.doors) if (d.exterior) {
  const mid = (d.range[0] + d.range[1]) / 2;
  const out = d.axis === 'x' ? [Math.max(...d.at) > cx ? Math.max(...d.at) + 1.2 : Math.min(...d.at) - 1.2, mid] : [mid, Math.max(...d.at) > cz ? Math.max(...d.at) + 1.2 : Math.min(...d.at) - 1.2];
  occupied.push([out[0], out[1], 1.3]);
}
const inYard = (m) => (x, z) => !houseBuf(x, z, m) && x > yx0 + 0.4 + m && x < yx1 - 0.4 - m && z > yz0 + 0.4 + m && z < yz1 - 0.4 - m;
const decor = [];
const TREES = cfg.trees ?? [];
for (const t of TREES) {
  for (const [x, z] of pick(t.count, t.radius, inYard(t.radius + 1.5), 2)) {
    decor.push({ url: `/models/yard/${t.file}.glb`, offset: [x, 0, z], rotationY: r3(rnd() * Math.PI * 2) });
    const tr = t.trunk;
    solids.push([x - tr, z - tr, x + tr, z + tr, 0, t.height]);
  }
}
// fileira de árvores do lado de fora da cerca (só cenário, sem colisão)
const ring = cfg.backdrop ?? [];
if (ring.length) {
  for (const [ax0, az0, ax1, az1, ox, oz] of [[yx0, yz0, yx1, yz0, 0, -1], [yx0, yz1, yx1, yz1, 0, 1], [yx0, yz0, yx0, yz1, -1, 0], [yx1, yz0, yx1, yz1, 1, 0]]) {
    const len = Math.hypot(ax1 - ax0, az1 - az0);
    for (let t = -4; t < len + 4; t += 3.2 + rnd() * 2.2) {
      const out = 3 + rnd() * 6;
      const x = ax0 + (ax1 - ax0) * (t / len) + ox * out, z = az0 + (az1 - az0) * (t / len) + oz * out;
      const file = ring[Math.floor(rnd() * ring.length)];
      decor.push({ url: `/models/yard/${file}.glb`, offset: [x, 0, z], rotationY: r3(rnd() * Math.PI * 2), scale: r3(0.85 + rnd() * 0.5) });
    }
  }
}
const props = [];
for (const p of cfg.yardProps ?? []) {
  const rr = Math.hypot(p.size[0], p.size[2]) / 2 + 0.1;
  for (const [x, z] of pick(p.count, rr, inYard(Math.max(0.8, rr)))) props.push([p.type, r3(x), r3(z), r3(rnd() * Math.PI * 2), 0]);
}
const yardSpawns = pick(cfg.yardSpawns ?? 16, 0.6, inYard(1.0));

// ---------- 5. junta tudo ----------
const out = {
  id: cfg.id, wallHeight: cfg.wallHeight, boxes: [], props: [], hiders: [], hunters: [], lights: [], zones: [], scenes: [], size: [YW, YD], center: [cx, cz],
};
const T = (x, z) => [r3(x - cx), r3(z - cz)];
for (const room of rooms) {
  const { map, ox, oz } = room;
  for (const [x0, z0, x1, z1, b, t] of map.boxes) out.boxes.push([...T(x0 + ox, z0 + oz), ...T(x1 + ox, z1 + oz), b, t]);
  for (const p of map.props) for (const q of p.placements) out.props.push([p.id, ...T(q.x + ox, q.z + oz), q.yaw, Math.max(0, q.y)]);
  for (const [type, x, z, yaw, y] of map.extras ?? []) out.props.push([type, ...T(x + ox, z + oz), yaw, y]);
  for (const [x, z] of map.spawns) out.hiders.push(T(x + ox, z + oz));
  for (const [x, y, z] of map.lights) { const [a, c] = T(x + ox, z + oz); out.lights.push([a, r3(Math.min(y, room.H - 0.15)), c]); }
  if (!map.lights.length) { const [a, c] = T((room.world[0] + room.world[2]) / 2, (room.world[1] + room.world[3]) / 2); out.lights.push([a, r3(room.H - 0.4), c]); }
  const [a0, c0] = T(room.world[0], room.world[1]), [a1, c1] = T(room.world[2], room.world[3]);
  out.zones.push({ name: room.label, rect: [a0, c0, a1, c1], surface: room.surface ?? 'wood', covered: true });
  out.scenes.push({ url: `/models/maps/${cfg.id}_${room.key}.glb`, offset: [r3(ox - cx), r3(-room.floorY), r3(oz - cz)] });
}
for (const [x0, z0, x1, z1, b, t] of solids) out.boxes.push([...T(x0, z0), ...T(x1, z1), r3(b), r3(t)]);
for (const [type, x, z, yaw, y] of props) out.props.push([type, ...T(x, z), yaw, y]);
for (const [x, z] of yardSpawns) out.hunters.push(T(x, z));
for (const [x, z] of yardSpawns.slice(0, Math.ceil(yardSpawns.length / 2))) out.hiders.push(T(x, z));
for (const d of decor) out.scenes.push({ url: d.url, offset: [r3(d.offset[0] - cx), 0, r3(d.offset[2] - cz)], rotationY: d.rotationY, ...(d.scale ? { scale: d.scale } : {}) });
out.zones.push({ name: cfg.yardName ?? 'Quintal', rect: [-YW / 2, -YD / 2, YW / 2, YD / 2], surface: cfg.yardSurface ?? 'grass' });
out.zones.push({ name: 'Arredores', rect: [-YW / 2 - 40, -YD / 2 - 40, YW / 2 + 40, YD / 2 + 40], surface: cfg.outerSurface ?? 'grass' });
out.exterior = { url: `/models/maps/${cfg.id}_exterior.glb`, offset: [r3(-cx), 0, r3(-cz)] };
fs.writeFileSync(`${OUT}/composite.json`, JSON.stringify(out));
console.log('casa', [hx0, hz0, hx1, hz1].map(r3), 'caixas', out.boxes.length, 'objetos', out.props.length, 'nascimentos', out.hiders.length, '/', out.hunters.length, 'árvores', decor.length);

// ---------- 6. módulo TypeScript e arquivos do jogo ----------
if (cfg.meta) {
  const ROOT = cfg.root;
  const data = { name: cfg.meta.name, description: cfg.meta.description, ...out, theme: cfg.meta.theme, sunFrom: cfg.meta.sunFrom, sunIntensity: cfg.meta.sunIntensity, sky: cfg.meta.sky, lightColor: cfg.meta.lightColor, lightIntensity: cfg.meta.lightIntensity };
  delete data.center;
  const camel = cfg.id.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join('');
  fs.writeFileSync(`${ROOT}/shared/src/maps/scenes/${cfg.id}.ts`, `// Gerado por tools/scene-maps/compose.mjs — não editar à mão.\n// ${cfg.meta.source}\nimport { compositeMap } from './compositeMap.js';\n\nexport const build${camel} = () =>\n  compositeMap(${JSON.stringify(data)});\n`);
  fs.copyFileSync(`${OUT}/exterior.glb`, `${ROOT}/client/public/models/maps/${cfg.id}_exterior.glb`);
  for (const r of rooms) fs.copyFileSync(`${OUT}/${r.key}/scene.glb`, `${ROOT}/client/public/models/maps/${cfg.id}_${r.key}.glb`);
  // objetos separados de cômodos novos (ainda não registrados por gen.py)
  const regFile = `${ROOT}/tools/scene-maps/sceneProps.json`;
  let reg = JSON.parse(fs.readFileSync(regFile, 'utf8'));
  reg = reg.filter((c) => c.map !== cfg.id);
  const known = new Set(reg.map((c) => c.id));
  for (const r of rooms) {
    if (!r.register) continue;
    for (const p of r.map.props) {
      if (known.has(p.id)) continue;
      known.add(p.id);
      reg.push({ map: cfg.id, id: p.id, name: p.name, size: [r3(p.size[0] / 1.18), p.size[1], r3(p.size[2] / 1.18)], speed: p.speed || 1, file: `sc_${p.id}.glb` });
      fs.copyFileSync(`${OUT}/${r.key}/prop_${p.id}.glb`, `${ROOT}/client/public/models/props/sc_${p.id}.glb`);
    }
  }
  fs.writeFileSync(regFile, JSON.stringify(reg, null, 1));
  const lines = ['// Gerado por script (tools de mapas a partir de cenários) — não editar à mão.',
    '/** Objetos transformáveis separados dos cenários 3D: id, nome, tamanho do colisor e arquivo do modelo. */',
    'export const SCENE_PROPS: readonly { id: string; name: string; size: [number, number, number]; speed: number; file: string }[] = ['];
  for (const c of reg) lines.push(`  { id: '${c.id}', name: ${JSON.stringify(c.name)}, size: ${JSON.stringify(c.size)}, speed: ${c.speed}, file: '${c.file}' },`);
  lines.push('];');
  fs.writeFileSync(`${ROOT}/shared/src/props/sceneProps.ts`, lines.join('\n') + '\n');
  console.log('TS e modelos copiados');
}
