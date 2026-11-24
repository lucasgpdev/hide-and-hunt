/**
 * Identificação local do jogador no navegador.
 *
 * - Sessão (sessionStorage): cada aba é uma sessão; recarregar a página
 *   mantém a mesma sessão e o servidor devolve o jogador à sala.
 * - Conta (localStorage): token aleatório que identifica a conta de
 *   convidado e guarda a progressão. O servidor só armazena o hash dele.
 */
const SESSION_KEY = 'hh.sessionId';
const NICKNAME_KEY = 'hh.nickname';
const ACCOUNT_KEY = 'hh.accountToken';

function safeGet(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(storage: Storage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    // Armazenamento indisponível (modo privado restrito): segue sem persistir.
  }
}

let memorySessionId: string | undefined;
let memoryAccountToken: string | undefined;

export function getSessionId(): string {
  const stored = safeGet(sessionStorage, SESSION_KEY);
  if (stored) return stored;
  memorySessionId ??= crypto.randomUUID();
  safeSet(sessionStorage, SESSION_KEY, memorySessionId);
  return memorySessionId;
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function getAccountToken(): string {
  const stored = safeGet(localStorage, ACCOUNT_KEY);
  if (stored && /^[A-Za-z0-9_-]{43}$/.test(stored)) return stored;
  memoryAccountToken ??= base64url(crypto.getRandomValues(new Uint8Array(32)));
  safeSet(localStorage, ACCOUNT_KEY, memoryAccountToken);
  return memoryAccountToken;
}

export function getSavedNickname(): string {
  return safeGet(localStorage, NICKNAME_KEY) ?? '';
}

export function saveNickname(nickname: string): void {
  safeSet(localStorage, NICKNAME_KEY, nickname);
}

/** Troca o token da conta (depois de fazer login com usuário e senha). */
export function setAccountToken(token: string): void {
  memoryAccountToken = token;
  safeSet(localStorage, ACCOUNT_KEY, token);
}
