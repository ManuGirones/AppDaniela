// Ejecutar: cd tests && npm install && node test.js
process.env.TZ = 'Europe/Madrid';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const RAIZ = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');

let ok = 0, fallos = 0;
function assert(cond, msg){ if (cond) ok++; else { fallos++; if (fallos <= 40) console.error('✗ ' + msg); } }
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function abrir(guardado, ahoraIso){
  const errores = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errores.push(e.message));
  vc.on('error', e => errores.push(String(e)));
  const store = {};
  if (guardado !== undefined) store['entreno.estado'] = guardado;
  const stub = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  };
  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously', url: 'https://example.org/', virtualConsole: vc,
    beforeParse(w){ Object.defineProperty(w, 'localStorage', {value: stub, configurable: true}); w.scrollTo = () => {}; if (ahoraIso) w.__ahora = ahoraIso; },
  });
  return {w: dom.window, errores, store};
}

/* ---------- 1. Humo ---------- */
const {w, errores} = abrir();
const ev = s => w.eval(s);
assert(errores.length === 0, 'la app carga sin excepciones: ' + errores.join(' | '));
const appVersion = ev('APP_VERSION');
assert(w.document.getElementById('version').textContent === 'v' + appVersion, 'versión visible en pantalla');
assert(w.document.querySelectorAll('nav.tabs button').length === 3, 'barra con 3 pestañas');
assert(w.document.getElementById('reloj') && /^\d\d:\d\d$/.test(w.document.getElementById('reloj').textContent), 'inicio muestra la hora');

/* ---------- 2. Versión: index.html y sw.js coinciden ---------- */
const sw = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8');
const swVersion = (sw.match(/const VERSION = '([^']+)'/) || [])[1];
assert(swVersion === appVersion, `APP_VERSION (${appVersion}) y VERSION de sw.js (${swVersion}) deben coincidir`);
const archivosSw = [...sw.matchAll(/'\.\/([^']*)'/g)].map(m => m[1]).filter(Boolean);
for (const f of archivosSw) assert(fs.existsSync(path.join(RAIZ, f)), 'sw.js cachea un archivo que existe: ' + f);

/* ---------- 3. Integridad de datos ---------- */
const EJ = ev('EJERCICIOS'), SES = ev('SESIONES'), PL = ev('PLANTILLAS');
const usados = new Set();
for (const [sid, s] of Object.entries(SES)){
  assert(['inferior','superior','cardio'].includes(s.tipo), sid + ': tipo válido');
  assert(s.calentamiento.length > 0, sid + ': tiene calentamiento');
  s.bloques.forEach((b, i) => {
    assert(b.opciones.length > 0, `${sid}[${i}]: tiene opciones`);
    assert(new Set(b.opciones).size === b.opciones.length, `${sid}[${i}]: opciones sin duplicados`);
    for (const o of b.opciones){ usados.add(o); assert(EJ[o], `${sid}[${i}]: el ejercicio ${o} existe`); }
    if (b.esquema.tipo !== 'cardio'){
      assert(b.esquema.series > 0 && b.esquema.repsMin <= b.esquema.repsMax, `${sid}[${i}]: esquema coherente`);
      assert(i === 0 || !b.esquema.aprox, `${sid}[${i}]: aproximación solo en el primer bloque`);
    }
  });
}
for (const [sid, s] of Object.entries(SES)) if (s.imagen){
  assert(fs.existsSync(path.join(RAIZ, s.imagen)), sid + ': la imagen existe');
  assert(archivosSw.includes(s.imagen), sid + ': sw.js guarda la imagen para usarla sin conexión');
}
assert(Object.values(SES).every(s => s.imagen), 'todas las sesiones tienen imagen');
// Tamaño real de un .webp (cabecera VP8 / VP8L / VP8X)
function tamWebp(f){
  const b = fs.readFileSync(f), tipo = b.toString('ascii', 12, 16);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null;
  if (tipo === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  if (tipo === 'VP8L'){ const v = b.readUInt32LE(21); return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1]; }
  if (tipo === 'VP8X') return [b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1];
  return null;
}
const TAM = ev('TAM_IMG');
for (const [src, t] of Object.entries(TAM)){
  assert(fs.existsSync(path.join(RAIZ, src)), src + ': existe');
  assert(igual(tamWebp(path.join(RAIZ, src)), t), src + `: tamaño declarado ${t} = real ${tamWebp(path.join(RAIZ, src))}`);
  assert(archivosSw.includes(src), src + ': sw.js la guarda para usarla sin conexión');
  const esSesion = Object.values(SES).some(s => s.imagen === src);
  if (!esSesion) assert(EJ[src.slice(0, -5)], src + ': corresponde a un ejercicio que existe');
}
for (const [sid, s] of Object.entries(SES)) assert(TAM[s.imagen], sid + ': su imagen está registrada');
assert(w.htmlImg && w.imagenEjercicio('prensa') === 'prensa.webp' && w.imagenEjercicio('eliptica') === null && w.imagenEjercicio('pierna') === null, 'imagen de ejercicio solo si existe (y nunca la de una sesión)');
const enDisco = fs.readdirSync(RAIZ).filter(f => f.endsWith('.webp'));
for (const f of enDisco) assert(TAM[f], f + ': imagen en la carpeta pero sin registrar en TAM_IMG');
assert(fs.readdirSync(RAIZ).filter(f => fs.statSync(path.join(RAIZ, f)).isDirectory() && f !== 'tests').length === 0, 'estructura plana: sin subcarpetas (salvo tests)');
for (const id of Object.keys(EJ)) assert(usados.has(id), 'ejercicio definido y usado en alguna sesión: ' + id);
assert(igual(Object.keys(PL), ['1','2','3','4','5','6']), 'plantillas de 1 a 6 días');
for (const [n, pl] of Object.entries(PL)){
  assert(pl.length === Number(n), `plantilla ${n}: tiene ${n} sesiones`);
  for (const s of pl) assert(SES[s], `plantilla ${n}: la sesión ${s} existe`);
  if (Number(n) >= 3) assert(pl.filter(s => SES[s].tipo === 'inferior').length >= 2, `plantilla ${n}: al menos 2 sesiones de pierna/glúteo`);
}

