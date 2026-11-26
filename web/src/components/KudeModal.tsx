import { Check, Code2, Copy, FileText, Printer, Receipt } from "lucide-react";
import { useState } from "react";
import { formatCDC, formatDateTimePY, formatPYG, taxRateLabel } from "../lib/format";
import type { EmitterProfile, SifenInvoice } from "../types/domain";
import { Modal } from "./Modal";

interface KudeModalProps {
  invoice: SifenInvoice | null;
  emitter: EmitterProfile;
  onClose: () => void;
}

/**
 * Genera una matriz visual QR determinística a partir del CDC (44 dígitos)
 * para previsualización en modo mock (en Parte 3 se generará QR PNG/SVG oficial con hash CSC).
 */
function MockQrSvg({ seed }: { seed: string }) {
  const size = 21;
  const cells: Array<{ x: number; y: number }> = [];

  const isFinder = (x: number, y: number) =>
    (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (isFinder(x, y)) continue;
      const idx = (y * size + x) % seed.length;
      const charCode = seed.charCodeAt(idx);
      if ((charCode + x * 7 + y * 13) % 3 === 0) {
        cells.push({ x, y });
      }
    }
  }

  const renderFinder = (ox: number, oy: number) => (
    <g key={`${ox}-${oy}`}>
      <rect x={ox} y={oy} width="7" height="7" fill="#0F172A" />
      <rect x={ox + 1} y={oy + 1} width="5" height="5" fill="#FFFFFF" />
      <rect x={ox + 2} y={oy + 2} width="3" height="3" fill="#0F172A" />
    </g>
  );

  return (
    <svg
      viewBox={`-1 -1 ${size + 2} ${size + 2}`}
      className="h-28 w-28 rounded-lg border border-slate-200 bg-white p-1"
      aria-label="Código QR de consulta e-Kuatia"
    >
      {renderFinder(0, 0)}
      {renderFinder(size - 7, 0)}
      {renderFinder(0, size - 7)}
      {cells.map((c) => (
        <rect key={`${c.x}-${c.y}`} x={c.x} y={c.y} width="1" height="1" fill="#0F172A" />
      ))}
    </svg>
  );
}

