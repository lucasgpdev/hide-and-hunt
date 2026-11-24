/**
 * Endereço do servidor.
 * - Desenvolvimento: mesma origem (o Vite encaminha /api e /socket.io).
 * - Produção: VITE_SERVER_URL, quando o servidor estiver em outro domínio.
 */
const configured = import.meta.env.VITE_SERVER_URL?.trim().replace(/\/+$/, '') ?? '';

export const SERVER_URL: string = configured;

export function apiUrl(path: string): string {
  return `${SERVER_URL}${path}`;
}
