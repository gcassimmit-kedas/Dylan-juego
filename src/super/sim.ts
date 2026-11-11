// Supermercado: simulación pura (sin DOM ni Three.js), para poder probarla con `npm test`.
// Todo lo que pasa en la tienda (clientes, existencias, dinero) se decide aquí; main.ts solo lo dibuja.

/** Datos de cada producto. Precios en pesos dominicanos (RD$), siempre enteros. */
export interface Product {
  nombre: string;
  /** Unidades que trae cada caja del proveedor. */
  caja: number;
  /** Lo que cuesta una caja en el ordenador. */
  costoCaja: number;
  /** Precio de venta de una unidad. */
  precio: number;
  /** Unidades que caben en su estantería. */
  capacidad: number;
  /** Probabilidad relativa de que un cliente lo busque. */
  demanda: number;
  /** Fruta (se vende en mesa de fruta). */
  fruta?: boolean;
  /**
   * Difícil de conseguir: el proveedor solo tiene unas pocas cajas algunos días.
   * Si un cliente no la encuentra no se enfada (sabe que es difícil de encontrar).
   */
  rara?: boolean;
}

export const PRODUCTS = {
  // Precios de supermercado dominicano: nada cuesta menos de 55 pesos y todo es múltiplo de 5.
  // La caja del proveedor sale a algo más de la mitad de lo que se saca vendiéndola.
  pan: { nombre: 'Pan de molde', caja: 8, costoCaja: 520, precio: 120, capacidad: 12, demanda: 1.3 },
  leche: { nombre: 'Leche', caja: 6, costoCaja: 250, precio: 75, capacidad: 12, demanda: 1.3 },
  yogur: { nombre: 'Yogur', caja: 8, costoCaja: 260, precio: 60, capacidad: 16, demanda: 0.9 },
  queso: { nombre: 'Queso', caja: 4, costoCaja: 550, precio: 250, capacidad: 8, demanda: 0.7 },
  cereales: { nombre: 'Cereales', caja: 6, costoCaja: 720, precio: 220, capacidad: 12, demanda: 0.9 },
  galletas: { nombre: 'Galletas', caja: 10, costoCaja: 360, precio: 65, capacidad: 15, demanda: 1 },
  refresco: { nombre: 'Refresco', caja: 12, costoCaja: 630, precio: 95, capacidad: 18, demanda: 1.1 },
  agua: { nombre: 'Agua', caja: 12, costoCaja: 360, precio: 55, capacidad: 18, demanda: 1 },
  manzanas: { nombre: 'Manzanas', caja: 20, costoCaja: 660, precio: 60, capacidad: 30, demanda: 1, fruta: true },
  guineos: { nombre: 'Guineos', caja: 12, costoCaja: 460, precio: 70, capacidad: 24, demanda: 1, fruta: true },
  // Difíciles de conseguir: las más caras de la tienda.
  fresas: { nombre: 'Fresas', caja: 6, costoCaja: 1150, precio: 350, capacidad: 12, demanda: 0.35, fruta: true, rara: true },
  uvas: { nombre: 'Uvas', caja: 6, costoCaja: 1150, precio: 350, capacidad: 12, demanda: 0.35, fruta: true, rara: true },
} as const satisfies Record<string, Product>;

const isRara = (p: ProductId) => (PRODUCTS[p] as Product).rara === true;
export const esRara = isRara;

export type ProductId = keyof typeof PRODUCTS;
export const PRODUCT_IDS = Object.keys(PRODUCTS) as ProductId[];

export interface Point { x: number; z: number }

/** Mueble donde se expone cada producto. `rot` es hacia dónde mira el frente (radianes, 0 = +z). */
export interface Display {
  product: ProductId;
  tipo: 'gondola' | 'nevera' | 'fruta' | 'panera';
  x: number;
  z: number;
  rot: number;
  /** Punto del pasillo donde se para el cliente para coger el producto. */
  pick: Point;
}

/**
 * Plano de la tienda (metros). La tienda va de x = -9.5 a 9.5 y de z = -7.5 (fondo) a 7.5 (fachada).
 * Todos los muebles miran hacia la fachada (+z), que es desde donde mira la cámara.
 */
export const DISPLAYS: Display[] = [
  { product: 'cereales', tipo: 'gondola', x: -4.7, z: -3.3, rot: 0, pick: { x: -4.7, z: -2.4 } },
  { product: 'galletas', tipo: 'gondola', x: -0.7, z: -3.3, rot: 0, pick: { x: -0.7, z: -2.4 } },
  { product: 'pan', tipo: 'panera', x: 3.4, z: -3.3, rot: 0, pick: { x: 3.4, z: -2.4 } },
  { product: 'refresco', tipo: 'gondola', x: -4.7, z: 0, rot: 0, pick: { x: -4.7, z: 0.9 } },
  { product: 'agua', tipo: 'gondola', x: -0.7, z: 0, rot: 0, pick: { x: -0.7, z: 0.9 } },
  { product: 'manzanas', tipo: 'fruta', x: 3.4, z: 0, rot: 0, pick: { x: 3.4, z: 1.1 } },
  { product: 'guineos', tipo: 'fruta', x: 6.6, z: 0, rot: 0, pick: { x: 6.6, z: 1.1 } },
  { product: 'fresas', tipo: 'fruta', x: 6.1, z: -3.3, rot: 0, pick: { x: 6.1, z: -2.2 } },
  { product: 'uvas', tipo: 'fruta', x: 8.25, z: -3.3, rot: 0, pick: { x: 8.25, z: -2.2 } },
  { product: 'leche', tipo: 'nevera', x: -5.6, z: -6.95, rot: 0, pick: { x: -5.6, z: -5.7 } },
  { product: 'yogur', tipo: 'nevera', x: -1.6, z: -6.95, rot: 0, pick: { x: -1.6, z: -5.7 } },
  { product: 'queso', tipo: 'nevera', x: 2.4, z: -6.95, rot: 0, pick: { x: 2.4, z: -5.7 } },
];

/** Tamaño (ancho, fondo) de cada tipo de mueble, para que los clientes los rodeen. */
export const FOOTPRINT: Record<Display['tipo'], [number, number]> = {
  gondola: [3.0, 0.6], nevera: [2.2, 0.8], fruta: [1.8, 1.1], panera: [2.6, 0.6],
};

