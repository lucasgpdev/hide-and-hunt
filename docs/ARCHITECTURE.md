# Arquitetura — HIDE & HUNT

## Visão geral

```
┌──────────────── Navegador ────────────────┐        ┌──────────── Servidor (Node) ────────────┐
│ React (interface)                         │        │ Express  → /api/health, ranking, admin  │
│ Three.js (renderização 3D)                │  HTTP  │ Socket.IO → conexões em tempo real       │
│ Rapier (física local / previsão)          │◄──────►│   ├─ validação Zod de toda mensagem     │
│ NetworkClient (Socket.IO)                 │   WS   │   ├─ limite de frequência por evento    │
└───────────────────────────────────────────┘        │   ├─ registro de jogadores/sessões      │
                 ▲                                    │   └─ salas, partidas, voz (sinalização) │
                 │ tipos, constantes, esquemas        │ PostgreSQL (persistência)               │
            ┌────┴─────┐                              └─────────────────────────────────────────┘
            │  shared  │◄────────────────────────────────────────┘
            └──────────┘
```

## Decisões técnicas

**Monorepo com npm workspaces (`shared`, `server`, `client`).** Um único `npm install`, um único repositório e tipos compartilhados sem publicar pacotes. Não foi usada ferramenta extra (Turborepo, Nx) para evitar dependências desnecessárias.

**Pacote `@hh/shared` com condição de exportação `source`.** Em desenvolvimento e testes, o Vite, o `tsx` e o Vitest leem o TypeScript de `shared/src` diretamente (alterações aparecem na hora). Em produção, o Node usa `shared/dist`, compilado pelo `npm run build`. O TypeScript entende a mesma condição via `customConditions`.

**Servidor autoritativo desde o início.** O cliente só envia intenções. Toda mensagem recebida é tratada como `unknown`, validada com Zod e passa por limite de frequência antes de chegar à lógica. O cliente não decide posições, capturas, transformações, pontuação ou recompensas.

**Socket.IO com confirmação (ack) para pedidos e eventos para avisos.** Pedidos do cliente (`session:hello`, `net:ping`) recebem uma resposta tipada `{ ok: true, ... } | { ok: false, error }`. Avisos do servidor (`server:stats`, `server:error`) são eventos. O estado da partida a 15 atualizações/s (Fase 5) usará eventos compactos.

**Sessões por aba.** O cliente guarda um UUID no `sessionStorage`: cada aba é um jogador (permite testar multiplayer localmente), recarregar a página mantém o mesmo jogador, e uma aba duplicada é detectada — o servidor substitui a conexão antiga em vez de duplicar o jogador. É a base da reconexão (Fase 5) e será ligada à conta do jogador na Fase 10.

**Banco recomendado, não obrigatório.** Com PostgreSQL, as migrações rodam na inicialização e a progressão é salva. Sem ele, o servidor usa um repositório em memória com a mesma interface, e o perfil informa `persistent: false` ao jogador.

**Rapier `compat`.** Funciona igual no navegador e no Node sem configurar carregamento de `.wasm`, o que permite usar a mesma física no cliente (previsão) e no servidor (validação). Custo: pacote maior, carregado sob demanda.

**Configuração validada.** `server/src/config/env.ts` valida as variáveis de ambiente; um valor errado impede o servidor de iniciar com mensagem clara, em vez de falhar no meio de uma partida.

**Valores de jogo centralizados.** Durações, tamanho das salas, proporção de equipes e taxa de rede ficam em `shared/src/constants`. Os valores de equilíbrio (item 38) seguirão o mesmo padrão em `balance.ts`.

## Segurança já implementada

| Proteção | Onde |
| --- | --- |
| Validação de todas as mensagens (Zod, objetos estritos) | `server/src/networking/connectionHandler.ts` |
| Limite de frequência por evento (token bucket) | `server/src/security/rateLimiter.ts`, `networking/policy.ts` |
| Desconexão após 20 mensagens inválidas/bloqueadas | `networking/policy.ts` |
| Tamanho máximo de mensagem (16 KB) | `server.ts` |
| Prazo de 10 s para o cliente se identificar | `networking/policy.ts` |
| Limite global de conexões | `MAX_CONNECTIONS` no `.env` |
| Sessão duplicada substitui a anterior | `players/PlayerRegistry.ts` |
| Dados internos (sessão, socket) nunca enviados a outros jogadores | `toPublicPlayer()` |
| Versão de protocolo obrigatória | `PROTOCOL_VERSION` em `shared` |
| Logs estruturados (pino) | `server/src/logger.ts` |

