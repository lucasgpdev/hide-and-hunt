// Converte uma cena glTF de pesquisa (PBRT → glTF) em mapa jogável:
// - assa transformações e escala; remove malhas indesejadas
// - separa objetos repetidos (cadeiras, carteiras...) em "props" transformáveis,
//   com modelo de referência + posição/rotação de cada instância
// - gera colisão automática (mapa de alturas em grade de 10 cm → caixas)
// - escolhe pontos de nascimento alcançáveis e luzes
// Uso: node pipeline.mjs config.json
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, flatten, clearNodeTransform, cloneDocument, getBounds } from '@gltf-transform/functions';
import fs from 'node:fs';

const cfg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const OUT = cfg.out;
fs.mkdirSync(OUT, { recursive: true });


// ---------- cortes (portas): subtrai caixas da geometria ----------
// Para cada triângulo que cruza uma caixa, mantém só as partes de fora
// (recorte sucessivo pelos 6 planos) e interpola todos os atributos.
function cutBoxes(doc, boxes) {
  if (!boxes.length) return;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== 4) continue;
      const posAcc = prim.getAttribute('POSITION');
      const pos = posAcc.getArray();
      const count = posAcc.getCount();
      // caixa da primitiva: pula se não cruza nenhum corte
      let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < count; i++) for (let a = 0; a < 3; a++) { const v = pos[i * 3 + a]; if (v < mn[a]) mn[a] = v; if (v > mx[a]) mx[a] = v; }
      const hits = boxes.filter((b) => mn[0] < b[3] && mx[0] > b[0] && mn[1] < b[4] && mx[1] > b[1] && mn[2] < b[5] && mx[2] > b[2]);
      if (!hits.length) continue;
      const semantics = prim.listSemantics();
      const attrs = semantics.map((sem) => { const acc = prim.getAttribute(sem); return { sem, acc, size: acc.getElementSize(), data: Array.from(acc.getArray()) }; });
      let nVert = count;
      const lerp = (i, j, t) => {
        for (const at of attrs) for (let c = 0; c < at.size; c++) at.data.push(at.data[i * at.size + c] * (1 - t) + at.data[j * at.size + c] * t);
        return nVert++;
      };
      const P = (i, a) => attrs[0].sem === 'POSITION' ? attrs[0].data[i * 3 + a] : attrs.find((x) => x.sem === 'POSITION').data[i * 3 + a];
      const split = (poly, axis, value, keepLess) => {
        // devolve [parte do lado "keep", resto]
        const keep = [], rest = [];
        for (let k = 0; k < poly.length; k++) {
          const a = poly[k], b = poly[(k + 1) % poly.length];
          const da = P(a, axis) - value, db = P(b, axis) - value;
          const ina = keepLess ? da < 0 : da > 0, inb = keepLess ? db < 0 : db > 0;
          if (ina) keep.push(a); else rest.push(a);
          if (ina !== inb && Math.abs(da - db) > 1e-12) { const t = da / (da - db); if (t > 1e-6 && t < 1 - 1e-6) { const v = lerp(a, b, t); keep.push(v); rest.push(v); } }
        }
        return [keep.length >= 3 ? keep : null, rest.length >= 3 ? rest : null];
      };
      const idx = prim.getIndices().getArray();
      const out = [];
      for (let t = 0; t < idx.length / 3; t++) {
        let pieces = [[idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]]];
        for (const b of hits) {
          const next = [];
          for (const poly of pieces) {
            let rest = poly;
            for (const [axis, value, less] of [[0, b[0], true], [0, b[3], false], [1, b[1], true], [1, b[4], false], [2, b[2], true], [2, b[5], false]]) {
              if (!rest) break;
              const [keep, r] = split(rest, axis, value, less);
              if (keep) next.push(keep);
              rest = r;
            }
            // o que sobrou está dentro da caixa: descartado
          }
          pieces = next;
        }
        for (const poly of pieces) for (let k = 1; k < poly.length - 1; k++) out.push(poly[0], poly[k], poly[k + 1]);
      }
      for (const at of attrs) {
        const Ctor = at.acc.getArray().constructor;
        at.acc.setArray(new Ctor(at.data));
      }
      prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(out)).setBuffer(doc.getRoot().listBuffers()[0]));
    }
  }
}

