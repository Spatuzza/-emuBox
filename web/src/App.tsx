import {
  AlertTriangle,
  Box,
  CheckCircle2,
  Clock,
  Database,
  FileText,
  RefreshCw,
  ShieldCheck,
  Store,
  Users,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";

interface HealthResponse {
  status: "ok" | "error";
  service: string;
  version: string;
  database: string;
  sifenMode: "mock" | "test" | "prod";
  timestamp: string;
}

interface SystemStatusResponse {
  service: string;
  version: string;
  sifenMode: "mock" | "test" | "prod";
  emitter: {
    ruc: string;
    razonSocial: string;
    timbrado: string;
    puntoVenta: string;
    ultimoNumeroFactura: number;
  } | null;
  counts: {
    products: number;
    lowStockProducts: number;
    customers: number;
    sales: number;
    sifenDocuments: number;
  };
  modules: Array<{
    id: string;
    name: string;
    status: "ready" | "planned";
  }>;
  timestamp: string;
}

const SIFEN_BADGE: Record<string, { label: string; classes: string }> = {
  mock: {
    label: "SIFEN: MOCK (Demo local)",
    classes: "bg-amber-100 text-amber-800 border-amber-300",
  },
  test: {
    label: "SIFEN: TEST (DNIT Pruebas)",
    classes: "bg-sky-100 text-sky-800 border-sky-300",
  },
  prod: {
    label: "SIFEN: PRODUCCIÓN",
    classes: "bg-emerald-100 text-emerald-800 border-emerald-300",
  },
};

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [status, setStatus] = useState<SystemStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [healthRes, statusRes] = await Promise.all([
        fetch("/api/health"),
        fetch("/api/system/status"),
      ]);
      if (!healthRes.ok || !statusRes.ok) {
        throw new Error(`API respondió con código ${healthRes.status} / ${statusRes.status}`);
      }
      const [healthJson, statusJson] = await Promise.all([
        healthRes.json() as Promise<HealthResponse>,
        statusRes.json() as Promise<SystemStatusResponse>,
      ]);
      setHealth(healthJson);
      setStatus(statusJson);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo conectar con la API");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const modeBadge = SIFEN_BADGE[status?.sifenMode ?? health?.sifenMode ?? "mock"];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top Bar */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
              <Store className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900">emuBox</h1>
              <p className="text-xs text-slate-500">
                Stock, POS y Facturación Electrónica · Paraguay (SIFEN v150)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${modeBadge.classes}`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {modeBadge.label}
            </span>
            <button
              type="button"
              onClick={() => void loadData()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Actualizar
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        {error && (
          <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Error de conexión con el backend</p>
              <p className="text-xs text-rose-700">{error}</p>
            </div>
          </div>
        )}

        {/* Estado de servicios y Emisor */}
        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Database className="h-4 w-4 text-slate-500" />
                Estado de la infraestructura
              </h2>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  health?.status === "ok"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {health?.status === "ok" ? "Operativo" : "Verificando..."}
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">API</dt>
                <dd className="font-semibold text-slate-900">
                  {health ? `${health.service} v${health.version}` : "—"}
                </dd>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">PostgreSQL</dt>
                <dd className="font-semibold text-emerald-700">
                  {health?.database === "connected" ? "Conectado" : "—"}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
              <FileText className="h-4 w-4 text-slate-500" />
              Emisor configurado (DNIT / e-Kuatia)
            </h2>
            {status?.emitter ? (
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div className="col-span-2 rounded-lg bg-slate-50 p-3">
                  <dt className="text-xs text-slate-500">Razón Social</dt>
                  <dd className="font-semibold text-slate-900">{status.emitter.razonSocial}</dd>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <dt className="text-xs text-slate-500">RUC</dt>
                  <dd className="font-mono font-semibold text-slate-900">{status.emitter.ruc}</dd>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <dt className="text-xs text-slate-500">Timbrado / Punto</dt>
                  <dd className="font-mono font-semibold text-slate-900">
                    {status.emitter.timbrado} ({status.emitter.puntoVenta})
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-slate-500">Cargando datos del emisor...</p>
            )}
          </div>
        </section>

        {/* KPIs iniciales */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            icon={<Box className="h-5 w-5 text-indigo-600" />}
            label="Productos activos"
            value={status?.counts.products ?? 0}
            hint="Con soporte IVA 10%, 5% y Exenta"
          />
          <KpiCard
            icon={<AlertTriangle className="h-5 w-5 text-amber-600" />}
            label="Alertas stock mínimo"
            value={status?.counts.lowStockProducts ?? 0}
            hint="Productos en o debajo del mínimo"
            highlight={(status?.counts.lowStockProducts ?? 0) > 0}
          />
          <KpiCard
            icon={<Users className="h-5 w-5 text-sky-600" />}
            label="Clientes registrados"
            value={status?.counts.customers ?? 0}
            hint="Consumidor final + contribuyentes"
          />
          <KpiCard
            icon={<FileText className="h-5 w-5 text-emerald-600" />}
            label="Documentos SIFEN"
            value={status?.counts.sifenDocuments ?? 0}
            hint={`Ventas totales: ${status?.counts.sales ?? 0}`}
          />
        </section>

        {/* Hoja de ruta de módulos */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-800">
            Módulos del sistema (Avance por fases)
          </h2>
          <div className="divide-y divide-slate-100">
            {(status?.modules ?? []).map((mod, idx) => (
              <div key={mod.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">
                    {idx + 1}
                  </span>
                  <span className="text-sm font-medium text-slate-800">{mod.name}</span>
                </div>
                {mod.status === "ready" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Listo
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                    <Clock className="h-3.5 w-3.5" />
                    Próxima fase
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  hint,
  highlight = false,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  hint: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm ${
        highlight ? "border-amber-300 bg-amber-50/50" : "border-slate-200 bg-white"
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium text-slate-600">{label}</span>
        {icon}
      </div>
      <p className="text-3xl font-bold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}
