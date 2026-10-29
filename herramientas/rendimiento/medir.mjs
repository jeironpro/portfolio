#!/usr/bin/env node
/* ============================================================
   Repite la medición de rendimiento y SEO con Lighthouse y la
   compara con la línea base de linea-base.json.

   Mide las tres páginas en móvil (dos pasadas y se queda con la
   mejor) y en escritorio (una pasada). Falla si alguna métrica
   se sale de los umbrales documentados en docs/rendimiento.md.

   Uso:  npm run medir        (desde herramientas/rendimiento)

   Variables:
     SITIO         URL base a medir (por defecto, la de la línea base)
     LINEA_BASE    ruta a otra línea base (para probar la detección)
     CHROME_PATH   ruta al ejecutable de Chrome
   ============================================================ */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ejecutar = promisify(execFile);
const AQUI = import.meta.dirname;
const CLI = path.join(AQUI, 'node_modules/lighthouse/cli/index.js');
const BASE = process.env.LINEA_BASE || path.join(AQUI, 'linea-base.json');
const PAGINAS = ['/', '/ca/', '/en/'];
const VISTAS = [
  { nombre: 'móvil', preset: null, pasadas: 2 },
  { nombre: 'escritorio', preset: 'desktop', pasadas: 1 },
];

if (!existsSync(CLI)) {
  console.error('Falta Lighthouse. Ejecuta «npm install» en herramientas/rendimiento.');
  process.exit(2);
}
if (!existsSync(BASE)) {
  console.error(`No se encuentra la línea base: ${BASE}`);
  process.exit(2);
}

const lineaBase = JSON.parse(await readFile(BASE, 'utf8'));
const sitio = (process.env.SITIO || lineaBase.sitio).replace(/\/?$/, '/');
const { umbrales } = lineaBase;

const tmp = await mkdtemp(path.join(os.tmpdir(), 'rendimiento-'));
let medidas = [];

