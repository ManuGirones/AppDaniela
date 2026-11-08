// En cada publicación: cambiar VERSION aquí Y APP_VERSION en index.html (deben coincidir)
const VERSION = '0.6.2';
const CACHE = 'entreno-v' + VERSION;
const ARCHIVOS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './abduccion_maquina.webp',
  './abduccion_polea.webp',
  './bulgara_mancuernas.webp',
  './caminata_banda.webp',
  './cardio.webp',
  './carino-01.webp',
  './carino-02.webp',
  './carino-03.webp',
  './carino-04.webp',
  './carino-05.webp',
  './carino-06.webp',
  './carino-07.webp',
  './carino-08.webp',
  './carino-09.webp',
  './carino-10.webp',
  './carino-11.webp',
  './carino-12.webp',
  './carino-13.webp',
  './carino-14.webp',
  './carino-15.webp',
  './carino-16.webp',
  './carino-17.webp',
  './carino-18.webp',
  './carino-19.webp',
  './carino-20.webp',
  './carino-21.webp',
  './carino-22.webp',
  './carino-23.webp',
  './carino-24.webp',
  './carino-25.webp',
  './carino-26.webp',
  './carino-27.webp',
  './contractor.webp',
  './contractor_inverso.webp',
  './crunch_polea.webp',
  './curl_mancuernas.webp',
  './curl_maquina.webp',
  './curl_martillo.webp',
  './curl_pie.webp',
  './curl_polea.webp',
  './curl_sentado.webp',
  './curl_tumbado.webp',
  './dead_bug.webp',
  './dominada_asistida.webp',
  './elevacion_piernas.webp',
  './empuje.webp',
  './espalda.webp',
  './extension.webp',
  './face_pull.webp',
  './fondos_asistidos.webp',
  './gemelo_maquina.webp',
  './gemelo_prensa.webp',
  './gluteo.webp',
  './goblet.webp',
  './hip_thrust_mancuerna.webp',
  './hip_thrust_maquina.webp',
  './hip_thrust_multipower.webp',
  './hiperextension.webp',
  './jalon.webp',
  './jalon_estrecho.webp',
  './jalon_unilateral.webp',
  './laterales_mancuernas.webp',
  './laterales_maquina.webp',
  './laterales_polea.webp',
  './pajaros.webp',
  './pallof.webp',
  './patada_maquina.webp',
  './patada_polea.webp',
  './pendulo.webp',
  './pierna.webp',
  './plancha.webp',
  './plancha_lateral.webp',
  './prensa.webp',
  './prensa_unilateral.webp',
  './press_hombro_mancuernas.webp',
  './press_hombro_maquina.webp',
  './press_inclinado_mancuernas.webp',
  './press_inclinado_maquina.webp',
  './press_mancuernas.webp',
  './press_pecho_maquina.webp',
  './pull_through.webp',
  './pullover_polea.webp',
  './remo_mancuerna.webp',
  './remo_maquina.webp',
  './remo_pecho_apoyado.webp',
  './remo_polea.webp',
  './rumano_mancuernas.webp',
  './sentadilla_multipower.webp',
  './stepup_mancuernas.webp',
  './torso.webp',
  './triceps_barra_polea.webp',
  './triceps_cuerda.webp',
  './triceps_mancuerna.webp',
  './zancada_inversa.webp',
  './zancada_mancuernas.webp',
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
