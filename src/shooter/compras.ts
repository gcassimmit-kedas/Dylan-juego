// Compra "Doble potencia" con Google Play (solo en la app de Android).
// Usa cordova-plugin-purchase, que en la app nativa deja el objeto global CdvPurchase. En la web y en iOS no existe,
// así que el botón de compra no aparece. Tampoco aparece en Android hasta que el producto exista en Play Console.
// Los datos de la tarjeta los gestiona Google: el juego solo recibe la confirmación de que el pago se hizo.

/** Identificador del producto consumible en Google Play Console. */
export const BOOST_PRODUCT = 'com.dylan.shooter2027.doble';
const GRANTED_KEY = 'shooter.comprasEntregadas';

/**
 * Evita entregar dos veces la misma compra (Google puede avisar de nuevo si la app se cerró antes de confirmarla).
 * Devuelve la lista actualizada, o null si esa compra ya se entregó.
 */
export function markGranted(list: string[], transactionId: string): string[] | null {
  if (!transactionId || list.includes(transactionId)) return null;
  return [...list, transactionId].slice(-50);
}

export interface BoostShop {
  /** Precio en la moneda del jugador, tal como lo da Google (por ejemplo "3,00 €"). */
  price: string;
  /** Abre la ventana de pago de Google. Devuelve un texto de error para mostrar, o null si se abrió. */
  buy(): Promise<string | null>;
}

interface CdvTransaction { transactionId: string; products: { id: string }[]; isConsumed?: boolean; finish(): Promise<unknown> }
interface CdvOffer { order(): Promise<{ message?: string; code?: number } | undefined> }
interface CdvProduct { canPurchase: boolean; pricing?: { price: string }; getOffer(): CdvOffer | undefined }
interface CdvApi {
  store: {
    register(p: { id: string; type: string; platform: string }[]): void;
    when(): { approved(cb: (t: CdvTransaction) => void): unknown; productUpdated(cb: () => void): unknown };
    initialize(platforms: string[]): Promise<unknown[]>;
    get(id: string, platform?: string): CdvProduct | undefined;
  };
  ProductType: { CONSUMABLE: string };
  Platform: { GOOGLE_PLAY: string };
  ErrorCode?: { PAYMENT_CANCELLED?: number };
}

function readGranted(): string[] {
  try { const v = JSON.parse(localStorage.getItem(GRANTED_KEY) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; }
}

/**
 * Prepara la tienda. `grant` se llama una vez por cada compra pagada (también las que quedaron sin entregar
 * de una sesión anterior). `onReady` recibe la tienda cuando el producto está a la venta.
 */
export function initBoostShop(grant: () => void, onReady: (shop: BoostShop) => void) {
  const cdv = (window as unknown as { CdvPurchase?: CdvApi }).CdvPurchase;
  if (!cdv) return; // web, iOS o app sin el plugin
  const { store, ProductType, Platform } = cdv;
  store.register([{ id: BOOST_PRODUCT, type: ProductType.CONSUMABLE, platform: Platform.GOOGLE_PLAY }]);
  store.when().approved((t) => {
    if (!t.products.some((p) => p.id === BOOST_PRODUCT)) return;
    const next = markGranted(readGranted(), t.transactionId);
    if (next) {
      try { localStorage.setItem(GRANTED_KEY, JSON.stringify(next)); } catch { /* sin almacenamiento */ }
      grant();
    }
    void t.finish(); // consumible: se consume para poder comprarlo otra vez
  });
  let announced = false;
  store.when().productUpdated(() => {
    const product = store.get(BOOST_PRODUCT, Platform.GOOGLE_PLAY);
    if (announced || !product || !product.canPurchase || !product.pricing) return;
    announced = true;
    onReady({
      price: product.pricing.price,
      async buy() {
        const offer = product.getOffer();
        if (!offer) return 'La compra no está disponible ahora mismo.';
        const err = await offer.order();
        if (!err) return null;
        if (cdv.ErrorCode?.PAYMENT_CANCELLED !== undefined && err.code === cdv.ErrorCode.PAYMENT_CANCELLED) return null;
        return 'No se pudo completar la compra. Inténtalo de nuevo.';
      },
    });
  });
  void store.initialize([Platform.GOOGLE_PLAY]);
}