export function KudeModal({ invoice, emitter, onClose }: KudeModalProps) {
  const [tab, setTab] = useState<"ticket" | "a4" | "xml">("ticket");
  const [copied, setCopied] = useState(false);

  const handleCopyCdc = async () => {
    if (!invoice) return;
    try {
      await navigator.clipboard.writeText(invoice.cdc);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard no disponible
    }
  };

  return (
    <Modal
      open={Boolean(invoice)}
      onClose={onClose}
      title={invoice ? `KuDE — Factura Electrónica ${invoice.documentFullNumber}` : "KuDE"}
      subtitle={
        invoice
          ? `CDC (${invoice.cdc.length} dígitos) · ${invoice.sifenResponseMsg}`
          : undefined
      }
      maxWidthClass="max-w-3xl"
    >
      {invoice && (
        <div className="space-y-4">
          {/* Controles superiores */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setTab("ticket")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  tab === "ticket"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Receipt className="h-3.5 w-3.5" />
                Ticket 80mm
              </button>
              <button
                type="button"
                onClick={() => setTab("a4")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  tab === "a4"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <FileText className="h-3.5 w-3.5" />
                Factura A4
              </button>
              <button
                type="button"
                onClick={() => setTab("xml")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  tab === "xml"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Code2 className="h-3.5 w-3.5" />
                XML v150
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleCopyCdc()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    CDC copiado
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copiar CDC
                  </>
                )}
              </button>
              {tab !== "xml" && (
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#060E24] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#0c1a3d]"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Imprimir KuDE
                </button>
              )}
            </div>
          </div>

          {/* Vista Ticket Térmico 80mm */}
          {tab === "ticket" && (
            <div className="flex justify-center rounded-xl bg-slate-100 p-5">
              <div
                id="kude-printable"
                className="w-full max-w-[330px] rounded-xl border border-slate-200 bg-white p-5 font-mono text-[11px] leading-relaxed text-slate-900 shadow-sm"
              >
                <div className="border-b border-dashed border-slate-300 pb-3 text-center">
                  <p className="font-display text-sm font-bold">{emitter.razonSocial}</p>
                  <p className="text-[10px] text-slate-600">{emitter.direccion}</p>
                  <p className="mt-1 font-semibold">
                    RUC: {emitter.ruc}-{emitter.dv}
                  </p>
                  <p>Timbrado N°: {emitter.timbrado}</p>
                  <p className="mt-1 font-bold uppercase">KuDE de Factura Electrónica</p>
                  <p className="text-xs font-bold">{invoice.documentFullNumber}</p>
                </div>

                <div className="space-y-0.5 border-b border-dashed border-slate-300 py-2.5 text-[10px]">
                  <p>Fecha: {formatDateTimePY(invoice.createdAt)}</p>
                  <p>Cliente: {invoice.customer.name}</p>
                  <p>
                    Doc:{" "}
                    {invoice.customer.documentType === "RUC"
                      ? `${invoice.customer.documentNumber}-${invoice.customer.dv}`
                      : invoice.customer.documentNumber}
                  </p>
                  <p>
                    Condición: {invoice.paymentCondition} · {invoice.paymentMethod}
                  </p>
                </div>

                <div className="border-b border-dashed border-slate-300 py-2.5">
                  <div className="mb-1 flex justify-between font-bold">
                    <span>Cant / Descripción</span>
                    <span>Subtotal</span>
                  </div>
                  {invoice.items.map((it) => (
                    <div key={it.productId} className="mb-1.5">
                      <div className="flex justify-between gap-2">
                        <span className="truncate">
                          {it.quantity}x {it.productName}
                        </span>
                        <span className="shrink-0 tabular-nums">{formatPYG(it.lineTotal)}</span>
                      </div>
                      <div className="text-[9px] text-slate-500">
                        {formatPYG(it.unitPrice)} c/u · {taxRateLabel(it.taxRate)}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-1 border-b border-dashed border-slate-300 py-2.5 tabular-nums">
                  <div className="flex justify-between text-xs font-bold">
                    <span>TOTAL A PAGAR</span>
                    <span>{formatPYG(invoice.totalAmount)}</span>
                  </div>
                  <div className="pt-1 text-[10px] text-slate-600">
                    <div className="flex justify-between">
                      <span>Liquidación IVA 10%:</span>
                      <span>{formatPYG(invoice.totalIva10)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Liquidación IVA 5%:</span>
                      <span>{formatPYG(invoice.totalIva5)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Exentas:</span>
                      <span>{formatPYG(invoice.subtotalExenta)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-center gap-2 pt-3 text-center">
                  <MockQrSvg seed={invoice.cdc} />
                  <p className="text-[9px] font-semibold text-slate-700">
                    Consulte la validez de esta Factura Electrónica con el CDC:
                  </p>
                  <p className="break-all rounded bg-slate-50 px-2 py-1 text-[9px] font-bold tracking-wider">
                    {formatCDC(invoice.cdc)}
                  </p>
                  <p className="text-[9px] text-slate-500">
                    https://ekuatia.set.gov.py/consultas/
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Vista Factura A4 */}
          {tab === "a4" && (
            <div
              id="kude-printable"
              className="rounded-xl border border-slate-200 bg-white p-6 text-xs text-slate-800 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
                <div>
                  <p className="font-display text-lg font-bold text-slate-900">
                    {emitter.razonSocial}
                  </p>
                  <p className="text-slate-600">{emitter.actividadEconomicaDesc}</p>
                  <p className="text-slate-500">
                    {emitter.direccion} · {emitter.telefono}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-right font-mono">
                  <p className="text-[11px] font-semibold text-slate-500">
                    TIMBRADO N° {emitter.timbrado}
                  </p>
                  <p className="font-bold text-slate-900">
                    RUC: {emitter.ruc}-{emitter.dv}
                  </p>
                  <p className="mt-1 text-sm font-bold text-[#0038A8]">
                    FACTURA ELECTRÓNICA {invoice.documentFullNumber}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 border-b border-slate-200 py-3 sm:grid-cols-2">
                <div>
                  <span className="text-slate-500">Fecha de emisión:</span>{" "}
                  <strong>{formatDateTimePY(invoice.createdAt)}</strong>
                  <br />
                  <span className="text-slate-500">Cliente / Razón Social:</span>{" "}
                  <strong>{invoice.customer.name}</strong>
                </div>
                <div className="sm:text-right">
                  <span className="text-slate-500">RUC / Documento:</span>{" "}
                  <strong className="font-mono">
                    {invoice.customer.documentType === "RUC"
                      ? `${invoice.customer.documentNumber}-${invoice.customer.dv}`
                      : invoice.customer.documentNumber}
                  </strong>
                  <br />
                  <span className="text-slate-500">Condición:</span>{" "}
                  <strong>
                    {invoice.paymentCondition} ({invoice.paymentMethod})
                  </strong>
                </div>
              </div>

              <table className="mt-4 w-full border-collapse text-left tabular-nums">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] text-slate-500">
                    <th className="py-2">Cód.</th>
                    <th className="py-2">Descripción</th>
                    <th className="py-2 text-right">Cant.</th>
                    <th className="py-2 text-right">P. Unit.</th>
                    <th className="py-2 text-right">Exenta</th>
                    <th className="py-2 text-right">IVA 5%</th>
                    <th className="py-2 text-right">IVA 10%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoice.items.map((it) => (
                    <tr key={it.productId}>
                      <td className="py-2 font-mono text-[11px]">{it.productSku}</td>
                      <td className="py-2 font-medium">{it.productName}</td>
                      <td className="py-2 text-right">{it.quantity}</td>
                      <td className="py-2 text-right">{formatPYG(it.unitPrice)}</td>
                      <td className="py-2 text-right">
                        {it.taxRate === "EXENTA" ? formatPYG(it.lineTotal) : "—"}
                      </td>
                      <td className="py-2 text-right">
                        {it.taxRate === "IVA_5" ? formatPYG(it.lineTotal) : "—"}
                      </td>
                      <td className="py-2 text-right">
                        {it.taxRate === "IVA_10" ? formatPYG(it.lineTotal) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-4">
                <div className="flex items-center gap-3">
                  <MockQrSvg seed={invoice.cdc} />
                  <div className="max-w-xs space-y-1">
                    <p className="font-semibold text-slate-900">
                      Validación DNIT / e-Kuatia (SIFEN v150)
                    </p>
                    <p className="font-mono text-[10px] break-all text-slate-600">
                      CDC: {formatCDC(invoice.cdc)}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      Estado: {invoice.sifenResponseCode} · {invoice.sifenResponseMsg}
                    </p>
                  </div>
                </div>

                <div className="min-w-[210px] space-y-1 rounded-xl bg-slate-50 p-3 tabular-nums">
                  <div className="flex justify-between">
                    <span className="text-slate-500">IVA 5%:</span>
                    <span>{formatPYG(invoice.totalIva5)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">IVA 10%:</span>
                    <span>{formatPYG(invoice.totalIva10)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-1.5 text-sm font-bold text-slate-900">
                    <span>TOTAL:</span>
                    <span>{formatPYG(invoice.totalAmount)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Vista XML SIFEN v150 */}
          {tab === "xml" && (
            <div className="space-y-2">
              <p className="text-xs text-slate-500">
                Estructura previa del Documento Electrónico conforme al Manual Técnico SIFEN v150
                (la firma digital XMLDSig con <code>.p12</code> se aplica en el backend).
              </p>
              <pre className="max-h-96 overflow-auto rounded-xl bg-[#060E24] p-4 font-mono text-[11px] leading-relaxed text-slate-200">
                {invoice.xmlPreview}
              </pre>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