// ---------- carregar e assar transformações ----------
async function loadBaked() {
  const doc = await io.read(cfg.src);
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  for (const l of root.listExtensionsUsed()) if (l.extensionName === 'KHR_lights_punctual') l.dispose();
  for (const n of root.listNodes()) if (n.getCamera()) n.setCamera(null);
  const remove = (cfg.remove ?? []).map((r) => new RegExp(r));
  for (const n of root.listNodes()) if (n.getMesh() && remove.some((r) => r.test(n.getName()))) n.dispose();
  // escala/rotação global
  const wrapper = doc.createNode('root');
  for (const n of [...scene.listChildren()]) wrapper.addChild(n);
  scene.addChild(wrapper);
  const s = cfg.scale ?? 1;
  wrapper.setScale([s, s, s]);
  await doc.transform(flatten());
  // malhas compartilhadas: duplica para assar cada nó
  const used = new Set();
  for (const n of root.listNodes()) {
    const m = n.getMesh();
    if (!m) continue;
    if (used.has(m)) n.setMesh(m.clone());
    used.add(n.getMesh());
  }
  for (const n of root.listNodes()) clearNodeTransform(n);
  // garante índices
  for (const m of root.listMeshes()) {
    for (const p of m.listPrimitives()) {
      if (!p.getIndices()) {
        const count = p.getAttribute('POSITION').getCount();
        const idx = new Uint32Array(count);
        for (let i = 0; i < count; i++) idx[i] = i;
        p.setIndices(doc.createAccessor().setType('SCALAR').setArray(idx).setBuffer(root.listBuffers()[0]));
      }
    }
  }
  return doc;
}

const doc = await loadBaked();
const outside = [];
if (cfg.clip != null) {
  // descarta o que fica fora do cômodo (pisos infinitos, corredores, jardins do cenário original)
  const [bx0, bz0, bx1, bz1] = cfg.bounds, m = cfg.clip, F = 1e4;
  outside.push([-F, -F, -F, bx0 - m, F, F], [bx1 + m, -F, -F, F, F, F], [-F, -F, -F, F, F, bz0 - m], [-F, -F, bz1 + m, F, F, F]);
}
cutBoxes(doc, [...(cfg.cuts ?? []), ...outside]);
const root = doc.getRoot();
const prims = []; // { node, prim, pos: Float32Array, idx: Uint32Array, name }
for (const n of root.listNodes()) {
  const m = n.getMesh();
  if (!m) continue;
  for (const p of m.listPrimitives()) {
    if (p.getMode() !== 4) continue;
    prims.push({ node: n, prim: p, name: n.getName(), pos: p.getAttribute('POSITION').getArray(), idx: Uint32Array.from(p.getIndices().getArray()) });
  }
}
const all = getBounds(root.getDefaultScene() ?? root.listScenes()[0]);
const floorY = cfg.floorY ?? all.min[1];
console.log('scene bounds', all.min.map((v) => +v.toFixed(2)), all.max.map((v) => +v.toFixed(2)), 'floorY', floorY);

// ---------- separar peças (componentes conectados) ----------
function components(entry) {
  const { pos, idx } = entry;
  const key = new Map();
  const parent = [];
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const vid = (i) => {
    const k = `${Math.round(pos[i * 3] * 1000)},${Math.round(pos[i * 3 + 1] * 1000)},${Math.round(pos[i * 3 + 2] * 1000)}`;
    let v = key.get(k);
    if (v === undefined) { v = parent.length; parent.push(v); key.set(k, v); }
    return v;
  };
  const tv = [];
  for (let t = 0; t < idx.length / 3; t++) {
    const a = vid(idx[t * 3]), b = vid(idx[t * 3 + 1]), c = vid(idx[t * 3 + 2]);
    tv.push(a);
    const ra = find(a), rb = find(b), rc = find(c);
    parent[rb] = ra; parent[find(rc)] = find(ra);
  }
  const groups = new Map();
  for (let t = 0; t < tv.length; t++) {
    const r = find(tv[t]);
    let g = groups.get(r);
    if (!g) { g = { entry, tris: [], min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }; groups.set(r, g); }
    g.tris.push(t);
    for (let k = 0; k < 3; k++) {
      const i = idx[t * 3 + k];
      for (let a = 0; a < 3; a++) { const v = pos[i * 3 + a]; if (v < g.min[a]) g.min[a] = v; if (v > g.max[a]) g.max[a] = v; }
    }
  }
  return [...groups.values()];
}

