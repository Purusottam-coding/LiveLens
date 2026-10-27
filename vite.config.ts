import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { cloudflare } from '@cloudflare/vite-plugin';
import fs from 'fs';

function devSpaAndLanFix(): Plugin {
  return {
    name: 'dev-spa-and-lan-fix',
    configureServer(server) {
      server.httpServer?.prependListener('upgrade', (req) => {
        // Rewrite host to localhost so local dev server allows LAN WebSocket upgrades without 401
        if (req.headers.host && !req.headers.host.startsWith('localhost')) {
          req.headers.host = 'localhost:5173';
        }
      });

      // Serve transformed index.html for SPA routes (/, /camera, /display) so dev worker doesn't crash on Windows
      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split('?')[0] || '/';
        const isApiOrWs = path.startsWith('/api') || path.startsWith('/ws');
        const isStaticAsset = path.includes('.') || path.startsWith('/@') || path.startsWith('/src') || path.startsWith('/node_modules');

        if (!isApiOrWs && !isStaticAsset) {
          try {
            let template = fs.readFileSync('index.html', 'utf-8');
            template = await server.transformIndexHtml(req.url || path, template);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/html');
            res.end(template);
            return;
          } catch (err) {
            next(err);
            return;
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), basicSsl(), devSpaAndLanFix(), cloudflare()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    origin: 'https://localhost:5173',
  },
});