import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
//
// NOTE on camera access: getUserMedia (used by html5-qrcode) is only available
// in a "secure context", i.e. HTTPS *or* http://localhost. We bind the dev
// server to localhost so QR scanning works out of the box during development.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: 'localhost',
    port: 5173,
  },
})
