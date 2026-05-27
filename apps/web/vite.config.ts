import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type ProxyOptions } from "vite"

const API_TARGET = "http://localhost:3001"

/**
 * The browser sends the page's Origin header through to the API. When the
 * page is served on a LAN IP (e.g. http://192.168.1.42:5173 from a phone)
 * the Origin would be `http://192.168.1.42:5173`, which our API doesn't
 * trust by default. We rewrite it to localhost:5173 here so CORS +
 * Better Auth trustedOrigins keep working without env tweaks.
 */
const apiProxy: ProxyOptions = {
  target: API_TARGET,
  changeOrigin: true,
  configure: (proxy) => {
    proxy.on("proxyReq", (proxyReq) => {
      proxyReq.setHeader("origin", "http://localhost:5173")
    })
  },
}

const wsProxy: ProxyOptions = {
  target: API_TARGET.replace(/^http/, "ws"),
  ws: true,
  changeOrigin: true,
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Read env files from the monorepo root, not apps/web/. This keeps a single
  // source of truth in /.env and /.env.example.
  envDir: path.resolve(__dirname, "../.."),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    // 0.0.0.0 so phones / tablets on the same LAN can reach the dev server
    // via the laptop's LAN IP. Geolocation requires HTTPS or localhost — for
    // a LAN-only http URL, the browser may still gate the API; tunnel via
    // cloudflared / ngrok if you need geolocation from a real phone.
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    proxy: {
      // Backend lives entirely under /api and /ws. Everything else falls
      // through to Vite so SPA route hard-refreshes (e.g. /devices/abc,
      // /map, /invitations/xyz) work as expected.
      "/api": apiProxy,
      "/ws": wsProxy,
    },
  },
})
