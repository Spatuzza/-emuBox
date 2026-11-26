import {
  type BridgeConfig,
  DataSourceMode,
  DocumentIdType,
  StockMovementType,
  TaxRate,
} from "@prisma/client";
import type { Pool } from "pg";
import { calculateMod11DV } from "../../lib/paraguay.js";
import { prisma } from "../../lib/prisma.js";
import {
  createExternalPool,
  maskConnectionUrl,
  quoteIdent,
  validateMappingAgainstSchema,
} from "./introspect.js";
import { type SchemaMapping, schemaMappingSchema } from "./types.js";

let cachedPool: { url: string; pool: Pool } | null = null;

export async function getExternalPool(connectionUrl: string): Promise<Pool> {
  if (cachedPool && cachedPool.url === connectionUrl) {
    return cachedPool.pool;
  }
  if (cachedPool) {
    await cachedPool.pool.end().catch(() => undefined);
    cachedPool = null;
  }
  const pool = createExternalPool(connectionUrl);
  cachedPool = { url: connectionUrl, pool };
  return pool;
}

export async function closeBridgePool(): Promise<void> {
  if (cachedPool) {
    await cachedPool.pool.end().catch(() => undefined);
    cachedPool = null;
  }
}

export async function getBridgeConfig(): Promise<BridgeConfig> {
  return prisma.bridgeConfig.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      mode: DataSourceMode.STANDALONE,
      provider: "postgresql",
      readOnly: true,
    },
  });
}

export function serializeBridgeConfig(cfg: BridgeConfig) {
  return {
    mode: cfg.mode,
    provider: cfg.provider,
    hasConnectionUrl: Boolean(cfg.connectionUrl),
    maskedConnectionUrl: maskConnectionUrl(cfg.connectionUrl),
    readOnly: cfg.readOnly,
    mapping: cfg.mappingJson ?? null,
    lastTestedAt: cfg.lastTestedAt?.toISOString() ?? null,
    lastTestOk: cfg.lastTestOk,
    lastTestMessage: cfg.lastTestMessage ?? null,
    updatedAt: cfg.updatedAt.toISOString(),
  };
}

export function parseBridgeMapping(cfg: BridgeConfig): SchemaMapping | null {
  if (!cfg.mappingJson) return null;
  const parsed = schemaMappingSchema.safeParse(cfg.mappingJson);
  return parsed.success ? parsed.data : null;
}

export function isBridgeActive(cfg: BridgeConfig): boolean {
  return (
    cfg.mode === DataSourceMode.BRIDGE &&
    Boolean(cfg.connectionUrl) &&
    Boolean(parseBridgeMapping(cfg))
  );
}

export function normalizeParaguayTaxRate(raw: unknown, fallback: TaxRate): TaxRate {
  if (raw === null || raw === undefined) return fallback;
  const str = String(raw).trim().toUpperCase();
  if (str === "10" || str === "10%" || str === "IVA_10" || str === "IVA10" || str === "G10") {
    return TaxRate.IVA_10;
  }
  if (str === "5" || str === "5%" || str === "IVA_5" || str === "IVA5" || str === "G5") {
    return TaxRate.IVA_5;
  }
  if (
    str === "0" ||
    str === "0%" ||
    str === "EXENTA" ||
    str === "EXENTO" ||
    str === "EX" ||
    str === "EXE"
  ) {
    return TaxRate.EXENTA;
  }
  const num = Number(raw);
  if (!Number.isNaN(num)) {
    if (num >= 8) return TaxRate.IVA_10;
    if (num >= 3) return TaxRate.IVA_5;
    if (num === 0) return TaxRate.EXENTA;
  }
  return fallback;
}

/**
 * Extrae una URL http(s) limpia desde un campo string, array PostgreSQL (text[]) o JSONB (["https://..."]).
 */