/* ---------- 4. Exclusión: ningún orden de elecciones deja un bloque vacío ---------- */
let caminos = 0;
for (const sid of Object.keys(SES)){
  (function rec(idx, elegidos){
    if (idx === SES[sid].bloques.length){ caminos++; return; }
    const ops = w.opcionesBloque(sid, idx, elegidos, []);
    assert(ops.length > 0, `${sid}: bloque ${idx} vacío tras elegir ${elegidos.join(',')}`);
    for (const o of ops){
      assert(!elegidos.includes(o), `${sid}: ${o} se ofrece otra vez tras elegirlo`);
      rec(idx + 1, elegidos.concat(o));
    }
  })(0, []);
}
assert(caminos > 1000, 'se han recorrido todos los caminos de elección (' + caminos + ')');
// ocultos: se filtran, y si vaciarían el bloque se ignoran
assert(igual(w.opcionesBloque('gluteo', 3, [], ['abduccion_maquina']), ['abduccion_polea','caminata_banda']), 'ocultos se filtran');
assert(w.opcionesBloque('empuje', 2, [], ['press_hombro_maquina','press_hombro_mancuernas']).length === 2, 'si ocultos vacían el bloque, se ignoran');

/* ---------- 5. Series automáticas ---------- */
for (const [sid, s] of Object.entries(SES)) s.bloques.forEach((b, i) => b.opciones.forEach(o => {
  const ser = w.seriesDe(sid, i, o);
  if (b.esquema.tipo === 'cardio'){ assert(ser.length === 1 && ser[0].tipo === 'cardio', `${sid}/${o}: cardio`); return; }
  const e = w.esquemaDe(sid, i, o);
  assert(ser.filter(x => x.tipo === 'aprox').length === (b.esquema.aprox || 0), `${sid}/${o}: nº de aproximaciones`);
  assert(ser.filter(x => x.tipo === 'efectiva').length === b.esquema.series, `${sid}/${o}: nº de series efectivas`);
  assert(e.unilateral === !!EJ[o].unilateral, `${sid}/${o}: unilateral`);
  assert(typeof w.textoEsquema(e) === 'string' && !/undefined|NaN/.test(w.textoEsquema(e)), `${sid}/${o}: texto de esquema limpio`);
}));
assert(w.textoEsquema(w.esquemaDe('pierna', 0, 'sentadilla_multipower')) === '2 de aproximación + 3 × 6–10 reps · descanso 2:30', 'texto sentadilla multipower');
assert(!EJ.hack && EJ.sentadilla_multipower.nombre === 'Sentadilla en multipower', 'hack sustituida por multipower');
assert(w.esquemaDe('gluteo', 4, 'plancha').unidad === 's', 'plancha en segundos');
assert(w.textoEsquema(w.esquemaDe('cardio', 0, 'intervalos_bici')) === '20 min', 'intervalos 20 min');

