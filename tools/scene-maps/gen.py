# gen.py <id> <map.json> <meta.json> : escreve shared/src/maps/scenes/<id>.ts e copia os modelos
import json, sys, shutil, os
mid, mj, metaf = sys.argv[1:4]
d = json.load(open(mj)); meta = json.load(open(metaf))
x0, z0, x1, z1 = d['bounds']; cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
r = lambda v: round(v, 3)
boxes = [[r(b[0]-cx), r(b[1]-cz), r(b[2]-cx), r(b[3]-cz), b[4], b[5]] for b in d['boxes']]
props = []
for p in d['props']:
    for q in p['placements']:
        props.append([p['id'], r(q['x']-cx), r(q['z']-cz), q['yaw'], max(0, q['y'])])
for e in d.get('extras', []):
    props.append([e[0], r(e[1]-cx), r(e[2]-cz), e[3], e[4]])
spawns = [[r(s[0]-cx), r(s[1]-cz)] for s in d['spawns']]
lights = [[r(l[0]-cx), r(min(l[1], d['wallHeight']-0.15)), r(l[2]-cz)] for l in d['lights']]
if not lights:
    w, dd = x1-x0, z1-z0
    for fx in ([-0.25, 0.25] if w > dd else [0]):
        for fz in ([-0.25, 0.25] if dd >= w else [0]):
            lights.append([r(fx*w), r(d['wallHeight']-0.4), r(fz*dd)])
data = {
  'id': mid, 'name': meta['name'], 'description': meta['description'],
  'url': f'/models/maps/{mid}.glb', 'offset': [r(-cx), r(-d['floorY']), r(-cz)],
  'size': [r(x1-x0), r(z1-z0)], 'wallHeight': d['wallHeight'],
  'boxes': boxes, 'props': props, 'spawns': spawns, 'lights': lights,
  'theme': meta['theme'],
}
for k in ('sunFrom', 'sunIntensity', 'lightColor', 'lightIntensity', 'surface', 'sky'):
    if k in meta: data[k] = meta[k]
camel = ''.join(w.capitalize() for w in mid.split('_'))
ts = f"""// Gerado por script a partir do cenário {meta['source']} — não editar à mão.
import {{ sceneMap }} from './sceneMap.js';

export const build{camel} = () =>
  sceneMap({json.dumps(data, separators=(',', ':'))});
"""
root = '/home/claude/HIDE-AND-HUNT'
open(f'{root}/shared/src/maps/scenes/{mid}.ts', 'w').write(ts)
# tipos de objeto da cena
reg = f'{root}/tools/scene-maps/sceneProps.json'
cur = json.load(open(reg)) if os.path.exists(reg) else []
cur = [c for c in cur if c['map'] != mid]
for p in d['props']:
    cur.append({'map': mid, 'id': p['id'], 'name': p['name'], 'size': [round(p['size'][0]/1.18, 3), p['size'][1], round(p['size'][2]/1.18, 3)], 'speed': p.get('speed') or 1, 'file': f"sc_{p['id']}.glb"})
json.dump(cur, open(reg, 'w'), indent=1)
out = os.path.dirname(mj)
shutil.copy(f'{out}/scene.glb', f'{root}/client/public/models/maps/{mid}.glb')
for p in d['props']:
    shutil.copy(f"{out}/prop_{p['id']}.glb", f"{root}/client/public/models/props/sc_{p['id']}.glb")
print('ok', mid, 'boxes', len(boxes), 'props', len(props), 'spawns', len(spawns), 'lights', len(lights))
lines = ["// Gerado por script (tools de mapas a partir de cenários) — não editar à mão.",
         "/** Objetos transformáveis separados dos cenários 3D: id, nome, tamanho do colisor e arquivo do modelo. */",
         "export const SCENE_PROPS: readonly { id: string; name: string; size: [number, number, number]; speed: number; file: string }[] = ["]
for c in cur:
    lines.append(f"  {{ id: '{c['id']}', name: {json.dumps(c['name'], ensure_ascii=False)}, size: {json.dumps(c['size'])}, speed: {c['speed']}, file: '{c['file']}' }},")
lines.append("];")
open(f'{root}/shared/src/props/sceneProps.ts', 'w').write("\n".join(lines) + "\n")
