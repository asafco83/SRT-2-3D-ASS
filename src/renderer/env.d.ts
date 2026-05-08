import type { Api } from '../preload/index.js';

declare global {
  interface Window {
    api: Api;
  }
}

declare module '*.png' {
  const src: string;
  export default src;
}
