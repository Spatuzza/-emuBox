import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Camera,
  History,
  ImagePlus,
  Loader2,
  Package,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react";
import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "../components/Modal";
import { PaginationBar } from "../components/PaginationBar";
import { compressImageFileToDataUrl } from "../lib/api";
import { formatDateTimePY, formatPYG, taxRateBadgeClass, taxRateLabel } from "../lib/format";
import type { Product, StockMovement, StockMovementType, TaxRate } from "../types/domain";

interface StockViewProps {
  products: Product[];
  movements: StockMovement[];
  onSaveProduct: (product: Omit<Product, "id"> & { id?: string }) => Promise<void>;
  onAdjustStock: (params: {
    productId: string;
    type: StockMovementType;
    quantity: number;
    notes: string;
  }) => Promise<void>;
  onUploadImage: (productId: string, dataUrl: string) => Promise<void>;
  onGenerateAiImage: (productId: string, prompt?: string) => Promise<void>;
  onDeleteImage: (productId: string) => Promise<void>;
}

type StockFilter = "ALL" | "LOW" | TaxRate;

const EMPTY_FORM = {
  sku: "",
  barcode: "",
  name: "",
  unit: "UNI",
  price: 10000,
  cost: 6000,
  taxRate: "IVA_10" as TaxRate,
  stock: 10,
  minStock: 5,
};

function formatSourceLabel(source?: string): string {
  switch (source) {
    case "UPLOAD":
      return "Foto subida";
    case "EXTERNAL_URL":
      return "URL BD externa";
    case "ICON_ICONIFY":
      return "Ícono simple · Iconify";
    case "AI_POLLINATIONS":
      return "IA · Pollinations";
    case "AI_CLOUDFLARE":
      return "IA · Cloudflare";
    case "AI_HUGGINGFACE":
      return "IA · Hugging Face";
    case "AI_LOCAL":
      return "Miniatura local";
    default:
      return "DB";
  }
}

