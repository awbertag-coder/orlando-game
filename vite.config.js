import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // permette di raggiungere il dev server da altri dispositivi sulla rete locale, utile piu' avanti
    port: 5173
  }
})