export const LAYOUT = {
  /** Fuera, delante de la puerta automática. */
  street: { x: 6, z: 9 },
  /** Justo al pasar la puerta. */
  entry: { x: 6, z: 5.4 },
  /** Cajas registradoras (el empleado está detrás, en z mayor). La 1 es la del anfitrión (o del que juega solo). */
  registers: [{ x: 3.6, z: 4.25 }, { x: -3.4, z: 4.25 }] as const,
  /** La caja 1 (alias de registers[0]). */
  register: { x: 3.6, z: 4.25 },
  /** Hueco de la cola de una caja: el 0 es el que está pagando. */
  queue: (i: number, k = 0): Point => ({ x: LAYOUT.registers[k].x - 0.2 - i * 0.85, z: 3.3 }),
  queueMax: 6,
  /** Ordenador de pedidos (oficina). */
  computer: { x: -7.6, z: 5.6 },
  /** Palés del almacén (fondo a la derecha). */
  storage: { x: 8.1, z: -5.6 },
  /** Donde está el cajero de cada caja. */
  cashier: { x: 3.9, z: 5.0 },
  cashiers: [{ x: 3.9, z: 5.0 }, { x: -3.1, z: 5.0 }] as const,
  /** Puerta automática de la fachada. */
  door: { x: 6, w: 2.4 },
};

/** Duración de un turno en segundos de juego (la tienda abre de 8:00 a 20:00). */
export const SHIFT_SECONDS = 150;
export const OPEN_HOUR = 8;
export const CLOSE_HOUR = 20;
const WALK_SPEED = 1.5;
const PICK_TIME = 1.1;
const QUEUE_PATIENCE = 38;
const MAX_IN_STORE = 12;

export type CustomerState = 'entrando' | 'yendo' | 'cogiendo' | 'cola' | 'saliendo' | 'fuera';

export interface Customer {
  id: number;
  x: number;
  z: number;
  /** Hacia dónde camina (para orientar el modelo). */
  dir: number;
  andando: boolean;
  path: Point[];
  estado: CustomerState;
  /** Lo que viene a comprar, en orden. */
  lista: { product: ProductId; qty: number }[];
  paso: number;
  cesta: { product: ProductId; qty: number }[];
  timer: number;
  /** Segundos que aguanta en la cola. */
  paciencia: number;
  pacienciaMax: number;
  escaneados: number;
  /** Unidades de cada producto ya pasadas por el escáner. */
  pasados: Partial<Record<ProductId, number>>;
  /** Billete con el que paga (0 mientras se escanea). Con tarjeta, el importe justo. */
  pago: number;
  /** Paga con tarjeta: no hay cambio que dar. */
  tarjeta: boolean;
  enfadado: boolean;
  /** Caja en cuya cola está (-1 si todavía no hace cola). */
  caja: number;
  /** Semilla de aspecto (ropa, pelo, piel) para que cada cliente se vea distinto. */
  look: number;
}

export type GameEvent =
  | { tipo: 'entra'; id: number }
  | { tipo: 'falta'; product: ProductId; id: number }
  | { tipo: 'coge'; product: ProductId; qty: number; id: number }
  | { tipo: 'escanea'; id: number; product: ProductId; caja: number }
  | { tipo: 'paga'; billete: number; total: number; id: number; caja: number; tarjeta: boolean }
  | { tipo: 'venta'; importe: number; cambio: number; sobra: number; propina: number; id: number; caja: number; tarjeta: boolean }
  | { tipo: 'compra'; j: number; coste: number; lineas: [ProductId, number][] }
  | { tipo: 'mejora'; j: number; caja: number; mejora: MejoraId }
  | { tipo: 'seVa'; id: number }
  | { tipo: 'cierre' }
  | { tipo: 'fin' };

export interface ShiftStats {
  clientes: number;
  atendidos: number;
  perdidos: number;
  /** Clientes que se fueron de la cola por esperar demasiado. */
  cansados: number;
  articulos: number;
  faltas: number;
}

/** Cada jugador tiene su dinero; los ingresos y gastos son los del día. */
export interface Jugador {
  dinero: number;
  ingresos: number;
  gastos: number;
  /** Dinero perdido hoy por dar cambio de más. */
  cambioDeMas: number;
}

export interface Caja {
  /** Ids de clientes en la cola, por orden (el primero está en la caja). */
  cola: number[];
  /** La caja 2 solo abre cuando hay un segundo jugador. */
  abierta: boolean;
  musica: boolean;
  /** Su cajero necesita una ducha: los clientes de esa cola aguantan menos. */
  sucio?: boolean;
  propinas: boolean;
}

/** Mejoras de las cajas: cualquiera de los dos jugadores puede comprarlas para su caja o para la del otro. */
export const MEJORAS = {
  musica: { nombre: 'Música relajante', coste: 2000, desc: 'Los clientes de esta caja aguantan un 50 % más en la cola.' },
  propinas: { nombre: 'Bote de propinas', coste: 3500, desc: 'Los clientes contentos de esta caja dejan un 10 % de propina.' },
} as const;
export type MejoraId = keyof typeof MEJORAS;
export const MEJORA_IDS = Object.keys(MEJORAS) as MejoraId[];

export type Phase = 'preparacion' | 'turno' | 'resumen';

export interface GameState {
  fase: Phase;
  dia: number;
  /** Jugador 1 (anfitrión o el que juega solo) y jugador 2. */
  jugadores: [Jugador, Jugador];
  cajas: [Caja, Caja];
  /** 0 a 100: con más reputación llegan más clientes. */
  reputacion: number;
  almacen: Record<ProductId, number>;
  estantes: Record<ProductId, number>;
  reloj: number;
  proximoCliente: number;
  clientes: Customer[];
  stats: ShiftStats;
  eventos: GameEvent[];
  seed: number;
  nextId: number;
  mejorDia: number;
  /** Cajas que le quedan hoy al proveedor de cada producto difícil de conseguir. */
  ofertaRara: Partial<Record<ProductId, number>>;
}

