import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt': nunca troca a versão sozinho — o app mostra o aviso
      // "Nova versão disponível" e só atualiza quando a pessoa clicar.
      registerType: 'prompt',
      injectRegister: null, // registro manual em src/pwa.ts (controla o aviso de atualização)
      includeAssets: ['pwa/favicon.png'],
      manifest: {
        id: '/',
        name: 'Studio Personal – Agendas',
        short_name: 'Agendas',
        description: 'Agenda semanal dos professores do Studio Personal',
        lang: 'pt-BR',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        icons: [
          { src: '/pwa/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Só o "casco" do app (HTML/JS/CSS/fontes/imagens) fica em cache.
        globPatterns: ['**/*.{js,css,html,woff,woff2,png,jpg,svg,ico}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            // Supabase (dados/login) nunca vem do cache: sempre rede, nunca agenda desatualizada.
            urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co'),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
});
