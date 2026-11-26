import { TaxRate } from "@prisma/client";
import { Pool } from "pg";
import type {
  CustomerMapping,
  IntrospectedColumn,
  IntrospectedTable,
  IntrospectionResult,
  ProductMapping,
  SchemaMapping,
} from "./types.js";

// Esquemas internos del motor / proveedores cloud (Supabase, PgBouncer, etc.)
const EXCLUDED_SYSTEM_SCHEMAS = [
  "pg_catalog",
  "information_schema",
  "auth",
  "storage",
  "realtime",
  "supabase_functions",
  "supabase_migrations",
  "vault",
  "extensions",
  "graphql",
  "graphql_public",
  "pgbouncer",
  "pgsodium",
  "pgsodium_masks",
  "net",
  "cron",
  "_realtime",
  "_analytics",
  "pg_toast",
];

// Tablas internas de Ñemubox (para excluirlas si el usuario apunta a la misma BD en public)
const NEMUBOX_INTERNAL_TABLES = new Set([
  "emitter_config",
  "bridge_config",
  "customers",
  "products",
  "product_images",
  "stock_movements",
  "sales",
  "sale_items",
  "sifen_documents",
  "sifen_batches",
  "_prisma_migrations",
]);

/**
 * Escapa estrictamente un identificador PostgreSQL tras haberlo validado contra information_schema.
 */
export function quoteIdent(identifier: string): string {
  if (!identifier || identifier.includes("\0") || identifier.length > 128) {
    throw new Error(`Identificador SQL inválido: ${identifier}`);
  }
  return `"${identifier.replace(/"/g, '""')}"`;
}

/**
 * Auto-codifica caracteres especiales en la contraseña (ej. {, }, +, #, @, /)
 * si el usuario pegó la URI de PostgreSQL sin percent-encoding.
 */
export function sanitizePostgresUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  const protoMatch = /^(postgres(?:ql)?:\/\/)(.+)$/i.exec(trimmed);
  if (!protoMatch) return trimmed;

  const proto = protoMatch[1];
  const rest = protoMatch[2];
  const atIdx = rest.lastIndexOf("@");
  if (atIdx === -1) return trimmed;

  const userInfo = rest.slice(0, atIdx);
  const hostAndPath = rest.slice(atIdx + 1);
  const colonIdx = userInfo.indexOf(":");
  if (colonIdx === -1) return trimmed;

  const user = userInfo.slice(0, colonIdx);
  const rawPass = userInfo.slice(colonIdx + 1);

  // Evitar doble encoding si ya estaba codificada
  let decodedPass = rawPass;
  try {
    decodedPass = decodeURIComponent(rawPass);
  } catch {
    decodedPass = rawPass;
  }

  return `${proto}${encodeURIComponent(decodeURIComponentSafe(user))}:${encodeURIComponent(
    decodedPass
  )}@${hostAndPath}`;
}