const emptyStats = (): ShiftStats => ({ clientes: 0, atendidos: 0, perdidos: 0, cansados: 0, articulos: 0, faltas: 0 });
const nuevoJugador = (dinero: number): Jugador => ({ dinero, ingresos: 0, gastos: 0, cambioDeMas: 0 });
const nuevaCaja = (abierta: boolean): Caja => ({ cola: [], abierta, musica: false, propinas: false });
/** Dinero con el que empieza cada jugador. */
export const DINERO_INICIAL = 1500;
const byProduct = (f: (id: ProductId) => number) => Object.fromEntries(PRODUCT_IDS.map((id) => [id, f(id)])) as Record<ProductId, number>;

/** Partida nueva: poco dinero y poco género, para que haya que gestionar desde el primer día. */
export function newGame(seed = 1): GameState {
  const s = crearPartida(seed);
  sortearOferta(s);
  // El primer día siempre hay algo de lo difícil, para que se descubra.
  for (const p of PRODUCT_IDS) if (isRara(p)) s.ofertaRara[p] = Math.max(1, s.ofertaRara[p] ?? 0);
  return s;
}

function crearPartida(seed: number): GameState {
  const start: Partial<Record<ProductId, [number, number]>> = {
    pan: [6, 8], leche: [6, 6], yogur: [8, 0], queso: [4, 0], cereales: [6, 0],
    galletas: [8, 10], refresco: [10, 12], agua: [10, 0], manzanas: [15, 20],
    guineos: [12, 0], fresas: [4, 0], uvas: [4, 0],
  };
  return {
    fase: 'preparacion',
    dia: 1,
    jugadores: [nuevoJugador(DINERO_INICIAL), nuevoJugador(DINERO_INICIAL)],
    cajas: [nuevaCaja(true), nuevaCaja(false)],
    reputacion: 50,
    estantes: byProduct((id) => start[id]?.[0] ?? 0),
    almacen: byProduct((id) => start[id]?.[1] ?? 0),
    reloj: 0,
    proximoCliente: 1.5,
    clientes: [],
    stats: emptyStats(),
    eventos: [],
    seed: seed >>> 0 || 1,
    nextId: 1,
    mejorDia: 0,
    ofertaRara: {},
  };
}

/** Lo que tiene hoy el proveedor de los productos difíciles: algunos días nada, otros 1 o 2 cajas. */
export function sortearOferta(s: GameState) {
  s.ofertaRara = {};
  for (const p of PRODUCT_IDS) if (isRara(p)) s.ofertaRara[p] = rand(s) < 0.35 ? 0 : 1 + Math.floor(rand(s) * 2);
}

/** Cajas que se pueden pedir hoy de un producto (sin límite si no es difícil de conseguir). */
/**
 * Dónde se compra: el ordenador de la tienda (todo, con las fresas y uvas limitadas), el Mayorista de
 * enfrente (lo de siempre un 15 % más barato, sin fruta) y la Frutería (solo fruta; fresas y uvas
 * siempre, pero un 25 % más caras). A las tiendas de fuera hay que ir andando.
 */
export const PROVEEDORES = {
  ordenador: { nombre: 'Ordenador', factor: 1, factorRara: 1 },
  mayorista: { nombre: 'Mayorista', factor: 0.85, factorRara: 1 },
  fruteria: { nombre: 'Frutería', factor: 1, factorRara: 1.25 },
} as const;
export type ProveedorId = keyof typeof PROVEEDORES;
export const esProveedor = (v: unknown): v is ProveedorId => typeof v === 'string' && v in PROVEEDORES;

/** ¿Vende este proveedor este producto? */
export function vende(prov: ProveedorId, p: ProductId): boolean {
  const fruta = (PRODUCTS[p] as Product).fruta === true;
  return prov === 'ordenador' || (prov === 'mayorista' ? !fruta : fruta);
}

/** Precio de una caja según dónde se compre (redondeado a 10 pesos). */
export function costeCaja(p: ProductId, prov: ProveedorId = 'ordenador'): number {
  const base = PRODUCTS[p].costoCaja, f = isRara(p) ? PROVEEDORES[prov].factorRara : PROVEEDORES[prov].factor;
  return f === 1 ? base : Math.round((base * f) / 10) * 10;
}

/** Cajas que se pueden pedir hoy de un producto (sin límite si no es difícil de conseguir o en la Frutería). */
export const disponibles = (s: GameState, p: ProductId, prov: ProveedorId = 'ordenador') =>
  !vende(prov, p) ? 0 : isRara(p) && prov === 'ordenador' ? s.ofertaRara[p] ?? 0 : Infinity;

