import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Database,
  Download,
  FlaskConical,
  Loader2,
  Lock,
  PlugZap,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../lib/api";
import type {
  BridgeConfigState,
  CustomerMapping,
  IntrospectionResult,
  ProductMapping,
  SchemaMapping,
  TaxRate,
} from "../types/domain";
import { Modal } from "./Modal";

interface BridgeWizardProps {
  bridgeConfig: BridgeConfigState | null;
  onChanged: (message: string) => Promise<void>;
  onError: (message: string) => void;
}

function pickCol(
  cols: Array<{ name: string; dataType: string }>,
  patterns: string[],
  numericOnly = false
): string | null {
  const isNum = (dt: string) => /int|numeric|decimal|real|double|money|float/i.test(dt);
  const pool = numericOnly ? cols.filter((c) => isNum(c.dataType)) : cols;
  for (const pat of patterns) {
    const exact = pool.find((c) => c.name.toLowerCase() === pat);
    if (exact) return exact.name;
  }
  for (const pat of patterns) {
    const partial = pool.find((c) => c.name.toLowerCase().includes(pat));
    if (partial) return partial.name;
  }
  return null;
}

function extractPreviewImageUrl(raw: unknown): string | null {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    for (const it of raw) {
      const found = extractPreviewImageUrl(it);
      if (found) return found;
    }
    return null;
  }
  const str = String(raw).trim();
  if (!str) return null;
  if (str.startsWith("[") || str.startsWith("{")) {
    try {
      return extractPreviewImageUrl(JSON.parse(str));
    } catch {
      return null;
    }
  }
  return /^https?:\/\/\S+$/i.test(str) || str.startsWith("/") ? str : null;
}

