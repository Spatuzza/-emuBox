import { TaxRate } from "@prisma/client";
import { z } from "zod";

export const productMappingSchema = z.object({
  schema: z.string().trim().min(1).max(64).default("public"),
  table: z.string().trim().min(1).max(128),
  idColumn: z.string().trim().min(1).max(128),
  skuColumn: z.string().trim().max(128).optional().nullable(),
  barcodeColumn: z.string().trim().max(128).optional().nullable(),
  nameColumn: z.string().trim().min(1).max(128),
  priceColumn: z.string().trim().min(1).max(128),
  costColumn: z.string().trim().max(128).optional().nullable(),
  stockColumn: z.string().trim().max(128).optional().nullable(),
  minStockColumn: z.string().trim().max(128).optional().nullable(),
  taxRateColumn: z.string().trim().max(128).optional().nullable(),
  unitColumn: z.string().trim().max(128).optional().nullable(),
  imageUrlColumn: z.string().trim().max(128).optional().nullable(),
  defaultTaxRate: z.nativeEnum(TaxRate).default(TaxRate.IVA_10),
});

export const customerMappingSchema = z.object({
  schema: z.string().trim().min(1).max(64).default("public"),
  table: z.string().trim().min(1).max(128),
  idColumn: z.string().trim().min(1).max(128),
  documentColumn: z.string().trim().min(1).max(128),
  dvColumn: z.string().trim().max(128).optional().nullable(),
  nameColumn: z.string().trim().min(1).max(128),
  emailColumn: z.string().trim().max(128).optional().nullable(),
  addressColumn: z.string().trim().max(128).optional().nullable(),
});

export const schemaMappingSchema = z.object({
  products: productMappingSchema,
  customers: customerMappingSchema.optional().nullable(),
});

export type ProductMapping = z.infer<typeof productMappingSchema>;
export type CustomerMapping = z.infer<typeof customerMappingSchema>;
export type SchemaMapping = z.infer<typeof schemaMappingSchema>;

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