/** Generador pseudoaleatorio con la semilla guardada en el estado (mulberry32): partidas reproducibles en los tests. */
export function rand(s: GameState): number {
  s.seed = (s.seed + 0x6d2b79f5) >>> 0;
  let t = s.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const displayOf = (p: ProductId) => DISPLAYS.find((d) => d.product === p)!;

// ---------- Acciones del jugador ----------

export type BuyResult = { ok: true; coste: number } | { ok: false; motivo: 'dinero' | 'cantidad' | 'agotado' };

const jugadorValido = (j: number) => j === 0 || j === 1;

/** Compra cajas en el ordenador con el dinero del jugador `j`. Llegan al almacén (compartido) al momento. */
export function comprar(s: GameState, p: ProductId, cajas = 1, j = 0, prov: ProveedorId = 'ordenador'): BuyResult {
  if (!Number.isInteger(cajas) || cajas <= 0 || !jugadorValido(j) || !esProveedor(prov)) return { ok: false, motivo: 'cantidad' };
  if (cajas > disponibles(s, p, prov)) return { ok: false, motivo: 'agotado' };
  const coste = costeCaja(p, prov) * cajas, jug = s.jugadores[j];
  if (coste > jug.dinero) return { ok: false, motivo: 'dinero' };
  if (isRara(p) && prov === 'ordenador') s.ofertaRara[p] = (s.ofertaRara[p] ?? 0) - cajas;
  jug.dinero -= coste;
  s.almacen[p] += PRODUCTS[p].caja * cajas;
  jug.gastos += coste;
  return { ok: true, coste };
}

/** Compra varios productos de una vez (el carrito del ordenador). Si no llega el dinero, no se compra nada. */
export function comprarPedido(s: GameState, pedido: Partial<Record<ProductId, number>>, j = 0, prov: ProveedorId = 'ordenador'): BuyResult {
  if (!jugadorValido(j) || !esProveedor(prov)) return { ok: false, motivo: 'cantidad' };
  const lineas = PRODUCT_IDS.map((p) => [p, pedido[p] ?? 0] as const).filter(([, n]) => n !== 0);
  if (!lineas.length || lineas.some(([, n]) => !Number.isInteger(n) || n < 0 || n > 99)) return { ok: false, motivo: 'cantidad' };
  if (lineas.some(([p, n]) => n > disponibles(s, p, prov))) return { ok: false, motivo: 'agotado' };
  const coste = costePedido(pedido, prov);
  if (coste > s.jugadores[j].dinero) return { ok: false, motivo: 'dinero' };
  for (const [p, n] of lineas) if (n > 0) comprar(s, p, n, j, prov);
  // El otro jugador ve lo que se ha comprado.
  s.eventos.push({ tipo: 'compra', j, coste, lineas: lineas.map(([p, n]) => [p, n]) });
  return { ok: true, coste };
}

/** Compra una mejora para una caja (la propia o la del compañero) con el dinero del jugador `j`. */
export function mejorar(s: GameState, mejora: MejoraId, caja: number, j = 0): { ok: true; coste: number } | { ok: false; motivo: 'dinero' | 'ya' | 'cantidad' } {
  if (!jugadorValido(j) || !(caja === 0 || caja === 1) || !(mejora in MEJORAS)) return { ok: false, motivo: 'cantidad' };
  const k = s.cajas[caja];
  if (k[mejora]) return { ok: false, motivo: 'ya' };
  const coste = MEJORAS[mejora].coste, jug = s.jugadores[j];
  if (coste > jug.dinero) return { ok: false, motivo: 'dinero' };
  jug.dinero -= coste;
  jug.gastos += coste;
  k[mejora] = true;
  s.eventos.push({ tipo: 'mejora', j, caja, mejora });
  return { ok: true, coste };
}

/**
 * Abre o cierra una caja (la 2 abre cuando entra el segundo jugador). Al cerrarla, su cola pasa
 * a la otra caja abierta; si no queda ninguna, esos clientes dejan la compra y se van.
 */
export function abrirCaja(s: GameState, k: number, abierta: boolean) {
  if (!(k === 0 || k === 1)) return;
  const caja = s.cajas[k];
  caja.abierta = abierta;
  if (abierta || !caja.cola.length) return;
  const otra = s.cajas.findIndex((c, i) => i !== k && c.abierta);
  for (const id of caja.cola) {
    const c = s.clientes.find((x) => x.id === id);
    if (!c) continue;
    if (otra >= 0 && s.cajas[otra].cola.length < LAYOUT.queueMax) {
      c.caja = otra; c.pago = 0; c.escaneados = 0; c.pasados = {};
      s.cajas[otra].cola.push(id);
    } else {
      devolver(s, c); c.caja = -1; s.stats.perdidos++;
      s.eventos.push({ tipo: 'seVa', id });
      salir(c, { x: c.x, z: c.z });
    }
  }
  caja.cola = [];
  if (otra >= 0) avanzarCola(s, otra);
}

export const costePedido = (pedido: Partial<Record<ProductId, number>>, prov: ProveedorId = 'ordenador') =>
  PRODUCT_IDS.reduce((t, p) => t + costeCaja(p, prov) * Math.max(0, pedido[p] ?? 0), 0);

/** Lleva género del almacén a su estantería, hasta llenarla. Devuelve las unidades repuestas. */
export function reponer(s: GameState, p: ProductId): number {
  const n = Math.min(PRODUCTS[p].capacidad - s.estantes[p], s.almacen[p]);
  if (n <= 0) return 0;
  s.almacen[p] -= n;
  s.estantes[p] += n;
  return n;
}

export function empezarTurno(s: GameState) {
  if (s.fase !== 'preparacion') return;
  s.fase = 'turno';
  s.reloj = 0;
  s.proximoCliente = 1.5;
  s.clientes = [];
  for (const k of s.cajas) k.cola = [];
  s.eventos = [];
  // Los gastos de preparación (pedidos antes de abrir) cuentan para el día.
}

/** Tras ver el resumen: se prepara el día siguiente. */
export function siguienteDia(s: GameState) {
  if (s.fase !== 'resumen') return;
  s.fase = 'preparacion';
  s.dia += 1;
  s.stats = emptyStats();
  for (const j of s.jugadores) { j.ingresos = 0; j.gastos = 0; j.cambioDeMas = 0; }
  sortearOferta(s);
}

/** El cliente que está ahora en la caja `k`, si ya ha llegado a ella. */
export function clienteEnCaja(s: GameState, k = 0): Customer | null {
  const caja = s.cajas[k];
  if (!caja) return null;
  const c = s.clientes.find((x) => x.id === caja.cola[0]);
  return c && c.estado === 'cola' && c.path.length === 0 ? c : null;
}

export const totalArticulos = (c: Customer) => c.cesta.reduce((t, l) => t + l.qty, 0);
export const importe = (c: Customer) => c.cesta.reduce((t, l) => t + l.qty * PRODUCTS[l.product].precio, 0);

/** Producto que toca escanear ahora en la cesta del cliente (el primero que falte). */
export function siguienteArticulo(c: Customer): ProductId | null {
  for (const l of c.cesta) if ((c.pasados[l.product] ?? 0) < l.qty) return l.product;
  return null;
}

/** Lo que suma lo escaneado hasta ahora. */
export const importeEscaneado = (c: Customer) =>
  c.cesta.reduce((t, l) => t + Math.min(l.qty, c.pasados[l.product] ?? 0) * PRODUCTS[l.product].precio, 0);

/** Billetes de pesos con los que pagan los clientes. */
export const BILLETES = [50, 100, 200, 500, 1000, 2000] as const;
/** Lo que hay en el cajón para dar el cambio: monedas de 5, 10 y 25 y billetes de 50, 100, 200 y 500.
 *  (Los precios son múltiplos de 5, así que la moneda de 1 no hace falta.) */
export const CAMBIO = [5, 10, 25, 50, 100, 200, 500] as const;
/** Valores que son moneda (el resto son billetes). */
export const esMoneda = (v: number) => v < 50;

/** Con qué paga el cliente: a veces el importe justo; si no, el billete justo por encima del total o uno mayor. */
function elegirPago(s: GameState, total: number): number {
  const r = rand(s);
  if (r < 0.12) return total;
  const i = BILLETES.findIndex((b) => b >= total);
  if (i === -1) return Math.ceil(total / 1000) * 1000;
  return r > 0.7 && i < BILLETES.length - 1 ? BILLETES[i + 1] : BILLETES[i];
}

export const cambioDebido = (c: Customer) => (c.pago ? c.pago - importe(c) : 0);
/** Probabilidad de que un cliente pague con tarjeta. */
export const PROB_TARJETA = 0.4;

/**
 * El jugador pasa un producto por el escáner (si no dice cuál, el siguiente que falte).
 * Al pasar el último, el cliente paga con un billete y hay que darle el cambio.
 */
export function escanear(s: GameState, product?: ProductId, k = 0): { pagaCon: number } | { escaneado: ProductId } | null {
  if (s.fase !== 'turno') return null;
  const c = clienteEnCaja(s, k);
  if (!c || c.pago) return null;
  const p = product ?? siguienteArticulo(c);
  const linea = p && c.cesta.find((l) => l.product === p);
  if (!p || !linea || (c.pasados[p] ?? 0) >= linea.qty) return null;
  c.pasados[p] = (c.pasados[p] ?? 0) + 1;
  c.escaneados++;
  s.eventos.push({ tipo: 'escanea', id: c.id, product: p, caja: k });
  if (c.escaneados < totalArticulos(c)) return { escaneado: p };
  const total = importe(c);
  // Unos 4 de cada 10 pagan con tarjeta (el importe justo); el resto, en efectivo.
  c.tarjeta = rand(s) < PROB_TARJETA;
  c.pago = c.tarjeta ? total : elegirPago(s, total);
  s.eventos.push({ tipo: 'paga', billete: c.pago, total, id: c.id, caja: k, tarjeta: c.tarjeta });
  return { pagaCon: c.pago };
}

/**
 * Entrega el cambio. Si falta, el cliente no se va. Si sobra, la venta se cierra pero se pierde lo que sobra.
 */
export function darCambio(s: GameState, cambio: number, k = 0): { ok: true; sobra: number; propina: number } | { ok: false; falta: number } | null {
  if (s.fase !== 'turno' || !Number.isInteger(cambio) || cambio < 0) return null;
  const c = clienteEnCaja(s, k);
  if (!c || !c.pago) return null;
  const debido = cambioDebido(c);
  if (c.tarjeta && cambio !== 0) return null; // con tarjeta no hay cambio
  if (cambio < debido) return { ok: false, falta: debido - cambio };
  if (cambio > c.pago) return null; // no se puede dar más de lo que entregó... ni tiene sentido
  const total = importe(c), sobra = cambio - debido;
  // El dinero de la venta es del jugador de esa caja (caja 1: jugador 1; caja 2: jugador 2).
  const jug = s.jugadores[k];
  const propina = s.cajas[k].propinas && !c.enfadado ? Math.round((total * 0.1) / 5) * 5 : 0;
  jug.dinero += c.pago - cambio + propina;
  jug.ingresos += total - sobra + propina;
  jug.cambioDeMas += sobra;
  s.stats.articulos += totalArticulos(c);
  s.stats.atendidos++;
  s.reputacion = Math.min(100, s.reputacion + (c.enfadado ? 0 : 2));
  s.eventos.push({ tipo: 'venta', importe: total - sobra, cambio, sobra, propina, id: c.id, caja: k, tarjeta: c.tarjeta });
  s.cajas[k].cola.shift();
  salir(c, LAYOUT.queue(0, k));
  avanzarCola(s, k);
  return { ok: true, sobra, propina };
}

/** Cobra con el datáfono a un cliente que paga con tarjeta. */
export function cobrarTarjeta(s: GameState, k = 0): ReturnType<typeof darCambio> {
  const c = clienteEnCaja(s, k);
  if (!c || !c.pago || !c.tarjeta) return null;
  return darCambio(s, 0, k);
}

// ---------- Simulación ----------

// ---------- Caminos (A* sobre una rejilla de 25 cm) ----------

interface Rect { x0: number; z0: number; x1: number; z1: number }
const CELL = 0.25;
const GRID = { x0: -9.5, z0: -7.5, x1: 9.5, z1: 9.5 };
const GW = Math.round((GRID.x1 - GRID.x0) / CELL), GH = Math.round((GRID.z1 - GRID.z0) / CELL);
/** Distancia que se mantiene a muebles y paredes (radio de una persona). */
const CLEARANCE = 0.3;

/** Obstáculos fijos: muebles, mostrador, oficina, almacén y la fachada (menos la puerta). */
export function obstacles(): Rect[] {
  const out: Rect[] = [];
  for (const d of DISPLAYS) {
    const [w, dep] = FOOTPRINT[d.tipo];
    const side = Math.abs(Math.sin(d.rot)) > 0.5;
    const hw = (side ? dep : w) / 2, hd = (side ? w : dep) / 2;
    out.push({ x0: d.x - hw, z0: d.z - hd, x1: d.x + hw, z1: d.z + hd });
  }
  for (const r of LAYOUT.registers) out.push({ x0: r.x - 1.45, z0: r.z - 0.38, x1: r.x + 0.85, z1: r.z + 0.38 });
  const pc = LAYOUT.computer;
  out.push({ x0: pc.x - 1.5, z0: pc.z - 0.5, x1: pc.x + 1.4, z1: pc.z + 1.1 });
  const st = LAYOUT.storage;
  out.push({ x0: st.x - 1.3, z0: st.z - 0.55, x1: st.x + 1.3, z1: st.z + 0.55 });
  out.push({ x0: 7.3, z0: 6.35, x1: 7.9, z1: 6.85 }); // cestas
  const dr = LAYOUT.door;
  out.push({ x0: -9.6, z0: 7.4, x1: dr.x - dr.w / 2, z1: 7.6 });
  out.push({ x0: dr.x + dr.w / 2, z0: 7.4, x1: 9.6, z1: 7.6 });
  return out;
}

let blocked: Uint8Array | null = null;
function grid(): Uint8Array {
  if (blocked) return blocked;
  blocked = new Uint8Array(GW * GH);
  const obs = obstacles();
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const x = GRID.x0 + (i + 0.5) * CELL, z = GRID.z0 + (j + 0.5) * CELL;
    // Paredes laterales y del fondo
    if (x < GRID.x0 + CLEARANCE || x > GRID.x1 - CLEARANCE || z < GRID.z0 + CLEARANCE) { blocked[j * GW + i] = 1; continue; }
    if (z < 7.5 && (x < -9.5 + CLEARANCE || x > 9.5 - CLEARANCE)) { blocked[j * GW + i] = 1; continue; }
    for (const o of obs) if (x > o.x0 - CLEARANCE && x < o.x1 + CLEARANCE && z > o.z0 - CLEARANCE && z < o.z1 + CLEARANCE) { blocked[j * GW + i] = 1; break; }
  }
  return blocked;
}

