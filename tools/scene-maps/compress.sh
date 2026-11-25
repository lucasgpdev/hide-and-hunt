#!/bin/bash
# compress.sh <dir> : comprime scene_raw.glb e prop_*_raw.glb
set -e
cd "$1"
G="npx --prefix /tmp/kk gltf-transform"
for raw in scene_raw.glb prop_*_raw.glb; do
  [ -f "$raw" ] || continue
  b=${raw%_raw.glb}
  $G resize $raw ${b}_a.glb --pattern "*normal*" --width 512 --height 512 >/dev/null 2>&1 || cp $raw ${b}_a.glb
  $G resize ${b}_a.glb ${b}_b.glb --width 1024 --height 1024 >/dev/null 2>&1 || cp ${b}_a.glb ${b}_b.glb
  $G webp ${b}_b.glb ${b}_c.glb --quality 80 >/dev/null 2>&1 || cp ${b}_b.glb ${b}_c.glb
  $G weld ${b}_c.glb ${b}_d.glb >/dev/null 2>&1 || cp ${b}_c.glb ${b}_d.glb
  if [ "$b" = "scene" ]; then $G simplify ${b}_d.glb ${b}_e.glb --ratio 0.4 --error 0.0008 >/dev/null 2>&1 || cp ${b}_d.glb ${b}_e.glb; else cp ${b}_d.glb ${b}_e.glb; fi
  $G meshopt ${b}_e.glb ${b}.glb >/dev/null 2>&1
  rm -f ${b}_a.glb ${b}_b.glb ${b}_c.glb ${b}_d.glb ${b}_e.glb
  echo "$b $(stat -c %s ${b}.glb)"
done
