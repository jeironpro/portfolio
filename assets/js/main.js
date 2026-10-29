/* ============================================================
   Portafolio — Jeiron Espinal
   Comportamiento de la página: retrato y año del pie.
   Los textos viven ya en el HTML de cada idioma.
   ============================================================ */

/* ── Retrato: desplazamiento mínimo siguiendo el puntero ─────── */
(function () {
  'use strict';

  const retrato = document.getElementById('retrato');
  if (!retrato) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  const reposar = () => {
    retrato.style.setProperty('--x', '0px');
    retrato.style.setProperty('--y', '0px');
  };

  retrato.addEventListener('pointermove', (evento) => {
    if (reduce.matches) return;
    const caja = retrato.getBoundingClientRect();
    const x = (evento.clientX - caja.left) / caja.width - 0.5;
    const y = (evento.clientY - caja.top) / caja.height - 0.5;
    retrato.style.setProperty('--x', `${(-x * 10).toFixed(2)}px`);
    retrato.style.setProperty('--y', `${(-y * 8).toFixed(2)}px`);
  });

  retrato.addEventListener('pointerleave', reposar);

  // Si se activa «reducir movimiento» con la página abierta, se vuelve al centro.
  if (typeof reduce.addEventListener === 'function') {
    reduce.addEventListener('change', (evento) => {
      if (evento.matches) reposar();
    });
  }
}());

/* ── Año del pie ─────────────────────────────────────────────── */
(function () {
  'use strict';

  const pie = document.querySelector('.pie p');
  if (!pie) return;

  // El generador deja el año de la última publicación; aquí se corrige al
  // año real del visitante sin tocar el resto de la frase.
  pie.textContent = pie.textContent.replace(/\b20\d{2}\b/, String(new Date().getFullYear()));
}());