const cellOf = (p: Point) => [
  Math.min(GW - 1, Math.max(0, Math.floor((p.x - GRID.x0) / CELL))),
  Math.min(GH - 1, Math.max(0, Math.floor((p.z - GRID.z0) / CELL))),
] as const;
const centerOf = (i: number, j: number): Point => ({ x: GRID.x0 + (i + 0.5) * CELL, z: GRID.z0 + (j + 0.5) * CELL });

/**
 * El punto libre más cercano a `p` (el mismo si ya está libre): busca en anillos alrededor.
 * Sirve para no aparecer nunca dentro de un mueble o de un mostrador.
 */
export function puntoLibre(p: Point, libre: (q: Point) => boolean = walkable): Point {
  if (libre(p)) return { x: p.x, z: p.z };
  for (let r = 0.25; r <= 4; r += 0.25) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, q = { x: p.x + Math.cos(a) * r, z: p.z + Math.sin(a) * r };
      // Con la rejilla de la tienda, solo dentro de ella (no en la calle).
      if ((libre !== walkable || q.z < 7.2) && libre(q)) return q;
    }
  }
  return { ...LAYOUT.entry };
}

/** Dónde aparece el segundo jugador: justo detrás del primero (y nunca dentro de un mueble). */
export function detrasDe(x: number, z: number, yaw: number, dist = 1.3): Point {
  // Con yaw = 0 se mira hacia -z, así que "detrás" es +z.
  return puntoLibre({ x: x + Math.sin(yaw) * dist, z: z + Math.cos(yaw) * dist });
}

