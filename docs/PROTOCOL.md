# Protocolo de rede — versão 3

Transporte: Socket.IO 4 (WebSocket, com fallback para long-polling).
Toda mensagem do cliente é validada no servidor com os esquemas Zod de `shared/src/validation/messages.ts` e passa por limite de frequência (`server/src/networking/policy.ts`).

Pedidos com resposta devolvem `{ ok: true, ...dados }` ou `{ ok: false, error: { code, message } }`.

## Cliente → Servidor

| Evento | Dados | Resposta | Observações |
| --- | --- | --- | --- |
| `session:hello` | `protocolVersion`, `nickname`, `sessionId` (UUID por aba), `accountToken` (43 caracteres base64url) | `player`, `server`, `profile` | Obrigatório em até 10 s. O servidor guarda só o SHA-256 do token |
| `net:ping` | `clientTime` | `clientTime`, `serverTime` | Latência e diferença de relógio |
| `room:quickJoin` | `{ mode? }` | `room` | Matchmaking público por modo (qualquer modo exceto `custom`) |
| `room:create` | `settings` (parcial: tempos, mapa, `mode`, `randomEvents`, `abilities`...) | `room` | Sala privada; quem cria é o anfitrião |
| `room:join` | `code` | `room` | Código de 6 caracteres, maiúsculas ou minúsculas |
| `room:leave` | `{}` | — | |
| `room:settings` | `settings` (parcial) | `room` | Só o anfitrião, entre partidas |
| `room:start` | `{}` | — | Só o anfitrião, com 2 ou mais jogadores |
| `room:vote` | `mapId` | — | Entre partidas, se a votação estiver ativa |
| `player:move` | `tid`, `p` [x,y,z], `yaw`, `f` (bits) | (sem resposta) | 20 por segundo. Inválido → `player:teleport` para a última posição válida |
| `player:transform` | `propId` | — | Escondidos, durante HIDING/HUNTING |
| `player:capture` | `targetId` (ou `null` = errou), `cloneId?` | `captured` | Caçadores, durante HUNTING. `cloneId` = acertou um clone falso |
| `player:ability` | `ability`, `target?`, `propId?`, `playerId?` | — | Recarga, usos e equipe validados no servidor |
| `player:interact` | `id` (porta ou interruptor) | — | Distância e fase validadas |
| `player:shove` | `propId?` ou `playerId?` | — | Empurra objeto leve (impulso na física da sala) |
| `player:emote` | `emote` | — | Bloqueado para escondidos durante a partida |
| `player:ping` | `position` | (sem resposta) | Marcação só para a própria equipe |
| `room:report` | `playerId`, `reason`, `details?` | — | Denúncia (uma por par denunciante → denunciado a cada 24 h) |
| `profile:get` | `{}` | `profile` | |
| `profile:view` | `accountId` | `profile` público | |
| `ranking:get` | `category`, `scope?` (`global`/`season`), `mode?` | `entries`, `persistent` | Categorias: `xp`, `winsHider`, `winsHunter`, `captures`, `survivalSeconds`, `matchesPlayed`, `rating` |
| `progress:get` | `{}` | `progress` | Missões, temporada |
| `season:claim` | `level` | `progress` | Recompensa do passe |
| `shop:buy` / `shop:equip` | `skinId` | `profile` | |
| `shop:equipEffect` | `effectId` | `profile` | Efeito de transformação |
| `social:get` | `{}` | `social` | Amigos, pedidos, jogadores recentes |
| `social:request` | `code` (`Nome#1234`) | — | |
| `social:respond` | `requestId`, `accept` | `social` | |
| `social:remove` | `accountId` | `social` | |
| `social:invite` | `accountId` | — | Convida um amigo online para a sala atual |
| `account:register` | `username`, `password` | `profile` | Protege a conta de convidado com senha (`scrypt`) |
| `account:login` | `username`, `password` | `accountToken` | O cliente troca o token e reconecta |
| `replay:get` | `matchId?` | `replay` | Último replay da sala, se omitido |
| `voice:state` | `enabled` | (sem resposta) | Liga/desliga a participação no chat de voz |
| `voice:signal` | `to`, `data` (`offer`/`answer`/`candidate`) | (sem resposta) | Repassado só se os dois estão com voz ligada, na mesma sala e no mesmo grupo |

## Servidor → Cliente

| Evento | Dados | Quando |
| --- | --- | --- |
| `room:state` | `RoomInfo` ou `null` | Sempre que algo da sala muda (no máximo 15×/s) |
| `room:snapshot` | `{ t, p: [id, x, y, z, yaw, flags][], o?: poses de objetos empurrados }` | 15 vezes por segundo. Durante HIDING, caçadores não recebem os escondidos; escondidos camuflados também são omitidos |
| `room:effect` | som 3D, emote, marcação, radar, scanner, analisador, clone quebrado, conquista, missão | Efeitos visuais e sonoros (para todos ou só para alguns jogadores) |
| `player:abilities` | estado das habilidades (recarga, usos, ativa até) | Ao mudar |
| `social:invited` | `fromNickname`, `code` | Convite de amigo |
| `social:changed` | — | Amigos ou pedidos mudaram: o cliente busca de novo |
| `voice:peers` | ids que este jogador pode ouvir | Ao mudar a sala, a fase ou quem está com voz ligada |
| `voice:signal` | `from`, `data` | Negociação WebRTC repassada |
| `room:feed` | captura, entrada, saída, aviso | Eventos da partida |
| `player:teleport` | `position`, `yaw`, `teleportId` | Nascimento, troca de fase, reconexão ou movimento inválido |
| `match:results` | `MatchResults` | Fim da partida |
| `server:stats` | `onlinePlayers`, `uptimeSeconds`, `rooms` | A cada 5 s |
| `server:error` | `code`, `message` | Antes de encerrar uma conexão |

### Bits de `flags` (snapshot e `player:move`)

`1` andando · `2` correndo · `4` no chão · `8` vivo (só no snapshot).

### `teleportId`

Cada teletransporte incrementa o contador do jogador. O servidor ignora movimentos com outro `teleportId`, porque eles foram enviados antes do teletransporte e chegaram atrasados.

## Códigos de erro

`INVALID_PAYLOAD`, `PROTOCOL_MISMATCH`, `RATE_LIMITED`, `NOT_IDENTIFIED`, `ALREADY_IDENTIFIED`, `SESSION_REPLACED`, `SERVER_FULL`, `ROOM_NOT_FOUND`, `ROOM_FULL`, `NOT_IN_ROOM`, `ALREADY_IN_ROOM`, `NOT_HOST`, `INVALID_ACTION`, `COOLDOWN`, `NOT_ENOUGH_COINS`, `BANNED`, `PENALIZED` (fila bloqueada por abandono), `INVALID_CREDENTIALS`, `INTERNAL_ERROR`.

## HTTP

`GET /api/health` → `{ status, name, version, protocolVersion, uptimeSeconds, onlinePlayers, rooms, database }`.

Administração (só com `ADMIN_TOKEN` configurado; cabeçalho `Authorization: Bearer <token>`):

| Rota | O que faz |
| --- | --- |
| `GET /api/admin/rooms` | Salas, jogadores e movimentos recusados |
| `GET /api/admin/reports` | Denúncias recentes |
| `POST /api/admin/kick` `{ playerId }` | Remove o jogador da sala |
| `POST /api/admin/ban` `{ accountId, banned }` | Bane ou libera uma conta |