export function StockView({
  products,
  movements,
  onSaveProduct,
  onAdjustStock,
  onUploadImage,
  onGenerateAiImage,
  onDeleteImage,
}: StockViewProps) {
  const [subTab, setSubTab] = useState<"catalog" | "kardex">("catalog");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StockFilter>("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [kardexPage, setKardexPage] = useState(1);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  // Modal Producto
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [savingProduct, setSavingProduct] = useState(false);

  // Modal Movimiento Kardex
  const [moveProduct, setMoveProduct] = useState<Product | null>(null);
  const [moveType, setMoveType] = useState<StockMovementType>("IN");
  const [moveQty, setMoveQty] = useState(5);
  const [moveNotes, setMoveNotes] = useState("");
  const [savingMove, setSavingMove] = useState(false);

  // Modal Foto + Generación IA
  const [imageModalProductId, setImageModalProductId] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [imageBusy, setImageBusy] = useState<"upload" | "ai" | "delete" | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const imageProduct = useMemo(
    () => products.find((p) => p.id === imageModalProductId) ?? null,
    [products, imageModalProductId]
  );

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (!p.active) return false;
      if (filter === "LOW" && p.stock > p.minStock) return false;
      if ((filter === "IVA_10" || filter === "IVA_5" || filter === "EXENTA") && p.taxRate !== filter) {
        return false;
      }
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.barcode ?? "").toLowerCase().includes(q)
      );
    });
  }, [products, query, filter]);

  useEffect(() => {
    setPage(1);
  }, [query, filter, pageSize]);

  const paginatedProducts = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, page, pageSize]);

  const paginatedMovements = useMemo(() => {
    const start = (kardexPage - 1) * 25;
    return movements.slice(start, start + 25);
  }, [movements, kardexPage]);

  const openNewProduct = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setProductModalOpen(true);
  };

  const openEditProduct = (p: Product) => {
    setEditingId(p.id);
    setForm({
      sku: p.sku,
      barcode: p.barcode ?? "",
      name: p.name,
      unit: p.unit,
      price: p.price,
      cost: p.cost,
      taxRate: p.taxRate,
      stock: p.stock,
      minStock: p.minStock,
    });
    setProductModalOpen(true);
  };

  const handleProductSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.sku.trim() || !form.name.trim()) return;
    setSavingProduct(true);
    try {
      await onSaveProduct({
        id: editingId ?? undefined,
        sku: form.sku.trim().toUpperCase(),
        barcode: form.barcode.trim() || undefined,
        name: form.name.trim(),
        unit: form.unit.trim().toUpperCase() || "UNI",
        price: Math.max(0, Number(form.price)),
        cost: Math.max(0, Number(form.cost)),
        taxRate: form.taxRate,
        stock: Math.max(0, Number(form.stock)),
        minStock: Math.max(0, Number(form.minStock)),
        active: true,
      });
      setProductModalOpen(false);
    } finally {
      setSavingProduct(false);
    }
  };

  const handleMoveSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!moveProduct) return;
    if (moveType !== "ADJUSTMENT" && moveQty <= 0) return;
    setSavingMove(true);
    try {
      await onAdjustStock({
        productId: moveProduct.id,
        type: moveType,
        quantity: Number(moveQty),
        notes:
          moveNotes.trim() ||
          (moveType === "IN"
            ? "Entrada de mercadería"
            : moveType === "OUT"
              ? "Salida manual de stock"
              : "Ajuste de inventario"),
      });
      setMoveProduct(null);
      setMoveNotes("");
      setMoveQty(5);
    } finally {
      setSavingMove(false);
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !imageProduct) return;
    setImageBusy("upload");
    try {
      const dataUrl = await compressImageFileToDataUrl(file, 512);
      await onUploadImage(imageProduct.id, dataUrl);
    } finally {
      setImageBusy(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleGenerateAi = async () => {
    if (!imageProduct) return;
    setImageBusy("ai");
    try {
      await onGenerateAiImage(imageProduct.id, aiPrompt.trim() || undefined);
    } finally {
      setImageBusy(null);
    }
  };

  const handleDeletePhoto = async () => {
    if (!imageProduct) return;
    setImageBusy("delete");
    try {
      await onDeleteImage(imageProduct.id);
    } finally {
      setImageBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900">
            Productos e Inventario (Kardex)
          </h2>
          <p className="text-xs text-slate-500">
            Persistido en PostgreSQL · Fotos guardadas en BD + generación gratuita de miniaturas IA.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl bg-slate-200/70 p-1">
            <button
              type="button"
              onClick={() => setSubTab("catalog")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                subTab === "catalog"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Package className="h-3.5 w-3.5" />
              Catálogo ({products.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab("kardex")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                subTab === "kardex"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <History className="h-3.5 w-3.5" />
              Kardex ({movements.length})
            </button>
          </div>

          <button
            type="button"
            onClick={openNewProduct}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#060E24] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#0d1d47]"
          >
            <Plus className="h-4 w-4 text-[#FBBF24]" />
            Nuevo producto
          </button>
        </div>
      </div>

      {subTab === "catalog" ? (
        <>
          {/* Barra de búsqueda y filtros */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
            <div className="relative min-w-[240px] flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre, SKU o código de barras..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pr-3 pl-9 text-sm text-slate-900 outline-none transition focus:border-[#0038A8] focus:bg-white"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: "ALL", label: "Todos" },
                  { id: "LOW", label: "Bajo stock" },
                  { id: "IVA_10", label: "IVA 10%" },
                  { id: "IVA_5", label: "IVA 5%" },
                  { id: "EXENTA", label: "Exenta" },
                ] as const
              ).map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setFilter(chip.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    filter === chip.id
                      ? "bg-[#0038A8] text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tabla de productos */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                    <th className="px-4 py-3">Producto</th>
                    <th className="px-4 py-3">SKU / Código</th>
                    <th className="px-4 py-3">IVA PY</th>
                    <th className="px-4 py-3 text-right">Precio venta</th>
                    <th className="px-4 py-3 text-right">Stock</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 tabular-nums">
                  {paginatedProducts.map((p) => {
                    const isLow = p.stock <= p.minStock;
                    const showPhoto = Boolean(p.imageUrl) && !brokenImages[p.id];
                    return (
                      <tr key={p.id} className="transition hover:bg-slate-50/70">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                setImageModalProductId(p.id);
                                setAiPrompt("");
                              }}
                              title="Gestionar foto o generar miniatura"
                              className="group relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 transition hover:border-[#0038A8]"
                            >
                              {showPhoto ? (
                                <img
                                  src={p.imageUrl}
                                  alt={p.name}
                                  loading="lazy"
                                  onError={() =>
                                    setBrokenImages((prev) => ({ ...prev, [p.id]: true }))
                                  }
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <Camera className="h-4 w-4 text-slate-400 group-hover:text-[#0038A8]" />
                              )}
                              {p.imageSource?.startsWith("AI_") && (
                                <span className="absolute right-0.5 bottom-0.5 rounded bg-[#060E24]/80 px-1 font-mono text-[8px] font-bold text-[#FBBF24]">
                                  IA
                                </span>
                              )}
                            </button>

                            <div className="min-w-0">
                              <div className="font-medium text-slate-900">{p.name}</div>
                              <div className="text-[11px] text-slate-400">
                                Costo ref: {formatPYG(p.cost)} · Unidad: {p.unit}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-mono text-xs font-semibold text-slate-800">
                            {p.sku}
                          </div>
                          {p.barcode && (
                            <div className="font-mono text-[10px] text-slate-400">{p.barcode}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${taxRateBadgeClass(
                              p.taxRate
                            )}`}
                          >
                            {taxRateLabel(p.taxRate)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900">
                          {formatPYG(p.price)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                              isLow
                                ? "bg-amber-100 text-amber-800"
                                : "bg-emerald-50 text-emerald-700"
                            }`}
                          >
                            {isLow && <AlertTriangle className="h-3 w-3" />}
                            {p.stock} {p.unit}
                          </span>
                          <div className="text-[10px] text-slate-400">Mín: {p.minStock}</div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setImageModalProductId(p.id);
                                setAiPrompt("");
                              }}
                              title="Foto / IA"
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:border-amber-400 hover:text-amber-700"
                            >
                              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                              Foto
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setMoveProduct(p);
                                setMoveType("IN");
                                setMoveQty(5);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-[#0038A8]/40 hover:text-[#0038A8]"
                            >
                              <SlidersHorizontal className="h-3.5 w-3.5" />
                              Kardex
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditProduct(p)}
                              aria-label={`Editar ${p.name}`}
                              className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredProducts.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                        No se encontraron productos con el filtro actual.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <PaginationBar
            page={page}
            pageSize={pageSize}
            totalItems={filteredProducts.length}
            pageSizeOptions={[25, 50, 100]}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </>
      ) : (
        /* Historial Kardex */
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Producto</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3 text-right">Cantidad</th>
                    <th className="px-4 py-3 text-right">Stock Ant. → Nuevo</th>
                    <th className="px-4 py-3">Referencia / Motivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 tabular-nums">
                  {paginatedMovements.map((m) => {
                  const isPositive = m.quantity >= 0;
                  return (
                    <tr key={m.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">
                        {formatDateTimePY(m.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{m.productName}</div>
                        <div className="font-mono text-[10px] text-slate-400">{m.productSku}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                            isPositive
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-rose-100 text-rose-700"
                          }`}
                        >
                          {isPositive ? (
                            <ArrowUpCircle className="h-3 w-3" />
                          ) : (
                            <ArrowDownCircle className="h-3 w-3" />
                          )}
                          {m.type}
                        </span>
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono font-bold ${
                          isPositive ? "text-emerald-700" : "text-rose-700"
                        }`}
                      >
                        {isPositive ? `+${m.quantity}` : m.quantity}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-slate-600">
                        {m.previousStock} → <strong className="text-slate-900">{m.newStock}</strong>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">{m.notes}</td>
                    </tr>
                  );
                })}
                </tbody>
              </table>
            </div>
          </div>
          <PaginationBar
            page={kardexPage}
            pageSize={25}
            totalItems={movements.length}
            onPageChange={setKardexPage}
          />
        </div>
      )}

      {/* Modal Foto en DB + Generación con IA gratuita */}
      <Modal
        open={Boolean(imageProduct)}
        onClose={() => setImageModalProductId(null)}
        title={imageProduct ? `Imagen — ${imageProduct.name}` : "Imagen del producto"}
        subtitle="La imagen se guarda directamente en PostgreSQL (tabla product_images) y aparece en Catálogo y Caja POS."
        maxWidthClass="max-w-lg"
      >
        {imageProduct && (
          <div className="space-y-5">
            {/* Preview */}
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex h-48 w-48 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                {imageBusy === "ai" || imageBusy === "upload" ? (
                  <div className="flex flex-col items-center gap-2 text-xs text-slate-500">
                    <Loader2 className="h-7 w-7 animate-spin text-[#0038A8]" />
                    <span>
                      {imageBusy === "ai" ? "Generando mini-imagen con IA..." : "Guardando en BD..."}
                    </span>
                  </div>
                ) : imageProduct.imageUrl ? (
                  <img
                    src={imageProduct.imageUrl}
                    alt={imageProduct.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-1.5 text-slate-400">
                    <ImagePlus className="h-8 w-8" />
                    <span className="text-xs">Sin foto todavía</span>
                  </div>
                )}
              </div>

              {imageProduct.hasImage && (
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <span className="rounded-full bg-slate-200/80 px-2.5 py-0.5 font-semibold text-slate-700">
                    {formatSourceLabel(imageProduct.imageSource)}
                  </span>
                  {imageProduct.imageSizeBytes && (
                    <span className="font-mono">
                      {(imageProduct.imageSizeBytes / 1024).toFixed(1)} KB en PostgreSQL
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Opción 1: Subir foto real */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-800">1. Subir foto real (PC / Cámara)</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => void handleFileChange(e)}
                className="hidden"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={imageBusy !== null}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:border-[#0038A8] hover:text-[#0038A8] disabled:opacity-50"
                >
                  <Camera className="h-4 w-4" />
                  Elegir imagen (auto-optimizada a 512px)
                </button>
                {imageProduct.hasImage && (
                  <button
                    type="button"
                    disabled={imageBusy !== null}
                    onClick={() => void handleDeletePhoto()}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50/60 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Quitar
                  </button>
                )}
              </div>
            </div>

            {/* Opción 2: Generar ícono minimalista en líneas simples (API gratuita) */}
            <div className="space-y-2.5 border-t border-slate-100 pt-4">
              <p className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                2. Generar ícono en líneas simples (Gratis · sin API key)
              </p>
              <input
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder={`Palabra clave opcional (ej. agua, arroz, yerba, pan, libro...)`}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-[#0038A8]"
              />
              <button
                type="button"
                disabled={imageBusy !== null}
                onClick={() => void handleGenerateAi()}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#060E24] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-[#0d1c45] disabled:opacity-50"
              >
                {imageBusy === "ai" ? (
                  <Loader2 className="h-4 w-4 animate-spin text-[#FBBF24]" />
                ) : (
                  <Sparkles className="h-4 w-4 text-[#FBBF24]" />
                )}
                Generar ícono minimalista y guardar en PostgreSQL
              </button>
              <p className="text-[11px] text-slate-500">
                Busca automáticamente un símbolo vectorial limpio vía <strong>Iconify API</strong>{" "}
                (100% gratis) según el nombre del producto y lo guarda en PostgreSQL (~1.5 KB).
              </p>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Crear / Editar Producto */}
      <Modal
        open={productModalOpen}
        onClose={() => setProductModalOpen(false)}
        title={editingId ? "Editar producto" : "Nuevo producto"}
        subtitle="Configurá el precio en Guaraníes y el tipo de IVA paraguayo para SIFEN."
      >
        <form onSubmit={(e) => void handleProductSubmit(e)} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">SKU *</label>
              <input
                required
                autoFocus
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                placeholder="Ej. YERBA-1KG"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm uppercase outline-none focus:border-[#0038A8]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                Código de barras
              </label>
              <input
                value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                placeholder="784..."
                className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm outline-none focus:border-[#0038A8]"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              Nombre del producto *
            </label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ej. Yerba Mate Compuesta 1kg"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0038A8]"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                Precio venta (Gs.) *
              </label>
              <input
                type="number"
                min={0}
                step={50}
                required
                value={form.price}
                onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm outline-none focus:border-[#0038A8]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                Costo ref. (Gs.)
              </label>
              <input
                type="number"
                min={0}
                step={50}
                value={form.cost}
                onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm outline-none focus:border-[#0038A8]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">IVA Paraguay</label>
              <select
                value={form.taxRate}
                onChange={(e) => setForm({ ...form, taxRate: e.target.value as TaxRate })}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0038A8]"
              >
                <option value="IVA_10">IVA 10%</option>
                <option value="IVA_5">IVA 5%</option>
                <option value="EXENTA">Exenta (0%)</option>
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Unidad</label>
              <input
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                placeholder="UNI / KG / LT"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm uppercase outline-none focus:border-[#0038A8]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                {editingId ? "Stock actual" : "Stock inicial"}
              </label>
              <input
                type="number"
                min={0}
                disabled={Boolean(editingId)}
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm outline-none focus:border-[#0038A8] disabled:bg-slate-100 disabled:text-slate-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                Stock mínimo
              </label>
              <input
                type="number"
                min={0}
                value={form.minStock}
                onChange={(e) => setForm({ ...form, minStock: Number(e.target.value) })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm outline-none focus:border-[#0038A8]"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setProductModalOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={savingProduct}
              className="rounded-xl bg-[#0038A8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#002d87] disabled:opacity-50"
            >
              {savingProduct ? "Guardando..." : editingId ? "Guardar cambios" : "Crear producto"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Movimiento de Kardex */}
      <Modal
        open={Boolean(moveProduct)}
        onClose={() => setMoveProduct(null)}
        title={moveProduct ? `Movimiento Kardex — ${moveProduct.name}` : "Kardex"}
        subtitle={
          moveProduct
            ? `Stock actual: ${moveProduct.stock} ${moveProduct.unit} (SKU: ${moveProduct.sku})`
            : undefined
        }
        maxWidthClass="max-w-md"
      >
        <form onSubmit={(e) => void handleMoveSubmit(e)} className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { id: "IN", label: "Entrada (+)" },
                { id: "OUT", label: "Salida (-)" },
                { id: "ADJUSTMENT", label: "Fijar Stock" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setMoveType(opt.id)}
                className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                  moveType === opt.id
                    ? "border-[#0038A8] bg-blue-50 text-[#0038A8]"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              {moveType === "ADJUSTMENT" ? "Nuevo stock exacto" : "Cantidad"}
            </label>
            <input
              type="number"
              min={moveType === "ADJUSTMENT" ? 0 : 1}
              required
              autoFocus
              value={moveQty}
              onChange={(e) => setMoveQty(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-base font-bold outline-none focus:border-[#0038A8]"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              Motivo / Comprobante
            </label>
            <input
              value={moveNotes}
              onChange={(e) => setMoveNotes(e.target.value)}
              placeholder="Ej. Compra proveedor factura #450"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0038A8]"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setMoveProduct(null)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={savingMove}
              className="rounded-xl bg-[#060E24] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0d1c45] disabled:opacity-50"
            >
              {savingMove ? "Registrando..." : "Registrar movimiento"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
