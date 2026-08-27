import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // El .env vive en la raiz del repo (compartido por los tres proyectos,
  // ver DECISIONS.md D2): Vite por defecto solo busca en su propia carpeta.
  envDir: '../',
  server: {
    port: 5173,
  },
});