/* ---------- 6. Planificación: matriz completa con comprobación independiente ---------- */
const inf = s => SES[s].tipo === 'inferior';
function penal(plan){ // implementación independiente de la del motor
  const dias = new Map(plan.map(p => [p.dia, p.sesion]));
  let a = 0, b = 0;
  for (let d = 0; d < 6; d++) if (dias.has(d) && dias.has(d + 1)){ b++; if (inf(dias.get(d)) && inf(dias.get(d + 1))) a++; }
  return [a, b];
}
function optimoIndependiente(disp, n){ // mínimo (adyInf, adyTotal) probando todo
  let mejor = null;
  const ses = PL[n];
  const subconj = []; (function r(i, acc){ if (acc.length === n){ subconj.push(acc.slice()); return; } for (let k = i; k < disp.length; k++){ acc.push(disp[k]); r(k + 1, acc); acc.pop(); } })(0, []);
  const perms = []; (function r(rest, acc){ if (!rest.length){ perms.push(acc.slice()); return; } rest.forEach((x, i) => { acc.push(x); r(rest.filter((_, j) => j !== i), acc); acc.pop(); }); })(ses, []);
  for (const dd of subconj) for (const p of perms){
    const v = penal(dd.map((d, i) => ({dia: d, sesion: p[i]})));
    if (!mejor || v[0] < mejor[0] || (v[0] === mejor[0] && v[1] < mejor[1])) mejor = v;
  }
  return mejor;
}
let casos = 0;
for (let mask = 1; mask < 128; mask++){
  const disp = [0,1,2,3,4,5,6].filter(d => mask & (1 << d));
  for (let n = 1; n <= 6; n++){
    casos++;
    const r = w.planificarSemana({dias: n, disponibles: disp});
    const etiqueta = `disp=[${disp}] n=${n}`;
    if (disp.length < n){ assert(!r.ok && /Marca al menos/.test(r.error), etiqueta + ': error si faltan días'); continue; }
    assert(r.ok, etiqueta + ': ok');
    assert(r.plan.length === n, etiqueta + ': nº de sesiones');
    const ds = r.plan.map(p => p.dia);
    assert(new Set(ds).size === n && ds.every(d => disp.includes(d)), etiqueta + ': días únicos y disponibles');
    assert(igual(ds, ds.slice().sort((a, b) => a - b)), etiqueta + ': ordenado por día');
    assert(igual(r.plan.map(p => p.sesion).sort(), PL[n].slice().sort()), etiqueta + ': sesiones = plantilla');
    const v = penal(r.plan);
    assert(igual(v, optimoIndependiente(disp, n)), etiqueta + `: óptimo (motor ${v}, independiente ${optimoIndependiente(disp, n)})`);
    assert((v[0] > 0) === r.avisos.some(a => /días seguidos/.test(a)), etiqueta + ': aviso si y solo si inferior en días seguidos');
    assert(igual(w.planificarSemana({dias: n, disponibles: disp.slice().reverse().concat(disp)}).plan, r.plan), etiqueta + ': determinista y robusto a duplicados/orden');
  }
}
assert(casos === 127 * 6, 'casos de matriz: ' + casos);
assert(!w.planificarSemana({dias: 0, disponibles: [0,1,2]}).ok, 'rechaza 0 días');
assert(!w.planificarSemana({dias: 7, disponibles: [0,1,2,3,4,5,6]}).ok, 'rechaza 7 días');

// Semana completa disponible: sin inferior en días seguidos
const TODOS = [0,1,2,3,4,5,6];
for (let n = 3; n <= 6; n++) assert(penal(w.planificarSemana({dias: n, disponibles: TODOS}).plan)[0] === 0, `todos los días, n=${n}: sin pierna/glúteo seguidos`);

/* ---------- 7. Replanificar a mitad de semana ---------- */
let r = w.planificarSemana({dias: 4, disponibles: TODOS, hechos: [{dia: 0, sesion: 'pierna'}], desde: 2});
assert(r.ok && r.plan.length === 4, 'replan: 4 sesiones en total');
assert(r.plan[0].dia === 0 && r.plan[0].hecho && r.plan[0].sesion === 'pierna', 'replan: lo hecho se mantiene');
assert(r.plan.slice(1).every(p => p.dia >= 2 && !p.hecho), 'replan: lo nuevo desde el día indicado');
assert(igual(r.plan.map(p => p.sesion).sort(), PL[4].slice().sort()), 'replan: completa la plantilla');

r = w.planificarSemana({dias: 4, disponibles: TODOS, hechos: [{dia: 0, sesion: 'pierna'}], desde: 5});
assert(r.ok && r.plan.length === 3 && r.avisos.some(a => /No quedan días/.test(a)), 'replan sin hueco: avisa de lo que no cabe');
assert(r.plan.some(p => p.sesion === 'gluteo'), 'replan sin hueco: prioriza pierna/glúteo');

r = w.planificarSemana({dias: 3, disponibles: TODOS, hechos: [{dia:0,sesion:'pierna'},{dia:1,sesion:'cardio'},{dia:2,sesion:'torso'}], desde: 3});
assert(r.ok && r.plan.length === 3 && r.plan.every(p => p.hecho), 'replan: si ya hizo los días previstos no añade más');

r = w.planificarSemana({dias: 5, disponibles: TODOS, hechos: [], desde: 6});
assert(r.ok && r.plan.length === 1 && r.plan[0].sesion === 'pierna', 'replan solo domingo: queda la de mayor prioridad');