## Como adicionar um novo evento de rede

1. Adicione o nome em `NetEvent` (`shared/src/constants/network.ts`).
2. Crie o esquema Zod em `shared/src/validation/`.
3. Declare a assinatura em `ClientToServerEvents` ou `ServerToClientEvents` (`shared/src/types/network.ts`).
4. Defina o limite de frequência em `server/src/networking/policy.ts` e inclua o evento em `KNOWN_CLIENT_EVENTS`.
5. Registre o handler com `on(...)` no servidor — ele já recebe o dado validado.
6. Escreva o teste de integração em `tests/integration/`.
7. Se o formato de uma mensagem existente mudar, incremente `PROTOCOL_VERSION`.

## Fluxo de uma partida

```
WAITING ──(pública: mínimo de jogadores / privada: anfitrião inicia)──► COUNTDOWN (preparação)
   ▲                                                                       │ sorteia mapa, equipes
   │                                                                       ▼
FINISHED ◄──(todos capturados / tempo acabou / caçadores saíram)── HUNTING ◄── HIDING
   │  resultados, XP, votação                                             (caçadores vendados)
   └──(intervalo)──► COUNTDOWN da próxima rodada
```

Tudo isso acontece em `server/src/game/Room.ts`, uma classe sem dependência de rede: o relógio e as saídas são injetados, o que permite testar regras com tempo simulado (`server/tests/room.test.ts`).

## Movimento: física no cliente, validação no servidor

**Decisão:** o cliente move o personagem com o controlador de personagem do Rapier (resposta imediata, sem atraso de rede) e envia a posição 20 vezes por segundo. O servidor **valida** cada posição contra o mesmo mapa (os mapas são dados em `shared/src/maps`, e o mundo físico é gerado pela mesma função `buildMapPhysics` nos dois lados):

1. distância percorrida ≤ velocidade máxima × tempo × folga;
2. variação vertical plausível;
3. dentro dos limites do mapa;
4. a forma do jogador arrastada de A até B não atravessa nada (`castShape`), e o destino não está dentro de um sólido.

Se alguma regra falhar, o servidor teletransporta o jogador de volta para a última posição válida. As mensagens antigas são descartadas pelo `teleportId`.

**Por quê:** simular todos os jogadores no servidor com predição e reconciliação no cliente é mais robusto, mas muito mais complexo, e costuma gerar "puxões" quando a latência varia. Para um Prop Hunt, em que o importante é não atravessar paredes nem correr rápido demais, a validação cobre as trapaças relevantes com bem menos código. Se for preciso, dá para migrar para a simulação no servidor sem mudar o protocolo de mapas.

## Ações decididas só no servidor

| Ação | Validações |
| --- | --- |
| Transformar | fase, equipe, vivo, recarga, objeto existe no mapa, distância ao objeto, a nova forma cabe no lugar |
| Capturar | fase HUNTING, equipe, recarga, alvo é escondido vivo, distância, **linha de visão** (raio do olho do caçador ao alvo) |
| Resultado e XP | calculados no `finish()` e gravados em transação (`PostgresPlayerRepository.recordMatch`) |
| Compra | nível mínimo, saldo e "ainda não possui", com as condições repetidas no `UPDATE` para evitar compra dupla |

## Visibilidade da informação

- Durante HIDING, o snapshot enviado aos caçadores não inclui os escondidos.
- Nomes de jogadores só aparecem para a própria equipe durante a partida.
- O placar não mostra em que objeto cada escondido está.
- Sessão, conta e socket nunca são enviados a outros jogadores.

## Cliente

