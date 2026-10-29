# Rendimiento y SEO — línea base

Informe de referencia del sitio publicado, para comparar versiones futuras contra él.

- **Fecha:** 30 de octubre de 2026
- **Commit:** `6364d13` (build de Pages sobre ese commit)
- **URL:** <https://jeironpro.github.io/portfolio/>
- **Herramienta:** Lighthouse 13.6.0 · Google Chrome 156.0.8078.73

## Resumen

| Categoría | Móvil | Escritorio |
|---|---|---|
| Rendimiento | 98-100 | 100 |
| SEO | 100 | 100 |

En SEO no falla ninguna auditoría en las tres páginas ni en ninguno de los dos formatos.

## Móvil

Dos pasadas por página, con la caché del CDN ya caliente. La nota y las métricas se
mueven entre pasadas por el artefacto de Speed Index descrito más abajo, así que la
tabla da el rango observado.

| Página | Nota | FCP | LCP | SI | TBT | CLS |
|---|---|---|---|---|---|---|
| `/` | 98-100 | 822-981 | 1054-1216 | 822-3757 | 0 | 0 |
| `/ca/` | 98-100 | 993-1006 | 1232-1239 | 2534-3833 | 0-1 | 0 |
| `/en/` | 98-100 | 800-1021 | 1053-1228 | 800-3792 | 0 | 0 |

Valores en milisegundos salvo CLS, que es adimensional.

## Escritorio

Una pasada por página con `--preset=desktop`.

| Página | Nota | FCP | LCP | SI | TBT | CLS |
|---|---|---|---|---|---|---|
| `/` | 100 | 218 | 283 | 347 | 0 | 0 |
| `/ca/` | 100 | 220 | 284 | 339 | 0 | 0 |
| `/en/` | 100 | 225 | 288 | 341 | 0 | 0 |

## Peso

- **Móvil:** 63 KiB · 6 peticiones.
- **Escritorio:** 56 KiB · 6 peticiones (la variante de retrato cambia con el viewport).

## Cómo se midió

1. Calentar la caché del CDN con dos peticiones a cada URL antes de medir.
2. Ejecutar Lighthouse con throttling simulado (móvil) y con `--preset=desktop`.

```bash
npm install --prefix /tmp/lh lighthouse
CHROME_PATH=/usr/bin/google-chrome \
  /tmp/lh/node_modules/.bin/lighthouse https://jeironpro.github.io/portfolio/ \
  --quiet --output=json --output-path=/tmp/lh/raiz.json \
  --only-categories=performance,seo \
  --chrome-flags="--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage"
```

Para escritorio, añadir `--preset=desktop`.

## Cómo comparar una versión futura

Medir con el mismo método y comparar contra la tabla. Se considera regresión si:

- alguna página baja de **100** y la causa no es solo el Speed Index;
- **FCP o LCP** suben más de un 10 % o más de 100 ms respecto al rango;
- **TBT** supera 50 ms o **CLS** supera 0,01;
- el peso total pasa de 70 KiB;
- el SEO baja de 100 o aparece una auditoría fallida.

Si la única diferencia es un Speed Index alto con **TBT 0 y CLS 0**, repetir la medición
antes de tratarlo como regresión: es el artefacto conocido del Chrome headless.

## Comprobación automática

`herramientas/rendimiento/medir.mjs` aplica este método y estos umbrales:

- Mide las tres páginas en móvil **dos veces** y se queda con la mejor pasada; en
  escritorio mide una vez.
- Compara contra [`linea-base.json`](../herramientas/rendimiento/linea-base.json), que
  guarda los valores de este informe en formato legible por el script.
- Trata una nota de 98 como **aviso**, no como regresión, si la única auditoría
  ponderada por debajo de 1 es el Speed Index y TBT y CLS están dentro de umbral.
- Sale con **código 1** si hay cualquier regresión y con **0** si no la hay.

```bash
cd herramientas/rendimiento
npm install   # solo la primera vez
npm run medir
```

Para medir otro destino: `SITIO=https://otro.example/ npm run medir`. Si se cambia la
línea base, actualizar también este documento y el historial.

## Limitaciones conocidas

- **Datos de laboratorio.** La API de CrUX no tiene cuota disponible y el repositorio es
  nuevo, así que no hay métricas de usuarios reales.
- **Speed Index bimodal.** En cada pasada una de las tres páginas registra SI de 2,5-3,8 s
  y baja a 98/100; la página afectada cambia entre pasadas y las tres comparten CSS, JS,
  fuente e imágenes. Es un repintado tardío del trace de Chrome headless, no una
  característica del sitio. Por eso el SI solo pesa 10 sobre 100.
- **Una petición bloqueante:** la hoja de estilos (17 KiB). Lighthouse la marca en
  `render-blocking-insight`, una auditoría con peso 0 que no resta nota.
- **Caché de GitHub Pages:** `max-age=600`. Lighthouse estima 52 KiB de ahorro en visitas
  repetidas, pero la cabecera no se puede configurar desde el repositorio.
- Los umbrales de comparación son de laboratorio: sirven para detectar regresiones
  relativas, no para predecir la experiencia de un usuario concreto.

## Historial

| Fecha | Commit | Cambio |
|---|---|---|
| 2026-10-30 | `6364d13` | Línea base inicial, tras recrear el repositorio |
