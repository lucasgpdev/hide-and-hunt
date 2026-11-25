/**
 * Valores de equilíbrio do jogo (item 38 do planejamento).
 * Tudo que afeta a jogabilidade fica aqui, em um único lugar, e é usado
 * tanto pelo cliente (para prever) quanto pelo servidor (para validar).
 */
export const BALANCE = {
  movement: {
    gravity: -22,
    jumpVelocity: 7,
    hiderWalkSpeed: 4.2,
    hiderRunSpeed: 6.6,
    hunterWalkSpeed: 4.4,
    hunterRunSpeed: 6.9,
    /** Folga na validação de velocidade (latência, variação de quadros). */
    speedTolerance: 1.6,
    /** Distância extra permitida por mensagem (m). */
    distanceSlack: 0.6,
    maxVerticalSpeed: 16,
  },
  human: {
    radius: 0.35,
    height: 1.8,
  },
  transform: {
    /** Distância máxima entre o jogador e o objeto escolhido (m). */
    range: 4,
    cooldownSeconds: 2,
  },
  capture: {
    /** Distância máxima para capturar (m). */
    range: 2.8,
    cooldownSeconds: 0.6,
    /** Espera extra após tentar capturar algo que não é jogador. */
    missPenaltySeconds: 1.5,
  },
  network: {
    /** Envios de posição por segundo do cliente. */
    clientSendRate: 30,
    /** Atraso de interpolação dos outros jogadores (ms): ~2,5 atualizações do servidor. */
    interpolationDelayMs: 85,
  },
  rooms: {
    codeLength: 6,
    /** Tempo para voltar à sala após cair, mantendo o lugar (s). */
    reconnectGraceSeconds: 30,
    /** Jogadores mínimos para uma sala pública começar sozinha. */
    publicMinPlayers: 2,
    mapVoteOptions: 2,
  },
  progression: {
    xpParticipation: 50,
    xpWin: 100,
    xpPerCapture: 25,
    /** XP por segundo sobrevivido como escondido. */
    xpPerSurvivalSecond: 0.2,
    /** Moedas por partida = XP ganho / este valor. */
    coinsPerXp: 5,
  },
} as const;

/** Nível a partir do XP total (curva suave: 100, 400, 900... XP). */
export function levelFromXp(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;
}

/** XP necessário para atingir um nível. */
export function xpForLevel(level: number): number {
  return Math.max(0, (level - 1) ** 2 * 100);
}
