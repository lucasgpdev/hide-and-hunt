// Simplifica cada malha até um erro absoluto (em metros), não relativo ao tamanho:
// objetos pequenos (alças, talheres) perdem os detalhes que ninguém vê.
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { simplifyPrimitive, weld, prune } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
await MeshoptSimplifier.ready; await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const [src, dst, absArg, minArg] = process.argv.slice(2);
const abs = +(absArg ?? 0.004), minTris = +(minArg ?? 300);
const doc = await io.read(src);
await doc.transform(weld());
let before = 0, after = 0;
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  const b = getBounds(node);
  const diag = Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) || 1;
  for (const prim of mesh.listPrimitives()) {
    const n = (prim.getIndices()?.getCount() ?? 0) / 3;
    before += n;
    if (n > minTris) simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: 0.02, error: Math.min(0.08, abs / diag), lockBorder: false });
    after += (prim.getIndices()?.getCount() ?? 0) / 3;
  }
}
await doc.transform(prune());
await io.write(dst, doc);
console.log('triângulos', Math.round(before), '->', Math.round(after));