// ---------- props ----------
const removedTris = new Map(); // entry -> Set(tri)
const propOutputs = [];
const allClusters = [];
for (const kind of cfg.props ?? []) {
  const include = new RegExp(kind.include);
  const pieces = [];
  for (const e of prims) if (include.test(e.name)) pieces.push(...components(e));
  // agrupa peças que se tocam
  const tol = kind.tol ?? 0.015;
  const parent = pieces.map((_, i) => i);
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const touch = (a, b) => a.min[0] - tol <= b.max[0] && b.min[0] - tol <= a.max[0] && a.min[1] - tol <= b.max[1] && b.min[1] - tol <= a.max[1] && a.min[2] - tol <= b.max[2] && b.min[2] - tol <= a.max[2];
  for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) if (touch(pieces[i], pieces[j])) parent[find(j)] = find(i);
  const clusters = new Map();
  for (let i = 0; i < pieces.length; i++) {
    const r = find(i);
    let c = clusters.get(r);
    if (!c) { c = { pieces: [], min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }; clusters.set(r, c); }
    c.pieces.push(pieces[i]);
    for (let a = 0; a < 3; a++) { c.min[a] = Math.min(c.min[a], pieces[i].min[a]); c.max[a] = Math.max(c.max[a], pieces[i].max[a]); }
  }
  let list = [...clusters.values()].map((c) => ({ ...c, dims: [c.max[0] - c.min[0], c.max[1] - c.min[1], c.max[2] - c.min[2]] }));
  const [hMin, hMax] = kind.height ?? [0.2, 2];
  list = list.filter((c) => c.dims[1] >= hMin && c.dims[1] <= hMax && Math.max(c.dims[0], c.dims[2]) <= (kind.maxFoot ?? 2.5) && Math.max(c.dims[0], c.dims[2]) >= (kind.minFoot ?? 0.15));
  if (!list.length) { console.log('kind', kind.id, 'sem instâncias'); continue; }
  // amostra de pontos de cada instância
  const sample = (c, n = 500) => {
    const pts = [];
    let total = 0;
    for (const p of c.pieces) total += p.tris.length * 3;
    const step = Math.max(1, Math.floor(total / n));
    let k = 0;
    for (const p of c.pieces) {
      const { pos, idx } = p.entry;
      for (const t of p.tris) for (let j = 0; j < 3; j++) { if (k++ % step) continue; const i = idx[t * 3 + j]; pts.push([pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]); }
    }
    return pts;
  };
  for (const c of list) {
    c.pts = sample(c);
    c.centroid = [0, 1, 2].map((a) => c.pts.reduce((s, p) => s + p[a], 0) / c.pts.length);
    c.center = [(c.min[0] + c.max[0]) / 2, c.min[1], (c.min[2] + c.max[2]) / 2];
  }
  // referência: a instância de dimensões mais "típicas"
  const sorted = (c) => [Math.min(c.dims[0], c.dims[2]), Math.max(c.dims[0], c.dims[2]), c.dims[1]];
  const med = [0, 1, 2].map((a) => { const v = list.map((c) => sorted(c)[a]).sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; });
  const dist = (c) => sorted(c).reduce((s, v, a) => s + Math.abs(v - med[a]) / Math.max(0.05, med[a]), 0);
  list.sort((a, b) => dist(a) - dist(b));
  const ref = list[0];
  const same = list.filter((c) => dist(c) < (kind.similar ?? 0.45));
  // rotação de cada instância por busca de chamfer
  const refLocal = ref.pts.map((p) => [p[0] - ref.center[0], p[1] - ref.min[1], p[2] - ref.center[2]]);
  const chamfer = (A, B) => {
    let s = 0;
    for (const a of A) { let best = Infinity; for (const b of B) { const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2]; const d = dx * dx + dy * dy + dz * dz; if (d < best) best = d; } s += best; }
    return s / A.length;
  };
  const rot = (pts, th) => { const c = Math.cos(th), s = Math.sin(th); return pts.map((p) => [c * p[0] + s * p[2], p[1], -s * p[0] + c * p[2]]); };
  const placements = [];
  for (const c of same) {
    const local = c.pts.map((p) => [p[0] - c.center[0], p[1] - c.min[1], p[2] - c.center[2]]);
    let best = { th: 0, err: Infinity };
    const A = refLocal.filter((_, i) => i % 2 === 0), B = local.filter((_, i) => i % 2 === 0);
    for (let d = 0; d < 360; d += 6) { const th = (d * Math.PI) / 180; const e = chamfer(rot(A, th), B); if (e < best.err) best = { th, err: e }; }
    for (let d = -5; d <= 5; d += 1) { const th = best.th + (d * Math.PI) / 180; const e = chamfer(rot(refLocal, th), local); if (e < best.err) best = { th, err: e }; }
    // posição: centroide da instância menos o deslocamento girado do centroide da referência
    const off = [ref.centroid[0] - ref.center[0], ref.centroid[2] - ref.center[2]];
    const co = Math.cos(best.th), si = Math.sin(best.th);
    const x = c.centroid[0] - (co * off[0] + si * off[1]);
    const z = c.centroid[2] - (-si * off[0] + co * off[1]);
    placements.push({ x: +x.toFixed(3), y: +(c.min[1] - floorY).toFixed(3), z: +z.toFixed(3), yaw: +(((best.th + Math.PI) % (2 * Math.PI)) - Math.PI).toFixed(3), err: +Math.sqrt(best.err).toFixed(3) });
    for (const p of c.pieces) { let set = removedTris.get(p.entry); if (!set) removedTris.set(p.entry, (set = new Set())); for (const t of p.tris) set.add(t); }
    allClusters.push(c);
  }
  // modelo de referência
  const refTris = new Map();
  for (const p of ref.pieces) { let s = refTris.get(p.entry); if (!s) refTris.set(p.entry, (s = new Set())); for (const t of p.tris) s.add(t); }
  const model = cloneDocument(doc);
  const mprims = [];
  for (const n of model.getRoot().listNodes()) { const m = n.getMesh(); if (!m) continue; for (const p of m.listPrimitives()) if (p.getMode() === 4) mprims.push({ n, m, p }); }
  mprims.forEach((mp, i) => {
    const keep = refTris.get(prims[i]);
    if (!keep) { mp.p.dispose(); return; }
    const src = prims[i].idx;
    const out = new Uint32Array(keep.size * 3);
    let k = 0;
    for (const t of keep) { out[k++] = src[t * 3]; out[k++] = src[t * 3 + 1]; out[k++] = src[t * 3 + 2]; }
    mp.p.setIndices(model.createAccessor().setType('SCALAR').setArray(out).setBuffer(model.getRoot().listBuffers()[0]));
  });
  for (const n of model.getRoot().listNodes()) { const m = n.getMesh(); if (m && m.listPrimitives().length === 0) { n.setMesh(null); m.dispose(); } }
  const mscene = model.getRoot().getDefaultScene() ?? model.getRoot().listScenes()[0];
  const w = model.createNode('prop').setTranslation([-ref.center[0], -ref.min[1], -ref.center[2]]);
  for (const n of [...mscene.listChildren()]) w.addChild(n);
  mscene.addChild(w);
  await model.transform(prune(), dedup());
  await io.write(`${OUT}/prop_${kind.id}_raw.glb`, model);
  const size = [ref.dims[0], ref.dims[1], ref.dims[2]].map((v) => +v.toFixed(3));
  propOutputs.push({ ...kind, size, placements });
  console.log('prop', kind.id, 'instâncias', same.length, 'de', list.length, 'size', size, 'err', placements.map((p) => p.err).join(' '));
}

