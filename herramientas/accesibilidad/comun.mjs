/* ============================================================
   Utilidades compartidas por las comprobaciones del sitio.
   Sirve la raíz del repositorio como lo haría GitHub Pages:
   las rutas de directorio sin barra final responden 301 a la
   versión con barra, igual que el servidor real.
   ============================================================ */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const RAIZ = path.resolve(import.meta.dirname, '../..');

export const PAGINAS = ['/', '/ca/', '/en/'];

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.ico': 'image/vnd.microsoft.icon',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

export function chromeInstalado() {
  const candidatos = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/opt/google/chrome/chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  return candidatos.find((ruta) => existsSync(ruta));
}

export function servir() {
  const servidor = createServer(async (peticion, respuesta) => {
    let ruta;
    try {
      ruta = decodeURIComponent(peticion.url.split('?')[0]);
    } catch {
      respuesta.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' }).end('Petición inválida');
      return;
    }

    const relativa = ruta === '/' ? 'index.html' : ruta.replace(/^\/+/, '');
    const archivo = path.join(RAIZ, relativa);

    if (!archivo.startsWith(RAIZ)) {
      respuesta.writeHead(403).end('Prohibido');
      return;
    }

    try {
      const info = await stat(archivo);
      if (info.isDirectory()) {
        if (!ruta.endsWith('/')) {
          respuesta.writeHead(301, { location: `${ruta}/` }).end();
          return;
        }
        const indice = path.join(archivo, 'index.html');
        await stat(indice);
        const cuerpo = await readFile(indice);
        respuesta.writeHead(200, { 'content-type': TIPOS['.html'] });
        respuesta.end(cuerpo);
        return;
      }

      const cuerpo = await readFile(archivo);
      respuesta.writeHead(200, { 'content-type': TIPOS[path.extname(archivo)] || 'application/octet-stream' });
      respuesta.end(cuerpo);
    } catch {
      respuesta.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('No encontrado');
    }
  });

  return new Promise((ok) => {
    servidor.listen(0, '127.0.0.1', () => ok({ servidor, puerto: servidor.address().port }));
  });
}