/** ¿Se puede estar en este punto sin chocar con nada? */
export function walkable(p: Point): boolean {
  const [i, j] = cellOf(p);
  return p.x >= GRID.x0 && p.x <= GRID.x1 && p.z >= GRID.z0 && p.z <= GRID.z1 && !grid()[j * GW + i];
}

function lineFree(a: Point, b: Point): boolean {
  const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.ceil(d / (CELL * 0.2));
  // Se comprueba un poco a cada lado de la línea para no rozar esquinas justo en el borde de una celda.
  for (let k = 1; k <= n; k++) {
    const x = a.x + ((b.x - a.x) * k) / n, z = a.z + ((b.z - a.z) * k) / n;
    if (!walkable({ x: x - 0.03, z: z - 0.03 }) || !walkable({ x: x + 0.03, z: z - 0.03 }) || !walkable({ x: x - 0.03, z: z + 0.03 }) || !walkable({ x: x + 0.03, z: z + 0.03 })) return false;
  }
  return true;
}

/** Celda libre más cercana (por si un punto cae justo en el borde de un mueble). */
function nearestFree(i: number, j: number): [number, number] {
  const g = grid();
  if (!g[j * GW + i]) return [i, j];
  for (let r = 1; r < 12; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
    const a = i + di, b = j + dj;
    if (a >= 0 && b >= 0 && a < GW && b < GH && !g[b * GW + a]) return [a, b];
  }
  return [i, j];
}

/** Camino de `from` a `to` rodeando muebles (A* con atajos en línea recta). */
export function route(from: Point, to: Point): Point[] {
  if (lineFree(from, to) && walkable(to)) return [{ ...to }];
  const g = grid();
  const [si, sj] = nearestFree(...cellOf(from)), [ti, tj] = nearestFree(...cellOf(to));
  const start = sj * GW + si, goal = tj * GW + ti;
  const gScore = new Float32Array(GW * GH).fill(Infinity), prev = new Int32Array(GW * GH).fill(-1), done = new Uint8Array(GW * GH);
  const open: number[] = [start], f = new Float32Array(GW * GH).fill(Infinity);
  const h = (k: number) => { const dx = Math.abs((k % GW) - ti), dz = Math.abs(Math.floor(k / GW) - tj); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
  gScore[start] = 0; f[start] = h(start);
  while (open.length) {
    // Montón pequeño: búsqueda lineal del mejor (la rejilla es diminuta).
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (f[open[k]] < f[open[bi]]) bi = k;
    const cur = open[bi]; open[bi] = open[open.length - 1]; open.pop();
    if (cur === goal) break;
    if (done[cur]) continue;
    done[cur] = 1;
    const ci = cur % GW, cj = Math.floor(cur / GW);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = ci + di, nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= GW || nj >= GH) continue;
      const nk = nj * GW + ni;
      if (g[nk] || done[nk]) continue;
      if (di && dj && (g[cj * GW + ni] || g[nj * GW + ci])) continue; // sin cortar esquinas
      const cost = gScore[cur] + (di && dj ? 1.414 : 1);
      if (cost < gScore[nk]) { gScore[nk] = cost; prev[nk] = cur; f[nk] = cost + h(nk); open.push(nk); }
    }
  }
  if (prev[goal] === -1 && goal !== start) return [{ ...to }]; // sin camino (no debería pasar): va recto
  const cells: Point[] = [];
  for (let k = goal; k !== -1; k = prev[k]) cells.push(centerOf(k % GW, Math.floor(k / GW)));
  cells.reverse();
  cells[cells.length - 1] = { ...to };
  // Atajos: de cada punto salta al más lejano que se vea en línea recta.
  const out: Point[] = [];
  let a: Point = from, k = 0;
  while (k < cells.length - 1) {
    let best = k + 1;
    for (let m = cells.length - 1; m > k + 1; m--) if (lineFree(a, cells[m])) { best = m; break; }
    out.push(cells[best]); a = cells[best]; k = best;
  }
  if (!out.length) out.push({ ...to });
  return out;
}

