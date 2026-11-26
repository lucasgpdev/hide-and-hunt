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

## Mapas abertos (Casa Grande, Escola)

`compose.mjs configs/big_house.json` (ou `big_school.json`) junta vários cômodos
num mapa só, com área externa:

- roda o `pipeline.mjs` em cada cômodo com `cuts` (recorta as portas nas paredes
  do cenário), `clip` (descarta o que fica fora do cômodo, como pisos infinitos e
  corredores do cenário original), `keepClear` (sem objetos na frente das portas)
  e sem a caixa de contorno;
- gera a casca externa (`<id>_exterior.glb`): paredes com janelas onde o cenário
  tem aberturas (relatório `sides` do `map.json`, ou `holes` manual por cômodo),
  telhado com beiral, batentes e piso das passagens e a cerca do quintal;
- espalha árvores e arbustos (cenários extras, só o tronco tem colisão), objetos
  do quintal e pontos de nascimento por amostragem do ponto mais distante;
- escreve `shared/src/maps/scenes/<id>.ts` (`compositeMap`) e copia os modelos.

As portas ficam em coordenadas do mundo (antes de centralizar): `axis` é o eixo
perpendicular à parede, `at` o intervalo atravessado e `range` a largura.
Árvores, arbustos e objetos do quintal: Poly Haven (CC0).

## Deixar leve

- `ABS=0.003 bash compress.sh pasta`: simplifica o cenário por erro absoluto
  (3 mm) com `simplify-abs.mjs` — alças, talheres e frutas perdem detalhes
  invisíveis (cozinha: 595 mil → 78 mil triângulos). `TEX=512` reduz texturas.
- `node simplify-abs.mjs entrada.glb saída.glb 0.0015 200`: o mesmo para objetos.
- `node leafthin.mjs árvore.glb saída.glb 0.45 1.25`: mantém 45% dos cartões de
  folhas e aumenta 25% os que ficam.
- `node mopt.mjs entrada.glb saída.glb`: meshopt sem quantizar (personagens com
  esqueleto e animações).
