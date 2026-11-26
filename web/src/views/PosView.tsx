import {
  Banknote,
  CreditCard,
  Minus,
  Plus,
  QrCode,
  Receipt,
  Search,
  ShoppingCart,
  Trash2,
  UserPlus,
} from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { Modal } from "../components/Modal";
import {
  calculateMod11DV,
  computeItemIva,
  computeSaleTotals,
  formatPYG,
  taxRateBadgeClass,
  taxRateLabel,
} from "../lib/format";
import type {
  Customer,
  PaymentCondition,
  PaymentMethod,
  Product,
  SaleItem,
} from "../types/domain";

interface PosViewProps {
  products: Product[];
  customers: Customer[];
  onCreateCustomer: (customer: Omit<Customer, "id">) => Customer;
  onCompleteSale: (params: {
    customer: Customer;
    paymentCondition: PaymentCondition;
    paymentMethod: PaymentMethod;
    items: SaleItem[];
  }) => void;
}

export function PosView({
  products,
  customers,
  onCreateCustomer,
  onCompleteSale,
}: PosViewProps) {
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Array<{ productId: string; quantity: number }>>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    customers[0]?.id ?? "cust-cf"
  );
  const [paymentCondition, setPaymentCondition] = useState<PaymentCondition>("CONTADO");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("EFECTIVO");

  // Modal rápido de nuevo cliente RUC/CI
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [custDocType, setCustDocType] = useState<"RUC" | "CI">("RUC");
  const [custDocNum, setCustDocNum] = useState("");
  const [custName, setCustName] = useState("");
  const [custEmail, setCustEmail] = useState("");

  const activeProducts = useMemo(() => products.filter((p) => p.active), [products]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return activeProducts;
    return activeProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.barcode ?? "").toLowerCase().includes(q)
    );
  }, [activeProducts, search]);

  const addToCart = (product: Product) => {
    if (product.stock <= 0) return;
    setCart((prev) => {
      const existing = prev.find((c) => c.productId === product.id);
      if (existing) {
        const nextQty = Math.min(product.stock, existing.quantity + 1);
        return prev.map((c) => (c.productId === product.id ? { ...c, quantity: nextQty } : c));
      }
      return [...prev, { productId: product.id, quantity: 1 }];
    });
  };

  const updateCartQty = (productId: string, delta: number) => {
    const prod = products.find((p) => p.id === productId);
    if (!prod) return;
    setCart((prev) =>
      prev
        .map((c) => {
          if (c.productId !== productId) return c;
          const nextQty = Math.min(prod.stock, c.quantity + delta);
          return { ...c, quantity: nextQty };
        })
        .filter((c) => c.quantity > 0)
    );
  };

  const handleBarcodeEnter = (e: FormEvent) => {
    e.preventDefault();
    const q = search.trim().toLowerCase();
    if (!q) return;
    const exact = activeProducts.find(
      (p) => p.sku.toLowerCase() === q || (p.barcode ?? "").toLowerCase() === q
    );
    if (exact) {
      addToCart(exact);
      setSearch("");
    } else if (filteredProducts.length === 1) {
      addToCart(filteredProducts[0]);
      setSearch("");
    }
  };

  const saleItems: SaleItem[] = useMemo(() => {
    return cart
      .map((entry) => {
        const p = products.find((prod) => prod.id === entry.productId);
        if (!p) return null;
        const lineTotal = p.price * entry.quantity;
        return {
          productId: p.id,
          productSku: p.sku,
          productName: p.name,
          quantity: entry.quantity,
          unitPrice: p.price,
          taxRate: p.taxRate,
          lineTotal,
          ivaAmount: computeItemIva(lineTotal, p.taxRate),
        };
      })
      .filter((x): x is SaleItem => x !== null);
  }, [cart, products]);

  const totals = useMemo(() => computeSaleTotals(saleItems), [saleItems]);
  const selectedCustomer =
    customers.find((c) => c.id === selectedCustomerId) ?? customers[0];

  const handleCheckout = () => {
    if (saleItems.length === 0 || !selectedCustomer) return;
    onCompleteSale({
      customer: selectedCustomer,
      paymentCondition,
      paymentMethod,
      items: saleItems,
    });
    setCart([]);
  };

  const handleCreateCustomerSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cleanDoc = custDocNum.replace(/\D/g, "");
    if (!cleanDoc || !custName.trim()) return;
    const created = onCreateCustomer({
      documentType: custDocType,
      documentNumber: cleanDoc,
      dv: custDocType === "RUC" ? calculateMod11DV(cleanDoc) : undefined,
      name: custName.trim(),
      isTaxpayer: custDocType === "RUC",
      email: custEmail.trim() || undefined,
    });
    setSelectedCustomerId(created.id);
    setCustomerModalOpen(false);
    setCustDocNum("");
    setCustName("");
    setCustEmail("");
  };

  return (
    <div className="grid gap-5 lg:grid-cols-12">
      {/* Columna Izquierda: Buscador + Catálogo Rápido */}
      <div className="space-y-4 lg:col-span-7 xl:col-span-8">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900">
            Caja POS — Emisión rápida SIFEN
          </h2>
          <p className="text-xs text-slate-500">
            Escaneá un código de barras, escribí SKU + Enter o tocá un producto para sumar al ticket.
          </p>
        </div>

        <form onSubmit={handleBarcodeEnter} className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Escanear código de barras, SKU o buscar producto..."
            className="w-full rounded-2xl border border-slate-200 bg-white py-3 pr-4 pl-10 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#0038A8] focus:ring-2 focus:ring-[#0038A8]/15"
          />
        </form>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filteredProducts.map((p) => {
            const inCart = cart.find((c) => c.productId === p.id)?.quantity ?? 0;
            const outOfStock = p.stock <= 0;
            return (
              <button
                key={p.id}
                type="button"
                disabled={outOfStock}
                onClick={() => addToCart(p)}
                className={`group relative flex flex-col justify-between rounded-2xl border p-4 text-left transition ${
                  outOfStock
                    ? "cursor-not-allowed border-slate-200 bg-slate-100 opacity-55"
                    : inCart > 0
                      ? "border-[#0038A8] bg-blue-50/35 shadow-sm"
                      : "border-slate-200 bg-white shadow-sm hover:-translate-y-0.5 hover:border-[#0038A8]/40 hover:shadow-md"
                }`}
              >
                {inCart > 0 && (
                  <span className="absolute top-3 right-3 flex h-6 min-w-6 items-center justify-center rounded-full bg-[#0038A8] px-1.5 font-mono text-xs font-bold text-white">
                    {inCart}
                  </span>
                )}

                <div>
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${taxRateBadgeClass(
                      p.taxRate
                    )}`}
                  >
                    {taxRateLabel(p.taxRate)}
                  </span>
                  <h3 className="mt-2 line-clamp-2 text-sm font-semibold text-slate-900">
                    {p.name}
                  </h3>
                  <p className="mt-0.5 font-mono text-[11px] text-slate-400">{p.sku}</p>
                </div>

                <div className="mt-4 flex items-end justify-between border-t border-slate-100 pt-2.5 tabular-nums">
                  <span className="font-display text-base font-bold text-slate-900">
                    {formatPYG(p.price)}
                  </span>
                  <span
                    className={`text-[11px] font-semibold ${
                      p.stock <= p.minStock ? "text-amber-700" : "text-slate-500"
                    }`}
                  >
                    Stock: {p.stock}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Columna Derecha: Ticket Activo + Cliente + Liquidación IVA PY */}
      <aside className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-span-5 xl:col-span-4">
        <div className="border-b border-slate-100 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <ShoppingCart className="h-4 w-4 text-[#0038A8]" />
              Comprobante actual
            </h3>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={() => setCart([])}
                className="text-xs font-medium text-rose-600 hover:underline"
              >
                Vaciar
              </button>
            )}
          </div>

          {/* Selector de Cliente (RUC / Consumidor Final) */}
          <div className="flex gap-2">
            <select
              aria-label="Seleccionar cliente"
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-[#0038A8]"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.documentType === "RUC" ? ` (${c.documentNumber}-${c.dv})` : ""}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setCustomerModalOpen(true)}
              title="Nuevo cliente RUC / CI"
              className="inline-flex shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-2.5 text-slate-600 hover:border-[#0038A8]/40 hover:text-[#0038A8]"
            >
              <UserPlus className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Lista de ítems del carrito */}
        <div className="flex-1 divide-y divide-slate-100 overflow-y-auto p-4">
          {saleItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <Receipt className="h-6 w-6" />
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-700">Carrito vacío</p>
              <p className="mt-1 max-w-[220px] text-xs text-slate-400">
                Tocá cualquier producto de la izquierda para armar la factura electrónica.
              </p>
            </div>
          ) : (
            saleItems.map((item) => (
              <div key={item.productId} className="flex items-center justify-between gap-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-900">
                    {item.productName}
                  </p>
                  <p className="font-mono text-[11px] text-slate-500">
                    {formatPYG(item.unitPrice)} · {taxRateLabel(item.taxRate)}
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => updateCartQty(item.productId, -1)}
                    aria-label="Restar unidad"
                    className="flex h-6 w-6 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-6 text-center font-mono text-xs font-bold tabular-nums">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => updateCartQty(item.productId, 1)}
                    aria-label="Sumar unidad"
                    className="flex h-6 w-6 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => updateCartQty(item.productId, -item.quantity)}
                    aria-label="Quitar producto"
                    className="ml-1 rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Condición, método de pago y liquidación IVA Paraguay */}
        <div className="space-y-3 border-t border-slate-200 bg-slate-50/70 p-4">
          <div className="grid grid-cols-2 gap-2">
            {(["CONTADO", "CREDITO"] as const).map((cond) => (
              <button
                key={cond}
                type="button"
                onClick={() => setPaymentCondition(cond)}
                className={`rounded-xl border py-1.5 text-xs font-semibold transition ${
                  paymentCondition === cond
                    ? "border-[#060E24] bg-[#060E24] text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {cond === "CONTADO" ? "Contado" : "Crédito"}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {(
              [
                { id: "EFECTIVO", label: "Efectivo", icon: Banknote },
                { id: "QR", label: "QR", icon: QrCode },
                { id: "TARJETA", label: "Tarjeta", icon: CreditCard },
                { id: "TRANSFERENCIA", label: "Transf.", icon: Receipt },
              ] as const
            ).map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPaymentMethod(m.id)}
                  className={`flex flex-col items-center gap-1 rounded-xl border py-2 text-[10px] font-semibold transition ${
                    paymentMethod === m.id
                      ? "border-[#0038A8] bg-blue-50 text-[#0038A8]"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {m.label}
                </button>
              );
            })}
          </div>

          {/* Desglose IVA Paraguay */}
          <div className="space-y-1 rounded-xl border border-slate-200 bg-white p-3 text-xs tabular-nums">
            <div className="flex justify-between text-slate-500">
              <span>Liquidación IVA 10% (÷11)</span>
              <span>{formatPYG(totals.totalIva10)}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Liquidación IVA 5% (÷21)</span>
              <span>{formatPYG(totals.totalIva5)}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Exentas</span>
              <span>{formatPYG(totals.subtotalExenta)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-100 pt-2 text-base font-bold text-slate-900">
              <span>Total a cobrar</span>
              <span className="font-display text-[#0038A8]">{formatPYG(totals.totalAmount)}</span>
            </div>
          </div>

          <button
            type="button"
            disabled={saleItems.length === 0}
            onClick={handleCheckout}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#D52B1E] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#b92217] disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Receipt className="h-4 w-4" />
            Emitir Factura Electrónica (SIFEN)
          </button>
        </div>
      </aside>

      {/* Modal Nuevo Cliente rápido con cálculo automático de DV */}
      <Modal
        open={customerModalOpen}
        onClose={() => setCustomerModalOpen(false)}
        title="Registrar cliente para facturación"
        subtitle="Si ingresás un RUC, Ñemubox calcula automáticamente el Dígito Verificador (Módulo 11 DNIT)."
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleCreateCustomerSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {(["RUC", "CI"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setCustDocType(t)}
                className={`rounded-xl border py-2 text-xs font-semibold ${
                  custDocType === t
                    ? "border-[#0038A8] bg-blue-50 text-[#0038A8]"
                    : "border-slate-200 text-slate-600"
                }`}
              >
                {t === "RUC" ? "Contribuyente (RUC)" : "Cédula de Identidad (CI)"}
              </button>
            ))}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              Número de {custDocType} (sin guion) *
            </label>
            <div className="flex items-center gap-2">
              <input
                required
                autoFocus
                value={custDocNum}
                onChange={(e) => setCustDocNum(e.target.value.replace(/\D/g, ""))}
                placeholder={custDocType === "RUC" ? "80012345" : "4512890"}
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm outline-none focus:border-[#0038A8]"
              />
              {custDocType === "RUC" && custDocNum.length >= 4 && (
                <span className="rounded-xl bg-slate-100 px-3 py-2 font-mono text-sm font-bold text-[#0038A8]">
                  DV: {calculateMod11DV(custDocNum)}
                </span>
              )}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              Razón Social / Nombre completo *
            </label>
            <input
              required
              value={custName}
              onChange={(e) => setCustName(e.target.value)}
              placeholder="Ej. Ferretería Central S.R.L."
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0038A8]"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              Email (para envío de KuDE)
            </label>
            <input
              type="email"
              value={custEmail}
              onChange={(e) => setCustEmail(e.target.value)}
              placeholder="cliente@correo.com.py"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0038A8]"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setCustomerModalOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-xl bg-[#0038A8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#002d87]"
            >
              Guardar y seleccionar
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
