/** Cloudflare's bundler hands an imported WebAssembly file over compiled. */
declare module '*.wasm' {
  const compiled: WebAssembly.Module;
  export default compiled;
}