// ---------- cenário estático (sem os props) ----------
{
  const stat = cloneDocument(doc);
  const sprims = [];
  for (const n of stat.getRoot().listNodes()) { const m = n.getMesh(); if (!m) continue; for (const p of m.listPrimitives()) if (p.getMode() === 4) sprims.push(p); }
  sprims.forEach((p, i) => {
    const rem = removedTris.get(prims[i]);
    if (!rem) return;
    const src = prims[i].idx;
    const tris = src.length / 3 - rem.size;
    if (tris <= 0) { p.dispose(); return; }
    const out = new Uint32Array(tris * 3);
    let k = 0;
    for (let t = 0; t < src.length / 3; t++) { if (rem.has(t)) continue; out[k++] = src[t * 3]; out[k++] = src[t * 3 + 1]; out[k++] = src[t * 3 + 2]; }
    p.setIndices(stat.createAccessor().setType('SCALAR').setArray(out).setBuffer(stat.getRoot().listBuffers()[0]));
  });
  for (const n of stat.getRoot().listNodes()) { const m = n.getMesh(); if (m && m.listPrimitives().length === 0) { n.setMesh(null); m.dispose(); } }
  await stat.transform(prune(), dedup());
  await io.write(`${OUT}/scene_raw.glb`, stat);
}

