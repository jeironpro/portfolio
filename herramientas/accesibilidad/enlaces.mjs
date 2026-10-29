#!/usr/bin/env node
/* ============================================================
   Comprueba enlaces y recursos del sitio.

   Sirve la raíz del repositorio, carga cada página en Chrome
   (móvil y escritorio) para registrar todo lo que pide el
   navegador y después verifica cada enlace del documento:
   rutas internas, anclas (#id), archivos descargables y URL
   externas.

   Falla (código 1) si:
     - un recurso del sitio devuelve 4xx o 5xx
     - un enlace interno devuelve 4xx o 5xx
     - un ancla apunta a un id que no existe
     - un enlace externo devuelve 404 o 410

   Los bloqueos (401, 403, 429), los 5xx externos y los tiempos
   agotados solo se avisan: no dependen del sitio.

   Uso:  npm run enlaces   (desde herramientas/accesibilidad)
   ============================================================ */

import puppeteer from 'puppeteer-core';
import { PAGINAS, chromeInstalado, servir } from './comun.mjs';

const VISTAS = [
  { nombre: 'móvil', width: 412, height: 823, deviceScaleFactor: 2.625, mobile: true },
  { nombre: 'escritorio', width: 1280, height: 800, deviceScaleFactor: 1, mobile: false },
];

const TIMEOUT_EXTERNO = 12000;
const CONCURRENCIA = 6;
const PROTOCOLOS_IGNORADOS = /^(mailto|tel|sms|javascript|data|blob|ftp):/i;

function porLotes(lista, limite, tarea) {
  const salida = new Array(lista.length);
  let siguiente = 0;
  const trabajadores = Array.from({ length: Math.min(limite, lista.length) }, async () => {
    while (siguiente < lista.length) {
      const indice = siguiente++;
      salida[indice] = await tarea(lista[indice]);
    }
  });
  return Promise.all(trabajadores).then(() => salida);
}

function tieneDestino(html, ancla) {
  const escapado = ancla.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:\\bid|\\bname)\\s*=\\s*["']${escapado}["']`).test(html);
}

const ejecutable = chromeInstalado();
if (!ejecutable) {
  console.error('No se encontró Chrome. Define CHROME_PATH con la ruta al ejecutable.');
  process.exit(2);
}

const { servidor, puerto } = await servir();
const base = `http://127.0.0.1:${puerto}`;
const local = new URL(base);

const navegador = await puppeteer.launch({
  executablePath: ejecutable,
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1'],
});

async function cargar(ruta) {
  const enlaces = new Map();
  const recursos = new Map();
  let origen = null;

  for (const [indice, vista] of VISTAS.entries()) {
    const pagina = await navegador.newPage();

    pagina.on('response', (respuesta) => {
      const url = respuesta.url();
      if (!url.startsWith(base)) return;
      if (respuesta.request().resourceType() === 'document') return;
      recursos.set(url, { url, estado: respuesta.status() });
    });

    pagina.on('requestfailed', (peticion) => {
      const url = peticion.url();
      if (!url.startsWith(base)) return;
      recursos.set(url, { url, estado: 0, motivo: peticion.failure()?.errorText || 'petición fallida' });
    });

    await pagina.setViewport({
      width: vista.width,
      height: vista.height,
      deviceScaleFactor: vista.deviceScaleFactor,
      isMobile: vista.mobile,
      hasTouch: vista.mobile,
    });
    await pagina.goto(`${base}${ruta}`, { waitUntil: 'networkidle0' });

    if (indice === 0) {
      origen = await pagina.$eval('link[rel="canonical"]', (el) => el.href).catch(() => null);
      const anclas = await pagina.$$eval('a[href]', (lista) =>
        lista.map((a) => ({
          href: a.getAttribute('href'),
          texto: (a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 48),
        })),
      );
      for (const ancla of anclas) {
        const clave = `${ancla.href}\u0000${ancla.texto}`;
        if (ancla.href && !enlaces.has(clave)) enlaces.set(clave, ancla);
      }
    }

    await pagina.close();
  }

  return { ruta, origen, enlaces: [...enlaces.values()], recursos };
}