function direccion(ruta) {
  return new URL(ruta.replace(/^\//, ''), sitio).href;
}

async function calentar() {
  for (const ruta of PAGINAS) {
    for (let i = 0; i < 2; i++) {
      await fetch(direccion(ruta)).catch(() => {});
    }
  }
}

async function medir(ruta, vista, nombreArchivo) {
  const url = direccion(ruta);
  const salida = path.join(tmp, `${nombreArchivo}.json`);
  const args = [
    CLI,
    url,
    '--quiet',
    '--output=json',
    `--output-path=${salida}`,
    '--only-categories=performance,seo',
    '--chrome-flags=--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage',
  ];
  if (vista.preset) args.push(`--preset=${vista.preset}`);

  try {
    await ejecutar(process.execPath, args, { timeout: 180000, maxBuffer: 20 * 1024 * 1024 });
  } catch (error) {
    const detalle = (error.stderr || error.message || '').trim().split('\n').slice(-4).join('\n');
    throw new Error(`Lighthouse falló en ${ruta} (${vista.nombre}):\n${detalle}`);
  }

  const informe = JSON.parse(await readFile(salida, 'utf8'));
  const a = informe.audits;
  const c = informe.categories;
  const ms = (id) => Math.round(a[id].numericValue);

  return {
    pagina: ruta,
    vista: vista.nombre,
    nota: Math.round(c.performance.score * 100),
    seo: Math.round(c.seo.score * 100),
    fcp: ms('first-contentful-paint'),
    lcp: ms('largest-contentful-paint'),
    si: ms('speed-index'),
    tbt: ms('total-blocking-time'),
    cls: Number(a['cumulative-layout-shift'].numericValue.toFixed(3)),
    pesoKib: Math.round(a['total-byte-weight'].numericValue / 1024),
    seoFallos: c.seo.auditRefs
      .filter((ref) => a[ref.id] && a[ref.id].score !== null && a[ref.id].score < 1)
      .map((ref) => ref.id),
    perfsBajas: c.performance.auditRefs
      .filter((ref) => ref.weight > 0 && a[ref.id] && a[ref.id].score !== null && a[ref.id].score < 1)
      .map((ref) => ({ id: ref.id, score: a[ref.id].score })),
  };
}

function comparar(medida) {
  const clave = medida.vista === 'móvil' ? 'movil' : 'escritorio';
  const base = lineaBase[clave]?.[medida.pagina];
  const fallos = [];
  const avisos = [];

  if (!base) {
    avisos.push(`${medida.pagina} (${medida.vista}): no hay línea base para esta página`);
    return { fallos, avisos };
  }

  if (medida.seo < 100) {
    const detalle = medida.seoFallos.length ? `: ${medida.seoFallos.join(', ')}` : '';
    fallos.push(`${medida.pagina} (${medida.vista}) · SEO ${medida.seo}/100${detalle}`);
  }

  if (medida.nota < base.nota) {
    const soloSI =
      medida.perfsBajas.length > 0 && medida.perfsBajas.every((auditoria) => auditoria.id === 'speed-index');
    if (soloSI && medida.tbt <= umbrales.tbt && medida.cls <= umbrales.cls) {
      avisos.push(`${medida.pagina} (${medida.vista}) · nota ${medida.nota}: solo baja Speed Index (artefacto conocido)`);
    } else {
      const bajas =
        medida.perfsBajas.map((auditoria) => `${auditoria.id} ${auditoria.score.toFixed(2)}`).join(', ') ||
        'sin auditorías con peso';
      fallos.push(`${medida.pagina} (${medida.vista}) · nota ${medida.nota}/100 (${bajas})`);
    }
  }

  for (const metrica of ['fcp', 'lcp']) {
    const valor = medida[metrica];
    const referencia = base[metrica];
    const umbral = umbrales[metrica];
    const limite = Math.max(referencia * (1 + umbral.porcentaje), referencia + umbral.milisegundos);
    if (valor > limite) {
      fallos.push(
        `${medida.pagina} (${medida.vista}) · ${metrica.toUpperCase()} ${valor} ms ` +
          `(base ${referencia}, umbral ${Math.round(limite)})`,
      );
    }
  }

  if (medida.tbt > umbrales.tbt) {
    fallos.push(`${medida.pagina} (${medida.vista}) · TBT ${medida.tbt} ms (umbral ${umbrales.tbt})`);
  }
  if (medida.cls > umbrales.cls) {
    fallos.push(`${medida.pagina} (${medida.vista}) · CLS ${medida.cls} (umbral ${umbrales.cls})`);
  }
  if (medida.pesoKib > umbrales.pesoKib) {
    fallos.push(`${medida.pagina} (${medida.vista}) · peso ${medida.pesoKib} KiB (umbral ${umbrales.pesoKib})`);
  }

  return { fallos, avisos };
}

try {
  console.log(`\nRendimiento y SEO — Lighthouse ${lineaBase.lighthouse}`);
  console.log(`Sitio: ${sitio}`);
  console.log(`Línea base: ${lineaBase.commit} (${lineaBase.fecha})\n`);
  console.log('Calentando la caché del CDN…');

  await calentar();

  for (const ruta of PAGINAS) {
    for (const vista of VISTAS) {
      const pasadas = [];
      for (let i = 1; i <= vista.pasadas; i++) {
        process.stdout.write(`  ${ruta.padEnd(5)} ${vista.nombre.padEnd(11)} pasada ${i}/${vista.pasadas}… `);
        const medida = await medir(ruta, vista, `${ruta.replace(/\//g, '_') || 'raiz'}-${vista.nombre}-${i}`);
        pasadas.push(medida);
        console.log(`nota ${medida.nota} · FCP ${medida.fcp} ms · LCP ${medida.lcp} ms`);
      }
      pasadas.sort((a, b) => b.nota - a.nota || a.lcp - b.lcp);
      medidas.push(pasadas[0]);
    }
  }

  console.log('\nResultados (mejor pasada por página y vista):\n');
  console.log(
    'Página'.padEnd(7) +
      'Vista'.padEnd(12) +
      'Nota'.padStart(5) +
      'FCP'.padStart(7) +
      'LCP'.padStart(7) +
      'SI'.padStart(6) +
      'TBT'.padStart(6) +
      'CLS'.padStart(8) +
      'Peso'.padStart(8),
  );
  for (const m of medidas) {
    console.log(
      m.pagina.padEnd(7) +
        m.vista.padEnd(12) +
        String(m.nota).padStart(5) +
        `${m.fcp}`.padStart(7) +
        `${m.lcp}`.padStart(7) +
        `${m.si}`.padStart(6) +
        `${m.tbt}`.padStart(6) +
        m.cls.toFixed(3).padStart(8) +
        `${m.pesoKib} KiB`.padStart(8),
    );
  }

  const fallos = [];
  const avisos = [];
  for (const medida of medidas) {
    const resultado = comparar(medida);
    fallos.push(...resultado.fallos);
    avisos.push(...resultado.avisos);
  }

  if (avisos.length > 0) {
    console.log('\nAvisos:');
    for (const aviso of avisos) console.log(`  ? ${aviso}`);
  }

  if (fallos.length > 0) {
    console.log(`\n✘ ${fallos.length} regresión(es) frente a la línea base:`);
    for (const fallo of fallos) console.log(`  ${fallo}`);
    process.exitCode = 1;
  } else {
    console.log('\n✔ Sin regresiones.');
  }
} catch (error) {
  console.error(`\n${error.message}`);
  process.exitCode = 2;
} finally {
  await rm(tmp, { recursive: true, force: true });
}
