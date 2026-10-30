# Portafolio — Jeiron Espinal

Sitio personal de una sola página: presentación, proyectos de formación y el stack con
el que trabajo. Es HTML, CSS y JavaScript sin dependencias y sin peticiones a dominios
externos: la tipografía JetBrains Mono se sirve desde `assets/fonts/`. El sitio publicado
es estático: las
versiones catalana e inglesa se generan con un script de Node que no usa paquetes.

[![Accesibilidad](https://github.com/jeironpro/portfolio/actions/workflows/accesibilidad.yml/badge.svg)](https://github.com/jeironpro/portfolio/actions/workflows/accesibilidad.yml)
[![Rendimiento](https://github.com/jeironpro/portfolio/actions/workflows/rendimiento.yml/badge.svg)](https://github.com/jeironpro/portfolio/actions/workflows/rendimiento.yml)

**En línea:** <https://jeironpro.github.io/portfolio/>

![Portada del portafolio](docs/capturas/portada.png)

## Estructura

```
.
├── index.html              Portada en castellano (fuente de las demás)
├── ca/
│   └── index.html          Versión catalana (generada)
├── en/
│   └── index.html          Versión inglesa (generada)
├── assets/
│   ├── css/estilos.css     Todos los estilos
│   ├── js/main.js          Retrato y año del pie
│   ├── cv/                 CV que descarga el botón de la cabecera
│   └── img/                Retrato en WebP y JPG (Open Graph)
├── herramientas/
│   ├── generar.mjs         Genera ca/ y en/ desde index.html
│   ├── textos.json         Textos catalanes e ingleses
│   ├── accesibilidad/      axe-core y enlaces rotos (npm test, npm run enlaces)
│   └── rendimiento/        Compara con la línea base (npm run medir)
├── docs/
│   ├── capturas/           Capturas de referencia de cada sección
│   └── rendimiento.md      Línea base de rendimiento y SEO
├── robots.txt
├── sitemap.xml
├── .gitignore
├── LICENSE
└── README.md
```

El HTML no lleva estilos ni scripts propios: solo enlaza `assets/css/estilos.css` y
`assets/js/main.js`. El único `<script>` en línea es el bloque JSON-LD de datos
estructurados, que busca el navegador y no ejecuta.

## Secciones

- **Sobre mí** — retrato, rol, biografía, botón de descarga del CV y enlaces a
  LinkedIn, GitHub y link-in-bio.
- **Proyectos** — agrupados por la formación de la que salieron (INFOTEP y Institut TIC
  de Barcelona) y, aparte, otros proyectos publicados.
- **Tecnologías** — cifras y áreas, calculadas sobre los repositorios públicos.

## Idiomas

Cada idioma tiene su propia URL, para que los buscadores puedan indexarlas por separado:

| Idioma | URL |
|---|---|
| Castellano | <https://jeironpro.github.io/portfolio/> |
| Catalán | <https://jeironpro.github.io/portfolio/ca/> |
| Inglés | <https://jeironpro.github.io/portfolio/en/> |

Las tres páginas se enlazan entre sí con `hreflang` (incluido `x-default` hacia el
castellano) y el conmutador de la cabecera son enlaces normales, con `aria-current` en
el idioma en el que estás. Al cambiar de idioma se navega, no se reescribe el texto.

El castellano es la fuente: se edita `index.html` y `herramientas/textos.json`, y
después se regeneran las otras dos versiones:

```bash
node herramientas/generar.mjs
```

El generador sustituye los nodos con `data-i18n`, traduce los metadatos, ajusta
`canonical`, `og:url`, `og:locale` y los datos estructurados, cambia el conmutador y
reescribe las rutas de `assets/` con `../`. Si falta una clave en un idioma, falla en
vez de dejar texto a medias.

El año del pie no está escrito a mano: el generador resuelve el marcador `{anio}` y
`main.js` lo corrige al año real del visitante.

## Accesibilidad

- Enlace **«Saltar al contenido»** como primer elemento del tabulador; el foco pasa a
  `<main>`, que lleva `tabindex="-1"`.
- Anillo de foco propio, ámbar, en enlaces y botones (`:focus-visible`).
- Conmutador de idioma con enlaces de 44 × 34 px, `lang`, `hreflang` y `aria-current`.
  El idioma actual no se distingue solo por el color: también va en negrita.
- Contraste mínimo de 7:1 en el texto secundario y 4.5:1 en el resto (WCAG AA).
- `prefers-reduced-motion` detiene la cinta, el parallax del retrato y las transiciones.
- Un solo `h1`, jerarquía de encabezados sin saltos y `aria-hidden` solo en lo decorativo.

La comprobación es automática. `herramientas/accesibilidad` pasa axe-core por las tres
páginas, en móvil y escritorio, y el flujo de GitHub Actions la repite en cada push:
falla si aparece cualquier violación A o AA.

```bash
cd herramientas/accesibilidad
npm install   # solo la primera vez
npm test
```

## Enlaces y recursos

`herramientas/accesibilidad/enlaces.mjs` carga las tres páginas en Chrome y comprueba:

- **Recursos** que pide el navegador (CSS, JS, tipografía, favicon y la variante de
  retrato que elige cada `srcset`): falla si alguno devuelve 4xx o 5xx.
- **Enlaces internos**, incluidas las URL absolutas del sitio que aparecen en el HTML:
  se resuelven contra el servidor local, no contra GitHub Pages, así que una rotura se
  detecta antes de publicar.
- **Anclas** (`#seccion`): comprueba que el `id` exista en la página de destino.
- **Enlaces externos**: falla solo con 404 o 410. Un 401, 403, 429, 5xx o un tiempo
  agotado se informa como «sin verificar», porque depende de terceros y no del sitio.

```bash
cd herramientas/accesibilidad
npm run enlaces
```

El flujo de GitHub Actions ejecuta las dos comprobaciones en cada push, aunque la de
accesibilidad falle, para que un run muestre los dos resultados a la vez. Además las
repite todos los lunes a las 06:30 UTC, para detectar enlaces externos caídos sin que
haga falta un push. Los informes de accesibilidad y de enlaces se publican en el
resumen del run.

## SEO

- `title` y `meta description` propios por idioma, `canonical` en cada URL y
  `hreflang` recíproco entre las tres, con `x-default`.
- Open Graph y tarjeta de Twitter completos, con `og:locale` por página.
- Datos estructurados JSON-LD: `Person`, `WebSite` y `ProfilePage`, con el idioma y la
  URL de cada versión.
- `robots.txt` permisivo y `sitemap.xml` con las tres URLs y sus alternativas.
- Un solo `h1`, encabezados jerárquicos, enlaces con texto e imágenes con `alt` y
  dimensiones.

La línea base de rendimiento y SEO, con el método y los umbrales de comparación, está en
[docs/rendimiento.md](docs/rendimiento.md). Para repetir la medición:

```bash
cd herramientas/rendimiento
npm install   # solo la primera vez
npm run medir
```

Mide las tres páginas en móvil y escritorio (dos pasadas cada una) y sale con código 1 si
alguna métrica se sale de la línea base. Un flujo de GitHub Actions la ejecuta cada lunes y avisa
si hay desviaciones.

## Ver en local

```bash
python3 -m http.server 8765
```

Y visita <http://localhost:8765>, <http://localhost:8765/ca/> o
<http://localhost:8765/en/>.

## Publicación

GitHub Pages sirve la rama `main` desde la raíz. Antes de publicar, ejecuta
`node herramientas/generar.mjs` para que `ca/` y `en/` reflejen los últimos cambios.

Al cambiar de dominio hay que ajustar `SITIO` en `herramientas/generar.mjs`, las
alternativas `hreflang`, `canonical`, `og:url`, y las URL de `robots.txt` y
`sitemap.xml`.

## Licencia

MIT. Consulta [LICENSE](LICENSE).
