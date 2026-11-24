/**
 * Modos de jogo (item 30). Cada modo ajusta as regras do Room no servidor.
 */
export const GAME_MODES = ['classic', 'infection', 'lone_hunter', 'duos', 'chaos', 'survival', 'competitive', 'custom'] as const;
export type GameMode = (typeof GAME_MODES)[number];

export interface ModeInfo {
  name: string;
  description: string;
  rules: string[];
  /** Pode ser escolhido no matchmaking público. */
  publicQueue: boolean;
}

export const MODE_INFO: Record<GameMode, ModeInfo> = {
  classic: {
    name: 'Clássico',
    description: 'Escondidos viram objetos; caçadores precisam capturar todos antes do tempo acabar.',
    rules: ['1 caçador a cada 4 jogadores', 'Escondidos vencem se alguém sobreviver', 'Capturado vira espectador'],
    publicQueue: true,
  },
  infection: {
    name: 'Infecção',
    description: 'Quem é capturado vira caçador. Sobreviva até o fim!',
    rules: ['Começa com poucos caçadores (1 a cada 8)', 'Cada captura muda o jogador de equipe', 'Caçadores vencem quando todos forem infectados'],
    publicQueue: true,
  },
  lone_hunter: {
    name: 'Caçador solitário',
    description: 'Um único caçador contra todos os escondidos. O caçador muda a cada rodada.',
    rules: ['Sempre 1 caçador', 'Quem caçou menos vezes é escolhido', 'Tempo de caça 25% maior'],
    publicQueue: true,
  },
  duos: {
    name: 'Duplas',
    description: 'Escondidos jogam em duplas: vejam o parceiro e sobrevivam juntos.',
    rules: ['Duplas formadas automaticamente', 'Nome do parceiro sempre visível', 'Bônus quando a dupla inteira sobrevive'],
    publicQueue: true,
  },
  chaos: {
    name: 'Caos',
    description: 'Eventos aleatórios o tempo todo: apagões, alarmes, portas batendo e tempestade.',
    rules: ['Eventos a cada 15–25 segundos', 'Habilidades recarregam mais rápido', 'Regras de vitória do clássico'],
    publicQueue: true,
  },
  survival: {
    name: 'Sobrevivência',
    description: 'Partida longa com dificuldade crescente para os escondidos.',
    rules: ['Caça dura o dobro', 'A cada minuto os caçadores ficam mais rápidos', 'Pulsos de radar automáticos a cada 90 s'],
    publicQueue: true,
  },
  competitive: {
    name: 'Competitivo',
    description: 'Partidas classificatórias com pontuação própria por temporada.',
    rules: ['Regras do clássico, sem eventos aleatórios', 'Vitórias e derrotas alteram sua pontuação', 'Mínimo de 4 jogadores'],
    publicQueue: true,
  },
  custom: {
    name: 'Personalizado',
    description: 'O anfitrião escolhe tempos, equipes, mapa, eventos e habilidades.',
    rules: ['Somente em salas privadas', 'Todas as regras vêm das configurações da sala'],
    publicQueue: false,
  },
};

export const RATING_START = 1000;