function salir(c: Customer, from: Point) {
  c.estado = 'saliendo';
  c.path = [...route(from, LAYOUT.entry), { ...LAYOUT.street }];
}

function avanzarCola(s: GameState, k: number) {
  s.cajas[k].cola.forEach((id, i) => {
    const c = s.clientes.find((x) => x.id === id);
    if (!c) return;
    const spot = LAYOUT.queue(i, k);
    // Si su hueco ha cambiado, recalcula el camino hasta el nuevo.
    const last = c.path.length ? c.path[c.path.length - 1] : { x: c.x, z: c.z };
    if (Math.abs(last.x - spot.x) > 0.01 || Math.abs(last.z - spot.z) > 0.01) c.path = route({ x: c.x, z: c.z }, spot);
  });
}

/** Segundos hasta el siguiente cliente: más rápido con más días y más reputación. */
export function intervaloClientes(s: GameState): number {
  const base = Math.max(3.2, 8.5 - (s.dia - 1) * 0.45);
  return base * (1.45 - (s.reputacion / 100) * 0.8);
}

function elegirProducto(s: GameState, excluir: ProductId[]): ProductId {
  const opciones = PRODUCT_IDS.filter((p) => !excluir.includes(p));
  const total = opciones.reduce((t, p) => t + PRODUCTS[p].demanda, 0);
  let r = rand(s) * total;
  for (const p of opciones) { r -= PRODUCTS[p].demanda; if (r <= 0) return p; }
  return opciones[opciones.length - 1];
}

function nuevoCliente(s: GameState): Customer {
  const n = 1 + Math.floor(rand(s) * (s.dia >= 3 ? 4 : 3));
  const lista: Customer['lista'] = [];
  for (let i = 0; i < n; i++) {
    const p = elegirProducto(s, lista.map((l) => l.product));
    lista.push({ product: p, qty: rand(s) < 0.3 ? 2 : 1 });
  }
  // Recorre la tienda en orden (de izquierda a derecha) en lugar de ir y volver.
  lista.sort((a, b) => displayOf(a.product).pick.x - displayOf(b.product).pick.x);
  const c: Customer = {
    id: s.nextId++, x: LAYOUT.street.x + (rand(s) - 0.5) * 0.6, z: LAYOUT.street.z, dir: Math.PI, andando: true,
    path: [LAYOUT.entry], estado: 'entrando', lista, paso: 0, cesta: [], timer: 0,
    paciencia: QUEUE_PATIENCE, pacienciaMax: QUEUE_PATIENCE, escaneados: 0, pasados: {}, pago: 0, tarjeta: false, enfadado: false, caja: -1, look: Math.floor(rand(s) * 1e6),
  };
  s.stats.clientes++;
  s.eventos.push({ tipo: 'entra', id: c.id });
  return c;
}

function irAlSiguiente(s: GameState, c: Customer) {
  const here = { x: c.x, z: c.z };
  if (c.paso < c.lista.length) {
    c.estado = 'yendo';
    c.path = route(here, displayOf(c.lista[c.paso].product).pick);
    return;
  }
  // Va a la caja abierta con menos cola.
  let k = -1;
  s.cajas.forEach((caja, i) => { if (caja.abierta && (k < 0 || caja.cola.length < s.cajas[k].cola.length)) k = i; });
  if (!c.cesta.length || k < 0 || s.cajas[k].cola.length >= LAYOUT.queueMax) {
    // No ha encontrado nada (o la cola está llena): se va sin comprar.
    if (!c.cesta.length) { s.stats.perdidos++; }
    else { devolver(s, c); s.stats.perdidos++; s.reputacion = Math.max(0, s.reputacion - 4); }
    s.eventos.push({ tipo: 'seVa', id: c.id });
    salir(c, here);
    return;
  }
  c.estado = 'cola';
  c.caja = k;
  const caja = s.cajas[k];
  caja.cola.push(c.id);
  c.paciencia = c.pacienciaMax = QUEUE_PATIENCE * (caja.musica ? 1.5 : 1) * (caja.sucio ? 0.7 : 1);
  c.path = route(here, LAYOUT.queue(caja.cola.length - 1, k));
}

/** Si se va sin pagar, deja lo que llevaba en su sitio. */
function devolver(s: GameState, c: Customer) {
  for (const l of c.cesta) s.estantes[l.product] = Math.min(PRODUCTS[l.product].capacidad, s.estantes[l.product] + l.qty);
  c.cesta = [];
}

function mover(c: Customer, dt: number) {
  let left = WALK_SPEED * dt;
  c.andando = c.path.length > 0;
  while (left > 0 && c.path.length) {
    const t = c.path[0];
    const dx = t.x - c.x, dz = t.z - c.z, d = Math.hypot(dx, dz);
    if (d > 1e-6) c.dir = Math.atan2(dx, dz);
    if (d <= left) { c.x = t.x; c.z = t.z; c.path.shift(); left -= d; }
    else { c.x += (dx / d) * left; c.z += (dz / d) * left; left = 0; }
  }
}

