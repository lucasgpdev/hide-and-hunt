import { describe, expect, it } from 'vitest';
import { helloPayloadSchema, nicknameSchema, pingPayloadSchema, PROTOCOL_VERSION } from '@hh/shared';

const SESSION = '3f1c2b9e-8a7d-4c5e-9f10-2a3b4c5d6e7f';

describe('nicknameSchema', () => {
  it('aceita nomes válidos, inclusive com acentos', () => {
    expect(nicknameSchema.parse('Caçador_01')).toBe('Caçador_01');
    expect(nicknameSchema.parse('João Silva')).toBe('João Silva');
  });

  it('remove espaços nas pontas e espaços repetidos', () => {
    expect(nicknameSchema.parse('  Ana   Paula  ')).toBe('Ana Paula');
  });

  it('rejeita nomes curtos, longos ou com caracteres proibidos', () => {
    expect(nicknameSchema.safeParse('ab').success).toBe(false);
    expect(nicknameSchema.safeParse('a'.repeat(17)).success).toBe(false);
    expect(nicknameSchema.safeParse('<script>').success).toBe(false);
    expect(nicknameSchema.safeParse(123).success).toBe(false);
  });
});

describe('helloPayloadSchema', () => {
  it('aceita um payload completo', () => {
    const result = helloPayloadSchema.safeParse({
      protocolVersion: PROTOCOL_VERSION,
      nickname: 'Player',
      sessionId: SESSION,
      accountToken: 'a'.repeat(43),
    });
    expect(result.success).toBe(true);
  });

  it('rejeita campos extras e sessão inválida', () => {
    expect(
      helloPayloadSchema.safeParse({ protocolVersion: 1, nickname: 'Player', sessionId: SESSION, admin: true }).success,
    ).toBe(false);
    expect(helloPayloadSchema.safeParse({ protocolVersion: 1, nickname: 'Player', sessionId: 'abc' }).success).toBe(
      false,
    );
  });
});

describe('pingPayloadSchema', () => {
  it('aceita tempo numérico e rejeita valores inválidos', () => {
    expect(pingPayloadSchema.safeParse({ clientTime: 1234.5 }).success).toBe(true);
    expect(pingPayloadSchema.safeParse({ clientTime: -1 }).success).toBe(false);
    expect(pingPayloadSchema.safeParse({ clientTime: Number.POSITIVE_INFINITY }).success).toBe(false);
    expect(pingPayloadSchema.safeParse({ clientTime: '10' }).success).toBe(false);
  });
});