// ---------- colisão: mapa de alturas ----------
const [bx0, bz0, bx1, bz1] = cfg.bounds;
const RES = 0.1;
const GX = Math.ceil((bx1 - bx0) / RES), GZ = Math.ceil((bz1 - bz0) / RES);
const top = new Float32Array(GX * GZ).fill(-1), bot = new Float32Array(GX * GZ).fill(99);
const LOW = cfg.stepIgnore ?? 0.1, HIGH = 2.3;
const ignore = (cfg.noCollide ?? []).map((r) => new RegExp(r));
for (const e of prims) {
  if (ignore.some((r) => r.test(e.name))) continue;
  const rem = removedTris.get(e);
  const { pos, idx } = e;
  for (let t = 0; t < idx.length / 3; t++) {
    if (rem?.has(t)) continue;
    const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3;
    const ys = [pos[a + 1], pos[b + 1], pos[c + 1]].map((y) => y - floorY);
    if (Math.max(...ys) < LOW || Math.min(...ys) > HIGH) continue;
    const e1 = Math.hypot(pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]);
    const e2 = Math.hypot(pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]);
    const e3 = Math.hypot(pos[c] - pos[b], pos[c + 1] - pos[b + 1], pos[c + 2] - pos[b + 2]);
    const n = Math.min(300, Math.max(1, Math.ceil(Math.max(e1, e2, e3) / 0.04)));
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
      const u = i / n, v = j / n;
      const x = pos[a] + (pos[b] - pos[a]) * u + (pos[c] - pos[a]) * v;
      const y = pos[a + 1] + (pos[b + 1] - pos[a + 1]) * u + (pos[c + 1] - pos[a + 1]) * v - floorY;
      const z = pos[a + 2] + (pos[b + 2] - pos[a + 2]) * u + (pos[c + 2] - pos[a + 2]) * v;
      if (y < LOW || y > HIGH) continue;
      const gx = Math.floor((x - bx0) / RES), gz = Math.floor((z - bz0) / RES);
      if (gx < 0 || gz < 0 || gx >= GX || gz >= GZ) continue;
      const k = gz * GX + gx;
      if (y > top[k]) top[k] = y;
      if (y < bot[k]) bot[k] = y;
    }
  }
}
const H = cfg.wallHeight;
// Recorta a colisão sob cada objeto transformável (o colisor do próprio objeto assume ali):
// cadeiras sob a mesa, almofadas sobre o sofá etc.
for (const p of propOutputs) {
  const hx = p.size[0] / 1.18 / 2 + 0.07, hz = p.size[2] / 1.18 / 2 + 0.07;
  for (const pl of p.placements) {
    const c = Math.cos(pl.yaw), sn = Math.sin(pl.yaw);
    const r = Math.hypot(hx, hz);
    for (let gz = Math.floor((pl.z - r - bz0) / RES); gz <= Math.floor((pl.z + r - bz0) / RES); gz++) {
      for (let gx = Math.floor((pl.x - r - bx0) / RES); gx <= Math.floor((pl.x + r - bx0) / RES); gx++) {
        if (gx < 0 || gz < 0 || gx >= GX || gz >= GZ) continue;
        const dx = bx0 + (gx + 0.5) * RES - pl.x, dz = bz0 + (gz + 0.5) * RES - pl.z;
        // para o referencial do objeto (rotação inversa)
        const lx = c * dx - sn * dz, lz = sn * dx + c * dz;
        if (Math.abs(lx) > hx || Math.abs(lz) > hz) continue;
        const k = gz * GX + gx;
        if (top[k] < 0) continue;
        if (pl.y < LOW + 0.05) { top[k] = -1; bot[k] = 99; } else { top[k] = Math.min(top[k], pl.y - 0.06); bot[k] = Math.min(bot[k], top[k]); if (top[k] < LOW) { top[k] = -1; bot[k] = 99; } }
      }
    }
  }
}
// célula → [base, topo] quantizados
const cellBox = (k) => {
  if (top[k] < 0) return null;
  let t = top[k] >= 1.95 ? H : Math.ceil(top[k] / 0.05) * 0.05;
  let b = bot[k] > 1.0 ? Math.floor(bot[k] / 0.25) * 0.25 : 0;
  if (t >= H) b = bot[k] > 1.0 ? b : 0;
  if (t - b < 0.15) b = Math.max(0, t - 0.15);
  return [+b.toFixed(2), +t.toFixed(2)];
};
const boxes = [];
const used = new Uint8Array(GX * GZ);
const keyOf = (k) => { const c = cellBox(k); return c ? c.join('|') : null; };
for (let gz = 0; gz < GZ; gz++) for (let gx = 0; gx < GX; gx++) {
  const k0 = gz * GX + gx;
  if (used[k0]) continue;
  const key = keyOf(k0);
  if (!key) continue;
  let w = 1;
  while (gx + w < GX && !used[gz * GX + gx + w] && keyOf(gz * GX + gx + w) === key) w++;
  let h = 1;
  outer: while (gz + h < GZ) { for (let i = 0; i < w; i++) { const k = (gz + h) * GX + gx + i; if (used[k] || keyOf(k) !== key) break outer; } h++; }
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) used[(gz + j) * GX + gx + i] = 1;
  const [b, t] = key.split('|').map(Number);
  boxes.push([bx0 + gx * RES, bz0 + gz * RES, bx0 + (gx + w) * RES, bz0 + (gz + h) * RES, b, t]);
}
// paredes de contorno (fora dos limites)
if (cfg.contour !== false) boxes.push([bx0 - 0.3, bz0 - 0.3, bx1 + 0.3, bz0, 0, H], [bx0 - 0.3, bz1, bx1 + 0.3, bz1 + 0.3, 0, H], [bx0 - 0.3, bz0, bx0, bz1, 0, H], [bx1, bz0, bx1 + 0.3, bz1, 0, H]);

