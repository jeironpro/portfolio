#!/usr/bin/env node
/* ============================================================
   Comprueba la accesibilidad del sitio con axe-core.
   Sirve la raíz del repositorio, abre cada página en Chrome
   (móvil y escritorio) y falla si hay alguna violación A/AA.

   Uso:  npm test        (desde herramientas/accesibilidad)

   Requiere Chrome. Se busca en CHROME_PATH o en las rutas
   habituales de Linux y macOS.
   ============================================================ */

import { existsSync } from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { PAGINAS, chromeInstalado, servir } from './comun.mjs';

const AQUI = import.meta.dirname;
const AXE = path.join(AQUI, 'node_modules/axe-core/axe.min.js');

const VISTAS = [
  { nombre: 'móvil', width: 412, height: 823, deviceScaleFactor: 2.625, mobile: true },
  { nombre: 'escritorio', width: 1280, height: 800, deviceScaleFactor: 1, mobile: false },
];
const ETIQUETAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

const ejecutable = chromeInstalado();
if (!ejecutable) {
  console.error('No se encontró Chrome. Define CHROME_PATH con la ruta al ejecutable.');
  process.exit(2);
}
if (!existsSync(AXE)) {
  console.error('Falta axe-core. Ejecuta «npm install» en herramientas/accesibilidad.');
  process.exit(2);
}

const { servidor, puerto } = await servir();
const base = `http://127.0.0.1:${puerto}`;
const navegador = await puppeteer.launch({
  executablePath: ejecutable,
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1'],
});

const resultados = [];
let violaciones = 0;

try {
  for (const ruta of PAGINAS) {
    for (const vista of VISTAS) {
      const pagina = await navegador.newPage();
      await pagina.setViewport({
        width: vista.width,
        height: vista.height,
        deviceScaleFactor: vista.deviceScaleFactor,
        isMobile: vista.mobile,
        hasTouch: vista.mobile,
      });
      await pagina.goto(`${base}${ruta}`, { waitUntil: 'networkidle0' });
      await pagina.evaluate(() => document.fonts.ready);
      await pagina.addScriptTag({ path: AXE });

      const informe = await pagina.evaluate(async (etiquetas) => {
        const r = await window.axe.run(document, { runOnly: { type: 'tag', values: etiquetas } });
        return {
          violaciones: r.violations.map((v) => ({
            id: v.id,
            impacto: v.impact,
            ayuda: v.help,
            nodos: v.nodes.map((n) => n.target.join(' ')).slice(0, 6),
          })),
          evaluadas: r.passes.length + r.violations.length,
        };
      }, ETIQUETAS);

      await pagina.close();
      resultados.push({ ruta, vista: vista.nombre, ...informe });
      violaciones += informe.violaciones.length;
    }
  }
} finally {
  await navegador.close();
  servidor.close();
}

const ancho = 20;
console.log('\nAccesibilidad (axe-core) — WCAG 2.0/2.1/2.2 A y AA + buenas prácticas\n');
for (const r of resultados) {
  const etiqueta = `${r.ruta} (${r.vista})`.padEnd(ancho);
  const estado = r.violaciones.length === 0 ? 'sin violaciones' : `${r.violaciones.length} violación(es)`;
  console.log(`${etiqueta} ${String(r.evaluadas).padStart(2)} reglas · ${estado}`);
}

if (violaciones > 0) {
  console.log('\nDetalle:');
  for (const r of resultados) {
    for (const v of r.violaciones) {
      console.log(`\n  [${v.impacto}] ${v.ayuda} — ${r.ruta} (${r.vista})`);
      console.log(`    regla: ${v.id}`);
      for (const nodo of v.nodos) console.log(`    -> ${nodo}`);
    }
  }
  console.log(`\n✘ ${violaciones} violación(es) encontradas.`);
  process.exit(1);
}

console.log('\n✔ Ninguna violación.');
