import { z } from 'zod';
import { MAX_PLAYERS_PER_ROOM, NICKNAME_MAX_LENGTH, NICKNAME_MIN_LENGTH } from '../constants/game.js';
import { isPlayableMap } from '../maps/index.js';
import { ABILITY_IDS } from '../game/abilities.js';
import { GAME_MODES } from '../game/modes.js';
import { EMOTES } from '../progression/shop.js';
import { RANKING_CATEGORIES, RANKING_SCOPES } from '../types/room.js';

/**
 * Esquemas Zod de todas as mensagens enviadas pelo cliente.
 * O servidor valida TODA mensagem recebida com estes esquemas antes de usá-la.
 */

/** Letras (com acentos), números, espaço, _ e -. Sem espaços nas pontas. */
const NICKNAME_PATTERN = /^[\p{L}\p{N}_\- ]+$/u;

export const nicknameSchema = z
  .string()
  .trim()
  .min(NICKNAME_MIN_LENGTH, `O nome precisa ter pelo menos ${NICKNAME_MIN_LENGTH} caracteres.`)
  .max(NICKNAME_MAX_LENGTH, `O nome pode ter no máximo ${NICKNAME_MAX_LENGTH} caracteres.`)
  .regex(NICKNAME_PATTERN, 'Use apenas letras, números, espaço, _ ou -.')
  .transform((value) => value.replace(/\s+/g, ' '));

export const sessionIdSchema = z.uuid();

/** Token da conta de convidado: 43 caracteres base64url (32 bytes). */
export const accountTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Token de conta inválido.');

export const helloPayloadSchema = z.strictObject({
  protocolVersion: z.number().int().positive(),
  nickname: nicknameSchema,
  sessionId: sessionIdSchema,
  accountToken: accountTokenSchema,
});

export const pingPayloadSchema = z.strictObject({
  clientTime: z.number().finite().nonnegative(),
});

export const emptyPayloadSchema = z.union([z.undefined(), z.null(), z.strictObject({})]);

/** Letras e números sem caracteres ambíguos (sem 0, O, 1, I). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{6}$/, 'O código tem 6 letras ou números.');

export const roomSettingsSchema = z.strictObject({
  maxPlayers: z.number().int().min(2).max(MAX_PLAYERS_PER_ROOM),
  hunters: z.number().int().min(1).max(16).nullable(),
  prepSeconds: z.number().int().min(5).max(60),
  hidingSeconds: z.number().int().min(10).max(120),
  huntingSeconds: z.number().int().min(60).max(900),
  intermissionSeconds: z.number().int().min(5).max(60),
  mapId: z.string().refine(isPlayableMap, 'Mapa indisponível.'),
  mapVoting: z.boolean(),
  mode: z.enum(GAME_MODES),
  randomEvents: z.boolean(),
  abilities: z.boolean(),
});

export const roomSettingsPatchSchema = roomSettingsSchema.partial();

export const createRoomPayloadSchema = z.strictObject({ settings: roomSettingsPatchSchema });
export const quickJoinPayloadSchema = z.union([
  z.undefined(),
  z.null(),
  z.strictObject({ mode: z.enum(GAME_MODES).exclude(['custom']).optional() }),
]);
export const joinRoomPayloadSchema = z.strictObject({ code: roomCodeSchema });
export const updateSettingsPayloadSchema = z.strictObject({ settings: roomSettingsPatchSchema });
export const voteMapPayloadSchema = z.strictObject({ mapId: z.string().max(40) });

const coordinate = z.number().finite().min(-500).max(500);

export const movePayloadSchema = z.strictObject({
  tid: z.number().int().nonnegative(),
  p: z.tuple([coordinate, coordinate, coordinate]),
  yaw: z.number().finite().min(-100).max(100),
  f: z.number().int().min(0).max(255),
});

export const transformPayloadSchema = z.strictObject({ propId: z.string().min(1).max(64) });
export const capturePayloadSchema = z.strictObject({ targetId: z.uuid().nullable(), cloneId: z.string().max(40).optional() });
export const shovePayloadSchema = z.strictObject({ propId: z.string().max(64).optional(), playerId: z.uuid().optional() });

export const rankingPayloadSchema = z.strictObject({
  category: z.enum(RANKING_CATEGORIES),
  scope: z.enum(RANKING_SCOPES).optional(),
  mode: z.enum(GAME_MODES).optional(),
});
export const skinPayloadSchema = z.strictObject({ skinId: z.string().min(1).max(32) });
export const effectPayloadSchema = z.strictObject({ effectId: z.string().min(1).max(32) });

const vec3 = z.tuple([coordinate, coordinate, coordinate]);

export const abilityPayloadSchema = z.strictObject({
  ability: z.enum(ABILITY_IDS),
  /** Ponto mirado (distração sonora) ou objeto mirado (analisador). */
  target: vec3.optional(),
  propId: z.string().max(64).optional(),
  playerId: z.uuid().optional(),
});
export const interactPayloadSchema = z.strictObject({ id: z.string().min(1).max(32) });
export const emotePayloadSchema = z.strictObject({ emote: z.enum(EMOTES.map((e) => e.id) as [string, ...string[]]) });
export const pingMarkerPayloadSchema = z.strictObject({ position: vec3 });
export const reportPayloadSchema = z.strictObject({
  playerId: z.uuid(),
  reason: z.enum(['cheating', 'abuse', 'afk', 'other']),
  details: z.string().max(300).optional(),
});
export const claimSeasonPayloadSchema = z.strictObject({ level: z.number().int().min(1).max(100) });
export const friendCodeSchema = z.string().trim().regex(/^[\p{L}\p{N}_\- ]{3,16}#\d{4}$/u, 'Código de amigo no formato Nome#1234.');
export const friendRequestPayloadSchema = z.strictObject({ code: friendCodeSchema });
export const friendRespondPayloadSchema = z.strictObject({ requestId: z.uuid(), accept: z.boolean() });
export const friendTargetPayloadSchema = z.strictObject({ accountId: z.uuid() });
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_.]{3,20}$/, 'Usuário com 3 a 20 letras, números, _ ou ponto.');
export const passwordSchema = z.string().min(8, 'A senha precisa de pelo menos 8 caracteres.').max(128);
export const credentialsPayloadSchema = z.strictObject({ username: usernameSchema, password: passwordSchema });
export const replayPayloadSchema = z.strictObject({ matchId: z.uuid().optional() });
export const voiceSignalPayloadSchema = z.strictObject({
  to: z.uuid(),
  data: z.strictObject({
    type: z.enum(['offer', 'answer', 'candidate']),
    sdp: z.string().max(12000).optional(),
    candidate: z.string().max(1000).optional(),
    sdpMid: z.string().max(64).nullable().optional(),
    sdpMLineIndex: z.number().int().min(0).max(64).nullable().optional(),
  }),
});
export const voiceStatePayloadSchema = z.strictObject({ enabled: z.boolean() });

export type HelloPayload = z.input<typeof helloPayloadSchema>;
export type ParsedHelloPayload = z.output<typeof helloPayloadSchema>;
export type PingPayload = z.infer<typeof pingPayloadSchema>;
export type RoomSettingsPatch = z.infer<typeof roomSettingsPatchSchema>;
export type MovePayload = z.infer<typeof movePayloadSchema>;