// ---------- nascimentos: células livres alcançáveis ----------
const R = Math.ceil(0.42 / RES);
const blocked = new Uint8Array(GX * GZ);
for (let k = 0; k < GX * GZ; k++) {
  if (top[k] < 0) continue;
  const c = cellBox(k);
  if (c[0] > 1.9) continue; // só acima da cabeça
  blocked[k] = 1;
}
// áreas que devem ficar livres (passagem das portas): sem objetos nem nascimentos
for (const [x0, z0, x1, z1] of cfg.keepClear ?? []) {
  for (let gz = Math.floor((z0 - bz0) / RES); gz <= Math.floor((z1 - bz0) / RES); gz++) for (let gx = Math.floor((x0 - bx0) / RES); gx <= Math.floor((x1 - bx0) / RES); gx++) if (gx >= 0 && gz >= 0 && gx < GX && gz < GZ) blocked[gz * GX + gx] = 1;
}
// objetos extras (do catálogo) também bloqueiam
for (const ex of cfg.extras ?? []) {
  const r = Math.max(ex.size[0], ex.size[2]) / 2 + 0.05;
  for (let gz = Math.floor((ex.z - r - bz0) / RES); gz <= Math.floor((ex.z + r - bz0) / RES); gz++) for (let gx = Math.floor((ex.x - r - bx0) / RES); gx <= Math.floor((ex.x + r - bx0) / RES); gx++) if (gx >= 0 && gz >= 0 && gx < GX && gz < GZ) blocked[gz * GX + gx] = 1;
}
// props também bloqueiam
for (const p of propOutputs) for (const pl of p.placements) {
  const r = Math.max(p.size[0], p.size[2]) / 2 + 0.05;
  for (let gz = Math.floor((pl.z - r - bz0) / RES); gz <= Math.floor((pl.z + r - bz0) / RES); gz++) for (let gx = Math.floor((pl.x - r - bx0) / RES); gx <= Math.floor((pl.x + r - bx0) / RES); gx++) if (gx >= 0 && gz >= 0 && gx < GX && gz < GZ) blocked[gz * GX + gx] = 1;
}
// Objetos extras automáticos: encostados em paredes/móveis, em pontos livres, espalhados.
const autoPlaced = [];
{
  const nearest = (gx, gz, maxR) => {
    // distância (em células) até a célula bloqueada mais próxima, e a direção dela
    let best = null;
    for (let j = -maxR; j <= maxR; j++) for (let i = -maxR; i <= maxR; i++) {
      const x = gx + i, z = gz + j;
      if (x < 0 || z < 0 || x >= GX || z >= GZ) { const d = Math.hypot(i, j); if (!best || d < best.d) best = { d, i, j }; continue; }
      if (!blocked[z * GX + x]) continue;
      const d = Math.hypot(i, j);
      if (!best || d < best.d) best = { d, i, j };
    }
    return best;
  };
  // região interna: alcançável a partir do centro sem atravessar nada
  const inside = new Uint8Array(GX * GZ);
  {
    let start = -1, bd = Infinity;
    for (let k = 0; k < GX * GZ; k++) if (!blocked[k]) { const d = Math.hypot(k % GX - GX / 2, Math.floor(k / GX) - GZ / 2); if (d < bd) { bd = d; start = k; } }
    const st = start >= 0 ? [start] : [];
    if (start >= 0) inside[start] = 1;
    while (st.length) { const c = st.pop(); const x = c % GX, z = Math.floor(c / GX); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= GX || nz >= GZ) continue; const nk = nz * GX + nx; if (!blocked[nk] && !inside[nk]) { inside[nk] = 1; st.push(nk); } } }
  }
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const ex of cfg.autoExtras ?? []) {
    for (let n = 0; n < (ex.count ?? 1); n++) {
      const r = Math.hypot(ex.size[0], ex.size[2]) / 2 + 0.03;
      const rc = Math.ceil(r / RES);
      const cands = [];
      for (let gz = rc; gz < GZ - rc; gz += 1) for (let gx = rc; gx < GX - rc; gx += 1) {
        if (blocked[gz * GX + gx] || !inside[gz * GX + gx]) continue;
        const nb = nearest(gx, gz, rc + 3);
        if (!nb || nb.d * RES < r || nb.d * RES > r + 0.25) continue;
        cands.push([gx, gz, nb]);
      }
      if (!cands.length) { console.log('autoExtra sem lugar', ex.type); continue; }
      // longe dos outros extras e dos objetos já colocados
      let pick = null, bd = -1;
      for (let t = 0; t < 400; t++) {
        const c = cands[Math.floor(rand() * cands.length)];
        const x = bx0 + (c[0] + 0.5) * RES, z = bz0 + (c[1] + 0.5) * RES;
        const d = Math.min(9, ...autoPlaced.map((a) => Math.hypot(a.x - x, a.z - z)));
        if (d > bd) { bd = d; pick = { c, x, z }; }
      }
      const { c, x, z } = pick;
      const yaw = Math.atan2(-c[2].i, -c[2].j); // de costas para a parede/móvel mais próximo
      autoPlaced.push({ type: ex.type, x: +x.toFixed(3), z: +z.toFixed(3), yaw: +yaw.toFixed(3), y: 0, size: ex.size });
      for (let j = -rc; j <= rc; j++) for (let i = -rc; i <= rc; i++) if (i * i + j * j <= (rc + 0.5) ** 2) { const k = (c[1] + j) * GX + c[0] + i; if (k >= 0 && k < GX * GZ) blocked[k] = 1; }
    }
  }
  console.log('extras automáticos', autoPlaced.map((a) => a.type).join(' '));
}
const free = new Uint8Array(GX * GZ);
for (let gz = R; gz < GZ - R; gz++) for (let gx = R; gx < GX - R; gx++) {
  let ok = true;
  for (let j = -R; j <= R && ok; j++) for (let i = -R; i <= R; i++) if (i * i + j * j <= R * R && blocked[(gz + j) * GX + gx + i]) { ok = false; break; }
  if (ok) free[gz * GX + gx] = 1;
}
// maior região conectada
const comp = new Int32Array(GX * GZ).fill(-1);
let bestComp = -1, bestSize = 0, ci = 0;
for (let k = 0; k < GX * GZ; k++) {
  if (!free[k] || comp[k] >= 0) continue;
  const stack = [k]; comp[k] = ci; let size = 0;
  while (stack.length) { const c = stack.pop(); size++; const x = c % GX, z = Math.floor(c / GX); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= GX || nz >= GZ) continue; const nk = nz * GX + nx; if (free[nk] && comp[nk] < 0) { comp[nk] = ci; stack.push(nk); } } }
  if (size > bestSize) { bestSize = size; bestComp = ci; }
  ci++;
}
const cand = [];
for (let k = 0; k < GX * GZ; k++) if (comp[k] === bestComp) cand.push([bx0 + (k % GX + 0.5) * RES, bz0 + (Math.floor(k / GX) + 0.5) * RES]);
const spawns = [];
if (cand.length) {
  spawns.push(cand[Math.floor(cand.length / 2)]);
  while (spawns.length < 16) {
    let best = null, bd = -1;
    for (const c of cand) { const d = Math.min(...spawns.map((s) => Math.hypot(s[0] - c[0], s[1] - c[1]))); if (d > bd) { bd = d; best = c; } }
    if (bd < 0.75) break;
    spawns.push(best);
  }
}
console.log('caixas de colisão', boxes.length, 'área livre m²', (bestSize * RES * RES).toFixed(1), 'nascimentos', spawns.length);