function decodeURIComponentSafe(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

export function formatBridgeConnectionError(err: unknown, rawUrl?: string): string {
  const msg = err instanceof Error ? err.message : "No se pudo conectar a PostgreSQL";
  const isDirectSupabase = Boolean(rawUrl && /@db\.[a-z0-9]+\.supabase\.co/i.test(rawUrl));
  if (isDirectSupabase && /ENOTFOUND|EAI_AGAIN|ENETUNREACH/i.test(msg)) {
    return `El host "db.*.supabase.co" (Direct connection) de Supabase es solo IPv6 y Docker usa IPv4. En Supabase abrí Connect → Method: "Session pooler" y pegá la URI "*.pooler.supabase.com:5432".`;
  }
  return msg;
}

export function maskConnectionUrl(rawUrl: string | null | undefined): string {
  if (!rawUrl) return "";
  try {
    const parsed = new URL(sanitizePostgresUrl(rawUrl));
    if (parsed.password) {
      parsed.password = "****";
    }
    return parsed.toString();
  } catch {
    return rawUrl.replace(/:([^:@/]+)@/, ":****@");
  }
}

function shouldEnableCloudSsl(connectionUrl: string): boolean {
  try {
    const parsed = new URL(sanitizePostgresUrl(connectionUrl));
    const sslMode = parsed.searchParams.get("sslmode")?.toLowerCase();
    if (sslMode === "disable") return false;
    if (sslMode && sslMode !== "disable") return true;
    const host = parsed.hostname.toLowerCase();
    return (
      host.endsWith(".supabase.co") ||
      host.endsWith(".supabase.com") ||
      host.endsWith(".neon.tech") ||
      host.endsWith(".railway.app") ||
      host.endsWith(".render.com") ||
      host.endsWith(".amazonaws.com") ||
      host.endsWith(".azure.com")
    );
  } catch {
    return /sslmode=require|supabase\.co|supabase\.com/i.test(connectionUrl);
  }
}

export function createExternalPool(connectionUrl: string): Pool {
  const safeUrl = sanitizePostgresUrl(connectionUrl);
  const useSsl = shouldEnableCloudSsl(safeUrl);
  let normalizedUrl = safeUrl;
  if (useSsl) {
    try {
      const parsed = new URL(safeUrl);
      parsed.searchParams.delete("sslmode");
      normalizedUrl = parsed.toString();
    } catch {
      // Mantener URL original si no es estándar
    }
  }
  // Usar query_timeout (lado cliente) en lugar de statement_timeout para compatibilidad con Supabase PgBouncer
  return new Pool({
    connectionString: normalizedUrl,
    max: 4,
    idleTimeoutMillis: 15_000,
    connectionTimeoutMillis: 8_000,
    query_timeout: 10_000,
    ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  });
}

export async function testExternalConnection(connectionUrl: string): Promise<{
  ok: boolean;
  database?: string;
  serverVersion?: string;
  user?: string;
  message: string;
}> {
  const pool = createExternalPool(connectionUrl);
  try {
    const res = await pool.query<{
      db: string;
      ver: string;
      usr: string;
    }>("SELECT current_database() AS db, version() AS ver, current_user AS usr");
    const row = res.rows[0];
    return {
      ok: true,
      database: row?.db,
      serverVersion: row?.ver?.split(",")[0] ?? row?.ver,
      user: row?.usr,
      message: `Conexión exitosa a "${row?.db}" como "${row?.usr}"`,
    };
  } catch (err) {
    return {
      ok: false,
      message: formatBridgeConnectionError(err, connectionUrl),
    };
  } finally {
    await pool.end().catch(() => undefined);
  }
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function findColumnByPatterns(
  columns: IntrospectedColumn[],
  patterns: string[],
  numericOnly = false
): string | undefined {
  const isNum = (dt: string) =>
    /int|numeric|decimal|real|double|money|float/i.test(dt);

  const candidates = numericOnly ? columns.filter((c) => isNum(c.dataType)) : columns;

  // 1) Coincidencia exacta primero
  for (const pat of patterns) {
    const exact = candidates.find((c) => norm(c.name) === pat);
    if (exact) return exact.name;
  }
  // 2) Coincidencia parcial
  for (const pat of patterns) {
    const partial = candidates.find((c) => norm(c.name).includes(pat));
    if (partial) return partial.name;
  }
  return undefined;
}

/**
 * Heurística inteligente para bases de datos comerciales en español / Paraguay.
 */
export function suggestParaguayMapping(tables: IntrospectedTable[]): {
  suggestedMapping: Partial<SchemaMapping>;
  confidenceNotes: string[];
} {
  const notes: string[] = [];
  const productTablePatterns = [
    "products",
    "product",
    "productos",
    "producto",
    "articulos",
    "articulo",
    "mercaderias",
    "mercaderia",
    "items",
    "inventario",
    "stock",
  ];
  const customerTablePatterns = [
    "customers",
    "customer",
    "clientes",
    "cliente",
    "clients",
    "client",
    "personas",
    "persona",
    "terceros",
    "contribuyentes",
    "entidades",
  ];

  const pickTable = (patterns: string[]) => {
    for (const pat of patterns) {
      const exact = tables.find((t) => norm(t.table) === pat);
      if (exact) return exact;
    }
    for (const pat of patterns) {
      const partial = tables.find((t) => norm(t.table).includes(pat));
      if (partial) return partial;
    }
    return undefined;
  };

  let products: ProductMapping | undefined;
  let customers: CustomerMapping | undefined;

  const prodTable = pickTable(productTablePatterns) ?? tables[0];
  if (prodTable) {
    const cols = prodTable.columns;
    const idColumn =
      findColumnByPatterns(cols, ["id", "cod_art", "id_art", "id_producto", "codigo", "cod"]) ??
      cols[0]?.name ??
      "id";
    const skuColumn =
      findColumnByPatterns(cols, ["sku", "cod_art", "codigo", "cod_interno", "ref", "cod"]) ??
      idColumn;
    const barcodeColumn = findColumnByPatterns(cols, [
      "barcode",
      "cod_barra",
      "codigo_barra",
      "ean",
      "barra",
    ]);
    const nameColumn =
      findColumnByPatterns(cols, [
        "nombre",
        "descrip",
        "descripcion",
        "producto",
        "articulo",
        "detalle",
        "titulo",
        "name",
      ]) ??
      cols.find((c) => c.name !== idColumn)?.name ??
      idColumn;
    const priceColumn =
      findColumnByPatterns(
        cols,
        ["p_venta", "precio_venta", "precio", "pvp", "monto", "valor", "price"],
        true
      ) ??
      findColumnByPatterns(cols, ["p_venta", "precio", "pvp", "price"]) ??
      cols[0]?.name ??
      idColumn;
    const costColumn = findColumnByPatterns(
      cols,
      ["costo", "p_compra", "precio_compra", "costo_ref", "cost"],
      true
    );
    const stockColumn = findColumnByPatterns(
      cols,
      ["existencia", "stock_actual", "stock", "saldo", "cant", "cantidad", "disponible"],
      true
    );
    const minStockColumn = findColumnByPatterns(
      cols,
      ["stock_min", "min_stock", "minimo", "punto_pedido"],
      true
    );
    const taxRateColumn = findColumnByPatterns(cols, [
      "tasa_iva",
      "iva",
      "impuesto",
      "gravada",
      "tipo_iva",
      "tax",
    ]);
    const unitColumn = findColumnByPatterns(cols, ["unidad", "u_med", "medida", "unit"]);
    const imageUrlColumn = findColumnByPatterns(cols, [
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
      "img",
    ]);

    products = {
      schema: prodTable.schema,
      table: prodTable.table,
      idColumn,
      skuColumn,
      barcodeColumn: barcodeColumn ?? null,
      nameColumn,
      priceColumn,
      costColumn: costColumn ?? null,
      stockColumn: stockColumn ?? null,
      minStockColumn: minStockColumn ?? null,
      taxRateColumn: taxRateColumn ?? null,
      unitColumn: unitColumn ?? null,
      imageUrlColumn: imageUrlColumn ?? null,
      defaultTaxRate: TaxRate.IVA_10,
    };
    notes.push(
      `Productos detectado en "${prodTable.schema}.${prodTable.table}" (ID: ${idColumn}, Nombre: ${nameColumn}, Precio: ${priceColumn}${
        stockColumn ? `, Stock: ${stockColumn}` : ", sin columna de stock"
      }${imageUrlColumn ? `, Foto: ${imageUrlColumn}` : ""}).`
    );
  }

  const custTable = pickTable(customerTablePatterns);
  if (custTable && (!prodTable || custTable.table !== prodTable.table)) {
    const cols = custTable.columns;
    const idColumn =
      findColumnByPatterns(cols, ["id", "id_cliente", "id_persona", "cod_cli", "codigo"]) ??
      cols[0]?.name ??
      "id";
    const documentColumn =
      findColumnByPatterns(cols, ["ruc", "documento", "nro_doc", "ci", "cedula", "doc"]) ??
      cols[0]?.name ??
      idColumn;
    const dvColumn = findColumnByPatterns(cols, ["dv", "digito_verificador", "digito"]);
    const nameColumn =
      findColumnByPatterns(cols, [
        "razon_social",
        "nombre_razon",
        "nombre",
        "cliente",
        "denominacion",
        "name",
      ]) ??
      cols.find((c) => c.name !== idColumn)?.name ??
      idColumn;
    const emailColumn = findColumnByPatterns(cols, ["email", "correo", "mail"]);
    const addressColumn = findColumnByPatterns(cols, ["direccion", "domicilio", "dir", "address"]);

    customers = {
      schema: custTable.schema,
      table: custTable.table,
      idColumn,
      documentColumn,
      dvColumn: dvColumn ?? null,
      nameColumn,
      emailColumn: emailColumn ?? null,
      addressColumn: addressColumn ?? null,
    };
    notes.push(
      `Clientes detectado en "${custTable.schema}.${custTable.table}" (Doc: ${documentColumn}, Nombre: ${nameColumn}).`
    );
  } else {
    notes.push(
      "No se detectó tabla de clientes externa (opcional: Ñemubox usará su tabla interna de clientes)."
    );
  }

  return {
    suggestedMapping: {
      ...(products ? { products } : {}),
      ...(customers ? { customers } : {}),
    },
    confidenceNotes: notes,
  };
}

export async function introspectPostgresSchema(
  connectionUrl: string
): Promise<IntrospectionResult> {
  const pool = createExternalPool(connectionUrl);
  try {
    const metaRes = await pool.query<{ db: string; ver: string }>(
      "SELECT current_database() AS db, version() AS ver"
    );
    const database = metaRes.rows[0]?.db ?? "postgresql";
    const serverVersion = metaRes.rows[0]?.ver?.split(",")[0] ?? "PostgreSQL";

    const tablesRes = await pool.query<{ table_schema: string; table_name: string }>(
      `SELECT table_schema, table_name
       FROM information_schema.tables
       WHERE table_type IN ('BASE TABLE', 'VIEW')
         AND NOT (table_schema = ANY($1::text[]))
         AND table_schema NOT LIKE 'pg_%'
       ORDER BY CASE WHEN table_schema = 'public' THEN 0 ELSE 1 END, table_schema, table_name
       LIMIT 80`,
      [EXCLUDED_SYSTEM_SCHEMAS]
    );

    const colsRes = await pool.query<{
      table_schema: string;
      table_name: string;
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>(
      `SELECT table_schema, table_name, column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE NOT (table_schema = ANY($1::text[]))
         AND table_schema NOT LIKE 'pg_%'
       ORDER BY table_schema, table_name, ordinal_position`,
      [EXCLUDED_SYSTEM_SCHEMAS]
    );

    const colsByTable = new Map<string, IntrospectedColumn[]>();
    for (const c of colsRes.rows) {
      const key = `${c.table_schema}.${c.table_name}`;
      const list = colsByTable.get(key) ?? [];
      list.push({
        name: c.column_name,
        dataType: c.data_type,
        isNullable: c.is_nullable === "YES",
      });
      colsByTable.set(key, list);
    }

    // Solo excluir tablas internas de Ñemubox si la conexión apunta a la propia BD de Ñemubox
    // (detectado por la presencia de bridge_config + sifen_documents en public).
    const publicTableNames = new Set(
      tablesRes.rows.filter((t) => t.table_schema === "public").map((t) => t.table_name)
    );
    const isNemuboxOwnDb =
      publicTableNames.has("bridge_config") && publicTableNames.has("sifen_documents");

    const tables: IntrospectedTable[] = [];
    for (const t of tablesRes.rows) {
      if (isNemuboxOwnDb && t.table_schema === "public" && NEMUBOX_INTERNAL_TABLES.has(t.table_name)) {
        continue;
      }
      const key = `${t.table_schema}.${t.table_name}`;
      const columns = colsByTable.get(key) ?? [];
      if (columns.length === 0) continue;

      let estimatedRows = 0;
      let sampleRows: Array<Record<string, unknown>> = [];
      try {
        const countRes = await pool.query<{ cnt: string }>(
          `SELECT COUNT(*)::text AS cnt FROM ${quoteIdent(t.table_schema)}.${quoteIdent(
            t.table_name
          )}`
        );
        estimatedRows = Number(countRes.rows[0]?.cnt ?? 0);

        const sampleRes = await pool.query<Record<string, unknown>>(
          `SELECT * FROM ${quoteIdent(t.table_schema)}.${quoteIdent(t.table_name)} LIMIT 3`
        );
        sampleRows = sampleRes.rows;
      } catch {
        // Si la vista/tabla no permite lectura de muestra, continuamos sin fallar
      }

      tables.push({
        schema: t.table_schema,
        table: t.table_name,
        columns,
        estimatedRows,
        sampleRows,
      });
    }

    const { suggestedMapping, confidenceNotes } = suggestParaguayMapping(tables);
    return {
      database,
      serverVersion,
      tables,
      suggestedMapping,
      confidenceNotes,
    };
  } finally {
    await pool.end().catch(() => undefined);
  }
}

/**
 * Validación OBLIGATORIA contra lista blanca real de information_schema antes de guardar o ejecutar SQL.
 */
export async function validateMappingAgainstSchema(
  pool: Pool,
  mapping: SchemaMapping
): Promise<void> {
  const verifyTableColumns = async (
    schema: string,
    table: string,
    requiredColumns: Array<string | null | undefined>,
    label: string
  ) => {
    const res = await pool.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2`,
      [schema, table]
    );

    if (res.rows.length === 0) {
      throw new Error(`La tabla mapeada para ${label} ("${schema}.${table}") no existe o no es legible.`);
    }

    const validCols = new Set(res.rows.map((r) => r.column_name));
    for (const col of requiredColumns) {
      if (col && !validCols.has(col)) {
        throw new Error(
          `La columna "${col}" no existe en "${schema}.${table}" (mapeo de ${label}).`
        );
      }
    }
  };

  const p = mapping.products;
  await verifyTableColumns(
    p.schema,
    p.table,
    [
      p.idColumn,
      p.skuColumn,
      p.barcodeColumn,
      p.nameColumn,
      p.priceColumn,
      p.costColumn,
      p.stockColumn,
      p.minStockColumn,
      p.taxRateColumn,
      p.unitColumn,
      p.imageUrlColumn,
    ],
    "Productos"
  );

  if (mapping.customers) {
    const c = mapping.customers;
    await verifyTableColumns(
      c.schema,
      c.table,
      [
        c.idColumn,
        c.documentColumn,
        c.dvColumn,
        c.nameColumn,
        c.emailColumn,
        c.addressColumn,
      ],
      "Clientes"
    );
  }
}