function extractExternalImageUrl(raw: unknown): string | undefined {
  if (!raw) return undefined;
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const found = extractExternalImageUrl(item);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof raw === "object" && raw !== null) {
    const obj = raw as Record<string, unknown>;
    return extractExternalImageUrl(obj.url ?? obj.src ?? obj.image ?? obj.publicUrl);
  }
  const str = String(raw).trim();
  if (!str) return undefined;
  if (str.startsWith("[") || str.startsWith("{")) {
    try {
      return extractExternalImageUrl(JSON.parse(str));
    } catch {
      // Continuar
    }
  }
  if (/^https?:\/\/\S+$/i.test(str) || str.startsWith("/")) {
    return str;
  }
  return undefined;
}

/**
 * Lee TODOS los productos en vivo desde la BD externa (hasta 5.000, con lista blanca validada),
 * sincroniza sus filas sombra en lote en el Sidecar (rápido incluso con cientos/miles de ítems)
 * y soporta fotos externas por URL (o fotos subidas/generadas en el Sidecar).
 */
export async function listBridgeProducts(
  cfg: BridgeConfig,
  filters?: { q?: string; taxRate?: string; lowStock?: boolean }
) {
  const mapping = parseBridgeMapping(cfg);
  if (!cfg.connectionUrl || !mapping) {
    throw new Error("El Modo Bridge no tiene conexión o mapeo válido configurado");
  }

  const pool = await getExternalPool(cfg.connectionUrl);
  await validateMappingAgainstSchema(pool, mapping);

  const p = mapping.products;
  const cols: Array<{ alias: string; col: string }> = [
    { alias: "ext_id", col: p.idColumn },
    { alias: "ext_name", col: p.nameColumn },
    { alias: "ext_price", col: p.priceColumn },
  ];
  if (p.skuColumn) cols.push({ alias: "ext_sku", col: p.skuColumn });
  if (p.barcodeColumn) cols.push({ alias: "ext_barcode", col: p.barcodeColumn });
  if (p.costColumn) cols.push({ alias: "ext_cost", col: p.costColumn });
  if (p.stockColumn) cols.push({ alias: "ext_stock", col: p.stockColumn });
  if (p.minStockColumn) cols.push({ alias: "ext_min_stock", col: p.minStockColumn });
  if (p.taxRateColumn) cols.push({ alias: "ext_tax", col: p.taxRateColumn });
  if (p.unitColumn) cols.push({ alias: "ext_unit", col: p.unitColumn });
  if (p.imageUrlColumn) cols.push({ alias: "ext_image_url", col: p.imageUrlColumn });

  const selectClause = cols
    .map((c) => `${quoteIdent(c.col)} AS ${quoteIdent(c.alias)}`)
    .join(", ");

  const sql = `SELECT ${selectClause} FROM ${quoteIdent(p.schema)}.${quoteIdent(
    p.table
  )} ORDER BY ${quoteIdent(p.nameColumn)} ASC LIMIT 5000`;

  const [res, existingShadows, existingSkus] = await Promise.all([
    pool.query<Record<string, unknown>>(sql),
    prisma.product.findMany({
      where: { externalId: { startsWith: "bridge:" } },
      include: { image: { select: { updatedAt: true, source: true, sizeBytes: true } } },
    }),
    prisma.product.findMany({ select: { sku: true, barcode: true } }),
  ]);

  const shadowByExtId = new Map(
    existingShadows.filter((s) => s.externalId).map((s) => [s.externalId!, s])
  );
  const usedSkus = new Set(existingSkus.map((x) => x.sku));
  const usedBarcodes = new Set(existingSkus.filter((x) => x.barcode).map((x) => x.barcode!));

  interface ParsedRow {
    rawId: string;
    externalId: string;
    sku: string;
    barcode: string | null;
    name: string;
    price: number;
    cost: number;
    stock: number;
    minStock: number;
    taxRate: TaxRate;
    unit: string;
    externalImageUrl?: string;
  }

  const parsedRows: ParsedRow[] = [];
  const toCreate: Array<{
    externalId: string;
    sku: string;
    barcode: string | null;
    name: string;
    unit: string;
    price: number;
    cost: number;
    taxRate: TaxRate;
    stock: number;
    minStock: number;
    active: boolean;
  }> = [];

  for (const row of res.rows) {
    const rawId = String(row.ext_id ?? "").trim();
    if (!rawId) continue;

    const externalId = `bridge:${rawId}`;
    const baseSku = String(row.ext_sku ?? rawId)
      .trim()
      .toUpperCase()
      .slice(0, 44);
    const name = String(row.ext_name ?? `Artículo ${rawId}`).trim().slice(0, 200);
    const price = Math.max(0, Number(row.ext_price ?? 0) || 0);
    const cost = Math.max(0, Number(row.ext_cost ?? 0) || 0);
    const stock = p.stockColumn ? Math.max(0, Number(row.ext_stock ?? 0) || 0) : 9999;
    const minStock = p.minStockColumn ? Math.max(0, Number(row.ext_min_stock ?? 0) || 0) : 0;
    const taxRate = normalizeParaguayTaxRate(row.ext_tax, p.defaultTaxRate);
    const unit = String(row.ext_unit ?? "UNI").trim().toUpperCase().slice(0, 16) || "UNI";
    const rawBarcode = row.ext_barcode ? String(row.ext_barcode).trim().slice(0, 64) : null;
    const externalImageUrl = p.imageUrlColumn
      ? extractExternalImageUrl(row.ext_image_url)
      : undefined;

    if (!shadowByExtId.has(externalId)) {
      let safeSku = baseSku || `EXT-${rawId.slice(0, 12)}`;
      if (usedSkus.has(safeSku)) {
        safeSku = `EXT-${rawId.slice(0, 10)}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase().slice(0, 50);
      }
      usedSkus.add(safeSku);

      const safeBarcode = rawBarcode && !usedBarcodes.has(rawBarcode) ? rawBarcode : null;
      if (safeBarcode) usedBarcodes.add(safeBarcode);

      toCreate.push({
        externalId,
        sku: safeSku,
        barcode: safeBarcode,
        name,
        unit,
        price,
        cost,
        taxRate,
        stock,
        minStock,
        active: true,
      });
    }

    parsedRows.push({
      rawId,
      externalId,
      sku: baseSku,
      barcode: rawBarcode,
      name,
      price,
      cost,
      stock,
      minStock,
      taxRate,
      unit,
      externalImageUrl,
    });
  }

  // Alta masiva en una sola operación para filas nuevas
  if (toCreate.length > 0) {
    await prisma.product.createMany({ data: toCreate, skipDuplicates: true });
    const newlyCreated = await prisma.product.findMany({
      where: { externalId: { in: toCreate.map((x) => x.externalId) } },
      include: { image: { select: { updatedAt: true, source: true, sizeBytes: true } } },
    });
    for (const s of newlyCreated) {
      if (s.externalId) shadowByExtId.set(s.externalId, s);
    }
  }

  // Actualizar en paralelo SOLO las filas sombra que realmente cambiaron de precio/stock/nombre
  const pendingUpdates: Array<() => Promise<unknown>> = [];
  for (const item of parsedRows) {
    const shadow = shadowByExtId.get(item.externalId);
    if (!shadow) continue;
    const changed =
      shadow.name !== item.name ||
      Number(shadow.price) !== item.price ||
      Number(shadow.cost) !== item.cost ||
      Number(shadow.stock) !== item.stock ||
      Number(shadow.minStock) !== item.minStock ||
      shadow.taxRate !== item.taxRate ||
      shadow.unit !== item.unit ||
      !shadow.active;

    if (changed) {
      pendingUpdates.push(() =>
        prisma.product.update({
          where: { id: shadow.id },
          data: {
            name: item.name,
            price: item.price,
            cost: item.cost,
            stock: item.stock,
            minStock: item.minStock,
            taxRate: item.taxRate,
            unit: item.unit,
            active: true,
          },
        })
      );
    }
  }

  // Ejecutar actualizaciones en lotes controlados de 25
  for (let i = 0; i < pendingUpdates.length; i += 25) {
    await Promise.all(pendingUpdates.slice(i, i + 25).map((fn) => fn()));
  }

  const serialized = [];
  for (const item of parsedRows) {
    const shadow = shadowByExtId.get(item.externalId);
    if (!shadow) continue;

    const hasSidecarImage = Boolean(shadow.image);
    const resolvedImageUrl =
      hasSidecarImage && shadow.image
        ? `/api/products/${shadow.id}/image?v=${shadow.image.updatedAt.getTime()}`
        : item.externalImageUrl;
    const resolvedImageSource = hasSidecarImage
      ? shadow.image?.source
      : item.externalImageUrl
        ? "EXTERNAL_URL"
        : undefined;

    serialized.push({
      id: shadow.id,
      externalId: item.rawId,
      isBridged: true,
      sku: shadow.sku,
      barcode: shadow.barcode ?? undefined,
      name: item.name,
      unit: item.unit,
      unitCodeSifen: shadow.unitCodeSifen,
      price: item.price,
      cost: item.cost,
      taxRate: item.taxRate,
      stock: item.stock,
      minStock: item.minStock,
      active: true,
      hasImage: Boolean(resolvedImageUrl),
      imageUrl: resolvedImageUrl,
      imageSource: resolvedImageSource,
      imageSizeBytes: shadow.image?.sizeBytes,
    });
  }

  const q = filters?.q?.trim().toLowerCase();
  return serialized.filter((item) => {
    if (filters?.taxRate && item.taxRate !== filters.taxRate) return false;
    if (filters?.lowStock && item.stock > item.minStock) return false;
    if (!q) return true;
    return (
      item.name.toLowerCase().includes(q) ||
      item.sku.toLowerCase().includes(q) ||
      (item.barcode ?? "").toLowerCase().includes(q)
    );
  });
}

/**
 * Lee clientes en vivo desde la BD externa (si se mapeó tabla de clientes),
 * sincronizando filas sombra en Sidecar y manteniendo siempre Consumidor Final.
 */
export async function listBridgeCustomers(cfg: BridgeConfig, q?: string) {
  const mapping = parseBridgeMapping(cfg);
  if (!cfg.connectionUrl || !mapping?.customers) {
    return null; // Señal para usar tabla interna de clientes
  }

  const pool = await getExternalPool(cfg.connectionUrl);
  await validateMappingAgainstSchema(pool, mapping);

  const c = mapping.customers;
  const cols: Array<{ alias: string; col: string }> = [
    { alias: "ext_id", col: c.idColumn },
    { alias: "ext_doc", col: c.documentColumn },
    { alias: "ext_name", col: c.nameColumn },
  ];
  if (c.dvColumn) cols.push({ alias: "ext_dv", col: c.dvColumn });
  if (c.emailColumn) cols.push({ alias: "ext_email", col: c.emailColumn });
  if (c.addressColumn) cols.push({ alias: "ext_addr", col: c.addressColumn });

  const selectClause = cols
    .map((col) => `${quoteIdent(col.col)} AS ${quoteIdent(col.alias)}`)
    .join(", ");

  const res = await pool.query<Record<string, unknown>>(
    `SELECT ${selectClause} FROM ${quoteIdent(c.schema)}.${quoteIdent(
      c.table
    )} ORDER BY ${quoteIdent(c.nameColumn)} ASC LIMIT 300`
  );

  // Asegurar Consumidor Final primero
  const cf = await prisma.customer.upsert({
    where: {
      documentType_documentNumber: {
        documentType: DocumentIdType.SIN_DOCUMENTO,
        documentNumber: "0",
      },
    },
    update: {},
    create: {
      documentType: DocumentIdType.SIN_DOCUMENTO,
      documentNumber: "0",
      name: "Sin Nombre (Consumidor Final)",
      isTaxpayer: false,
    },
  });

  const results = [
    {
      id: cf.id,
      documentType: cf.documentType,
      documentNumber: cf.documentNumber,
      dv: cf.dv ?? undefined,
      name: cf.name,
      isTaxpayer: cf.isTaxpayer,
    },
  ];

  for (const row of res.rows) {
    const rawId = String(row.ext_id ?? "").trim();
    const rawDocFull = String(row.ext_doc ?? "").trim();
    const name = String(row.ext_name ?? "").trim();
    if (!rawId || !name) continue;

    // Detectar "80012345-6" o número puro
    const [docPart, inlineDv] = rawDocFull.split("-");
    const cleanDoc = (docPart ?? "").replace(/\D/g, "") || rawId;
    const explicitDv = row.ext_dv ? String(row.ext_dv).trim() : inlineDv?.trim();
    const looksLikeRuc = Boolean(explicitDv) || cleanDoc.length >= 6;
    const docType = looksLikeRuc ? DocumentIdType.RUC : DocumentIdType.CI;
    const dv = docType === DocumentIdType.RUC ? explicitDv || calculateMod11DV(cleanDoc) : null;
    const externalId = `bridge:${rawId}`;

    let shadow = await prisma.customer.findFirst({ where: { externalId } });
    if (!shadow) {
      shadow = await prisma.customer.findUnique({
        where: { documentType_documentNumber: { documentType: docType, documentNumber: cleanDoc } },
      });
    }

    if (!shadow) {
      shadow = await prisma.customer.create({
        data: {
          externalId,
          documentType: docType,
          documentNumber: cleanDoc,
          dv,
          name: name.slice(0, 255),
          isTaxpayer: docType === DocumentIdType.RUC,
          email: row.ext_email ? String(row.ext_email).trim().slice(0, 120) : null,
          address: row.ext_addr ? String(row.ext_addr).trim().slice(0, 255) : null,
        },
      });
    } else {
      shadow = await prisma.customer.update({
        where: { id: shadow.id },
        data: {
          externalId: shadow.externalId ?? externalId,
          name: name.slice(0, 255),
          dv: dv ?? shadow.dv,
          email: row.ext_email ? String(row.ext_email).trim().slice(0, 120) : shadow.email,
          address: row.ext_addr ? String(row.ext_addr).trim().slice(0, 255) : shadow.address,
        },
      });
    }

    results.push({
      id: shadow.id,
      documentType: shadow.documentType,
      documentNumber: shadow.documentNumber,
      dv: shadow.dv ?? undefined,
      name: shadow.name,
      isTaxpayer: shadow.isTaxpayer,
    });
  }

  const query = q?.trim().toLowerCase();
  if (!query) return results;
  return results.filter(
    (c) =>
      c.name.toLowerCase().includes(query) || c.documentNumber.toLowerCase().includes(query)
  );
}

/**
 * Descuento atómico seguro sobre la BD externa (SOLO si readOnly=false y hay stockColumn mapeada).
 * Usa `UPDATE ... SET stock = stock - $1 WHERE id::text = $2 AND stock >= $1` dentro de transacción.
 */
export async function atomicDeductExternalStock(
  cfg: BridgeConfig,
  items: Array<{ externalRawId: string; productName: string; quantity: number }>
): Promise<{ applied: boolean; updatedStocks: Map<string, number> }> {
  const updatedStocks = new Map<string, number>();
  const mapping = parseBridgeMapping(cfg);
  if (cfg.readOnly || !cfg.connectionUrl || !mapping?.products.stockColumn) {
    return { applied: false, updatedStocks };
  }

  const pool = await getExternalPool(cfg.connectionUrl);
  await validateMappingAgainstSchema(pool, mapping);

  const p = mapping.products;
  const tableRef = `${quoteIdent(p.schema)}.${quoteIdent(p.table)}`;
  const stockCol = quoteIdent(p.stockColumn!);
  const idCol = quoteIdent(p.idColumn);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const item of items) {
      const res = await client.query<{ new_stock: string }>(
        `UPDATE ${tableRef}
         SET ${stockCol} = ${stockCol} - $1
         WHERE ${idCol}::text = $2 AND ${stockCol} >= $1
         RETURNING ${stockCol}::text AS new_stock`,
        [item.quantity, item.externalRawId]
      );
      if (res.rowCount === 0) {
        throw Object.assign(
          new Error(
            `Stock insuficiente en BD externa para "${item.productName}" (solicitado: ${item.quantity})`
          ),
          { statusCode: 409 }
        );
      }
      updatedStocks.set(item.externalRawId, Number(res.rows[0].new_stock));
    }
    await client.query("COMMIT");
    return { applied: true, updatedStocks };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Reposición atómica en BD externa (para cancelación de DE o compensación ante fallo del Sidecar).
 */
export async function atomicRestoreExternalStock(
  cfg: BridgeConfig,
  items: Array<{ externalRawId: string; quantity: number }>
): Promise<boolean> {
  const mapping = parseBridgeMapping(cfg);
  if (cfg.readOnly || !cfg.connectionUrl || !mapping?.products.stockColumn) {
    return false;
  }

  const pool = await getExternalPool(cfg.connectionUrl);
  await validateMappingAgainstSchema(pool, mapping);

  const p = mapping.products;
  const tableRef = `${quoteIdent(p.schema)}.${quoteIdent(p.table)}`;
  const stockCol = quoteIdent(p.stockColumn!);
  const idCol = quoteIdent(p.idColumn);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const item of items) {
      await client.query(
        `UPDATE ${tableRef}
         SET ${stockCol} = ${stockCol} + $1
         WHERE ${idCol}::text = $2`,
        [item.quantity, item.externalRawId]
      );
    }
    await client.query("COMMIT");
    return true;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Importación única: copia productos y clientes desde la BD externa hacia Standalone
 * (desactivando Bridge al finalizar para operar 100% en PostgreSQL propio).
 */
export async function importExternalToStandalone(
  connectionUrl: string,
  mapping: SchemaMapping,
  replaceDemoCatalog: boolean
): Promise<{ importedProducts: number; importedCustomers: number }> {
  const pool = await getExternalPool(connectionUrl);
  await validateMappingAgainstSchema(pool, mapping);

  if (replaceDemoCatalog) {
    await prisma.$transaction(async (tx) => {
      await tx.sifenDocument.deleteMany();
      await tx.sifenBatch.deleteMany();
      await tx.saleItem.deleteMany();
      await tx.sale.deleteMany();
      await tx.stockMovement.deleteMany();
      await tx.productImage.deleteMany();
      await tx.product.deleteMany();
    });
  }

  const p = mapping.products;
  const cols = [
    `${quoteIdent(p.idColumn)} AS "ext_id"`,
    `${quoteIdent(p.nameColumn)} AS "ext_name"`,
    `${quoteIdent(p.priceColumn)} AS "ext_price"`,
    ...(p.skuColumn ? [`${quoteIdent(p.skuColumn)} AS "ext_sku"`] : []),
    ...(p.barcodeColumn ? [`${quoteIdent(p.barcodeColumn)} AS "ext_barcode"`] : []),
    ...(p.costColumn ? [`${quoteIdent(p.costColumn)} AS "ext_cost"`] : []),
    ...(p.stockColumn ? [`${quoteIdent(p.stockColumn)} AS "ext_stock"`] : []),
    ...(p.minStockColumn ? [`${quoteIdent(p.minStockColumn)} AS "ext_min_stock"`] : []),
    ...(p.taxRateColumn ? [`${quoteIdent(p.taxRateColumn)} AS "ext_tax"`] : []),
    ...(p.unitColumn ? [`${quoteIdent(p.unitColumn)} AS "ext_unit"`] : []),
  ];

  const prodRes = await pool.query<Record<string, unknown>>(
    `SELECT ${cols.join(", ")} FROM ${quoteIdent(p.schema)}.${quoteIdent(p.table)} LIMIT 5000`
  );

  let importedProducts = 0;
  for (const row of prodRes.rows) {
    const rawId = String(row.ext_id ?? "").trim();
    const name = String(row.ext_name ?? "").trim();
    if (!rawId || !name) continue;

    const sku = String(row.ext_sku ?? rawId).trim().toUpperCase().slice(0, 50);
    const price = Math.max(0, Number(row.ext_price ?? 0) || 0);
    const cost = Math.max(0, Number(row.ext_cost ?? 0) || 0);
    const stock = p.stockColumn ? Math.max(0, Number(row.ext_stock ?? 0) || 0) : 0;
    const minStock = p.minStockColumn ? Math.max(0, Number(row.ext_min_stock ?? 0) || 0) : 0;
    const taxRate = normalizeParaguayTaxRate(row.ext_tax, p.defaultTaxRate);
    const unit = String(row.ext_unit ?? "UNI").trim().toUpperCase().slice(0, 16) || "UNI";
    const barcode = row.ext_barcode ? String(row.ext_barcode).trim().slice(0, 64) : null;

    const existing = await prisma.product.findUnique({ where: { sku } });
    if (!existing) {
      const barcodeExists = barcode
        ? await prisma.product.findUnique({ where: { barcode } })
        : null;
      const created = await prisma.product.create({
        data: {
          sku,
          barcode: barcodeExists ? null : barcode,
          name: name.slice(0, 200),
          unit,
          price,
          cost,
          taxRate,
          stock,
          minStock,
          active: true,
        },
      });
      if (stock > 0) {
        await prisma.stockMovement.create({
          data: {
            productId: created.id,
            type: StockMovementType.IN,
            quantity: stock,
            previousStock: 0,
            newStock: stock,
            referenceType: "BRIDGE_IMPORT",
            notes: `Importado desde ${p.schema}.${p.table}`,
          },
        });
      }
      importedProducts++;
    }
  }

  let importedCustomers = 0;
  if (mapping.customers) {
    const c = mapping.customers;
    const cCols = [
      `${quoteIdent(c.idColumn)} AS "ext_id"`,
      `${quoteIdent(c.documentColumn)} AS "ext_doc"`,
      `${quoteIdent(c.nameColumn)} AS "ext_name"`,
      ...(c.dvColumn ? [`${quoteIdent(c.dvColumn)} AS "ext_dv"`] : []),
      ...(c.emailColumn ? [`${quoteIdent(c.emailColumn)} AS "ext_email"`] : []),
      ...(c.addressColumn ? [`${quoteIdent(c.addressColumn)} AS "ext_addr"`] : []),
    ];
    const custRes = await pool.query<Record<string, unknown>>(
      `SELECT ${cCols.join(", ")} FROM ${quoteIdent(c.schema)}.${quoteIdent(c.table)} LIMIT 500`
    );

    for (const row of custRes.rows) {
      const rawDocFull = String(row.ext_doc ?? "").trim();
      const name = String(row.ext_name ?? "").trim();
      if (!rawDocFull || !name) continue;
      const [docPart, inlineDv] = rawDocFull.split("-");
      const cleanDoc = (docPart ?? "").replace(/\D/g, "");
      if (!cleanDoc) continue;
      const explicitDv = row.ext_dv ? String(row.ext_dv).trim() : inlineDv?.trim();
      const docType = explicitDv || cleanDoc.length >= 6 ? DocumentIdType.RUC : DocumentIdType.CI;
      const dv = docType === DocumentIdType.RUC ? explicitDv || calculateMod11DV(cleanDoc) : null;

      await prisma.customer.upsert({
        where: {
          documentType_documentNumber: { documentType: docType, documentNumber: cleanDoc },
        },
        update: { name: name.slice(0, 255) },
        create: {
          documentType: docType,
          documentNumber: cleanDoc,
          dv,
          name: name.slice(0, 255),
          isTaxpayer: docType === DocumentIdType.RUC,
          email: row.ext_email ? String(row.ext_email).trim().slice(0, 120) : null,
          address: row.ext_addr ? String(row.ext_addr).trim().slice(0, 255) : null,
        },
      });
      importedCustomers++;
    }
  }

  // Volver a Standalone al finalizar la importación
  await prisma.bridgeConfig.upsert({
    where: { id: 1 },
    update: { mode: DataSourceMode.STANDALONE },
    create: { id: 1, mode: DataSourceMode.STANDALONE, readOnly: true },
  });

  return { importedProducts, importedCustomers };
}

/**
 * Crea un esquema aislado de prueba (`legacy_erp`) que simula un ERP paraguayo antiguo
 * (`articulos` y `personas` con nombres heredados) para probar el Modo Bridge sin arriesgar datos reales.
 */
export async function createLegacySandboxSchema(): Promise<{
  connectionUrl: string;
  maskedConnectionUrl: string;
  schema: string;
}> {
  await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS legacy_erp;`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS legacy_erp.articulos (
      cod_art VARCHAR(32) PRIMARY KEY,
      descrip VARCHAR(200) NOT NULL,
      cod_barra VARCHAR(64),
      p_venta NUMERIC(14,2) NOT NULL,
      costo_ref NUMERIC(14,2) NOT NULL DEFAULT 0,
      existencia NUMERIC(12,3) NOT NULL DEFAULT 0,
      stock_min NUMERIC(12,3) NOT NULL DEFAULT 5,
      tasa_iva VARCHAR(16) NOT NULL DEFAULT '10%',
      unidad VARCHAR(16) NOT NULL DEFAULT 'UNI'
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS legacy_erp.personas (
      id_persona SERIAL PRIMARY KEY,
      ruc VARCHAR(24) UNIQUE NOT NULL,
      nombre_razon VARCHAR(200) NOT NULL,
      correo VARCHAR(120),
      domicilio VARCHAR(200)
    );
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO legacy_erp.articulos (cod_art, descrip, cod_barra, p_venta, costo_ref, existencia, stock_min, tasa_iva, unidad)
    VALUES
      ('FER-001', 'Martillo Carpintero Cabo Madera', '7849001000011', 45000, 29000, 18, 5, '10%', 'UNI'),
      ('FER-002', 'Cemento Portland Bolsa 50kg', '7849001000028', 62000, 48000, 35, 10, '10%', 'BOL'),
      ('FER-003', 'Pintura Látex Interior 4L', '7849001000035', 115000, 82000, 7, 6, '10%', 'LAT'),
      ('FER-004', 'Alambre Galvanizado Rollito 1kg', '7849001000042', 22000, 14500, 4, 8, '10%', 'KG'),
      ('FER-005', 'Semilla de Maíz Certificado (Exenta)', '7849001000059', 28000, 19000, 20, 5, 'EXENTA', 'KG')
    ON CONFLICT (cod_art) DO NOTHING;
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO legacy_erp.personas (ruc, nombre_razon, correo, domicilio)
    VALUES
      ('80077889-1', 'Constructora del Este S.A.', 'compras@constructoraeste.com.py', 'Ruta PY02 Km 14, CDE'),
      ('80033445-2', 'Ferretería San Lorenzo S.R.L.', 'admin@ferresl.com.py', 'Av. Julia Miranda Cueto 410')
    ON CONFLICT (ruc) DO NOTHING;
  `);

  const internalUrl = process.env.DATABASE_URL ?? "";
  return {
    connectionUrl: internalUrl,
    maskedConnectionUrl: maskConnectionUrl(internalUrl),
    schema: "legacy_erp",
  };
}
