import {
  AlertTriangle,
  ArrowRight,
  Box,
  CheckCircle2,
  Database,
  FileCheck2,
  PlusCircle,
  ShoppingCart,
  TrendingUp,
} from "lucide-react";
import { formatDateTimePY, formatPYG, taxRateLabel } from "../lib/format";
import type {
  AppSection,
  EmitterProfile,
  HealthResponse,
  Product,
  SifenInvoice,
  SystemStatusResponse,
} from "../types/domain";

interface DashboardViewProps {
  health: HealthResponse | null;
  systemStatus: SystemStatusResponse | null;
  emitter: EmitterProfile;
  products: Product[];
  invoices: SifenInvoice[];
  onNavigate: (section: AppSection) => void;
  onOpenInvoice: (invoice: SifenInvoice) => void;
}

export function DashboardView({
  health,
  systemStatus,
  emitter,
  products,
  invoices,
  onNavigate,
  onOpenInvoice,
}: DashboardViewProps) {
  const activeProducts = products.filter((p) => p.active);
  const lowStockProducts = activeProducts.filter((p) => p.stock <= p.minStock);
  const approvedInvoices = invoices.filter((i) => i.status !== "CANCELLED");
  const totalSalesAmount = approvedInvoices.reduce((acc, inv) => acc + inv.totalAmount, 0);
  const totalIva = approvedInvoices.reduce(
    (acc, inv) => acc + inv.totalIva10 + inv.totalIva5,
    0
  );

  return (
    <div className="space-y-6">
      {/* Hero banner de bienvenida + acciones rápidas */}
      <section className="relative overflow-hidden rounded-2xl bg-[#060E24] p-6 text-white shadow-sm">
        <div
          className="pointer-events-none absolute inset-0 opacity-80"
          style={{
            background:
              "radial-gradient(circle at 88% 20%, rgba(213, 43, 30, 0.28), transparent 42%), radial-gradient(circle at 12% 90%, rgba(0, 56, 168, 0.45), transparent 48%)",
          }}
        />
        <div className="relative flex flex-col justify-between gap-5 md:flex-row md:items-center">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium text-amber-200 ring-1 ring-white/15">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {emitter.razonSocial} · RUC {emitter.ruc}-{emitter.dv}
            </div>
            <h2 className="font-display text-2xl font-bold tracking-tight">
              Panel de control comercial
            </h2>
            <p className="max-w-xl text-sm text-slate-300">
              Controlá tu inventario con Kardex auditable y emití Facturas Electrónicas SIFEN v150
              con KuDE listo para imprimir en segundos.
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => onNavigate("pos")}
              className="inline-flex items-center gap-2 rounded-xl bg-[#D52B1E] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#b92217]"
            >
              <ShoppingCart className="h-4 w-4" />
              Abrir Caja POS
            </button>
            <button
              type="button"
              onClick={() => onNavigate("stock")}
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white ring-1 ring-white/15 transition hover:bg-white/15"
            >
              <PlusCircle className="h-4 w-4 text-[#FBBF24]" />
              Gestionar Stock
            </button>
          </div>
        </div>
      </section>

      {/* KPIs principales */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Facturación acumulada</span>
            <TrendingUp className="h-4 w-4 text-[#0038A8]" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
            {formatPYG(totalSalesAmount)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            IVA incluido liquidado: {formatPYG(totalIva)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Productos activos</span>
            <Box className="h-4 w-4 text-slate-600" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
            {activeProducts.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Catálogo con IVA 10%, 5% y Exenta
          </p>
        </div>

        <div
          className={`rounded-2xl border p-5 shadow-sm ${
            lowStockProducts.length > 0
              ? "border-amber-300 bg-amber-50/60"
              : "border-slate-200 bg-white"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-600">Alertas stock mínimo</span>
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
            {lowStockProducts.length}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            {lowStockProducts.length > 0
              ? "Productos que requieren reposición"
              : "Todo el inventario en niveles óptimos"}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Documentos SIFEN (DE)</span>
            <FileCheck2 className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
            {invoices.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Timbrado {emitter.timbrado} · Punto {emitter.establecimiento}-{emitter.puntoExpedicion}
          </p>
        </div>
      </section>

      {/* Grilla inferior: Alertas de Stock + Últimas Facturas + Estado del Stack */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Alertas de reposición */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Reposición urgente (Stock mínimo)
            </h3>
            <button
              type="button"
              onClick={() => onNavigate("stock")}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#0038A8] hover:underline"
            >
              Ver todo
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {lowStockProducts.length === 0 ? (
            <div className="rounded-xl bg-emerald-50 p-4 text-xs text-emerald-800">
              No hay productos debajo del stock mínimo.
            </div>
          ) : (
            <div className="space-y-2.5">
              {lowStockProducts.map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between rounded-xl border border-amber-200/80 bg-amber-50/40 px-3.5 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{product.name}</p>
                    <p className="font-mono text-[11px] text-slate-500">
                      {product.sku} · {taxRateLabel(product.taxRate)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right tabular-nums">
                    <p className="text-sm font-bold text-amber-800">
                      {product.stock} {product.unit}
                    </p>
                    <p className="text-[10px] text-slate-500">Mín: {product.minStock}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Estado técnico en vivo (API + Postgres) */}
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <Database className="h-3.5 w-3.5 text-slate-500" />
                Backend Docker en vivo
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  health?.status === "ok"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-200 text-slate-600"
                }`}
              >
                <CheckCircle2 className="h-3 w-3" />
                {health?.status === "ok" ? "Conectado" : "Sin respuesta"}
              </span>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500">
              PostgreSQL:{" "}
              <strong className="text-slate-700">
                {health?.database === "connected" ? "Activo" : "—"}
              </strong>{" "}
              · Semilla BD: {systemStatus?.counts.products ?? "—"} productos · API v
              {health?.version ?? "0.1.0"}
            </p>
          </div>
        </section>

        {/* Últimos Documentos Electrónicos SIFEN */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-7">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <FileCheck2 className="h-4 w-4 text-[#0038A8]" />
              Últimas Facturas Electrónicas (SIFEN)
            </h3>
            <button
              type="button"
              onClick={() => onNavigate("sifen")}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#0038A8] hover:underline"
            >
              Ir a SIFEN
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {invoices.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
              Todavía no emitiste comprobantes. Probá emitir tu primera factura desde{" "}
              <button
                type="button"
                onClick={() => onNavigate("pos")}
                className="font-semibold text-[#0038A8] underline"
              >
                Caja POS
              </button>
              .
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {invoices.slice(0, 5).map((inv) => (
                <div
                  key={inv.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-900">
                        {inv.documentFullNumber}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          inv.status === "APPROVED"
                            ? "bg-emerald-100 text-emerald-700"
                            : inv.status === "CANCELLED"
                              ? "bg-rose-100 text-rose-700"
                              : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {inv.status}
                      </span>
                    </div>
                    <p className="truncate text-xs text-slate-600">{inv.customer.name}</p>
                    <p className="font-mono text-[10px] text-slate-400">
                      {formatDateTimePY(inv.createdAt)} · CDC {inv.cdc.slice(0, 14)}…
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-display text-sm font-bold text-slate-900 tabular-nums">
                      {formatPYG(inv.totalAmount)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenInvoice(inv)}
                      className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-[#0038A8]/40 hover:text-[#0038A8]"
                    >
                      Ver KuDE
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