const paginas = [];
try {
  for (const ruta of PAGINAS) paginas.push(await cargar(ruta));
} finally {
  await navegador.close();
}

const sitio = paginas.find((p) => p.origen)?.origen;
const origenPublicado = sitio ? new URL(sitio) : null;
const rutaPublicada = origenPublicado?.pathname || null;

function clasificar(bruto, rutaPagina) {
  const abs = new URL(bruto, base + rutaPagina);

  if (abs.origin === local.origin) {
    return { interno: true, ruta: abs.pathname + abs.search, hash: abs.hash };
  }
  if (origenPublicado && abs.origin === origenPublicado.origin && abs.pathname.startsWith(rutaPublicada)) {
    return {
      interno: true,
      ruta: `/${abs.pathname.slice(rutaPublicada.length)}` + abs.search,
      hash: abs.hash,
    };
  }
  return { interno: false, url: abs.origin + abs.pathname + abs.search };
}

const cache = new Map();

function comprobarInterna(ruta) {
  if (!cache.has(ruta)) {
    cache.set(
      ruta,
      (async () => {
        try {
          const respuesta = await fetch(base + ruta, { redirect: 'follow' });
          const tipo = respuesta.headers.get('content-type') || '';
          let cuerpo = null;
          if (respuesta.ok && tipo.includes('text/html')) cuerpo = await respuesta.text();
          else if (respuesta.body) await respuesta.body.cancel().catch(() => {});
          return { estado: respuesta.status, ok: respuesta.ok, html: tipo.includes('text/html'), cuerpo };
        } catch (error) {
          return { estado: 0, ok: false, html: false, cuerpo: null, motivo: error.message };
        }
      })(),
    );
  }
  return cache.get(ruta);
}

async function comprobarExterna(url) {
  for (let intento = 1; intento <= 2; intento++) {
    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), TIMEOUT_EXTERNO);
    try {
      const respuesta = await fetch(url, {
        redirect: 'follow',
        signal: control.signal,
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; portafolio-enlaces/1.0)' },
      });
      clearTimeout(temporizador);
      const estado = respuesta.status;
      if (respuesta.body) await respuesta.body.cancel().catch(() => {});
      if (estado >= 500 && intento === 1) continue;
      return { url, estado };
    } catch (error) {
      clearTimeout(temporizador);
      if (intento === 1) continue;
      return {
        url,
        estado: 0,
        motivo: error.name === 'AbortError' ? 'tiempo agotado' : error.cause?.code || error.message,
      };
    }
  }
}

const externos = new Map();

for (const pagina of paginas) {
  pagina.destinos = new Set();
  pagina.fallos = [];

  for (const enlace of pagina.enlaces) {
    const bruto = (enlace.href || '').trim();
    if (!bruto || PROTOCOLOS_IGNORADOS.test(bruto)) continue;

    let destino;
    try {
      destino = clasificar(bruto, pagina.ruta);
    } catch {
      pagina.fallos.push({ enlace: bruto, detalle: 'URL no válida' });
      continue;
    }

    if (destino.interno) {
      pagina.destinos.add(`i:${destino.ruta}`);
      const informe = await comprobarInterna(destino.ruta);

      if (!informe.ok) {
        const detalle = informe.estado ? `HTTP ${informe.estado}` : informe.motivo || 'sin respuesta';
        pagina.fallos.push({ enlace: bruto, detalle });
        continue;
      }

      const ancla = destino.hash.slice(1);
      if (ancla && informe.html && informe.cuerpo) {
        let nombre;
        try {
          nombre = decodeURIComponent(ancla);
        } catch {
          nombre = ancla;
        }
        if (!tieneDestino(informe.cuerpo, nombre)) {
          pagina.fallos.push({ enlace: bruto, detalle: `el ancla #${nombre} no existe` });
        }
      }
    } else {
      pagina.destinos.add(`e:${destino.url}`);
      if (!externos.has(destino.url)) externos.set(destino.url, { url: destino.url, paginas: new Set() });
      externos.get(destino.url).paginas.add(pagina.ruta);
    }
  }

  for (const recurso of pagina.recursos.values()) {
    if (recurso.estado === 0) {
      pagina.fallos.push({ recurso: recurso.url, detalle: recurso.motivo || 'petición fallida' });
    } else if (recurso.estado >= 400) {
      pagina.fallos.push({ recurso: recurso.url, detalle: `HTTP ${recurso.estado}` });
    }
  }
}