/* ---------- 8. Estado y migraciones ---------- */
let a = abrir(JSON.stringify({config: {dias: 5}}));
let est = a.w.eval('estado');
assert(est.config.dias === 5, 'migración: conserva lo guardado');
assert(igual(est.config.disponibles, [0,1,2,3,4,5,6]) && Array.isArray(est.ocultos) && Array.isArray(est.clases) && Array.isArray(est.historial), 'migración: rellena campos nuevos');
a = abrir('{esto no es json');
assert(a.errores.length === 0 && a.w.eval('estado').config.dias === 4, 'estado corrupto: arranca con valores por defecto');
a = abrir(JSON.stringify({config: {dias: 'cinco', disponibles: 'x'}, ocultos: null, semanas: 'roto'}));
est = a.w.eval('estado');
assert(est.config.dias === 4 && Array.isArray(est.config.disponibles) && Array.isArray(est.ocultos) && typeof est.semanas === 'object', 'tipos erróneos: vuelven al valor por defecto');
a = abrir(JSON.stringify({config: {dias: 9}}));
assert(a.w.eval('estado').config.dias === 4, 'días fuera de rango → 4');
a = abrir(JSON.stringify({extra: 1}));
assert(a.w.eval('estado').extra === 1, 'campos desconocidos se conservan');

/* ---------- 9. Exclusión con vuelta atrás: aunque elija en cualquier orden, ningún bloque se vacía ---------- */
for (const [sid, s] of Object.entries(SES)) s.bloques.forEach((b, i) => {
  const otros = s.bloques.filter((_, j) => j !== i).filter(o => o.opciones.some(x => b.opciones.includes(x))).length;
  assert(b.opciones.length > otros, `${sid}[${i}]: sobran opciones aunque los demás bloques le quiten una cada uno`);
});

/* ---------- 10. Fechas (incluye cambios de hora) ---------- */
const D = s => new w.Date(s);
assert(w.lunesDe(D('2026-11-05T10:00:00')) === '2026-11-02', 'lunes de un jueves');
assert(w.lunesDe(D('2026-11-08T23:59:00')) === '2026-11-02', 'domingo pertenece a la semana del lunes anterior');
assert(w.lunesDe(D('2026-11-09T00:01:00')) === '2026-11-09', 'lunes empieza semana');
assert(w.lunesDe(D('2026-03-29T12:00:00')) === '2026-03-23' && w.sumarDias('2026-03-23', 7) === '2026-03-30', 'cambio de hora de marzo');
assert(w.lunesDe(D('2026-10-25T12:00:00')) === '2026-10-19' && w.difDias('2026-10-19', '2026-10-26') === 7, 'cambio de hora de octubre');
assert(w.difDias('2026-12-28', '2027-01-03') === 6 && w.lunesDe(D('2027-01-01T12:00:00')) === '2026-12-28', 'cambio de año');
assert(w.parseNum('62,5') === 62.5 && w.parseNum('') === null && w.parseNum('abc') === null, 'parseNum con coma decimal');

assert(w.fmtMiles(1900) === '1.900' && w.fmtMiles(475) === '475' && w.fmtMiles(12345) === '12.345', 'formato de miles');

/* ---------- 11. Peso ---------- */
let ep = {peso: []};
w.registrarPeso(ep, '2026-11-01', 62.4); w.registrarPeso(ep, '2026-11-01', 62.0);
assert(ep.peso.length === 1 && ep.peso[0].kg === 62.0, 'un registro por día (se sobrescribe)');
for (let k = 0; k < 14; k++) w.registrarPeso(ep, w.sumarDias('2026-10-20', k), k < 7 ? 63 : 62);
const rp = w.resumenPeso(ep.peso, '2026-11-02');
assert(rp && Math.abs(rp.media7 - 62) < 1e-9 && Math.abs(rp.cambio + 1) < 1e-9, 'media 7 días y cambio semanal');
assert(w.resumenPeso([], '2026-11-02') === null, 'sin registros → null');

