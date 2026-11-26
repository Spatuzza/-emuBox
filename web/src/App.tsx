import { Menu, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { IntroSplash } from "./components/IntroSplash";
import { KudeModal } from "./components/KudeModal";
import { Sidebar } from "./components/Sidebar";
import {
  buildSifenXmlPreview,
  computeSaleTotals,
  generateSifenCDC,
} from "./lib/format";
import {
  createInitialInvoices,
  INITIAL_CUSTOMERS,
  INITIAL_EMITTER,
  INITIAL_MOVEMENTS,
  INITIAL_PRODUCTS,
} from "./lib/seedData";
import type {
  AppSection,
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

const STORAGE_KEY = "nemubox_demo_state_v1";

interface PersistedState {
  emitter: EmitterProfile;
  products: Product[];
  customers: Customer[];
  movements: StockMovement[];
  invoices: SifenInvoice[];
}

function loadInitialState(): PersistedState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as PersistedState;
    }
  } catch {
    // Fallback a seed inicial
  }
  return {
    emitter: INITIAL_EMITTER,
    products: INITIAL_PRODUCTS,
    customers: INITIAL_CUSTOMERS,
    movements: INITIAL_MOVEMENTS,
    invoices: createInitialInvoices(),
  };
}

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

  // Estado local interactivo (preparado para conectar a endpoints Parte 2/3)
  const [state, setState] = useState<PersistedState>(loadInitialState);
  const [selectedInvoice, setSelectedInvoice] = useState<SifenInvoice | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Estado en vivo del backend Docker (/api/health y /api/system/status)
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatusResponse | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage lleno o deshabilitado
    }
  }, [state]);

  const loadBackendStatus = useCallback(async () => {
    setRefreshing(true);
    try {
      const [healthRes, statusRes] = await Promise.all([
        fetch("/api/health"),
        fetch("/api/system/status"),
      ]);
      if (healthRes.ok && statusRes.ok) {
        const [h, s] = await Promise.all([
          healthRes.json() as Promise<HealthResponse>,
          statusRes.json() as Promise<SystemStatusResponse>,
        ]);
        setHealth(h);
        setSystemStatus(s);
      }
    } catch {
      // Modo offline / backend detenido
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadBackendStatus();
  }, [loadBackendStatus]);

  // Atajos de teclado rápidos de caja (F2 = POS, F3 = Stock)
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

  const handleSaveProduct = (input: Omit<Product, "id"> & { id?: string }) => {
    setState((prev) => {
      if (input.id) {
        return {
          ...prev,
          products: prev.products.map((p) =>
            p.id === input.id ? { ...p, ...input, id: p.id } : p
          ),
        };
      }
      const newProduct: Product = {
        ...input,
        id: `prod-${Date.now()}`,
      };
      const initialMove: StockMovement = {
        id: `mov-${Date.now()}`,
        productId: newProduct.id,
        productName: newProduct.name,
        productSku: newProduct.sku,
        type: "IN",
        quantity: newProduct.stock,
        previousStock: 0,
        newStock: newProduct.stock,
        notes: "Alta de producto en catálogo",
        createdAt: new Date().toISOString(),
      };
      return {
        ...prev,
        products: [newProduct, ...prev.products],
        movements: newProduct.stock > 0 ? [initialMove, ...prev.movements] : prev.movements,
      };
    });
    showToast(input.id ? "Producto actualizado" : "Producto creado en el catálogo");
  };

  const handleAdjustStock = (params: {
    productId: string;
    type: StockMovementType;
    quantity: number;
    notes: string;
  }) => {
    setState((prev) => {
      const target = prev.products.find((p) => p.id === params.productId);
      if (!target) return prev;

      const prevStock = target.stock;
      let newStock = prevStock;
      let delta = params.quantity;

      if (params.type === "IN") {
        newStock = prevStock + params.quantity;
        delta = params.quantity;
      } else if (params.type === "OUT") {
        newStock = Math.max(0, prevStock - params.quantity);
        delta = -(prevStock - newStock);
      } else {
        newStock = Math.max(0, params.quantity);
        delta = newStock - prevStock;
      }

      const movement: StockMovement = {
        id: `mov-${Date.now()}`,
        productId: target.id,
        productName: target.name,
        productSku: target.sku,
        type: params.type,
        quantity: delta,
        previousStock: prevStock,
        newStock,
        notes: params.notes,
        createdAt: new Date().toISOString(),
      };

      return {
        ...prev,
        products: prev.products.map((p) =>
          p.id === target.id ? { ...p, stock: newStock } : p
        ),
        movements: [movement, ...prev.movements],
      };
    });
    showToast("Movimiento de Kardex registrado");
  };

  const handleCreateCustomer = (input: Omit<Customer, "id">): Customer => {
    const created: Customer = { ...input, id: `cust-${Date.now()}` };
    setState((prev) => ({ ...prev, customers: [...prev.customers, created] }));
    showToast(`Cliente ${created.name} registrado`);
    return created;
  };

  const handleCompleteSale = (params: {
    customer: Customer;
    paymentCondition: PaymentCondition;
    paymentMethod: PaymentMethod;
    items: SaleItem[];
  }) => {
    const now = new Date();
    const nextNumber = state.emitter.ultimoNumeroFactura + 1;
    const docNum = String(nextNumber).padStart(7, "0");
    const fullNumber = `${state.emitter.establecimiento}-${state.emitter.puntoExpedicion}-${docNum}`;
    const cdc = generateSifenCDC({
      emitter: state.emitter,
      documentNumber: nextNumber,
      issuedAt: now,
    });
    const totals = computeSaleTotals(params.items);
    const customerDoc =
      params.customer.documentType === "RUC"
        ? `${params.customer.documentNumber}-${params.customer.dv}`
        : params.customer.documentNumber;

    const newInvoice: SifenInvoice = {
      id: `inv-${Date.now()}`,
      saleNumber: nextNumber,
      documentFullNumber: fullNumber,
      cdc,
      mode: state.emitter.sifenMode,
      status: state.emitter.sifenMode === "mock" ? "APPROVED" : "QUEUED",
      customer: params.customer,
      paymentCondition: params.paymentCondition,
      paymentMethod: params.paymentMethod,
      items: params.items,
      subtotalExenta: totals.subtotalExenta,
      subtotalIva5: totals.subtotalIva5,
      subtotalIva10: totals.subtotalIva10,
      totalIva5: totals.totalIva5,
      totalIva10: totals.totalIva10,
      totalAmount: totals.totalAmount,
      qrUrl: `https://ekuatia.set.gov.py/consultas-test/qr?nVersion=150&Id=${cdc}&cHashQR=MOCK`,
      xmlPreview: buildSifenXmlPreview({
        cdc,
        emitter: state.emitter,
        documentNumber: docNum,
        customerName: params.customer.name,
        customerDoc,
        totalAmount: totals.totalAmount,
        totalIva10: totals.totalIva10,
        totalIva5: totals.totalIva5,
        items: params.items,
        issuedAtIso: now.toISOString(),
      }),
      sifenResponseCode: state.emitter.sifenMode === "mock" ? "0260" : "0300",
      sifenResponseMsg:
        state.emitter.sifenMode === "mock"
          ? "Aprobado (Simulación local SIFEN_MODE=mock)"
          : "En cola de lote asíncrono",
      createdAt: now.toISOString(),
    };

    const newMovements: StockMovement[] = [];
    const updatedProducts = state.products.map((p) => {
      const sold = params.items.find((it) => it.productId === p.id);
      if (!sold) return p;
      const newStock = Math.max(0, p.stock - sold.quantity);
      newMovements.push({
        id: `mov-${Date.now()}-${p.id}`,
        productId: p.id,
        productName: p.name,
        productSku: p.sku,
        type: "SALE",
        quantity: -sold.quantity,
        previousStock: p.stock,
        newStock,
        notes: `Venta #${nextNumber} · DE ${fullNumber}`,
        createdAt: now.toISOString(),
      });
      return { ...p, stock: newStock };
    });

    setState((prev) => ({
      ...prev,
      emitter: { ...prev.emitter, ultimoNumeroFactura: nextNumber },
      products: updatedProducts,
      movements: [...newMovements, ...prev.movements],
      invoices: [newInvoice, ...prev.invoices],
    }));

    setSelectedInvoice(newInvoice);
    showToast(`Factura Electrónica ${fullNumber} emitida`);
  };

  const handleCancelInvoice = (invoiceId: string) => {
    setState((prev) => ({
      ...prev,
      invoices: prev.invoices.map((inv) =>
        inv.id === invoiceId
          ? {
              ...inv,
              status: "CANCELLED",
              sifenResponseCode: "0600",
              sifenResponseMsg: "Evento de cancelación registrado",
            }
          : inv
      ),
    }));
    showToast("Evento de cancelación SIFEN registrado");
  };

  const handleResetDemo = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setState({
      emitter: INITIAL_EMITTER,
      products: INITIAL_PRODUCTS,
      customers: INITIAL_CUSTOMERS,
      movements: INITIAL_MOVEMENTS,
      invoices: createInitialInvoices(),
    });
    showToast("Datos de demostración restaurados");
  };

  const lowStockCount = state.products.filter((p) => p.active && p.stock <= p.minStock).length;
  const activeMode = state.emitter.sifenMode ?? health?.sifenMode ?? "mock";
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
        invoiceCount={state.invoices.length}
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
              <div>
                <h1 className="font-display text-base font-bold text-slate-900 sm:text-lg">
                  {SECTION_TITLE[activeSection]}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${modeBadge.classes}`}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                {modeBadge.label}
              </span>
              <button
                type="button"
                onClick={() => void loadBackendStatus()}
                disabled={refreshing}
                title="Sincronizar estado del servidor"
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
              emitter={state.emitter}
              products={state.products}
              invoices={state.invoices}
              onNavigate={setActiveSection}
              onOpenInvoice={setSelectedInvoice}
            />
          )}

          {activeSection === "stock" && (
            <StockView
              products={state.products}
              movements={state.movements}
              onSaveProduct={handleSaveProduct}
              onAdjustStock={handleAdjustStock}
            />
          )}

          {activeSection === "pos" && (
            <PosView
              products={state.products}
              customers={state.customers}
              onCreateCustomer={handleCreateCustomer}
              onCompleteSale={handleCompleteSale}
            />
          )}

          {activeSection === "sifen" && (
            <SifenView
              invoices={state.invoices}
              onOpenInvoice={setSelectedInvoice}
              onCancelInvoice={handleCancelInvoice}
            />
          )}

          {activeSection === "settings" && (
            <SettingsView
              emitter={state.emitter}
              onSaveEmitter={(updated) => {
                setState((prev) => ({ ...prev, emitter: updated }));
                showToast("Configuración del emisor guardada");
              }}
              onResetDemo={handleResetDemo}
            />
          )}
        </main>
      </div>

      {/* Modal global KuDE / XML SIFEN v150 */}
      <KudeModal
        invoice={selectedInvoice}
        emitter={state.emitter}
        onClose={() => setSelectedInvoice(null)}
      />

      {/* Toast liviano */}
      {toast && (
        <div
          role="status"
          className="fixed right-5 bottom-5 z-40 rounded-xl bg-[#060E24] px-4 py-2.5 text-xs font-semibold text-white shadow-lg ring-1 ring-amber-400/30"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
