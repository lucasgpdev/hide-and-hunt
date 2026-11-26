#!/bin/bash
# compress.sh <dir> : comprime scene_raw.glb e prop_*_raw.glb
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
cd "$1"
G="npx --prefix /tmp/kk gltf-transform"
# Ajustes (mapas grandes usam valores mais fortes): RATIO, ERR, TEX
RATIO=${RATIO:-0.4}; ERR=${ERR:-0.0008}; TEX=${TEX:-1024}
for raw in scene_raw.glb prop_*_raw.glb; do
  [ -f "$raw" ] || continue
  b=${raw%_raw.glb}
  $G resize $raw ${b}_a.glb --pattern "*normal*" --width 512 --height 512 >/dev/null 2>&1 || cp $raw ${b}_a.glb
  $G resize ${b}_a.glb ${b}_b.glb --width $TEX --height $TEX >/dev/null 2>&1 || cp ${b}_a.glb ${b}_b.glb
  $G webp ${b}_b.glb ${b}_c.glb --quality 80 >/dev/null 2>&1 || cp ${b}_b.glb ${b}_c.glb
  $G weld ${b}_c.glb ${b}_d.glb >/dev/null 2>&1 || cp ${b}_c.glb ${b}_d.glb
  if [ "$b" = "scene" ] && [ -n "$ABS" ]; then
    # erro absoluto em metros (simplify-abs.mjs): bem mais leve nos objetos pequenos
    (cd "$HERE" && node simplify-abs.mjs "$OLDPWD/${b}_d.glb" "$OLDPWD/${b}_e.glb" "$ABS") || cp ${b}_d.glb ${b}_e.glb
  elif [ "$b" = "scene" ]; then $G simplify ${b}_d.glb ${b}_e.glb --ratio $RATIO --error $ERR >/dev/null 2>&1 || cp ${b}_d.glb ${b}_e.glb; else cp ${b}_d.glb ${b}_e.glb; fi
  $G meshopt ${b}_e.glb ${b}.glb >/dev/null 2>&1
  rm -f ${b}_a.glb ${b}_b.glb ${b}_c.glb ${b}_d.glb ${b}_e.glb
  echo "$b $(stat -c %s ${b}.glb)"
done