/* ---------- 12. Semanas: esta y la siguiente, cada una con su configuración ---------- */
{
  const e = {config: {disponibles: [0,1,2,3,4,5,6], dias: 4}, semanas: {}, historial: [], clases: []};
  const jue = D('2026-11-05T10:00:00'); // jueves
  w.asegurarSemanas(e, jue);
  const s1 = e.semanas['2026-11-02'], s2 = e.semanas['2026-11-09'];
  assert(s1 && s2, 'crea esta semana y la siguiente');
  assert(s1.plan.length === 4 && s1.plan.every(p => p.dia >= 3), 'jueves: planifica 4 en J–D');
  assert(s2.plan.length === 4 && s2.plan[0].dia === 0, 'semana siguiente: completa desde el lunes');
  w.cambiarSemana(e, '2026-11-02', {dias: 2}, jue);
  assert(s1.plan.length === 2 && s1.plan.every(p => p.dia >= 3), 'jueves: puede elegir solo 2 días esta semana');
  assert(s2.dias === 2 && s2.plan.length === 2, 'la siguiente (sin tocar) hereda el cambio');
  w.cambiarSemana(e, '2026-11-09', {dias: 5, disponibles: [0,1,2,3,4]}, jue);
  assert(s2.plan.length === 5 && s2.personalizada, 'la siguiente se puede cambiar a mano');
  w.cambiarSemana(e, '2026-11-02', {dias: 3}, jue);
  assert(s2.dias === 5, 'tras tocarla a mano, ya no hereda cambios');
  w.cambiarSemana(e, '2026-11-02', {dias: 6}, jue);
  assert(s1.plan.length === 4 && s1.avisos.some(t => /No quedan días/.test(t)), 'jueves con 6 días: caben 4 y avisa');
  assert(s1.plan.filter(p => SES[p.sesion].tipo === 'inferior').length >= 2, 'si no cabe todo, conserva pierna/glúteo');
  const antes = JSON.stringify(e.semanas['2026-11-02'].plan);
  w.asegurarSemanas(e, D('2026-11-12T10:00:00')); // semana siguiente
  assert(e.semanas['2026-11-16'] && JSON.stringify(e.semanas['2026-11-02'].plan) === antes, 'al pasar de semana crea la nueva y no toca la pasada');
  w.replanificarSemana(e, '2026-11-02', D('2026-11-12T10:00:00'));
  assert(JSON.stringify(e.semanas['2026-11-02'].plan) === antes, 'una semana pasada no se replanifica');
  w.asegurarSemanas(e, D('2027-02-01T10:00:00'));
  assert(!e.semanas['2026-11-02'] && e.semanas['2027-02-01'], 'semanas de hace más de 8 se limpian');
}

/* ---------- 13. Pilates ---------- */
{
  const e = {config: {disponibles: [0,1,2,3,4,5,6], dias: 4}, semanas: {}, historial: [], clases: []};
  const c = w.anadirClase(e, '2026-11-04', 'pilates');
  assert(c && e.clases.length === 1, 'añade clase de pilates');
  assert(w.anadirClase(e, '2026-11-04', 'pilates') === null, 'no duplica el mismo día');
  assert(w.anadirClase(e, '2026-11-04', 'yoga') === null, 'solo tipos de clase conocidos');
  w.marcarClase(e, c.id);
  assert(w.claseHecha(e, c.id) && e.historial[0].sesion === 'pilates' && e.historial[0].fecha === '2026-11-04', 'marcar hecha la registra en el historial');
  assert(w.marcarClase(e, c.id) === null && e.historial.length === 1, 'no se registra dos veces');
  assert(w.quitarClase(e, c.id) === false, 'no se puede quitar una clase hecha');
  assert(w.hechosSemana(e.historial, '2026-11-02').length === 0, 'pilates no cuenta como sesión del plan de gimnasio');
  w.desmarcarClase(e, c.id);
  assert(!w.claseHecha(e, c.id) && e.historial.length === 0 && w.quitarClase(e, c.id) && e.clases.length === 0, 'deshacer y quitar');
}

/* ---------- 14. Estadísticas ---------- */
{
  const H = [
    {fecha: '2026-01-10', sesion: 'pierna', inicio: '2026-01-10T17:00:00Z', fin: '2026-01-10T18:00:00Z', ejercicios: [{id: 'sentadilla_multipower', series: [{kg: 50, reps: 10}, {kg: 55, reps: 8}]}]},
    {fecha: '2026-10-20', sesion: 'gluteo', inicio: '2026-10-20T17:00:00Z', fin: '2026-10-20T17:45:00Z', ejercicios: [{id: 'hip_thrust_maquina', series: [{kg: 80, reps: 10}]}, {id: 'plancha', series: [{kg: null, reps: 40}]}]},
    {fecha: '2026-11-01', sesion: 'pilates', inicio: null, fin: null, ejercicios: []},
    {fecha: '2026-11-03', sesion: 'espalda', inicio: '2026-11-03T17:00:00Z', fin: '2026-11-03T17:50:00Z', ejercicios: [{id: 'dominada_asistida', series: [{kg: 30, reps: 8}]}, {id: 'hack', series: [{kg: 60, reps: 8}]}]},
  ];
  const [d30, h30] = w.rangoFechas('30', '2026-11-05', []);
  assert(d30 === '2026-10-07' && h30 === '2026-11-05', 'rango 30 días incluye hoy');
  const st = w.estadisticas(H, d30, h30);
  assert(st.total === 3 && st.porTipo.gluteo === 1 && st.porTipo.pilates === 1 && st.porTipo.espalda === 1 && st.porTipo.pierna === 0, 'cuenta por tipo en 30 días');
  assert(st.minutos === 95 && st.series === 4, 'minutos (sin pilates) y series');
  assert(st.volumen === 80 * 10 + 60 * 8, 'volumen solo con kg reales (sin asistencia ni plancha)');
  assert(st.marcas.hip_thrust_maquina.kg === 80 && !st.marcas.dominada_asistida && st.marcas.hack.kg === 60, 'marcas, sin la asistencia');
  const [dt] = w.rangoFechas('todo', '2026-11-05', H.map(h => h.fecha));
  const todo = w.estadisticas(H, dt, '2026-11-05');
  assert(dt === '2026-01-10' && todo.total === 4 && todo.marcas.sentadilla_multipower.kg === 55, 'rango «todo» desde el primer entreno');
  assert(Math.abs(w.estadisticas([H[3]], '2026-11-03', '2026-11-03').mediaSemana - 1) < 1e-9, 'media semanal no se dispara con rangos cortos');
  assert(w.nombreEjercicio('hack') === 'Sentadilla hack' && w.nombreEjercicio('xyz') === 'xyz', 'nombres de ejercicios retirados');
}

