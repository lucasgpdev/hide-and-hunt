# Créditos e licenças dos recursos

Nenhum modelo, textura, animação ou som foi copiado de outros jogos. Tudo abaixo tem licença que permite uso em jogos.

## Personagens (`client/public/models/characters`)

| Arquivo | Origem | Licença / termos |
| --- | --- | --- |
| `Soldier.glb` | Personagem e animações do [Mixamo](https://www.mixamo.com) (Adobe), na versão distribuída nos exemplos do [three.js](https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf) | Termos do Mixamo: uso livre em projetos pessoais e comerciais, **inclusive jogos**. Não é permitido redistribuir os arquivos sozinhos como pacote de modelos. |
| `Xbot.glb` | Mixamo (Adobe), também dos exemplos do three.js | Mesmos termos do Mixamo |
| `RobotExpressive.glb` | Modelo de Tomás Laulhé ([Quaternius](https://quaternius.com)), ajustes de Don McCurdy, dos exemplos do three.js | CC0 1.0 (domínio público) |
| `q_Male_*.glb`, `q_Female_*.glb` (roupas) | [Modular Character Outfits – Fantasy](https://quaternius.itch.io/modular-character-outfits-fantasy), de Quaternius | CC0 1.0 (domínio público) |
| `q_Superhero_*_FullBody.glb` (rostos), `q_Hair_*.glb` | [Universal Base Characters](https://quaternius.itch.io/universal-base-characters), de Quaternius | CC0 1.0 (domínio público) |
| `q_animations.glb` | [Universal Animation Library](https://quaternius.itch.io/universal-animation-library), de Quaternius (faixas de escala removidas) | CC0 1.0 (domínio público) |

Os personagens realistas são montados no jogo: roupa + rosto + cabelo no mesmo esqueleto, com cabeça e mãos um pouco maiores (proporção de jogo de esconde-esconde). As cores, os olhos brilhantes e os **acessórios** das skins (máscara de porcelana, nariz de palhaço, cartola, cabeça de coelho, cabeça de abóbora, fone neon, máscara de vigia, máscara de gás e capa) são originais deste projeto, feitos por código. Nenhuma skin reproduz personagens de outras obras nem pessoas reais.

Se o jogo for publicado comercialmente, vale reler os termos atuais do Mixamo em <https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html>.

## Objetos realistas (`client/public/models/props`)

Modelos fotoescaneados do [Poly Haven](https://polyhaven.com/models), licença **CC0 1.0** (domínio público). Foram convertidos para GLB, com texturas reduzidas para 512 px em WebP. Cada um substitui o modelo feito por código do tipo correspondente; se o arquivo não carregar, o jogo volta ao modelo por código.

| Tipo no jogo | Modelo Poly Haven |
| --- | --- |
| Cadeira | SchoolChair_01 |
| Carteira escolar | SchoolDesk_01 |
| Mesa | dining_table (sem a toalha) |
| Sofá | Sofa_01 |
| Armário | painted_wooden_cabinet_02 |
| Lixeira | metal_trash_can (variação sem ferrugem) |
| Caixa | cardboard_box_01 |
| Mala | vintage_suitcase (variação 01) |
| Relógio | wall_clock |

## Cenário 3D "Sala de Aula Clássica" (`client/public/models/maps/classroom.glb`)

Cena **Classroom**, de Christophe Seux, dos [arquivos de demonstração do Blender](https://www.blender.org/download/demo-files/), licença **CC0 1.0** (domínio público). Usamos a versão glTF do repositório [gltf-research-scenes](https://github.com/ErfanMo77/gltf-research-scenes) (`scenes/classroom2`). Mudanças feitas aqui: as carteiras, as poltronas de couro e o cesto de papel foram separados como objetos transformáveis (`cr_desk.glb`, `cr_leather_chair.glb`, `cr_wastebasket.glb`); as portas foram abertas a 90°; as bolinhas de papel e a luz embutida foram removidas; texturas reduzidas (WebP, até 1024 px) e geometria simplificada e comprimida com meshopt. As colisões do mapa são caixas invisíveis medidas a partir da cena.

## Mapas a partir de cenas de renderização (`client/public/models/maps/*.glb`, `props/sc_*.glb`)

Versões glTF do repositório [gltf-research-scenes](https://github.com/ErfanMo77/gltf-research-scenes), baseadas nas cenas publicadas por [Benedikt Bitterli](https://benedikt-bitterli.me/resources/). Licença **CC-BY 3.0**: podem ser usadas e modificadas, inclusive comercialmente, com crédito aos autores:

| Mapa | Cena original | Autor |
| --- | --- | --- |
| Sala de Aula Japonesa (`jp_classroom`) | [Japanese Classroom](http://www.blendswap.com/blends/view/75940) | NovaZeeke |
| Cozinha Rústica (`country_kitchen`) | [Country Kitchen](http://www.blendswap.com/blends/view/42851) | Jay-Artist |
| Sala Branca (`white_room`) | [The White Room](http://www.blendswap.com/blends/view/41683) | Jay-Artist |
| Sala Cinza (`grey_room`) | [The Grey & White Room](http://www.blendswap.com/blends/view/75795) | Wig42 |
| Sala de Café da Manhã (`breakfast_room`) | [The Breakfast Room](http://www.blendswap.com/blends/view/75431) | Wig42 |

Mudanças feitas aqui (com as ferramentas de `tools/scene-maps`): objetos repetidos (carteiras, cadeiras, poltronas, abajur, almofadas, plantas, lixeira) separados como objetos transformáveis; colisão gerada a partir da geometria; luzes embutidas removidas; texturas reduzidas (WebP) e geometria simplificada e comprimida (meshopt); a Sala de Café da Manhã foi reduzida para a escala real. Os mapas antigos, feitos por código, continuam no projeto, mas fora da rotação.

## Objetos e céus do Poly Haven (CC0) — `client/public/models/props/ph_*.glb`, `client/public/sky/*.jpg`

Modelos de [Poly Haven](https://polyhaven.com) (licença **CC0**), reduzidos para texturas WebP de até 1024 px e geometria meshopt: Ottoman 01, Arm Chair 01, Potted Plant 02, Wicker Basket 01, Wooden Stool 01, Side Table 01, Ceramic Vase 01, Television 01, Book Encyclopedia Set 01, Boombox, Throw Pillows 01, Wooden Crate 01, Vintage Grandfather Clock 01, Lantern 01, Drawer Cabinet, Plastic Monobloc Chair 01 e Rubber Duck Toy. Céus vistos pelas janelas: HDRIs *Noon Grass* e *Kloofendal 48d Partly Cloudy (Pure Sky)*, convertidos para panoramas JPG.

## Sons (CC0) — `client/public/sounds/*.mp3`

Pacotes da [Kenney](https://kenney.nl) (licença **CC0**): *Impact Sounds* (passos em madeira, carpete e piso frio; impactos), *RPG Audio* (portas, tecido, rangidos, trinco) e *Interface Sounds* (cliques e interruptor). Convertidos para MP3 mono.

## Bibliotecas

- [N8AO](https://github.com/N8python/n8ao) (ISC): oclusão de ambiente.
- [nipplejs](https://github.com/yoannmoinet/nipplejs) (MIT): joystick na tela do celular.
- [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) (MIT): raios de mira acelerados.
- [postprocessing](https://github.com/pmndrs/postprocessing) (Zlib): dependência do N8AO.

## Animações extras

Da mesma *Universal Animation Library* (Quaternius, CC0): caminhada agachada, sentar, socos, pegar objeto, feitiço e empurrar.

## Iluminação de ambiente (HDRI)

Arquivos `lobby`, `lab`, `hall`, `apartment`, `studio` e `night` do pacote [`@pmndrs/assets`](https://github.com/pmndrs/assets) — seleção de HDRIs do [Poly Haven](https://polyhaven.com/hdris) reduzidos para 512×512. Licença **CC0 1.0**.

## Feito para este projeto

- Os demais **objetos**, os **cenários** e os **mapas**: geometria gerada por código.
- Todas as **texturas** (piso, azulejo, madeira, mármore, concreto, asfalto, grama, tecido, metal, papelão...): geradas por código em canvas.
- Todos os **sons**: sintetizados no navegador com Web Audio.
- Interface, ícones e textos.

## Serviços externos

- **STUN** `stun.l.google.com:19302` (Google), usado só para os navegadores descobrirem como se conectar no chat de voz. O áudio não passa por ele. Em produção, pode ser trocado por um servidor STUN/TURN próprio em `client/src/multiplayer/VoiceChat.ts`.

## Bibliotecas

Three.js (MIT), React (MIT), Rapier (Apache 2.0), Socket.IO (MIT), Express (MIT), Zod (MIT), pino (MIT), node-postgres (MIT), Vite (MIT), Vitest (MIT).