// ---------- luzes ----------
const lightRe = new RegExp(cfg.lights ?? '(Light|Lamp|Bulb|Fluorescent)');
const lights = [];
for (const e of prims) {
  if (!lightRe.test(e.name)) continue;
  for (const c of components(e)) {
    const d = Math.max(c.max[0] - c.min[0], c.max[2] - c.min[2]);
    if (d > 2.5 || c.tris.length < 4) continue;
    const p = [(c.min[0] + c.max[0]) / 2, c.min[1] - floorY, (c.min[2] + c.max[2]) / 2];
    if (lights.some((l) => Math.hypot(l[0] - p[0], l[2] - p[2]) < 1.2)) continue;
    lights.push(p.map((v) => +v.toFixed(2)));
  }
}

// ---------- relatório das paredes: trechos livres por dentro e janelas ----------
const sides = {};
{
  const winRe = new RegExp(cfg.windows ?? '(Window|Glass|Blind|Curtain)', 'i');
  const wins = [];
  for (const e of prims) if (winRe.test(e.name)) for (const c of components(e)) wins.push(c);
  const defs = { xmin: [2, bx0, 0], xmax: [2, bx1, 0], zmin: [0, bz0, 2], zmax: [0, bz1, 2] };
  for (const [name, [along, line]] of Object.entries(defs)) {
    const n = along === 0 ? GX : GZ;
    const freeBits = [];
    for (let i = 0; i < n; i++) {
      // a partir da parede, pula até 0,5 m de parede/rodapé e exige 0,9 m livres para dentro
      let ok = false;
      for (let skip = 0; skip <= 5 && !ok; skip++) {
        let clear = true;
        for (let d = skip; d < skip + 9 && clear; d++) {
          let gx, gz;
          if (name === 'xmin') { gx = d; gz = i; } else if (name === 'xmax') { gx = GX - 1 - d; gz = i; } else if (name === 'zmin') { gx = i; gz = d; } else { gx = i; gz = GZ - 1 - d; }
          if (gx < 0 || gz < 0 || gx >= GX || gz >= GZ) { clear = false; break; }
          const k = gz * GX + gx;
          if (top[k] >= LOW) clear = false;
        }
        if (clear) ok = true;
      }
      freeBits.push(ok ? 1 : 0);
    }
    const near = (c) => name === 'xmin' ? Math.abs(c.min[0] - bx0) < 0.45 : name === 'xmax' ? Math.abs(c.max[0] - bx1) < 0.45 : name === 'zmin' ? Math.abs(c.min[2] - bz0) < 0.45 : Math.abs(c.max[2] - bz1) < 0.45;
    const windows = wins.filter(near).map((c) => along === 0 ? [c.min[0], c.max[0], c.min[1] - floorY, c.max[1] - floorY] : [c.min[2], c.max[2], c.min[1] - floorY, c.max[1] - floorY]).map((w) => w.map((v) => +v.toFixed(2)));
    sides[name] = { start: +(along === 0 ? bx0 : bz0).toFixed(3), res: RES, free: freeBits.join(''), windows };
  }
}

