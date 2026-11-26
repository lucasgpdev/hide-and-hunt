// Afina a copa: mantém só parte dos cartões de folhas (componentes conectados)
// e aumenta um pouco os que ficam, para a árvore continuar cheia com bem menos triângulos.
import { NodeIO } from '@gltf-transform/core';
import { compactPrimitive, prune } from '@gltf-transform/functions';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const [src, dst, keepArg, growArg] = process.argv.slice(2);
const keep = +(keepArg ?? 0.45), grow = +(growArg ?? 1.25);
const doc = await io.read(src);
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
  const name = prim.getMaterial()?.getName() ?? '';
  if (!/leaves|leaf|twig/i.test(name)) continue;
  const idx = prim.getIndices(), pos = prim.getAttribute('POSITION');
  const ia = idx.getArray(), n = pos.getCount();
  const parent = new Int32Array(n).map((_, i) => i);
  const find = (a) => { while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a; };
  for (let t = 0; t < ia.length; t += 3) { const a = find(ia[t]); parent[find(ia[t + 1])] = a; parent[find(ia[t + 2])] = a; }
  const keepComp = new Map();
  const tris = [];
  for (let t = 0; t < ia.length; t += 3) {
    const c = find(ia[t]);
    if (!keepComp.has(c)) keepComp.set(c, rnd() < keep);
    if (keepComp.get(c)) tris.push(ia[t], ia[t + 1], ia[t + 2]);
  }
  // aumenta cada cartão mantido em torno do próprio centro
  const sum = new Map(), el = [0, 0, 0];
  for (let v = 0; v < n; v++) { const c = find(v); if (!keepComp.get(c)) continue; pos.getElement(v, el); const s = sum.get(c) ?? [0, 0, 0, 0]; s[0] += el[0]; s[1] += el[1]; s[2] += el[2]; s[3]++; sum.set(c, s); }
  for (let v = 0; v < n; v++) { const s = sum.get(find(v)); if (!s) continue; pos.getElement(v, el); for (let k = 0; k < 3; k++) { const m = s[k] / s[3]; el[k] = m + (el[k] - m) * grow; } pos.setElement(v, el); }
  const Arr = ia.constructor;
  idx.setArray(new Arr(tris));
  compactPrimitive(prim);
  console.log(src.split('/').pop(), name, ia.length / 3, '->', tris.length / 3, '');
}
await doc.transform(prune());
await io.write(dst, doc);