- `client/src/game/core/Game.ts` cuida de renderização, física local, câmera, mira e ações; é o único ponto em que o cliente pede ações ao servidor.
- `RemotePlayers` interpola os outros jogadores 110 ms no passado, entre dois snapshots.
- Os **objetos e cenários** são montados por código (`propModels.ts`, `MapView.ts`) com materiais PBR cujas texturas (cor, rugosidade e relevo) são geradas em canvas (`materials/textures.ts`, `materials/library.ts`), em coordenadas de mundo para não esticar. A geometria estática de cada mapa é juntada por material (poucas chamadas de desenho); malhas invisíveis simples servem para a mira.
- Os **personagens** são modelos glTF com esqueleto (`public/models/characters`) animados por `AnimationMixer` (`AnimatedCharacter.ts`). Se o arquivo não carregar, há um boneco procedural de reserva (`CharacterModel.ts`).
- **Luz e imagem**: HDRI (`core/environment.ts`, arquivos CC0 de `@pmndrs/assets`) para reflexos e luz ambiente; `core/PostFX.ts` com MSAA, GTAO, bloom e saída ACES conforme a qualidade escolhida.
- A interface React lê o estado do motor por um store leve (`hudStore`), atualizado no máximo 10 vezes por segundo.
- O Rapier é inicializado uma única vez (`game/physics/rapier.ts`). Inicializar duas vezes ao mesmo tempo corrompe o WebAssembly.
- Em desenvolvimento, `window.__hh` e `window.__hhGame` ficam disponíveis para testes automatizados de navegador.

## Como adicionar um mapa

1. Crie `shared/src/maps/<mapa>.ts` com o `MapBuilder` (paredes com portas, estruturas, objetos, luzes, pontos de nascimento).
2. Registre-o em `shared/src/maps/index.ts` e marque `available: true` no catálogo.
3. Rode `npm test`: `shared/tests/maps.test.ts` verifica se nenhum objeto ou ponto de nascimento ficou dentro de paredes e, com uma malha de 0,5 m, se todo cômodo e todo ponto de nascimento é alcançável a pé.
4. Se usar um tipo novo de estrutura (`SolidKind`), desenhe-o em `MapView.buildSolid` e dê uma cor em `MapPreview.tsx`.

## Sistemas da versão 0.3

**Física por sala no servidor.** Cada sala tem seu mundo Rapier (`server/src/game/physics.ts`) com as portas (colisores ligados/desligados) e os objetos empurráveis (corpos dinâmicos). A validação de movimento ignora os empurráveis, para um objeto empurrado não "prender" ninguém; as poses deles vão no snapshot (`o`).

**Modos e habilidades como dados.** `shared/src/game/modes.ts` define cada modo (proporção de equipes, tempos, regras como "capturado vira caçador"); `abilities.ts` define recarga, usos e duração de cada habilidade; `events.ts` os eventos aleatórios. O `Room` aplica as regras; o cliente só mostra.

**Replay.** O `Room` grava 5 quadros por segundo (posição, direção e disfarce de cada jogador) e os eventos marcantes. O `RoomManager` guarda os últimos replays em memória; o cliente os reproduz em `game/replay/ReplayPlayer.ts`, com o mapa real e os mesmos personagens.

**Progressão.** `ProgressionService` concentra XP, moedas, missões (sorteadas de forma determinística pela data), temporada, conquistas, amigos, Elo do competitivo, punições por abandono e denúncias. Guarda documentos JSON por conta em PostgreSQL (`postgresStore.ts`) ou em memória, e serializa as atualizações de cada conta para evitar perda em pedidos simultâneos. Senhas usam `scrypt` com sal.

**Chat de voz.** Áudio ponto a ponto (WebRTC) entre navegadores; o servidor só repassa a negociação, nunca o áudio, e nada é gravado. O servidor decide quem pode falar com quem (`RoomManager.voiceGroup`): durante a partida, capturados só falam com espectadores. O cliente aplica distância (até 22 m), áudio 3D (HRTF) e silenciamento.

**Moderação.** `/api/admin/*` com `Authorization: Bearer <ADMIN_TOKEN>` lista salas e denúncias, expulsa e bane. A interface fica em `/#admin`. Mais de 40 movimentos recusados numa partida geram denúncia automática.
