import * as THREE from 'three';
import { step, HALF_SIZE, type Body, type MoveInput } from './movement.ts';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const joy = document.getElementById('joy')!;
const knob = joy.firstElementChild as HTMLElement;
const cx = document.getElementById('cx')!, cz = document.getElementById('cz')!;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

// ---------- Escena ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d2416);
scene.fog = new THREE.Fog(0x1d2416, 25, 60);
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);

scene.add(new THREE.HemisphereLight(0xf4f1e4, 0x2a3420, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(12, 20, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -HALF_SIZE - 2, right: HALF_SIZE + 2, top: HALF_SIZE + 2, bottom: -HALF_SIZE - 2 });
scene.add(sun);

const size = HALF_SIZE * 2;
// Suelo con cuadrícula de 1 m dibujada en una textura (las líneas GL de 1 px se pierden en algunas GPU)
const tile = document.createElement('canvas');
tile.width = tile.height = 128;
const g2 = tile.getContext('2d')!;
g2.fillStyle = '#4d5a3a';
g2.fillRect(0, 0, 128, 128);
g2.strokeStyle = 'rgba(214, 222, 186, 0.28)';
g2.lineWidth = 4;
g2.strokeRect(0, 0, 128, 128);
const groundTex = new THREE.CanvasTexture(tile);
groundTex.colorSpace = THREE.SRGBColorSpace;
groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
groundTex.repeat.set(size, size);
groundTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
// Ejes centrales en dorado, para orientarse
const axisMat = new THREE.MeshBasicMaterial({ color: 0xffc83d, transparent: true, opacity: 0.55 });
for (const rot of [0, Math.PI / 2]) {
  const axis = new THREE.Mesh(new THREE.PlaneGeometry(0.08, size), axisMat);
  axis.rotation.set(-Math.PI / 2, 0, rot);
  axis.position.y = 0.01;
  scene.add(axis);
}

// Bordes y algunas referencias para notar el desplazamiento
const edgeMat = new THREE.MeshStandardMaterial({ color: 0x2a3420 });
for (const [w, d, x, z] of [[size + 1, 0.5, 0, -HALF_SIZE - 0.25], [size + 1, 0.5, 0, HALF_SIZE + 0.25], [0.5, size, -HALF_SIZE - 0.25, 0], [0.5, size, HALF_SIZE + 0.25, 0]]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.6, d), edgeMat);
  m.position.set(x, 0.3, z);
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
}
const crateMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3e, roughness: 0.9 });
for (const [x, z, s] of [[6, -5, 1.2], [-8, 4, 1.6], [12, 10, 1], [-13, -12, 2], [3, 14, 1.4], [-4, -16, 1]]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), crateMat);
  m.position.set(x, s / 2, z);
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
}

// Jugador: cuerpo + "visor" para ver hacia dónde mira
const player = new THREE.Group();
const bodyMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.8, 6, 16), new THREE.MeshStandardMaterial({ color: 0xffc83d, roughness: 0.5 }));
bodyMesh.position.y = 0.8;
bodyMesh.castShadow = true;
const visor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.2), new THREE.MeshStandardMaterial({ color: 0x141a0f }));
visor.position.set(0, 1.25, 0.36);
player.add(bodyMesh, visor);
scene.add(player);

// ---------- Entrada: joystick táctil/ratón + teclado ----------
const JOY_R = 50;
let joyId: number | null = null;
const stick: MoveInput = { x: 0, z: 0 };

function moveKnob(e: PointerEvent) {
  const r = joy.getBoundingClientRect();
  let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  const d = Math.hypot(dx, dy);
  if (d > JOY_R) { dx *= JOY_R / d; dy *= JOY_R / d; }
  stick.x = dx / JOY_R; stick.z = dy / JOY_R;
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
}
function releaseJoy() {
  joyId = null; stick.x = stick.z = 0;
  knob.style.transform = '';
  joy.classList.remove('on');
}
joy.addEventListener('pointerdown', (e) => {
  if (joyId !== null) return;
  joyId = e.pointerId;
  joy.classList.add('on');
  try { joy.setPointerCapture(e.pointerId); } catch { /* puntero ya liberado */ }
  moveKnob(e);
});
joy.addEventListener('pointermove', (e) => { if (e.pointerId === joyId) moveKnob(e); });
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const)
  joy.addEventListener(ev, (e) => { if (e.pointerId === joyId) releaseJoy(); });
joy.addEventListener('contextmenu', (e) => e.preventDefault());

const keys = new Set<string>();
addEventListener('keydown', (e) => { if (/^(Key[WASD]|Arrow)/.test(e.code)) { keys.add(e.code); e.preventDefault(); } });
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); releaseJoy(); });

function readInput(): MoveInput {
  if (joyId !== null) return stick;
  const k = (...c: string[]) => (c.some((x) => keys.has(x)) ? 1 : 0);
  const x = k('KeyD', 'ArrowRight') - k('KeyA', 'ArrowLeft');
  const z = k('KeyS', 'ArrowDown') - k('KeyW', 'ArrowUp');
  const m = Math.hypot(x, z) || 1;
  return { x: x / m, z: z / m };
}

// ---------- Bucle ----------
let body: Body = { x: 0, z: 0, heading: Math.PI, speed: 0 };
const camOffset = new THREE.Vector3(0, 9, 11);
const camTarget = new THREE.Vector3();
let last = performance.now(), running = true;

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // En vertical se aleja un poco la cámara para ver lo mismo de ancho
  camera.fov = w < h ? 70 : 55;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

function frame(now: number) {
  if (!running) return;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  body = step(body, readInput(), dt);
  player.position.set(body.x, 0, body.z);
  // Giro suave hacia la dirección de marcha (por el camino más corto)
  let dh = body.heading - player.rotation.y;
  dh = Math.atan2(Math.sin(dh), Math.cos(dh));
  player.rotation.y += reduceMotion.matches ? dh : dh * Math.min(1, dt * 14);
  // Balanceo al andar (desactivado con "reducir movimiento")
  bodyMesh.position.y = 0.8 + (reduceMotion.matches ? 0 : Math.abs(Math.sin(now / 110)) * 0.08 * (body.speed / 6));

  camTarget.set(body.x, 0, body.z).add(camOffset);
  if (reduceMotion.matches) camera.position.copy(camTarget);
  else camera.position.lerp(camTarget, Math.min(1, dt * 6));
  camera.lookAt(body.x, 0.8, body.z);

  cx.textContent = body.x.toFixed(1);
  cz.textContent = body.z.toFixed(1);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
camera.position.copy(camOffset);
requestAnimationFrame(frame);

// Ciclo de vida: se pausa al pasar a segundo plano
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { running = false; keys.clear(); releaseJoy(); }
  else if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
});
