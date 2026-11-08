// En cada publicación: cambiar VERSION aquí Y APP_VERSION en index.html (deben coincidir)
const VERSION = '0.3.6';
const CACHE = 'entreno-v' + VERSION;
const ARCHIVOS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './images/cardio.webp',
  './images/ej/abduccion_maquina.webp',
  './images/ej/abduccion_polea.webp',
  './images/ej/bulgara_mancuernas.webp',
  './images/ej/caminata_banda.webp',
  './images/ej/contractor.webp',
  './images/ej/contractor_inverso.webp',
  './images/ej/crunch_polea.webp',
  './images/ej/curl_mancuernas.webp',
  './images/ej/curl_maquina.webp',
  './images/ej/curl_martillo.webp',
  './images/ej/curl_pie.webp',
  './images/ej/curl_polea.webp',
  './images/ej/curl_sentado.webp',
  './images/ej/curl_tumbado.webp',
  './images/ej/dead_bug.webp',
  './images/ej/dominada_asistida.webp',
  './images/ej/elevacion_piernas.webp',
  './images/ej/extension.webp',
  './images/ej/face_pull.webp',
  './images/ej/fondos_asistidos.webp',
  './images/ej/gemelo_maquina.webp',
  './images/ej/gemelo_prensa.webp',
  './images/ej/goblet.webp',
  './images/ej/hip_thrust_mancuerna.webp',
  './images/ej/hip_thrust_maquina.webp',
  './images/ej/hip_thrust_multipower.webp',
  './images/ej/hiperextension.webp',
  './images/ej/jalon.webp',
  './images/ej/jalon_estrecho.webp',
  './images/ej/jalon_unilateral.webp',
  './images/ej/laterales_mancuernas.webp',
  './images/ej/laterales_maquina.webp',
  './images/ej/laterales_polea.webp',
  './images/ej/pajaros.webp',
  './images/ej/pallof.webp',
  './images/ej/patada_maquina.webp',
  './images/ej/patada_polea.webp',
  './images/ej/plancha.webp',
  './images/ej/plancha_lateral.webp',
  './images/ej/prensa.webp',
  './images/ej/prensa_unilateral.webp',
  './images/ej/press_hombro_mancuernas.webp',
  './images/ej/press_hombro_maquina.webp',
  './images/ej/press_inclinado_mancuernas.webp',
  './images/ej/press_inclinado_maquina.webp',
  './images/ej/press_mancuernas.webp',
  './images/ej/press_pecho_maquina.webp',
  './images/ej/pull_through.webp',
  './images/ej/pullover_polea.webp',
  './images/ej/remo_mancuerna.webp',
  './images/ej/remo_maquina.webp',
  './images/ej/remo_pecho_apoyado.webp',
  './images/ej/remo_polea.webp',
  './images/ej/rumano_mancuernas.webp',
  './images/ej/sentadilla_multipower.webp',
  './images/ej/stepup_mancuernas.webp',
  './images/ej/triceps_barra_polea.webp',
  './images/ej/triceps_cuerda.webp',
  './images/ej/triceps_mancuerna.webp',
  './images/ej/zancada_inversa.webp',
  './images/ej/zancada_mancuernas.webp',
  './images/empuje.webp',
  './images/espalda.webp',
  './images/gluteo.webp',
  './images/pierna.webp',
  './images/torso.webp',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('entreno-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Primero caché (funciona sin cobertura); si no está, red y se guarda
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, {ignoreSearch:true}).then(r => r || fetch(e.request).then(resp => {
      if (resp.ok && new URL(e.request.url).origin === location.origin) {
        const copia = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, copia));
      }
      return resp;
    }))
  );
});
