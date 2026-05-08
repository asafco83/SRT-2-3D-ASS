interface Window {
  api: import('../preload/index.js').Api;
}

declare module '*.png' {
  const src: string;
  export default src;
}
