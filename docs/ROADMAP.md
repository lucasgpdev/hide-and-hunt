# Roadmap — HIDE & HUNT

Estados: **Concluída** (código entregue e testado aqui) · **Concluída, falta validar** (código entregue; a validação depende de pessoas reais, placa de vídeo real ou publicação) · **Parcial**.

| Fase | Conteúdo | Estado | Observações |
| --- | --- | --- | --- |
| 1 | Configuração do projeto e arquitetura | **Concluída** | Monorepo, TypeScript estrito, Docker, testes |
| 2 | Ambiente 3D, personagem e câmera | **Concluída** | Personagens glTF com esqueleto e animações misturadas, câmera em terceira pessoa com colisão, física Rapier |
| 3 | Mapa SUPERMARKET | **Concluída** | |
| 4 | Transformação em objetos | **Concluída** | 27 tipos, validação no servidor, efeitos de transformação escolhíveis |
| 5 | Multiplayer e sincronização | **Concluída** | 15 snapshots/s, interpolação, reconexão em até 30 s |
| 6 | Salas públicas e privadas | **Concluída** | Fila por modo, códigos, anfitrião, convites |
| 7 | Regras, equipes e capturas | **Concluída** | |
| 8 | Mapa SENAI CLASSROOM | **Concluída** | Sem marcas oficiais |
| 9 | Interface completa e lobby 3D | **Concluída** | Lobby 3D separado (saguão com palco), emotes e votação no lobby |
| 10 | Banco de dados e progressão | **Concluída** | PostgreSQL, XP, níveis, moedas, histórico, cadastro com usuário e senha |
| 11 | Ranking, amigos, conquistas e personalização | **Concluída** | Ranking mundial/temporada por modo, amigos por código, convites, 14 conquistas, loja |
| 12 | Eventos, objetos interativos e espectador | **Concluída** | 6 eventos aleatórios, portas, interruptores, objetos com física, espectador |
| 13 | Proximity Chat | **Concluída, falta validar** | WebRTC com áudio 3D, silenciar, permissão explícita, indicador de fala, nada gravado. Sinalização testada; conversa entre dois microfones reais não testada |
| 14 | Demais mapas | **Concluída** | Escola, Escritório, Mansão, Shopping, Hospital, Restaurante, Armazém, Hotel e Cidade, com teste de alcance de todos os cômodos |
| 15 | Testes de carga e otimização | **Concluída, falta validar** | 32 conexões simuladas; geometria estática juntada por material; qualidade gráfica ajustável. FPS em placa de vídeo real não medido |
| 16 | Preparação para publicação | **Concluída, falta validar** | Build de produção num só serviço (testado), Dockerfile e `docker compose --profile app` (imagem não construída aqui: sem acesso ao Docker Hub) |
| 17 | Novos modos de jogo | **Concluída** | Infecção, Caçador solitário, Duplas, Caos, Sobrevivência, Competitivo, Personalizado |
| 18 | Habilidades especiais | **Concluída** | Clone falso, distração sonora, camuflagem, arrancada, radar, scanner, analisador |
| 19 | Física avançada e passagens secretas | **Concluída** | Objetos empurráveis sincronizados, passagens secretas em todos os mapas |
| 20 | Missões e passe de temporada | **Concluída** | Missões diárias/semanais, temporada de 20 níveis com recompensas |
| 21 | Replay cinematográfico | **Concluída** | Replay 3D com câmera cinematográfica, livre e seguir; linha do tempo com eventos |
| 22 | Melhorias ambientais | **Concluída** | HDRI, PBR, GTAO, bloom, sons 3D por superfície, chuva/trovão, luzes por cômodo |
| 23 | Competitivo e moderação | **Concluída** | Elo, denúncias, punição por abandono, reputação, painel `/#admin`, denúncia automática por movimentos suspeitos |
| 24 | Acessibilidade e configurações | **Parcial** | Remapear teclas, daltonismo, menos animação, tamanho da interface, alto contraste, avisos visuais. Falta: outros idiomas |
| 25 | Testes finais e publicação | **Parcial** | 139 testes automatizados, partida completa no navegador, telas verificadas. Faltam: teste com jogadores reais, medição em GPU e publicação num servidor |

## Próximos passos recomendados

1. **Jogar com 5 a 10 pessoas reais** e ajustar `shared/src/constants/balance.ts` (velocidades, recargas, tempos).
2. **Medir o FPS** em notebooks comuns na qualidade Média; se precisar, reduzir a resolução das sombras ou o número de luzes por mapa.
3. **Testar o chat de voz** com dois microfones e, para redes corporativas/escolares, configurar um servidor TURN.
4. **Publicar** com `docker compose --profile app` atrás de HTTPS (necessário para o microfone).
5. **Traduções** (inglês e espanhol).