function actualizar(s: GameState, c: Customer, dt: number) {
  mover(c, dt);
  const llegado = c.path.length === 0;
  switch (c.estado) {
    case 'entrando':
      if (llegado) irAlSiguiente(s, c);
      break;
    case 'yendo':
      if (llegado) { c.estado = 'cogiendo'; c.timer = PICK_TIME; c.dir = displayOf(c.lista[c.paso].product).rot + Math.PI; }
      break;
    case 'cogiendo':
      c.timer -= dt;
      if (c.timer <= 0) {
        const { product, qty } = c.lista[c.paso];
        const n = Math.min(qty, s.estantes[product]);
        if (n > 0) {
          s.estantes[product] -= n;
          const l = c.cesta.find((k) => k.product === product);
          if (l) l.qty += n; else c.cesta.push({ product, qty: n });
          s.eventos.push({ tipo: 'coge', product, qty: n, id: c.id });
        }
        if (n < qty && isRara(product)) {
          // Lo difícil de conseguir: si no hay, no pasa nada.
        } else if (n < qty) {
          s.stats.faltas++;
          c.enfadado = true;
          s.reputacion = Math.max(0, s.reputacion - 2);
          s.eventos.push({ tipo: 'falta', product, id: c.id });
        }
        c.paso++;
        irAlSiguiente(s, c);
      }
      break;
    case 'cola': {
      const caja = s.cajas[c.caja] ?? s.cajas[0];
      const primero = caja.cola[0] === c.id;
      // Mientras se le atiende en la caja no pierde la paciencia.
      if (!(primero && llegado && c.escaneados > 0)) c.paciencia -= dt;
      if (llegado && primero) c.dir = 0; // mira hacia la caja
      if (c.paciencia <= 0) {
        // Se cansa de esperar: deja la compra y se marcha.
        caja.cola = caja.cola.filter((id) => id !== c.id);
        devolver(s, c);
        c.enfadado = true;
        s.stats.perdidos++;
        s.stats.cansados++;
        s.reputacion = Math.max(0, s.reputacion - 4);
        s.eventos.push({ tipo: 'seVa', id: c.id });
        salir(c, { x: c.x, z: c.z });
        avanzarCola(s, c.caja < 0 ? 0 : c.caja);
      }
      break;
    }
    case 'saliendo':
      if (llegado) c.estado = 'fuera';
      break;
  }
}

/** Avanza la simulación `dt` segundos. */
export function tick(s: GameState, dt: number) {
  if (s.fase !== 'turno') return;
  const abierto = s.reloj < SHIFT_SECONDS;
  s.reloj += dt;
  if (abierto && s.reloj >= SHIFT_SECONDS) s.eventos.push({ tipo: 'cierre' });
  if (s.reloj < SHIFT_SECONDS) {
    s.proximoCliente -= dt;
    if (s.proximoCliente <= 0) {
      if (s.clientes.filter((c) => c.estado !== 'saliendo').length < MAX_IN_STORE) s.clientes.push(nuevoCliente(s));
      s.proximoCliente = intervaloClientes(s) * (0.6 + rand(s) * 0.8);
    }
  }
  for (const c of s.clientes) actualizar(s, c, dt);
  s.clientes = s.clientes.filter((c) => c.estado !== 'fuera');
  if (s.reloj >= SHIFT_SECONDS && s.clientes.length === 0) {
    s.fase = 'resumen';
    s.mejorDia = Math.max(s.mejorDia, s.jugadores[0].ingresos - s.jugadores[0].gastos);
    s.eventos.push({ tipo: 'fin' });
  }
}

/** Hora del reloj de la tienda (8:00 a 20:00) según el avance del turno. */
export function horaTienda(s: GameState): { h: number; m: number } {
  const t = Math.min(1, s.reloj / SHIFT_SECONDS);
  const mins = Math.floor((OPEN_HOUR + t * (CLOSE_HOUR - OPEN_HOUR)) * 60);
  return { h: Math.floor(mins / 60), m: mins % 60 };
}

// ---------- Guardado (solo en el dispositivo) ----------

export interface Save {
  v: 1 | 2 | 3;
  dia: number;
  dinero: number;
  /** Dinero del jugador 2 (v3). */
  dinero2?: number;
  /** Mejoras de cada caja (v3): [música, propinas]. */
  mejoras?: [boolean, boolean][];
  reputacion: number;
  almacen: Record<string, number>;
  estantes: Record<string, number>;
  mejorDia: number;
  seed: number;
  ofertaRara?: Record<string, number>;
}

/** Guarda lo necesario para seguir otro día. Solo se guarda entre turnos. */
export function exportar(s: GameState): Save {
  return { v: 3, dia: s.dia, dinero: s.jugadores[0].dinero, dinero2: s.jugadores[1].dinero, mejoras: s.cajas.map((k) => [k.musica, k.propinas]), reputacion: s.reputacion, almacen: { ...s.almacen }, estantes: { ...s.estantes }, mejorDia: s.mejorDia, seed: s.seed, ofertaRara: { ...s.ofertaRara } as Record<string, number> };
}

/** Restaura una partida guardada validando cada dato (si algo no cuadra, partida nueva). */
export function importar(data: unknown): GameState | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Partial<Save>;
  const int = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null);
  const dia = int(d.dia, 1, 1e6), dinero = int(d.dinero, 0, 1e9), rep = int(d.reputacion, 0, 100);
  if ((d.v !== 1 && d.v !== 2 && d.v !== 3) || dia === null || dinero === null || rep === null || !d.almacen || !d.estantes) return null;
  const s = newGame(int(d.seed, 1, 2 ** 32 - 1) ?? 1);
  for (const p of PRODUCT_IDS) {
    // Productos añadidos después de guardar la partida: empiezan a cero.
    const a = d.almacen[p] === undefined ? 0 : int(d.almacen[p], 0, 1e6);
    const e = d.estantes[p] === undefined ? 0 : int(d.estantes[p], 0, PRODUCTS[p].capacidad);
    if (a === null || e === null) return null;
    s.almacen[p] = a; s.estantes[p] = e;
  }
  // Las partidas de antes de los precios nuevos (v1) tenían todo unas 20 veces más barato.
  const escala = d.v === 1 ? 20 : 1;
  s.dia = dia; s.jugadores[0].dinero = dinero * escala; s.reputacion = rep;
  s.jugadores[1].dinero = int(d.dinero2, 0, 1e9) ?? DINERO_INICIAL;
  if (Array.isArray(d.mejoras)) d.mejoras.slice(0, 2).forEach((m, k) => { if (Array.isArray(m)) { s.cajas[k].musica = m[0] === true; s.cajas[k].propinas = m[1] === true; } }); s.mejorDia = (int(d.mejorDia, -1e9, 1e9) ?? 0) * escala;
  if (d.ofertaRara && typeof d.ofertaRara === 'object') {
    for (const p of PRODUCT_IDS) if (isRara(p)) s.ofertaRara[p] = int(d.ofertaRara[p], 0, 9) ?? 0;
  } else sortearOferta(s);
  return s;
}
