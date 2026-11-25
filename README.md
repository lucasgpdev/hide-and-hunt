# HIDE & HUNT

Jogo multiplayer 3D de Prop Hunt para navegador. Os escondidos se transformam em objetos do cenário; os caçadores precisam encontrá-los e capturá-los antes que o tempo acabe. Até 32 jogadores por sala.

> **Versão 0.3.0.** Todas as 25 fases do PROMPT MASTER V2 têm código entregue. O que ainda depende de jogadores reais, placa de vídeo real ou publicação está listado em [Problemas conhecidos](#problemas-conhecidos) e em [docs/ROADMAP.md](docs/ROADMAP.md).

## O que tem no jogo

**Partidas**
- **Fila pública** com escolha de modo, ou **sala privada** com código de 6 letras e regras próprias.
- **8 modos**: Clássico, Infecção (capturado vira caçador), Caçador solitário, Duplas, Caos (recargas curtas, eventos frequentes), Sobrevivência, Competitivo (pontuação Elo) e Personalizado.
- **6 mapas realistas** feitos a partir de cenas 3D do GitHub (CC0/CC-BY): Sala de Aula Clássica, Sala de Aula Japonesa, Cozinha Rústica, Sala Branca, Sala Cinza e Sala de Café da Manhã. Os objetos da própria cena (carteiras, cadeiras, poltronas, almofadas, plantas) viram esconderijos. Os 11 mapas antigos, feitos por código, continuam no projeto fora da rotação.
- **Lobby 3D**: enquanto a sala espera, todos andam por um saguão com palco, fazem emotes e votam no próximo mapa.
- **Espectador** depois de capturado, **resultados** com destaques e **replay 3D** da partida (câmera cinematográfica, livre ou seguindo um jogador; velocidade 0,5× a 4×).

**Jogabilidade**
- Escondidos viram qualquer um dos 27 tipos de objeto (**F**), empurram objetos leves (**R**) e usam habilidades: clone falso, distração sonora, camuflagem e arrancada.
- Caçadores capturam com **clique/E** (errar custa tempo) e usam radar, scanner de movimento e analisador.
- **Eventos aleatórios**: apagão, luzes piscando, alarme, meia-luz, portas que se mexem e tempestade.
- **Objetos interativos**: portas (abrir/fechar com **E**), interruptores de luz, passagens secretas e objetos com física.
- **Marcação de local** para a equipe (**Z**), **emotes** (**B**) e **chat de voz por proximidade** (WebRTC ponto a ponto, áudio 3D, voz mais baixa com a distância, ninguém é gravado; capturados só falam com outros espectadores).

**Progressão e social**
- Conta de convidado automática, com opção de **criar usuário e senha** para jogar em outro navegador.
- XP, níveis, moedas, **14 conquistas**, **missões diárias e semanais**, **passe de temporada** (20 níveis), **ranking** mundial ou da temporada, por modo.
- **Amigos** por código (`Nome#1234`), pedidos, convites para a sala, "entrar junto" e perfil público.
- **Personagens realistas** (CC0, Quaternius) com proporções de jogo de esconde-esconde e **skins originais** de clima sombrio e divertido: Palhaço da Meia-Noite, Coelho Sinistro, Cabeça de Abóbora, Zelador da Peste, Vigia Noturno e outras.
- Mapa **Sala de Aula Clássica**: cenário realista CC0 (Classroom, de Christophe Seux) em que dá para virar as próprias carteiras da sala.
- **Sem limite de FPS** por padrão (vai até a taxa do monitor; dá para limitar em Configurações) e rede a 30 atualizações por segundo.
- **Loja** de visuais com retrato 3D de cada skin e efeitos de transformação (só aparência, sem vantagem).
- **Moderação**: denúncias no placar, punição por abandono, reputação e painel de administração em `/#admin`.

**Gráficos e som**
- Personagens com esqueleto (soldado, manequim e robô) e animações de captura de movimento — parado, andar e correr misturados pela velocidade, pose de salto e emotes (o conjunto completo de emotes está no visual de robô).
- Materiais PBR com texturas geradas (piso, azulejo, madeira, mármore, concreto, asfalto, grama), iluminação HDRI, sombras suaves, oclusão de ambiente (GTAO), brilho (bloom), antisserrilhado MSAA e tone mapping ACES.
- Sons 3D posicionais (passos por superfície, portas, alarme, chuva) sintetizados no navegador.

**Acessibilidade**: remapeamento de todas as teclas, modo para daltonismo, reduzir animações, tamanho da interface, alto contraste, avisos visuais para sons, sensibilidade, FOV e qualidade gráfica.

## Requisitos

- **Node.js 22.12 ou mais novo** (`node -v`).
- **npm 10+** (vem com o Node).
- **Docker Desktop** (opcional), para o PostgreSQL. Sem ele o jogo funciona igual, mas perfis e ranking somem quando o servidor reinicia.
- Navegador com **WebGL 2** (Chrome, Edge, Firefox ou Safari atuais). Para o chat de voz, o navegador precisa de permissão de microfone e o site precisa estar em `localhost` ou HTTPS.

## Como rodar

Abra o terminal na pasta `HIDE-AND-HUNT`. No VS Code do Mac, use `Control` + `` ` ``.

```bash
# 1. Instalar as dependências
npm install

# 2. Criar o arquivo de configuração do servidor
cp server/.env.example server/.env        # Mac/Linux
copy server\.env.example server\.env      # Windows

# 3. (Opcional) Iniciar o PostgreSQL. Precisa do Docker Desktop aberto
npm run db:up

# 4. Iniciar cliente e servidor
npm run dev
```

Abra **http://localhost:5173**, escolha um nome e clique em **JOGAR**.

Sem Docker, deixe `DATABASE_URL=` vazio em `server/.env`. O servidor avisa que está sem banco e usa a memória.

### Testar o multiplayer sozinho

Abra uma segunda **janela anônima** (ou outro navegador), entre com outro nome e use **ENTRAR COM CÓDIGO** com o código da sala criada na primeira janela.

Para partidas rápidas de teste, crie uma sala privada e diminua os tempos em **Regras** (mínimos: preparação 5 s, esconderijo 10 s, caça 60 s).

### Jogar com amigos na mesma rede

Em um terminal rode `npm run dev:server`; em outro, `npm run dev -w @hh/client -- --host`. Compartilhe o endereço "Network" que o Vite mostrar (ex.: `http://192.168.0.10:5173`). O chat de voz só funciona em `localhost` ou HTTPS; na rede local, o resto do jogo funciona normalmente.

### Versão de produção (um só serviço)

```bash
npm run build
CLIENT_DIST=client/dist NODE_ENV=production npm start     # abre em http://localhost:3001
```

Ou com Docker (servidor + cliente + PostgreSQL):

```bash
ADMIN_TOKEN=um-token-com-24-ou-mais-caracteres docker compose --profile app up -d --build
```

### Publicar na Render

O arquivo `render.yaml` descreve o serviço (servidor + cliente) e o PostgreSQL. Na Render: **New → Blueprint** e escolha o repositório. Ou crie um **Web Service** Node com:

- Build: `npm ci --include=dev && npm run build`
- Start: `npm start`
- Variáveis: `NODE_VERSION=22`, `NODE_ENV=production`, `CLIENT_DIST=../client/dist`, `CLIENT_ORIGIN=<endereço do serviço>`, `DATABASE_URL=<URL interna do Postgres>` e, se quiser o painel de moderação, `ADMIN_TOKEN`.

No plano gratuito o serviço "dorme" depois de 15 minutos sem acesso (a primeira visita demora ~1 minuto para acordar) e o Postgres gratuito expira depois de 30 dias.

## Controles (padrão — todos podem ser trocados em Configurações → Controles)

| Tecla | Ação |
| --- | --- |
| W A S D | Andar |
| Mouse | Câmera (clique na tela para travar o cursor) |
| Espaço | Pular |
| Shift | Correr |
| F | Virar o objeto mirado (escondidos) |
| Clique / E | Capturar (caçadores) · abrir portas e interruptores |
| R | Empurrar objeto leve |
| 1 2 3 4 | Habilidades |
| Z | Marcar local para a equipe |
| B | Emotes |
| Tab | Placar |
| ESC | Menu (jogadores, silenciar, denunciar, voz, configurações) |

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Cliente (5173) e servidor (3001) com recarregamento automático |
| `npm test` | Testes automatizados (regras, modos, habilidades, física, salas, rede, progressão, mapas) |
| `npm run test:load` | Teste de carga com 2, 8, 16 e 32 conexões simuladas |
| `npm run typecheck` | Verifica os tipos de todos os pacotes |
| `npm run build` | Versão de produção (`shared/dist`, `server/dist`, `client/dist`) |
| `npm start` | Inicia o servidor compilado |
| `npm run db:up` / `db:down` | Inicia / para o PostgreSQL no Docker |

## Testes e o que foi verificado

- **`npm test`**: 139 testes. Cobrem estados da partida, equipes, validação de movimento, transformação, captura com linha de visão, os 8 modos, habilidades, eventos, portas e passagens secretas, objetos empurráveis, replay em tempo real, missões, temporada, conquistas, amigos, login com senha, Elo, punições, integração com Socket.IO real (inclusive a sinalização do chat de voz) e os 12 mapas (nenhum objeto dentro de paredes, e todo cômodo e ponto de nascimento alcançável a pé).
- **Teste de carga** (servidor e 32 clientes simulados): 15 snapshots/s por cliente, ping abaixo de 2 ms, 0 movimentos recusados.
- **Navegador** (Chrome sem placa de vídeo): partida completa com dois jogadores — criar sala, entrar por código, transformar em carrinho, capturar, resultados, XP salvo no PostgreSQL, replay 3D, missões atualizadas. Também foram abertas as telas de perfil, cadastro com senha, troca de tecla, ranking, criação de sala com modo, convite e moderação, e os 11 mapas foram fotografados.
- **Produção**: `npm run build` e o servidor compilado entregando o cliente e a API foram testados. A imagem Docker **não** foi construída aqui (o ambiente de teste não acessa o Docker Hub).

## Problemas conhecidos

- **FPS em placa de vídeo real não foi medido.** Os testes rodaram com renderização por software numa máquina de 2 núcleos, onde o jogo fica entre 2 e 4 FPS — não serve de referência. Se ficar lento no seu computador, use **Configurações → Gráficos → Baixa**.
- **32 navegadores reais ao mesmo tempo** não foram testados; só 32 conexões simuladas.
- **Chat de voz**: a troca de sinais pelo servidor tem teste automatizado; uma conversa real entre dois microfones não foi testada. Ele usa um servidor STUN público do Google; em redes muito restritas pode ser preciso um servidor TURN.
- **O movimento é calculado no cliente e validado pelo servidor** (velocidade, limites e paredes com Rapier). Movimentos inválidos fazem o jogador voltar à última posição válida.
- **Equilíbrio** (velocidades, recargas, tempos) ainda não foi ajustado com partidas de pessoas reais. Tudo fica em `shared/src/constants/balance.ts`.
- **Idioma**: só português do Brasil por enquanto.
- **O pacote do Rapier é grande** (~1,7 MB com gzip). Ele é carregado só ao entrar na sala.

## Estrutura

```
HIDE-AND-HUNT/
├── shared/src/        Tipos, protocolo, validação Zod, objetos, mapas (dados), física, modos, habilidades, eventos, progressão
├── server/src/
│   ├── game/          Room (regras, modos, habilidades, eventos, replay), física por sala
│   ├── rooms/         RoomManager (matchmaking por modo, códigos, reconexão, laço de 15 Hz)
│   ├── progression/   Contas, XP, missões, temporada, conquistas, amigos, ranking, Elo, denúncias
│   ├── database/      Conexão e migrações
│   ├── networking/    Eventos Socket.IO validados, limites de frequência, sinalização de voz
│   └── players/       Sessões
├── client/src/
│   ├── game/          Motor 3D: core/ (Game, pós-processamento, HDRI), maps/, materials/, objects/, characters/, replay/, effects/
│   ├── pages/         Menu, partida, moderação
│   ├── components/    HUD, habilidades, sala, resultados, replay, perfil, missões, amigos, ranking, loja, configurações
│   ├── multiplayer/   NetworkClient, sessão e chat de voz
│   ├── audio/         Sons 3D sintetizados (Web Audio)
│   └── settings/      Configurações e teclas
├── tests/             Integração (Socket.IO real) e carga
└── docs/              Arquitetura, protocolo, roadmap e créditos
```

## Documentação

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — decisões técnicas e fluxo de uma partida.
- [docs/PROTOCOL.md](docs/PROTOCOL.md) — todas as mensagens de rede.
- [docs/ROADMAP.md](docs/ROADMAP.md) — as 25 fases e o estado de cada uma.
- [docs/CREDITS.md](docs/CREDITS.md) — origem e licença dos modelos 3D e das imagens de ambiente.

## Imagens

Capturas feitas com renderização por software (sem placa de vídeo), qualidade Alta: [cidade](docs/screenshots/cidade.png), [armazém](docs/screenshots/armazem.png), [mansão](docs/screenshots/mansao.png), [hospital](docs/screenshots/hospital.png), [escritório](docs/screenshots/escritorio.png), [menu](docs/screenshots/menu.png).
