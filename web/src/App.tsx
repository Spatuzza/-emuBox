import { Database, Menu, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { IntroSplash } from "./components/IntroSplash";
import { KudeModal } from "./components/KudeModal";
import { Sidebar } from "./components/Sidebar";
import { api } from "./lib/api";
import { INITIAL_CUSTOMERS, INITIAL_EMITTER, INITIAL_MOVEMENTS, INITIAL_PRODUCTS } from "./lib/seedData";
import type {
  AppSection,
  BridgeConfigState,
  Customer,
  EmitterProfile,
  HealthResponse,
  PaymentCondition,
  PaymentMethod,
  Product,
  SaleItem,
  SifenInvoice,
  StockMovement,
  StockMovementType,
  SystemStatusResponse,
} from "./types/domain";
import { DashboardView } from "./views/DashboardView";
import { PosView } from "./views/PosView";
import { SettingsView } from "./views/SettingsView";
import { SifenView } from "./views/SifenView";
import { StockView } from "./views/StockView";

const SECTION_TITLE: Record<AppSection, string> = {
  dashboard: "Resumen General",
  pos: "Caja POS",
  stock: "Productos y Kardex",
  sifen: "Facturas Electrónicas SIFEN",
  settings: "Configuración",
};

const SIFEN_BADGE: Record<string, { label: string; classes: string }> = {
  mock: {
    label: "SIFEN: MOCK",
    classes: "bg-amber-100 text-amber-800 border-amber-300",
  },
  test: {
    label: "SIFEN: TEST (DNIT)",
    classes: "bg-sky-100 text-sky-800 border-sky-300",
  },
  prod: {
    label: "SIFEN: PROD",
    classes: "bg-emerald-100 text-emerald-800 border-emerald-300",
  },
};

export default function App() {
  const [showIntro, setShowIntro] = useState(true);
  const [introRunId, setIntroRunId] = useState(0);
  const [activeSection, setActiveSection] = useState<AppSection>("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // 100% respaldado por PostgreSQL
  const [emitter, setEmitter] = useState<EmitterProfile>(INITIAL_EMITTER);
  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
  const [customers, setCustomers] = useState<Customer[]>(INITIAL_CUSTOMERS);
  const [movements, setMovements] = useState<StockMovement[]>(INITIAL_MOVEMENTS);
  const [invoices, setInvoices] = useState<SifenInvoice[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<SifenInvoice | null>(null);
  const [toast, setToast] = useState<{ text: string; tone?: "ok" | "err" } | null>(null);

  // Salud en vivo del backend Docker + estado Bridge
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatusResponse | null>(null);
  const [bridgeConfig, setBridgeConfig] = useState<BridgeConfigState | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const showToast = useCallback((text: string, tone: "ok" | "err" = "ok") => {
    setToast({ text, tone });
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  const syncFromBackend = useCallback(async () => {
    setRefreshing(true);
    try {
      const [h, s, em, br, prods, movs, custs, docs] = await Promise.all([
        api.getHealth(),
        api.getSystemStatus(),
        api.getEmitter(),
        api.getBridgeConfig(),
        api.listProducts(),
        api.listMovements(150),
        api.listCustomers(),
        api.listSifenDocuments(100),
      ]);
      setHealth(h);
      setSystemStatus(s);
      setEmitter(em);
      setBridgeConfig(br);
      setProducts(prods);
      setMovements(movs);
      setCustomers(custs);
      setInvoices(docs);
    } catch {
      // Backend temporalmente no disponible
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void syncFromBackend();
  }, [syncFromBackend]);

  // Atajos rápidos de caja (F2 = POS, F3 = Stock)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        setActiveSection("pos");
      } else if (e.key === "F3") {
        e.preventDefault();
        setActiveSection("stock");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleSaveProduct = async (input: Omit<Product, "id"> & { id?: string }) => {
    try {
      if (input.id) {
        const updated = await api.updateProduct(input.id, input);
        setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        showToast("Producto actualizado en PostgreSQL");
      } else {
        const created = await api.createProduct(input);
        setProducts((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        const movs = await api.listMovements(150);
        setMovements(movs);
        showToast("Producto creado y guardado en PostgreSQL");
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error guardando producto", "err");
      throw err;
    }
  };

  const handleAdjustStock = async (params: {
    productId: string;
    type: StockMovementType;
    quantity: number;
    notes: string;
  }) => {
    try {
      const res = await api.createMovement(params);
      setProducts((prev) =>
        prev.map((p) => (p.id === params.productId ? { ...p, stock: res.newStock } : p))
      );
      setMovements((prev) => [res.movement, ...prev]);
      showToast("Movimiento de Kardex guardado en PostgreSQL");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error en Kardex", "err");
      throw err;
    }
  };

  const handleUploadImage = async (productId: string, dataUrl: string) => {
    try {
      const res = await api.uploadProductImage(productId, dataUrl);
      setProducts((prev) =>
        prev.map((p) =>
          p.id === productId
            ? {
                ...p,
                hasImage: res.hasImage,
                imageUrl: res.imageUrl,
                imageSource: res.imageSource,
                imageSizeBytes: res.imageSizeBytes,
              }
            : p
        )
      );
      showToast(`Foto guardada en PostgreSQL (${(res.imageSizeBytes / 1024).toFixed(1)} KB)`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error subiendo foto", "err");
    }
  };

  const handleGenerateAiImage = async (productId: string, prompt?: string) => {
    try {
      const res = await api.generateProductImage(productId, prompt);
      setProducts((prev) =>
        prev.map((p) =>
          p.id === productId
            ? {
                ...p,
                hasImage: res.hasImage,
                imageUrl: res.imageUrl,
                imageSource: res.imageSource,
                imageSizeBytes: res.imageSizeBytes,
              }
            : p
        )
      );
      showToast(
        res.message ??
          `Miniatura guardada en PostgreSQL (${(res.imageSizeBytes / 1024).toFixed(1)} KB)`
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error generando miniatura", "err");
    }
  };

  const handleDeleteImage = async (productId: string) => {
    try {
      await api.deleteProductImage(productId);
      setProducts((prev) =>
        prev.map((p) =>
          p.id === productId
            ? {
                ...p,
                hasImage: false,
                imageUrl: undefined,
                imageSource: undefined,
                imageSizeBytes: undefined,
              }
            : p
        )
      );
      showToast("Imagen eliminada de la base de datos");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error eliminando imagen", "err");
    }
  };

  const handleCreateCustomer = async (input: Omit<Customer, "id">): Promise<Customer> => {
    try {
      const created = await api.createCustomer(input);
      setCustomers((prev) => [...prev, created]);
      showToast(`Cliente ${created.name} guardado en PostgreSQL`);
      return created;
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error registrando cliente", "err");
      throw err;
    }
  };

  const handleCompleteSale = async (params: {
    customer: Customer;
    paymentCondition: PaymentCondition;
    paymentMethod: PaymentMethod;
    items: SaleItem[];
  }) => {
    try {
      const createdInvoice = await api.createSale({
        customerId: params.customer.id,
        paymentCondition: params.paymentCondition,
        paymentMethod: params.paymentMethod,
        items: params.items.map((it) => ({
          productId: it.productId,
          quantity: it.quantity,
        })),
      });

      const [prods, movs, em, sys] = await Promise.all([
        api.listProducts(),
        api.listMovements(150),
        api.getEmitter(),
        api.getSystemStatus(),
      ]);
      setProducts(prods);
      setMovements(movs);
      setEmitter(em);
      setSystemStatus(sys);
      setInvoices((prev) => [createdInvoice, ...prev]);
      setSelectedInvoice(createdInvoice);
      showToast(`Factura Electrónica ${createdInvoice.documentFullNumber} emitida (SIFEN v150)`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error emitiendo factura", "err");
      throw err;
    }
  };

  const handleSaveEmitter = async (updated: EmitterProfile) => {
    try {
      const saved = await api.updateEmitter(updated);
      setEmitter(saved);
      showToast("Emisor actualizado en PostgreSQL");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error guardando emisor", "err");
    }
  };

  const handleCancelInvoice = async (invoiceId: string) => {
    try {
      const updated = await api.cancelSifenDocument(invoiceId);
      const [prods, movs] = await Promise.all([api.listProducts(), api.listMovements(150)]);
      setProducts(prods);
      setMovements(movs);
      setInvoices((prev) => prev.map((inv) => (inv.id === updated.id ? updated : inv)));
      showToast(`DE ${updated.documentFullNumber} cancelado · Stock repuesto en Kardex`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error cancelando documento", "err");
    }
  };

  const handleBridgeChanged = async (message: string) => {
    await syncFromBackend();
    showToast(message);
  };

  const lowStockCount = products.filter((p) => p.active && p.stock <= p.minStock).length;
  const activeMode = emitter.sifenMode ?? health?.sifenMode ?? "mock";
  const modeBadge = SIFEN_BADGE[activeMode];

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {showIntro && (
        <IntroSplash key={introRunId} onFinish={() => setShowIntro(false)} />
      )}

      <Sidebar
        activeSection={activeSection}
        onSelect={setActiveSection}
        lowStockCount={lowStockCount}
        invoiceCount={invoices.length}
        sifenMode={activeMode}
        onReplayIntro={() => {
          setIntroRunId((n) => n + 1);
          setShowIntro(true);
        }}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur">
          <div className="flex h-[3px] w-full lg:hidden">
            <span className="h-full flex-1 bg-[#D52B1E]" />
            <span className="h-full flex-1 bg-slate-100" />
            <span className="h-full flex-1 bg-[#0038A8]" />
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Abrir menú de navegación"
                className="rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-100 lg:hidden"
              >
                <Menu className="h-4 w-4" />
              </button>
              <h1 className="font-display text-base font-bold text-slate-900 sm:text-lg">
                {SECTION_TITLE[activeSection]}
              </h1>
            </div>

            <div className="flex items-center gap-2">
              {bridgeConfig?.mode === "BRIDGE" && (
                <button
                  type="button"
                  onClick={() => setActiveSection("settings")}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                    bridgeConfig.readOnly
                      ? "border-indigo-300 bg-indigo-50 text-indigo-800"
                      : "border-emerald-300 bg-emerald-50 text-emerald-800"
                  }`}
                >
                  <Database className="h-3.5 w-3.5" />
                  {bridgeConfig.readOnly ? "BRIDGE · SOLO LECTURA" : "BRIDGE · ATÓMICO"}
                </button>
              )}
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${modeBadge.classes}`}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                {modeBadge.label}
              </span>
              <button
                type="button"
                onClick={() => void syncFromBackend()}
                disabled={refreshing}
                title="Sincronizar con PostgreSQL"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Sincronizar</span>
              </button>
            </div>
          </div>
        </header>

        {/* Contenido principal */}
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">
          {activeSection === "dashboard" && (
            <DashboardView
              health={health}
              systemStatus={systemStatus}
              emitter={emitter}
              products={products}
              invoices={invoices}
              onNavigate={setActiveSection}
              onOpenInvoice={setSelectedInvoice}
            />
          )}

          {activeSection === "stock" && (
            <StockView
              products={products}
              movements={movements}
              onSaveProduct={handleSaveProduct}
              onAdjustStock={handleAdjustStock}
              onUploadImage={handleUploadImage}
              onGenerateAiImage={handleGenerateAiImage}
              onDeleteImage={handleDeleteImage}
            />
          )}

          {activeSection === "pos" && (
            <PosView
              products={products}
              customers={customers}
              onCreateCustomer={handleCreateCustomer}
              onCompleteSale={handleCompleteSale}
            />
          )}

          {activeSection === "sifen" && (
            <SifenView
              invoices={invoices}
              onOpenInvoice={setSelectedInvoice}
              onCancelInvoice={handleCancelInvoice}
            />
          )}

          {activeSection === "settings" && (
            <SettingsView
              emitter={emitter}
              bridgeConfig={bridgeConfig}
              onSaveEmitter={handleSaveEmitter}
              onBridgeChanged={handleBridgeChanged}
              onError={(msg) => showToast(msg, "err")}
            />
          )}
        </main>
      </div>

      {/* Modal global KuDE / XML SIFEN v150 */}
      <KudeModal
        invoice={selectedInvoice}
        emitter={emitter}
        onClose={() => setSelectedInvoice(null)}
      />

      {/* Toast liviano */}
      {toast && (
        <div
          role="status"
          className={`fixed right-5 bottom-5 z-40 rounded-xl px-4 py-2.5 text-xs font-semibold text-white shadow-lg ${
            toast.tone === "err"
              ? "bg-rose-700 ring-1 ring-rose-300/40"
              : "bg-[#060E24] ring-1 ring-amber-400/30"
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}