export function BridgeWizard({ bridgeConfig, onChanged, onError }: BridgeWizardProps) {
  const [connectionUrl, setConnectionUrl] = useState("");
  const [useSavedConnection, setUseSavedConnection] = useState(
    Boolean(bridgeConfig?.hasConnectionUrl)
  );
  const [busy, setBusy] = useState<string | null>(null);

  const [introspection, setIntrospection] = useState<IntrospectionResult | null>(null);
  const [productMap, setProductMap] = useState<ProductMapping | null>(
    bridgeConfig?.mapping?.products ?? null
  );
  const [enableCustomerMap, setEnableCustomerMap] = useState(
    Boolean(bridgeConfig?.mapping?.customers)
  );
  const [customerMap, setCustomerMap] = useState<CustomerMapping | null>(
    bridgeConfig?.mapping?.customers ?? null
  );
  const [readOnly, setReadOnly] = useState<boolean>(bridgeConfig?.readOnly ?? true);

  // Modal Importación única
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [replaceDemo, setReplaceDemo] = useState(false);
  const [replaceConfirm, setReplaceConfirm] = useState("");

  // Modal Reset seguro de BD interna
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetMode, setResetMode] = useState<"empty" | "demo">("empty");
  const [resetPhrase, setResetPhrase] = useState("");

  const productTableMeta = useMemo(() => {
    if (!introspection || !productMap) return null;
    return (
      introspection.tables.find(
        (t) => t.schema === productMap.schema && t.table === productMap.table
      ) ?? null
    );
  }, [introspection, productMap]);

  const customerTableMeta = useMemo(() => {
    if (!introspection || !customerMap) return null;
    return (
      introspection.tables.find(
        (t) => t.schema === customerMap.schema && t.table === customerMap.table
      ) ?? null
    );
  }, [introspection, customerMap]);

  const applyIntrospection = (result: IntrospectionResult) => {
    setIntrospection(result);
    if (result.suggestedMapping.products) {
      setProductMap(result.suggestedMapping.products);
    } else if (result.tables[0]) {
      const t = result.tables[0];
      const c0 = t.columns[0]?.name ?? "id";
      setProductMap({
        schema: t.schema,
        table: t.table,
        idColumn: c0,
        skuColumn: c0,
        barcodeColumn: null,
        nameColumn: t.columns[1]?.name ?? c0,
        priceColumn: t.columns[2]?.name ?? c0,
        costColumn: null,
        stockColumn: null,
        minStockColumn: null,
        taxRateColumn: null,
        unitColumn: null,
        defaultTaxRate: "IVA_10",
      });
    }
    if (result.suggestedMapping.customers) {
      setEnableCustomerMap(true);
      setCustomerMap(result.suggestedMapping.customers);
    } else {
      setEnableCustomerMap(false);
      setCustomerMap(null);
    }
  };

  const handleIntrospect = async () => {
    const trimmed = connectionUrl.trim();
    if (!trimmed && !useSavedConnection) {
      onError("Ingresá una URL PostgreSQL o usá la BD legada de prueba.");
      return;
    }
    setBusy("introspect");
    try {
      const res = await api.introspectBridge(
        trimmed ? { connectionUrl: trimmed } : { useSavedConnection: true }
      );
      applyIntrospection(res);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Error al inspeccionar la BD");
    } finally {
      setBusy(null);
    }
  };

  const handleCreateSandbox = async () => {
    setBusy("sandbox");
    try {
      const res = await api.createSandboxLegacy();
      setConnectionUrl("");
      setUseSavedConnection(true);
      applyIntrospection(res.introspection);
      await onChanged(
        `Esquema legado de prueba "${res.schema}" creado e inspeccionado (sin activar Bridge todavía).`
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : "Error creando esquema de prueba");
    } finally {
      setBusy(null);
    }
  };

  const buildCurrentMapping = (): SchemaMapping | null => {
    if (!productMap) return null;
    return {
      products: productMap,
      customers: enableCustomerMap && customerMap ? customerMap : null,
    };
  };

  const handleActivateBridge = async () => {
    const mapping = buildCurrentMapping();
    if (!mapping) {
      onError("Primero inspeccioná y confirmá el mapeo de Productos.");
      return;
    }
    setBusy("activate");
    try {
      await api.saveBridgeConfig({
        mode: "BRIDGE",
        ...(connectionUrl.trim() ? { connectionUrl: connectionUrl.trim() } : {}),
        readOnly,
        mapping,
      });
      await onChanged(
        `Modo Bridge activado (${readOnly ? "Solo Lectura" : "Descuento atómico de stock"}).`
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo activar Modo Bridge");
    } finally {
      setBusy(null);
    }
  };

  const handleSwitchStandalone = async () => {
    setBusy("standalone");
    try {
      await api.saveBridgeConfig({
        mode: "STANDALONE",
        readOnly: true,
      });
      await onChanged("Vuelto a Modo Standalone (PostgreSQL propio de Ñemubox).");
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo cambiar a Standalone");
    } finally {
      setBusy(null);
    }
  };

  const handleRunImport = async () => {
    const mapping = buildCurrentMapping();
    if (!mapping) return;
    setBusy("import");
    try {
      const res = await api.importBridgeData({
        ...(connectionUrl.trim()
          ? { connectionUrl: connectionUrl.trim() }
          : { useSavedConnection: true }),
        mapping,
        replaceDemoCatalog: replaceDemo,
        confirmPhrase: replaceDemo ? replaceConfirm : undefined,
      });
      setImportModalOpen(false);
      setReplaceConfirm("");
      await onChanged(res.message);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Error importando datos");
    } finally {
      setBusy(null);
    }
  };

  const handleResetInternalDb = async () => {
    setBusy("reset");
    try {
      const res = await api.resetInternalDb({
        mode: resetMode,
        confirmPhrase: resetPhrase,
      });
      setResetModalOpen(false);
      setResetPhrase("");
      await onChanged(res.message);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Error reiniciando la BD interna");
    } finally {
      setBusy(null);
    }
  };

  const isBridge = bridgeConfig?.mode === "BRIDGE";

  return (
    <div className="space-y-6">
      {/* Banner de estado actual */}
      <section
        className={`rounded-2xl border p-5 shadow-sm ${
          isBridge
            ? "border-indigo-200 bg-indigo-50/60"
            : "border-slate-200 bg-white"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Database
                className={`h-5 w-5 ${isBridge ? "text-indigo-700" : "text-[#0038A8]"}`}
              />
              <h3 className="font-display text-base font-bold text-slate-900">
                {isBridge
                  ? "Modo Bridge / Metamórfico ACTIVO"
                  : "Modo Standalone ACTIVO (PostgreSQL propio)"}
              </h3>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                  isBridge
                    ? bridgeConfig.readOnly
                      ? "bg-indigo-100 text-indigo-800"
                      : "bg-emerald-100 text-emerald-800"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                {isBridge
                  ? bridgeConfig.readOnly
                    ? "Solo Lectura"
                    : "Descuento Atómico"
                  : "Standalone"}
              </span>
            </div>
            <p className="text-xs text-slate-600">
              {isBridge ? (
                <>
                  Leyendo catálogo en vivo desde{" "}
                  <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px]">
                    {bridgeConfig.mapping?.products.schema}.{bridgeConfig.mapping?.products.table}
                  </code>{" "}
                  sin alterar sus tablas. Fotos, XML SIFEN, CDC y KuDE viven en el Sidecar de
                  Ñemubox.
                </>
              ) : (
                "Operando 100% con el PostgreSQL propio de Ñemubox en Docker. Podés conectar una BD PostgreSQL heredada abajo sin alterar sus tablas."
              )}
            </p>
            {bridgeConfig?.lastTestMessage && (
              <p className="text-[11px] text-slate-500">
                Último estado: {bridgeConfig.lastTestMessage}
              </p>
            )}
          </div>

          {isBridge && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void handleSwitchStandalone()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-300 bg-white px-3.5 py-2 text-xs font-semibold text-indigo-800 hover:bg-indigo-50 disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Volver a Standalone
            </button>
          )}
        </div>
      </section>

      {/* Paso 1: Conexión + Auto-descubrimiento (Introspección) */}
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <PlugZap className="h-4 w-4 text-[#0038A8]" />
              Paso 1 — Conectar e inspeccionar BD existente (Solo Lectura)
            </h3>
            <p className="text-xs text-slate-500">
              Lee únicamente <code>information_schema</code> y 3 filas de muestra. Nunca ejecuta{" "}
              <code>ALTER TABLE</code> ni modifica tu base de datos.
            </p>
          </div>

          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void handleCreateSandbox()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          >
            {busy === "sandbox" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FlaskConical className="h-3.5 w-3.5" />
            )}
            Probar con BD legada simulada (legacy_erp)
          </button>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={connectionUrl}
            onChange={(e) => {
              setConnectionUrl(e.target.value);
              if (e.target.value.trim()) setUseSavedConnection(false);
            }}
            placeholder={
              bridgeConfig?.maskedConnectionUrl
                ? `Conexión guardada: ${bridgeConfig.maskedConnectionUrl} (dejá vacío para reutilizar)`
                : "postgresql://usuario:clave@host:5432/mi_erp_paraguay"
            }
            className="flex-1 rounded-xl border border-slate-200 px-3.5 py-2.5 font-mono text-xs outline-none focus:border-[#0038A8]"
          />
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void handleIntrospect()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#060E24] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#0d1c45] disabled:opacity-50"
          >
            {busy === "introspect" ? (
              <Loader2 className="h-4 w-4 animate-spin text-[#FBBF24]" />
            ) : (
              <Sparkles className="h-4 w-4 text-[#FBBF24]" />
            )}
            Auto-descubrir esquema
          </button>
        </div>

        <p className="text-[11px] text-slate-500">
          Compatible con PostgreSQL local, VPS, <strong>Supabase</strong> (usá la URI de{" "}
          <em>Session Pooler</em> <code>*.pooler.supabase.com:5432</code> para soporte IPv4 en
          Docker; SSL y exclusión de esquemas internos <code>auth/storage/realtime</code> son
          automáticos) y Neon.
        </p>

        {introspection && (
          <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-xs text-emerald-900">
            <p className="flex items-center gap-1.5 font-bold">
              <CheckCircle2 className="h-4 w-4 text-emerald-700" />
              Conectado a "{introspection.database}" ({introspection.serverVersion}) ·{" "}
              {introspection.tables.length} tabla(s) detectadas
            </p>
            <ul className="list-disc space-y-0.5 pl-5 text-[11px]">
              {introspection.confidenceNotes.map((note, idx) => (
                <li key={idx}>{note}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Paso 2: Wizard de Mapeo Inteligente */}
      {introspection && productMap && (
        <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <ArrowRightLeft className="h-4 w-4 text-[#0038A8]" />
              Paso 2 — Confirmar mapeo de columnas (schema-map.json)
            </h3>
            <p className="text-xs text-slate-500">
              Revisá las columnas sugeridas por la heurística Paraguay/Español. Todas se validan
              contra lista blanca de <code>information_schema</code>.
            </p>
          </div>

          {/* Mapeo Productos */}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Catálogo de Productos (Obligatorio)
              </h4>
              <select
                value={`${productMap.schema}.${productMap.table}`}
                onChange={(e) => {
                  const [schema, table] = e.target.value.split(".");
                  const meta = introspection.tables.find(
                    (t) => t.schema === schema && t.table === table
                  );
                  const cols = meta?.columns ?? [];
                  const firstCol = cols[0]?.name ?? "id";
                  const idCol = pickCol(cols, ["id", "cod_art", "codigo"]) ?? firstCol;
                  setProductMap({
                    ...productMap,
                    schema,
                    table,
                    idColumn: idCol,
                    skuColumn: pickCol(cols, ["sku", "cod_art", "codigo", "code"]) ?? idCol,
                    nameColumn:
                      pickCol(cols, ["name", "nombre", "title", "titulo", "descrip", "descripcion"]) ??
                      cols.find((c) => c.name !== idCol)?.name ??
                      firstCol,
                    priceColumn:
                      pickCol(cols, ["price", "precio", "p_venta", "pvp", "monto", "amount"], true) ??
                      pickCol(cols, ["price", "precio", "p_venta"]) ??
                      firstCol,
                    barcodeColumn: pickCol(cols, ["barcode", "cod_barra", "ean"]),
                    costColumn: pickCol(cols, ["cost", "costo", "p_compra"], true),
                    stockColumn: pickCol(cols, ["stock", "existencia", "quantity", "qty", "saldo", "cant"], true),
                    minStockColumn: pickCol(cols, ["min_stock", "stock_min", "minimo"], true),
                    taxRateColumn: pickCol(cols, ["tax_rate", "tasa_iva", "iva", "tax"]),
                    unitColumn: pickCol(cols, ["unit", "unidad", "medida"]),
                    imageUrlColumn: pickCol(cols, [
                      "image_url",
                      "imagen_url",
                      "foto_url",
                      "photo_url",
                      "img_url",
                      "image",
                      "images",
                      "imagen",
                      "foto",
                      "photo",
                      "thumbnail",
                      "picture",
                    ]),
                  });
                }}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-mono text-xs font-semibold text-slate-900"
              >
                {introspection.tables.map((t) => (
                  <option key={`${t.schema}.${t.table}`} value={`${t.schema}.${t.table}`}>
                    {t.schema}.{t.table} ({t.estimatedRows} filas)
                  </option>
                ))}
              </select>
            </div>

            {productTableMeta && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <ColSelect
                  label="ID único *"
                  required
                  value={productMap.idColumn}
                  columns={productTableMeta.columns}
                  onChange={(v) => setProductMap({ ...productMap, idColumn: v })}
                />
                <ColSelect
                  label="Nombre / Descripción *"
                  required
                  value={productMap.nameColumn}
                  columns={productTableMeta.columns}
                  onChange={(v) => setProductMap({ ...productMap, nameColumn: v })}
                />
                <ColSelect
                  label="Precio de venta *"
                  required
                  value={productMap.priceColumn}
                  columns={productTableMeta.columns}
                  onChange={(v) => setProductMap({ ...productMap, priceColumn: v })}
                />
                <ColSelect
                  label="Stock / Existencia"
                  value={productMap.stockColumn ?? ""}
                  columns={productTableMeta.columns}
                  onChange={(v) => setProductMap({ ...productMap, stockColumn: v || null })}
                />
                <ColSelect
                  label="SKU / Código interno"
                  value={productMap.skuColumn ?? ""}
                  columns={productTableMeta.columns}
                  onChange={(v) => setProductMap({ ...productMap, skuColumn: v || null })}
                />
                <ColSelect
                  label="Código de barras"
                  value={productMap.barcodeColumn ?? ""}
                  columns={productTableMeta.columns}
                  onChange={(v) => setProductMap({ ...productMap, barcodeColumn: v || null })}
                />
                <ColSelect
                  label="Foto / Imagen URL"
                  value={productMap.imageUrlColumn ?? ""}
                  columns={productTableMeta.columns}
                  onChange={(v) => setProductMap({ ...productMap, imageUrlColumn: v || null })}
                />
                <ColSelect
                  label="Tasa IVA (10%/5%/Exenta)"
                  value={productMap.taxRateColumn ?? ""}
                  columns={productTableMeta.columns}
                  onChange={(v) => setProductMap({ ...productMap, taxRateColumn: v || null })}
                />
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                    IVA por defecto (Sidecar)
                  </label>
                  <select
                    value={productMap.defaultTaxRate}
                    onChange={(e) =>
                      setProductMap({ ...productMap, defaultTaxRate: e.target.value as TaxRate })
                    }
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                  >
                    <option value="IVA_10">IVA 10%</option>
                    <option value="IVA_5">IVA 5%</option>
                    <option value="EXENTA">Exenta</option>
                  </select>
                </div>
              </div>
            )}

            {/* Muestra real de 3 filas */}
            {productTableMeta && productTableMeta.sampleRows.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full border-collapse text-left font-mono text-[11px]">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-slate-500">
                      {productMap.imageUrlColumn && <th className="px-2.5 py-1.5">Foto</th>}
                      <th className="px-2.5 py-1.5">ID ({productMap.idColumn})</th>
                      <th className="px-2.5 py-1.5">Nombre ({productMap.nameColumn})</th>
                      <th className="px-2.5 py-1.5">Precio ({productMap.priceColumn})</th>
                      <th className="px-2.5 py-1.5">
                        Stock ({productMap.stockColumn ?? "sin stock"})
                      </th>
                      <th className="px-2.5 py-1.5">
                        IVA ({productMap.taxRateColumn ?? productMap.defaultTaxRate})
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    {productTableMeta.sampleRows.map((row, idx) => {
                      const previewImg = productMap.imageUrlColumn
                        ? extractPreviewImageUrl(row[productMap.imageUrlColumn])
                        : null;
                      return (
                        <tr key={idx}>
                          {productMap.imageUrlColumn && (
                            <td className="px-2.5 py-1.5">
                              {previewImg ? (
                                <img
                                  src={previewImg}
                                  alt=""
                                  className="h-8 w-8 rounded-md border border-slate-200 object-cover"
                                />
                              ) : (
                                "—"
                              )}
                            </td>
                          )}
                          <td className="px-2.5 py-1.5">{String(row[productMap.idColumn] ?? "—")}</td>
                          <td className="px-2.5 py-1.5">{String(row[productMap.nameColumn] ?? "—")}</td>
                          <td className="px-2.5 py-1.5">{String(row[productMap.priceColumn] ?? "—")}</td>
                          <td className="px-2.5 py-1.5">
                            {productMap.stockColumn ? String(row[productMap.stockColumn] ?? "—") : "—"}
                          </td>
                          <td className="px-2.5 py-1.5">
                            {productMap.taxRateColumn
                              ? String(row[productMap.taxRateColumn] ?? "—")
                              : productMap.defaultTaxRate}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Mapeo Clientes (Opcional) */}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
                <input
                  type="checkbox"
                  checked={enableCustomerMap}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setEnableCustomerMap(checked);
                    if (checked && !customerMap && introspection.tables.length > 0) {
                      const t =
                        introspection.tables.find(
                          (x) => !(x.schema === productMap.schema && x.table === productMap.table)
                        ) ?? introspection.tables[0];
                      const c0 = t.columns[0]?.name ?? "id";
                      setCustomerMap({
                        schema: t.schema,
                        table: t.table,
                        idColumn: c0,
                        documentColumn: t.columns[1]?.name ?? c0,
                        dvColumn: null,
                        nameColumn: t.columns[2]?.name ?? c0,
                        emailColumn: null,
                        addressColumn: null,
                      });
                    }
                  }}
                />
                Mapear tabla de Clientes externa (Opcional)
              </label>

              {enableCustomerMap && customerMap && (
                <select
                  value={`${customerMap.schema}.${customerMap.table}`}
                  onChange={(e) => {
                    const [schema, table] = e.target.value.split(".");
                    const meta = introspection.tables.find(
                      (t) => t.schema === schema && t.table === table
                    );
                    const c0 = meta?.columns[0]?.name ?? "id";
                    setCustomerMap({
                      schema,
                      table,
                      idColumn: c0,
                      documentColumn: meta?.columns[1]?.name ?? c0,
                      dvColumn: null,
                      nameColumn: meta?.columns[2]?.name ?? c0,
                      emailColumn: null,
                      addressColumn: null,
                    });
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-mono text-xs font-semibold text-slate-900"
                >
                  {introspection.tables.map((t) => (
                    <option key={`${t.schema}.${t.table}`} value={`${t.schema}.${t.table}`}>
                      {t.schema}.{t.table} ({t.estimatedRows} filas)
                    </option>
                  ))}
                </select>
              )}
            </div>

            {enableCustomerMap && customerMap && customerTableMeta && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <ColSelect
                  label="ID cliente *"
                  required
                  value={customerMap.idColumn}
                  columns={customerTableMeta.columns}
                  onChange={(v) => setCustomerMap({ ...customerMap, idColumn: v })}
                />
                <ColSelect
                  label="RUC / CI *"
                  required
                  value={customerMap.documentColumn}
                  columns={customerTableMeta.columns}
                  onChange={(v) => setCustomerMap({ ...customerMap, documentColumn: v })}
                />
                <ColSelect
                  label="Razón Social / Nombre *"
                  required
                  value={customerMap.nameColumn}
                  columns={customerTableMeta.columns}
                  onChange={(v) => setCustomerMap({ ...customerMap, nameColumn: v })}
                />
                <ColSelect
                  label="Email"
                  value={customerMap.emailColumn ?? ""}
                  columns={customerTableMeta.columns}
                  onChange={(v) => setCustomerMap({ ...customerMap, emailColumn: v || null })}
                />
              </div>
            )}
          </div>

          {/* Paso 3: Seguridad + Acciones */}
          <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                  <Lock className="h-3.5 w-3.5 text-[#0038A8]" />
                  Política de escritura sobre la BD externa
                </p>
                <p className="text-[11px] text-slate-500">
                  Por seguridad arranca en <strong>Solo Lectura</strong>. Activá descuento atómico
                  solo si querés que cada factura POS ejecute{" "}
                  <code>UPDATE ... SET stock = stock - $1</code>.
                </p>
              </div>
              <div className="inline-flex rounded-xl bg-slate-200/80 p-1">
                <button
                  type="button"
                  onClick={() => setReadOnly(true)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                    readOnly ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
                  }`}
                >
                  Solo Lectura (Seguro)
                </button>
                <button
                  type="button"
                  onClick={() => setReadOnly(false)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                    !readOnly ? "bg-[#0038A8] text-white shadow-sm" : "text-slate-600"
                  }`}
                >
                  Descuento Atómico
                </button>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-3">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => setImportModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" />
                Importar una vez a Standalone
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void handleActivateBridge()}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0038A8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#002d87] disabled:opacity-50"
              >
                {busy === "activate" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <PlugZap className="h-3.5 w-3.5" />
                )}
                Activar Modo Bridge en vivo
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Zona segura de mantenimiento de BD interna */}
      <section className="rounded-2xl border border-rose-200 bg-rose-50/50 p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="flex items-center gap-2 text-sm font-bold text-rose-900">
              <ShieldAlert className="h-4 w-4 text-rose-600" />
              Mantenimiento de la BD interna de Ñemubox
            </h3>
            <p className="text-xs text-rose-800/80">
              Permite vaciar los datos demo para arrancar limpio en producción o restaurar el set de
              prueba. <strong>Nunca</strong> modifica ni borra una base de datos externa conectada.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setResetMode("empty");
              setResetPhrase("");
              setResetModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-white px-3.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Vaciar / Reiniciar BD interna
          </button>
        </div>
      </section>

      {/* Modal Importación única */}
      <Modal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        title="Importar catálogo a Ñemubox Standalone"
        subtitle="Copia los productos y clientes mapeados al PostgreSQL propio de Ñemubox sin tocar la BD origen."
        maxWidthClass="max-w-md"
      >
        <div className="space-y-4 text-xs text-slate-700">
          <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <input
              type="checkbox"
              checked={replaceDemo}
              onChange={(e) => setReplaceDemo(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <strong>Reemplazar catálogo demo actual</strong> (borra los productos, ventas y
              facturas internas previas antes de importar).
            </span>
          </label>

          {replaceDemo && (
            <div>
              <label className="mb-1 block font-semibold text-rose-700">
                Escribí <code>REEMPLAZAR</code> para confirmar:
              </label>
              <input
                value={replaceConfirm}
                onChange={(e) => setReplaceConfirm(e.target.value)}
                placeholder="REEMPLAZAR"
                className="w-full rounded-xl border border-rose-300 px-3 py-2 font-mono text-sm uppercase outline-none focus:border-rose-500"
              />
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => setImportModalOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={busy !== null || (replaceDemo && replaceConfirm.trim().toUpperCase() !== "REEMPLAZAR")}
              onClick={() => void handleRunImport()}
              className="rounded-xl bg-[#0038A8] px-4 py-2 font-semibold text-white hover:bg-[#002d87] disabled:opacity-50"
            >
              {busy === "import" ? "Importando..." : "Ejecutar importación"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Reinicio seguro de BD interna */}
      <Modal
        open={resetModalOpen}
        onClose={() => setResetModalOpen(false)}
        title="Reiniciar base de datos interna"
        subtitle="Solo afecta al PostgreSQL interno de Ñemubox. Jamás toca una base de datos externa."
        maxWidthClass="max-w-md"
      >
        <div className="space-y-4 text-xs text-slate-700">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setResetMode("empty")}
              className={`rounded-xl border p-3 text-left transition ${
                resetMode === "empty"
                  ? "border-rose-500 bg-rose-50 text-rose-900"
                  : "border-slate-200 text-slate-600"
              }`}
            >
              <p className="font-bold">Vaciar para producción</p>
              <p className="mt-0.5 text-[11px]">
                Limpia catálogo, ventas y facturas. Conserva tu Emisor y Consumidor Final.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setResetMode("demo")}
              className={`rounded-xl border p-3 text-left transition ${
                resetMode === "demo"
                  ? "border-[#0038A8] bg-blue-50 text-[#0038A8]"
                  : "border-slate-200 text-slate-600"
              }`}
            >
              <p className="font-bold">Restaurar datos demo</p>
              <p className="mt-0.5 text-[11px]">
                Vuelve a cargar los 5 productos de prueba Paraguay y clientes iniciales.
              </p>
            </button>
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            <span>
              Esta acción borrará ventas, facturas mock y movimientos de Kardex del PostgreSQL
              interno.
            </span>
          </div>

          <div>
            <label className="mb-1 block font-semibold text-slate-800">
              Para confirmar, escribí <code>REINICIAR</code>:
            </label>
            <input
              autoFocus
              value={resetPhrase}
              onChange={(e) => setResetPhrase(e.target.value)}
              placeholder="REINICIAR"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm uppercase outline-none focus:border-rose-500"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => setResetModalOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={busy !== null || resetPhrase.trim().toUpperCase() !== "REINICIAR"}
              onClick={() => void handleResetInternalDb()}
              className="rounded-xl bg-rose-600 px-4 py-2 font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {busy === "reset" ? "Procesando..." : "Confirmar reinicio"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ColSelect({
  label,
  value,
  columns,
  required = false,
  onChange,
}: {
  label: string;
  value: string;
  columns: Array<{ name: string; dataType: string }>;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold text-slate-600">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-800 outline-none focus:border-[#0038A8]"
      >
        {!required && <option value="">— No mapear —</option>}
        {columns.map((c) => (
          <option key={c.name} value={c.name}>
            {c.name} ({c.dataType})
          </option>
        ))}
      </select>
    </div>
  );
}
