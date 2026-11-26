export type SifenMode = "mock" | "test" | "prod";
export type DataSourceMode = "STANDALONE" | "BRIDGE";
export type TaxRate = "IVA_10" | "IVA_5" | "EXENTA";
export type DocumentIdType = "RUC" | "CI" | "PASAPORTE" | "SIN_DOCUMENTO";
export type StockMovementType = "IN" | "OUT" | "SALE" | "RETURN" | "ADJUSTMENT";
export type PaymentCondition = "CONTADO" | "CREDITO";
export type PaymentMethod = "EFECTIVO" | "TARJETA" | "TRANSFERENCIA" | "QR";
export type SifenDocumentStatus =
  | "DRAFT"
  | "SIGNED"
  | "QUEUED"
  | "SENT"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED";

export type AppSection = "dashboard" | "stock" | "pos" | "sifen" | "settings";

export interface HealthResponse {
  status: "ok" | "error";
  service: string;
  version: string;
  database: string;
  sifenMode: SifenMode;
  timestamp: string;
}

export interface SystemStatusResponse {
  service: string;
  version: string;
  sifenMode: SifenMode;
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

export interface EmitterProfile {
  ruc: string;
  dv: string;
  razonSocial: string;
  nombreFantasia: string;
  timbrado: string;
  establecimiento: string;
  puntoExpedicion: string;
  ultimoNumeroFactura: number;
  actividadEconomicaDesc: string;
  direccion: string;
  telefono: string;
  email: string;
  sifenMode: SifenMode;
  cscId: string;
}

export interface Customer {
  id: string;
  documentType: DocumentIdType;
  documentNumber: string;
  dv?: string;
  name: string;
  isTaxpayer: boolean;
  email?: string;
  address?: string;
}

export interface Product {
  id: string;
  sku: string;
  barcode?: string;
  name: string;
  unit: string;
  price: number;
  cost: number;
  taxRate: TaxRate;
  stock: number;
  minStock: number;
  active: boolean;
  hasImage?: boolean;
  imageUrl?: string;
  imageSource?: string;
  imageSizeBytes?: number;
}

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  type: StockMovementType;
  quantity: number;
  previousStock: number;
  newStock: number;
  notes: string;
  createdAt: string;
}

export interface SaleItem {
  productId: string;
  productSku: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  taxRate: TaxRate;
  lineTotal: number;
  ivaAmount: number;
}

export interface SifenInvoice {
  id: string;
  saleNumber: number;
  documentFullNumber: string; // 001-001-0000001
  cdc: string; // 44 dígitos
  mode: SifenMode;
  status: SifenDocumentStatus;
  customer: Customer;
  paymentCondition: PaymentCondition;
  paymentMethod: PaymentMethod;
  items: SaleItem[];
  subtotalExenta: number;
  subtotalIva5: number;
  subtotalIva10: number;
  totalIva5: number;
  totalIva10: number;
  totalAmount: number;
  qrUrl: string;
  qrImageUrl?: string;
  kudeA4Url?: string;
  kude80mmUrl?: string;
  xmlDownloadUrl?: string;
  xmlPreview: string;
  sifenResponseCode: string;
  sifenResponseMsg: string;
  createdAt: string;
}

export interface ProductMapping {
  schema: string;
  table: string;
  idColumn: string;
  skuColumn?: string | null;
  barcodeColumn?: string | null;
  nameColumn: string;
  priceColumn: string;
  costColumn?: string | null;
  stockColumn?: string | null;
  minStockColumn?: string | null;
  taxRateColumn?: string | null;
  unitColumn?: string | null;
  imageUrlColumn?: string | null;
  defaultTaxRate: TaxRate;
}

export interface CustomerMapping {
  schema: string;
  table: string;
  idColumn: string;
  documentColumn: string;
  dvColumn?: string | null;
  nameColumn: string;
  emailColumn?: string | null;
  addressColumn?: string | null;
}

export interface SchemaMapping {
  products: ProductMapping;
  customers?: CustomerMapping | null;
}

export interface IntrospectedColumn {
  name: string;
  dataType: string;
  isNullable: boolean;
}

export interface IntrospectedTable {
  schema: string;
  table: string;
  columns: IntrospectedColumn[];
  estimatedRows: number;
  sampleRows: Array<Record<string, unknown>>;
}

export interface IntrospectionResult {
  database: string;
  serverVersion: string;
  tables: IntrospectedTable[];
  suggestedMapping: Partial<SchemaMapping>;
  confidenceNotes: string[];
}

export interface BridgeConfigState {
  mode: DataSourceMode;
  provider: string;
  hasConnectionUrl: boolean;
  maskedConnectionUrl: string;
  readOnly: boolean;
  mapping: SchemaMapping | null;
  lastTestedAt: string | null;
  lastTestOk: boolean;
  lastTestMessage: string | null;
  updatedAt: string;
}