// ---------- fachada: o que é parede opaca e o que é vidro/abertura em cada lado ----------
// Projeta os triângulos próximos de cada lado no plano da parede (grade de 10 cm)
// e marca as células cobertas por material opaco. O resto (vidro, vãos) vira janela.
{
  const isGlass = (prim) => {
    const m = prim.getMaterial();
    if (!m) return false;
    if (m.getAlphaMode() === 'BLEND' || m.getBaseColorFactor()[3] < 0.9) return true;
    if (m.getExtension('KHR_materials_transmission')) return true;
    return /glass|window|vidro/i.test(m.getName() ?? '');
  };
  const glassPrim = new Map(prims.map((e) => [e, isGlass(e.prim)]));
  const HC = Math.ceil(H / RES);
  const defs = { xmin: [2, 0, bx0, 1], xmax: [2, 0, bx1, -1], zmin: [0, 2, bz0, 1], zmax: [0, 2, bz1, -1] };
  for (const [name, [along, perp, line, inward]] of Object.entries(defs)) {
    const n = along === 0 ? GX : GZ;
    const opaque = new Uint8Array(n * HC);
    const start = along === 0 ? bx0 : bz0;
    for (const e of prims) {
      if (glassPrim.get(e)) continue;
      const { pos, idx } = e;
      for (let t = 0; t < idx.length / 3; t++) {
        const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3;
        // faixa da parede: até 0,35 m para dentro e 0,4 m para fora do limite
        const dp = [pos[a + perp], pos[b + perp], pos[c + perp]].map((v) => (v - line) * inward);
        if (Math.max(...dp) < -0.4 || Math.min(...dp) > 0.35) continue;
        const e1 = Math.hypot(pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]);
        const e2 = Math.hypot(pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]);
        const steps = Math.min(200, Math.max(1, Math.ceil(Math.max(e1, e2) / 0.05)));
        for (let i = 0; i <= steps; i++) for (let j = 0; j <= steps - i; j++) {
          const u = i / steps, v = j / steps;
          const p = (k) => pos[a + k] + (pos[b + k] - pos[a + k]) * u + (pos[c + k] - pos[a + k]) * v;
          const d = (p(perp) - line) * inward;
          if (d < -0.4 || d > 0.35) continue;
          const gi = Math.floor((p(along) - start) / RES), gy = Math.floor((p(1) - floorY) / RES);
          if (gi < 0 || gi >= n || gy < 0 || gy >= HC) continue;
          opaque[gy * n + gi] = 1;
        }
      }
    }
    // aberturas: células não opacas entre 0,3 m e 0,3 m abaixo do teto, agrupadas em retângulos
    const y0 = Math.ceil(0.3 / RES), y1 = HC - Math.ceil(0.3 / RES);
    let holeCount = 0, total = 0;
    const used = new Uint8Array(n * HC);
    const rects = [];
    for (let gy = y0; gy < y1; gy++) for (let gi = 0; gi < n; gi++) {
      total++;
      const k = gy * n + gi;
      if (opaque[k]) continue;
      holeCount++;
      if (used[k]) continue;
      let w = 1;
      while (gi + w < n && !opaque[gy * n + gi + w] && !used[gy * n + gi + w]) w++;
      let h = 1;
      outer: while (gy + h < y1) { for (let q = 0; q < w; q++) { const kk = (gy + h) * n + gi + q; if (opaque[kk] || used[kk]) break outer; } h++; }
      for (let r = 0; r < h; r++) for (let q = 0; q < w; q++) used[(gy + r) * n + gi + q] = 1;
      if (w * h >= 6) rects.push([+(start + gi * RES).toFixed(2), +(gy * RES).toFixed(2), +(start + (gi + w) * RES).toFixed(2), +((gy + h) * RES).toFixed(2)]);
    }
    sides[name].holes = rects;
    sides[name].openFraction = +(holeCount / Math.max(1, total)).toFixed(2);
  }
}

fs.writeFileSync(`${OUT}/map.json`, JSON.stringify({
  sides,
  floorY, bounds: cfg.bounds, wallHeight: H,
  boxes: boxes.map((b) => b.map((v) => +v.toFixed(3))),
  props: propOutputs.map(({ id, name, size, placements, speed }) => ({ id, name, size, speed, placements })),
  spawns: spawns.map((s) => s.map((v) => +v.toFixed(2))),
  lights: lights.slice(0, 10),
  extras: [...(cfg.extras ?? []), ...autoPlaced].map((e) => [e.type, e.x, e.z, e.yaw ?? 0, e.y ?? 0]),
}, null, 0));
// prévia da grade (PGM) para conferência
const pgm = Buffer.alloc(GX * GZ);
for (let k = 0; k < GX * GZ; k++) pgm[k] = comp[k] === bestComp ? 255 : top[k] < 0 ? 180 : Math.max(0, 120 - top[k] * 50);
fs.writeFileSync(`${OUT}/grid.pgm`, Buffer.concat([Buffer.from(`P5 ${GX} ${GZ} 255\n`), pgm]));
console.log('ok', OUT);
