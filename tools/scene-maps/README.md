# Mapas a partir de cenários 3D prontos

Ferramentas usadas para transformar as cenas do repositório
[gltf-research-scenes](https://github.com/ErfanMo77/gltf-research-scenes)
(versões glTF das cenas de Benedikt Bitterli, licenças CC0/CC-BY) em mapas do jogo.

1. `pipeline.mjs config.json`: assa transformações e escala, separa objetos
   repetidos (cadeiras, carteiras, almofadas...) em objetos transformáveis com a
   rotação de cada um, gera a colisão (mapa de alturas de 10 cm em caixas),
   recorta a colisão sob os objetos, escolhe pontos de nascimento alcançáveis e
   luzes. Saída: `scene_raw.glb`, `prop_*_raw.glb`, `map.json`, `grid.pgm`.
2. `compress.sh pasta`: texturas WebP até 1024 px, simplificação e meshopt.
3. `gen.py id map.json meta.json`: escreve `shared/src/maps/scenes/<id>.ts`,
   atualiza `shared/src/props/sceneProps.ts` e copia os modelos para
   `client/public/models`.

Os caminhos em `configs/` apontam para onde as cenas foram baixadas
(`git lfs` ou `media.githubusercontent.com`). Precisa de
`@gltf-transform/cli`, `@gltf-transform/core|extensions|functions` e `sharp`.
