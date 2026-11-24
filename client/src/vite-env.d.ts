/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL do servidor em produção quando ele está em outro domínio. */
  readonly VITE_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