/* ---------- 15. Gráfica de peso ---------- */
{
  const reg = [];
  for (let k = 0; k < 20; k++) reg.push({fecha: w.sumarDias('2026-10-01', k), kg: 63 - k * 0.05 + (k % 2 ? 0.3 : 0)});
  const g = w.graficaPeso(reg, '2026-10-01', '2026-10-20', 340, 190);
  assert(g.ok && g.puntos.length === 20, 'gráfica con todos los puntos del rango');
  assert(g.puntos.every(p => p.x >= g.P.l - 1e-9 && p.x <= 340 - g.P.r + 1e-9 && p.y >= g.P.t - 1e-9 && p.y <= 190 - g.P.b + 1e-9), 'puntos dentro del área');
  assert(Math.abs(g.puntos[0].x - g.P.l) < 1e-9 && Math.abs(g.puntos[19].x - (340 - g.P.r)) < 1e-9, 'primer y último punto en los extremos');
  assert(!/NaN|undefined/.test(g.linea + g.lineaMedia), 'trazos sin NaN');
  const mm = w.mediaMovil(reg);
  assert(Math.abs(mm[6].media - reg.slice(0, 7).reduce((s, p) => s + p.kg, 0) / 7) < 1e-9, 'media móvil de 7 días');
  assert(!w.graficaPeso(reg, '2026-10-20', '2026-10-25', 340, 190).ok, 'con un solo punto no hay gráfica');
  const plano = w.graficaPeso([{fecha: '2026-10-01', kg: 62}, {fecha: '2026-10-02', kg: 62}], '2026-10-01', '2026-10-02', 340, 190);
  assert(plano.ok && plano.yMax > plano.yMin && !/NaN/.test(plano.linea), 'peso constante no rompe la escala');
}

