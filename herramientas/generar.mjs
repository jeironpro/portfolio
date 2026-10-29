#!/usr/bin/env node
/* ============================================================
   Genera ca/index.html y en/index.html a partir de index.html.
   El español es la fuente; el catalán y el inglés salen de
   herramientas/textos.json. Sin dependencias.
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(import.meta.dirname, '..');
const SITIO = 'https://jeironpro.github.io/portfolio/';
const ANIO = String(new Date().getFullYear());
const IDIOMAS = ['ca', 'en'];

const base = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
const datos = JSON.parse(fs.readFileSync(path.join(RAIZ, 'herramientas/textos.json'), 'utf8'));

const esc = (texto) => String(texto)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const escReg = (texto) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const conAnio = (texto) => texto.replace(/\{anio\}/g, ANIO);

// Sustituye el contenido de cada nodo que lleva data-i18n. Los nodos
// traducibles no envuelven otros elementos (lo comprueba el propio
// generador), así que basta con reemplazar el interior de la etiqueta.
function sustituirTextos(html, textos) {
  const faltan = [];
  for (const [clave, valor] of Object.entries(textos)) {
    if (clave === 'idioma' || clave === 'altRetrato') continue; // van en atributos
    const re = new RegExp(
      `(<([a-z0-9]+)[^>]*\\sdata-i18n="${escReg(clave)}"[^>]*>)([\\s\\S]*?)(</\\2>)`,
      'gi',
    );
    let usos = 0;
    html = html.replace(re, (coincide, apertura, etiqueta, interior, cierre) => {
      usos += 1;
      return apertura + esc(conAnio(valor)) + cierre;
    });
    if (!usos) faltan.push(clave);
  }
  return { html, faltan };
}

function nav(lang, etiqueta) {
  const destinos = [
    { codigo: 'ES', lang: 'es', href: '../' },
    { codigo: 'CA', lang: 'ca', href: '../ca/' },
    { codigo: 'EN', lang: 'en', href: '../en/' },
  ];
  const enlaces = destinos.map((destino) => {
    const actual = destino.lang === lang ? ' aria-current="page"' : '';
    return `    <a href="${destino.href}" lang="${destino.lang}" hreflang="${destino.lang}"${actual}>${destino.codigo}</a>`;
  }).join('\n');
  return `  <nav class="idioma" aria-label="${esc(etiqueta)}">\n${enlaces}\n  </nav>`;
}

function jsonLd(lang, url, meta, textos) {
  const person = `${SITIO}#person`;
  const grafo = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Person',
        '@id': person,
        name: 'Jeiron Espinal',
        url: SITIO,
        image: `${SITIO}assets/img/perfil.jpg`,
        jobTitle: textos.rol,
        knowsLanguage: ['es', 'ca', 'en'],
        knowsAbout: ['Python', 'Django', 'Flask', 'FastAPI', 'PostgreSQL', 'Docker', 'APIs REST'],
        sameAs: [
          'https://github.com/jeironpro',
          'https://linkedin.com/in/jeironpro',
        ],
      },
      {
        '@type': 'WebSite',
        '@id': `${url}#website`,
        url,
        name: 'Jeiron Espinal',
        inLanguage: lang,
        publisher: { '@id': person },
      },
      {
        '@type': 'ProfilePage',
        '@id': `${url}#webpage`,
        url,
        name: meta.titulo,
        inLanguage: lang,
        isPartOf: { '@id': `${url}#website` },
        about: { '@id': person },
        primaryImageOfPage: {
          '@type': 'ImageObject',
          url: `${SITIO}assets/img/perfil.jpg`,
        },
      },
    ],
  };
  const cuerpo = JSON.stringify(grafo, null, 2)
    .split('\n')
    .map((linea) => `  ${linea}`)
    .join('\n');
  return `<script type="application/ld+json">\n${cuerpo}\n  </script>`;
}

function metaNombre(html, nombre, valor) {
  const re = new RegExp(`(<meta name="${escReg(nombre)}" content=")[^"]*(">)`);
  return html.replace(re, `$1${esc(valor)}$2`);
}

function metaPropiedad(html, propiedad, valor) {
  const re = new RegExp(`(<meta property="${escReg(propiedad)}" content=")[^"]*(">)`);
  return html.replace(re, `$1${esc(valor)}$2`);
}

function generar(lang) {
  const { meta, textos } = datos[lang];
  const url = `${SITIO}${lang}/`;

  // Todas las claves usadas en el HTML deben existir en este idioma.
  const usadas = new Set([
    ...[...base.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]),
    ...[...base.matchAll(/data-i18n-(?:alt|aria)="([^"]+)"/g)].map((m) => m[1]),
  ]);
  const sinTexto = [...usadas].filter((clave) => typeof textos[clave] !== 'string');
  if (sinTexto.length) {
    throw new Error(`${lang}: faltan textos para ${sinTexto.join(', ')}`);
  }

  let html = base;

  html = html.replace('<html lang="es">', `<html lang="${lang}">`);
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(meta.titulo)}</title>`);
  html = metaNombre(html, 'description', meta.descripcion);
  html = metaPropiedad(html, 'og:title', meta.titulo);
  html = metaPropiedad(html, 'og:description', meta.descripcion);
  html = metaNombre(html, 'twitter:title', meta.titulo);
  html = metaNombre(html, 'twitter:description', meta.descripcion);
  html = metaPropiedad(html, 'og:image:alt', textos.altRetrato);
  html = metaNombre(html, 'twitter:image:alt', textos.altRetrato);

  html = html.replace(/(<link rel="canonical" href=")[^"]*(">)/, `$1${url}$2`);
  html = html.replace(/(<meta property="og:url" content=")[^"]*(">)/, `$1${url}$2`);

  const locales = [
    `  <meta property="og:locale" content="${meta.ogLocale}">`,
    ...meta.ogLocalesAlternos.map((otro) => `  <meta property="og:locale:alternate" content="${otro}">`),
  ].join('\n');
  html = html.replace(
    /  <!-- locales:start -->[\s\S]*?<!-- locales:end -->/,
    `  <!-- locales:start -->\n${locales}\n  <!-- locales:end -->`,
  );

  html = html.replace(
    /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
    jsonLd(lang, url, meta, textos),
  );

  // El alt del retrato va en un atributo, no en el contenido.
  html = html.replace(
    /<[a-z0-9]+[^>]*data-i18n-alt="[^"]+"[^>]*>/gi,
    (etiqueta) => etiqueta.replace(/alt="[^"]*"/, `alt="${esc(textos.altRetrato)}"`),
  );

  const resultado = sustituirTextos(html, textos);
  if (resultado.faltan.length) {
    throw new Error(`${lang}: no se encontró el nodo de ${resultado.faltan.join(', ')}`);
  }
  html = resultado.html;

  html = html.replace(/[ \t]*<nav class="idioma"[\s\S]*?<\/nav>/, nav(lang, textos.idioma));

  // Las páginas viven un nivel por debajo: los recursos suben con ../
  html = html.replace(/="assets\//g, '="../assets/');

  if (html.includes('{anio}')) throw new Error(`${lang}: quedó el marcador {anio}`);

  const destino = path.join(RAIZ, lang, 'index.html');
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, html, 'utf8');
  return destino;
}

for (const lang of IDIOMAS) {
  const destino = generar(lang);
  console.log(`generado ${path.relative(RAIZ, destino)}`);
}
