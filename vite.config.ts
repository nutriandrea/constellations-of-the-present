import { defineConfig, type Plugin } from 'vite'

// CSP applicata SOLO al build di produzione (nei dev HMR richiede inline/ws).
// `wasm-unsafe-eval` serve a MediaPipe per compilare il modello in WebAssembly.
// frame-ancestors non è supportato via <meta>: è coperto da X-Frame-Options in vercel.json.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "media-src 'self' blob:",
  "connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com https://*.supabase.co wss://*.supabase.co",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ')

function injectCsp(): Plugin {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return {
        html,
        tags: [
          {
            tag: 'meta',
            attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
            injectTo: 'head-prepend',
          },
        ],
      }
    },
  }
}

export default defineConfig({
  plugins: [injectCsp()],
})
