import { Ban, Check, Copy, Download, FileCheck2, FileText, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { formatDateTimePY, formatPYG } from "../lib/format";
import type { SifenDocumentStatus, SifenInvoice } from "../types/domain";

interface SifenViewProps {
  invoices: SifenInvoice[];
  onOpenInvoice: (invoice: SifenInvoice) => void;
  onCancelInvoice: (invoiceId: string) => Promise<void>;
}

export function SifenView({ invoices, onOpenInvoice, onCancelInvoice }: SifenViewProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | SifenDocumentStatus>("ALL");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (statusFilter !== "ALL" && inv.status !== statusFilter) return false;
      if (!q) return true;
      return (
        inv.documentFullNumber.toLowerCase().includes(q) ||
        inv.cdc.toLowerCase().includes(q) ||
        inv.customer.name.toLowerCase().includes(q) ||
        inv.customer.documentNumber.toLowerCase().includes(q)
      );
    });
  }, [invoices, query, statusFilter]);

  const copyCdc = async (inv: SifenInvoice) => {
    try {
      await navigator.clipboard.writeText(inv.cdc);
      setCopiedId(inv.id);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // Clipboard no disponible
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl font-bold text-slate-900">
          Documentos Electrónicos — SIFEN / e-Kuatia
        </h2>
        <p className="text-xs text-slate-500">
          Registro de facturas electrónicas emitidas, CDC de 44 dígitos, XML v150 y representación
          gráfica KuDE.
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por número, CDC, RUC o cliente..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pr-3 pl-9 text-sm text-slate-900 outline-none focus:border-[#0038A8] focus:bg-white"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { id: "ALL", label: "Todos" },
              { id: "APPROVED", label: "Aprobados" },
              { id: "QUEUED", label: "En lote" },
              { id: "CANCELLED", label: "Cancelados" },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                statusFilter === f.id
                  ? "bg-[#0038A8] text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla DEs */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                <th className="px-4 py-3">Comprobante / Fecha</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">CDC (44 dígitos)</th>
                <th className="px-4 py-3">Estado SIFEN</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {filtered.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs font-bold text-slate-900">
                      {inv.documentFullNumber}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {formatDateTimePY(inv.createdAt)} · {inv.mode.toUpperCase()}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{inv.customer.name}</div>
                    <div className="font-mono text-[11px] text-slate-400">
                      {inv.customer.documentType === "RUC"
                        ? `RUC ${inv.customer.documentNumber}-${inv.customer.dv}`
                        : inv.customer.documentType === "CI"
                          ? `CI ${inv.customer.documentNumber}`
                          : "Consumidor Final"}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => void copyCdc(inv)}
                      title="Copiar CDC completo"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-700 hover:bg-slate-200"
                    >
                      <span>
                        {inv.cdc.slice(0, 10)}…{inv.cdc.slice(-6)}
                      </span>
                      {copiedId === inv.id ? (
                        <Check className="h-3 w-3 text-emerald-600" />
                      ) : (
                        <Copy className="h-3 w-3 text-slate-400" />
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                        inv.status === "APPROVED"
                          ? "bg-emerald-100 text-emerald-700"
                          : inv.status === "CANCELLED"
                            ? "bg-rose-100 text-rose-700"
                            : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      <FileCheck2 className="h-3 w-3" />
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-display font-bold text-slate-900">
                    {formatPYG(inv.totalAmount)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onOpenInvoice(inv)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-[#0038A8]/40 hover:text-[#0038A8]"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        KuDE / XML
                      </button>
                      {inv.kudeA4Url && (
                        <a
                          href={`${inv.kudeA4Url}&download=1`}
                          download
                          title="Descargar KuDE PDF (A4)"
                          className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:border-[#0038A8]/40 hover:text-[#0038A8]"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>
                      )}
                      {inv.status === "APPROVED" && (
                        <button
                          type="button"
                          onClick={() => void onCancelInvoice(inv.id)}
                          title="Cancelar DE (hasta 48h · repone el stock automáticamente)"
                          className="rounded-lg border border-rose-200 bg-white p-1.5 text-rose-600 hover:bg-rose-50"
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                    No hay documentos electrónicos para el filtro seleccionado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
