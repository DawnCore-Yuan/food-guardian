/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
}

declare const __DEV_HOOK__: boolean;

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