/* ---------- 16. Flujo completo por la interfaz (clics reales) ---------- */
{
  const A = abrir(undefined, '2026-11-02T09:00:00'); // lunes, fijado antes de arrancar
  const W = A.w, doc = W.document;
  const click = (sel, v) => { const el = [...doc.querySelectorAll(sel)].find(e => v === undefined || e.dataset.v === v); if (!el) throw new Error('no existe ' + sel + ' ' + v); el.click(); };
  const escribir = (sel, i, v) => { const el = doc.querySelectorAll(sel)[i]; el.value = v; el.dispatchEvent(new W.Event('input', {bubbles: true})); };
  const est = () => W.eval('estado');
  const sem = l => est().semanas[l];
  assert(sem('2026-11-02').plan.length === 4 && sem('2026-11-09').plan.length === 4, 'plan inicial de esta semana y la siguiente');
  // Entrenos: quitar S y D esta semana, pasar a 3
  click('[data-a="tab"]', 'entrenos');
  assert(doc.querySelectorAll('.chip').length === 7 && doc.querySelectorAll('details.sesion').length === 6, 'entrenos: chips y sesiones');
  click('[data-a="disp"]', '6'); click('[data-a="disp"]', '5'); click('[data-a="dias"]', '-1');
  assert(sem('2026-11-02').dias === 3 && sem('2026-11-02').plan.every(p => p.dia <= 4), 'cambiar días replanifica sin S/D');
  // Próxima semana
  click('[data-a="sem"]', '1');
  assert(/La semana que viene/.test(doc.body.textContent) && !doc.querySelector('.dia [data-a="empezar"]'), 'próxima semana: se ve el plan sin botón de empezar');
  assert(sem('2026-11-09').dias === 3, 'la próxima hereda los 3 días');
  click('[data-a="dias"]', '1'); click('[data-a="dias"]', '1');
  assert(sem('2026-11-09').dias === 5 && sem('2026-11-02').dias === 3, 'cambiar la próxima no toca esta');
  // Pilates el miércoles de esta semana
  click('[data-a="sem"]', '0');
  click('[data-a="pilates-abrir"]'); click('[data-a="pilates-dia"]', '2026-11-04');
  assert(est().clases.length === 1 && /Pilates/.test(doc.body.textContent), 'pilates añadido y visible');
  // Pasado: no se pueden marcar días anteriores a hoy (es lunes: ninguno deshabilitado)
  W.__ahora = '2026-11-04T09:00:00'; W.render(); // miércoles
  assert([...doc.querySelectorAll('.chip[data-a="disp"]')].filter(c => c.disabled).length === 2, 'miércoles: L y M deshabilitados');
  click('[data-a="tab"]', 'inicio');
  assert(/Pilates/.test(doc.querySelector('.hero').textContent), 'inicio muestra pilates hoy');
  click('[data-a="clase-hecha"]');
  assert(est().historial.length === 1 && est().historial[0].sesion === 'pilates', 'pilates marcado desde inicio');
  // Entreno de gimnasio hoy (miércoles) si toca, si no, adelantar uno
  click('[data-a="tab"]', 'entrenos');
  const btn = doc.querySelector('.dia [data-a="empezar"]');
  const ses = btn.dataset.v; btn.click();
  assert(!doc.querySelector('nav.tabs') && /Calentamiento/.test(doc.body.textContent), 'entreno: calentamiento a pantalla completa');
  { const im = doc.querySelector('.musculos img'); assert(im && im.getAttribute('src') === SES[ses].imagen, 'al iniciar se ve la imagen de músculos de la sesión'); }
  click('[data-a="paso"]', '0');
  if (ses === 'pierna'){
    assert(doc.querySelector('.opt[data-v="prensa"] img') && doc.querySelector('.opt[data-v="pendulo"] img'), 'miniaturas en los ejercicios con imagen');
    click('[data-a="elegir"]', 'sentadilla_multipower');
    assert(doc.querySelectorAll('.serie.aprox').length === 2, 'multipower: 2 aproximaciones');
    assert(doc.querySelector('.card .musculos img').getAttribute('src') === 'sentadilla_multipower.webp', 'al elegir, se ve la imagen del ejercicio');
  } else click('[data-a="elegir"]', doc.querySelector('.opt').dataset.v);
  const nInputs = doc.querySelectorAll('input[data-in="reps"]').length;
  for (let k = 0; k < nInputs; k++){ if (doc.querySelectorAll('input[data-in="kg"]')[k]) escribir('input[data-in="kg"]', k, '40,5'); escribir('input[data-in="reps"]', k, '12'); }
  assert(doc.querySelectorAll('.serie.lista').length === nInputs, 'series marcadas al escribir reps');
  click('[data-a="paso"]', '1');
  const elegido0 = est().activo.bloques[0].ejercicio;
  assert(![...doc.querySelectorAll('.opt')].some(o => o.dataset.v === elegido0), 'no vuelve a ofrecer el ejercicio ya hecho');
  click('[data-a="salir"]');
  assert(JSON.parse(A.store['entreno.estado']).activo, 'entreno en curso guardado');
  click('[data-a="tab"]', 'inicio'); click('[data-a="continuar"]');
  for (let k = 2; k < SES[ses].bloques.length; k++) click('[data-a="paso"]', String(k));
  click('[data-a="terminar"]');
  const h = est().historial;
  assert(h.length === 2 && h[1].sesion === ses && h[1].fecha === '2026-11-04' && h[1].ejercicios.length === 1, 'entreno guardado con su ejercicio');
  assert(sem('2026-11-02').plan.some(p => p.dia === 2 && p.hecho && p.sesion === ses), 'plan marca el miércoles hecho');
  assert(/Entreno guardado/.test(doc.body.textContent), 'aviso de guardado');
  // Estadísticas desde inicio
  click('[data-a="vista"]', 'stats');
  assert(/Estadísticas/.test(doc.body.textContent) && doc.querySelectorAll('.barra').length === 7, 'estadísticas con 7 tipos');
  click('[data-a="rango"]', '365'); assert(doc.querySelector('.seg .on').dataset.v === '365', 'cambia de rango');
  click('[data-a="volver"]');
  // Peso: registrar varios días y ver evolución
  for (const [dia, kg] of [['2026-11-04', '62,3'], ['2026-11-05', '62,1'], ['2026-11-06', '61,9']]){
    W.__ahora = dia + 'T08:00:00'; W.render();
    doc.getElementById('peso-in').value = kg; click('[data-a="guardar-peso"]');
  }
  assert(est().peso.length === 3 && est().peso[2].kg === 61.9, 'tres registros de peso');
  click('[data-a="vista"]', 'peso');
  assert(doc.querySelector('.grafica svg path') && doc.querySelectorAll('.registro').length === 3, 'evolución: gráfica y lista');
  click('[data-a="peso-borrar"]', '2026-11-05');
  assert(est().peso.length === 2 && doc.querySelectorAll('.registro').length === 2, 'borrar un registro');
  click('[data-a="tab"]', 'comidas');
  assert(/1\.900 kcal/.test(doc.body.textContent) && doc.querySelectorAll('.card').length === 5, 'comidas: día + 4 comidas');
  // Cambio de semana: la que era «próxima» pasa a ser la actual con sus 5 días
  W.__ahora = '2026-11-09T09:00:00'; W.render();
  assert(sem('2026-11-09').dias === 5 && sem('2026-11-16'), 'al llegar el lunes, la próxima es la actual y se crea otra');
  // Descartar entreno en dos pasos
  click('[data-a="tab"]', 'inicio'); click('[data-a="empezar"]');
  click('[data-a="cancelar"]'); assert(est().activo, 'descartar pide confirmación');
  click('[data-a="cancelar-si"]'); assert(est().activo === null && est().historial.length === 2, 'descartado sin guardar');
  assert(A.errores.length === 0, 'flujo sin excepciones: ' + A.errores.join(' | '));
}