const listaExternos = [...externos.values()];
const resultadosExternos = await porLotes(listaExternos, CONCURRENCIA, (externo) => comprobarExterna(externo.url));

servidor.close();

const fallosExternos = [];
const externosPorPagina = new Map();
const avisos = [];

for (const [indice, resultado] of resultadosExternos.entries()) {
  const externo = listaExternos[indice];
  const paginasAfectadas = [...externo.paginas].join(', ');

  if (resultado.estado === 404 || resultado.estado === 410) {
    fallosExternos.push({ enlace: resultado.url, detalle: `HTTP ${resultado.estado}`, paginas: paginasAfectadas });
    for (const ruta of externo.paginas) externosPorPagina.set(ruta, (externosPorPagina.get(ruta) || 0) + 1);
  } else if (resultado.estado === 0) {
    avisos.push(`${resultado.url} — ${resultado.motivo || 'sin respuesta'} (en ${paginasAfectadas})`);
  } else if (resultado.estado >= 400) {
    avisos.push(`${resultado.url} — HTTP ${resultado.estado} (en ${paginasAfectadas})`);
  }
}

const fallos = paginas.flatMap((p) => p.fallos.map((f) => ({ pagina: p.ruta, ...f })));
const totalFallos = fallos.length + fallosExternos.length;

const ancho = 20;
console.log('\nEnlaces y recursos\n');
for (const pagina of paginas) {
  const internos = [...pagina.destinos].filter((d) => d.startsWith('i:')).length;
  const externosPagina = [...pagina.destinos].filter((d) => d.startsWith('e:')).length;
  const fallosPagina = pagina.fallos.length + (externosPorPagina.get(pagina.ruta) || 0);
  const estado = fallosPagina === 0 ? 'sin fallos' : `${fallosPagina} fallo(s)`;
  const etiqueta = `${pagina.ruta}`.padEnd(ancho);
  console.log(
    `${etiqueta} ${String(pagina.destinos.size).padStart(2)} enlaces (${internos} internos, ${externosPagina} externos)` +
      ` · ${String(pagina.recursos.size).padStart(2)} recursos · ${estado}`,
  );
}

console.log(
  `\nExternos únicos: ${listaExternos.length} · con 404/410: ${fallosExternos.length} · sin verificar: ${avisos.length}`,
);

if (fallos.length > 0 || fallosExternos.length > 0) {
  console.log('\nFallos:');
  for (const fallo of fallos) {
    const que = fallo.recurso ? `recurso ${new URL(fallo.recurso).pathname}` : fallo.enlace;
    console.log(`\n  ${fallo.pagina} → ${que}`);
    console.log(`    ${fallo.detalle}`);
  }
  for (const fallo of fallosExternos) {
    console.log(`\n  ${fallo.paginas} → ${fallo.enlace}`);
    console.log(`    ${fallo.detalle}`);
  }
}

if (avisos.length > 0) {
  console.log('\nSin verificar (no dependen del sitio):');
  for (const aviso of avisos) console.log(`  ? ${aviso}`);
}

if (totalFallos > 0) {
  console.log(`\n✘ ${totalFallos} fallo(s) encontrados.`);
  process.exit(1);
}

console.log('\n✔ Ningún enlace roto ni recurso ausente.');
