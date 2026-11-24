# Créditos e licenças dos recursos

Nenhum modelo, textura, animação ou som foi copiado de outros jogos. Tudo abaixo tem licença que permite uso em jogos.

## Personagens (`client/public/models/characters`)

| Arquivo | Origem | Licença / termos |
| --- | --- | --- |
| `Soldier.glb` | Personagem e animações do [Mixamo](https://www.mixamo.com) (Adobe), na versão distribuída nos exemplos do [three.js](https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf) | Termos do Mixamo: uso livre em projetos pessoais e comerciais, **inclusive jogos**. Não é permitido redistribuir os arquivos sozinhos como pacote de modelos. |
| `Xbot.glb` | Mixamo (Adobe), também dos exemplos do three.js | Mesmos termos do Mixamo |
| `RobotExpressive.glb` | Modelo de Tomás Laulhé ([Quaternius](https://quaternius.com)), ajustes de Don McCurdy, dos exemplos do three.js | CC0 1.0 (domínio público) |

Se o jogo for publicado comercialmente, vale reler os termos atuais do Mixamo em <https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html>.

## Iluminação de ambiente (HDRI)

Arquivos `lobby`, `lab`, `hall`, `apartment`, `studio` e `night` do pacote [`@pmndrs/assets`](https://github.com/pmndrs/assets) — seleção de HDRIs do [Poly Haven](https://polyhaven.com/hdris) reduzidos para 512×512. Licença **CC0 1.0**.

## Feito para este projeto

- Todos os **objetos** (27 tipos), **cenários** e **mapas**: geometria gerada por código.
- Todas as **texturas** (piso, azulejo, madeira, mármore, concreto, asfalto, grama, tecido, metal, papelão...): geradas por código em canvas.
- Todos os **sons**: sintetizados no navegador com Web Audio.
- Interface, ícones e textos.

## Serviços externos

- **STUN** `stun.l.google.com:19302` (Google), usado só para os navegadores descobrirem como se conectar no chat de voz. O áudio não passa por ele. Em produção, pode ser trocado por um servidor STUN/TURN próprio em `client/src/multiplayer/VoiceChat.ts`.

## Bibliotecas

Three.js (MIT), React (MIT), Rapier (Apache 2.0), Socket.IO (MIT), Express (MIT), Zod (MIT), pino (MIT), node-postgres (MIT), Vite (MIT), Vitest (MIT).