/* ---------- 17. Progresión: precarga y aviso de subir ---------- */
{
  const A = abrir(JSON.stringify({historial: [{id: 1, fecha: '2026-11-02', sesion: 'pierna', inicio: '2026-11-02T17:00:00Z', fin: '2026-11-02T18:00:00Z',
    ejercicios: [{id: 'sentadilla_multipower', bloque: 0, series: [{kg: 80, reps: 10}, {kg: 80, reps: 10}, {kg: 80, reps: 10}]}]}]}));
  const W = A.w, doc = W.document;
  W.__ahora = '2026-11-09T09:00:00'; W.render();
  W.eval("accion('empezar','pierna')"); W.eval("accion('paso','0')");
  assert(/Última vez: 80 kg × 10/.test(doc.querySelector('.opt[data-v="sentadilla_multipower"]').textContent), 'opción muestra la última vez');
  assert(doc.querySelector('.opt[data-v="prensa"] img') && doc.querySelector('.opt[data-v="pendulo"] img'), 'miniaturas en los ejercicios con imagen');
  W.eval("accion('elegir','sentadilla_multipower')");
  assert(doc.querySelector('.card .musculos img').getAttribute('src') === 'sentadilla_multipower.webp', 'al elegir, se ve la imagen del ejercicio');
  assert(doc.querySelector('input[data-in="kg"]').value === '80', 'precarga los kg');
  assert(/sube un poco el peso/.test(doc.body.textContent), 'aviso de doble progresión');
  assert(/≈ 40 kg/.test(doc.body.textContent) && /≈ 60 kg/.test(doc.body.textContent), 'aproximación sugerida al 50 % y 75 %');
  assert(A.errores.length === 0, 'sin excepciones');
}

/* ---------- 18. Migración desde v0.1 y v0.2 ---------- */
{
  const v01 = JSON.stringify({esquema: 1, semana: {disponibles: [0, 2, 4], dias: 3, lunes: null, plan: null}, ocultos: [], historial: []});
  let A = abrir(v01), e = A.w.eval('estado');
  assert(A.errores.length === 0 && igual(e.config.disponibles, [0, 2, 4]) && e.config.dias === 3 && !('semana' in e), 'v0.1: días pasan a config');
  const lunesHoy = A.w.lunesDe(new A.w.Date());
  const v02 = JSON.stringify({esquema: 1, semana: {disponibles: [0,1,2,3,4], dias: 5, lunes: lunesHoy, plan: [{dia: 0, sesion: 'pierna', hecho: true}], avisos: []},
    perfil: {altura: 170, edad: 18}, peso: [{fecha: '2026-11-01', kg: 62}], historial: [{id: 1, fecha: lunesHoy, sesion: 'pierna', inicio: null, fin: null,
    ejercicios: [{id: 'hack', bloque: 0, series: [{kg: 70, reps: 8}]}]}], activo: null});
  A = abrir(v02); e = A.w.eval('estado');
  assert(A.errores.length === 0 && e.config.dias === 5 && e.semanas[lunesHoy] && e.perfil.altura === 170 && e.peso.length === 1, 'v0.2: conserva semana, perfil y peso');
  A.w.eval("ui.tab='entrenos'"); A.w.render();
  assert(A.errores.length === 0 && /Sentadilla hack/.test(A.w.document.body.textContent), 'historial con hack se sigue viendo');
  A.w.eval("ui.vista='stats'"); A.w.render();
  assert(A.errores.length === 0, 'estadísticas con datos antiguos sin errores');
  const B = abrir(JSON.stringify({activo: {sesion: 'inexistente', bloques: []}}));
  assert(B.errores.length === 0 && B.w.eval('estado').activo === null, 'entreno activo corrupto se descarta');
}

/* ---------- Resumen ---------- */
console.log('\nPlanes por defecto (todos los días disponibles):');
const DN = ev('DIAS_CORTO');
for (let n = 1; n <= 6; n++) console.log(' ', n, '→', w.planificarSemana({dias: n, disponibles: TODOS}).plan.map(p => DN[p.dia] + ' ' + SES[p.sesion].nombre).join(' · '));
console.log(`\n${ok} comprobaciones correctas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
