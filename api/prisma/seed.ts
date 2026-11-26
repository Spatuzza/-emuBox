import { DocumentIdType, PrismaClient, SifenMode, StockMovementType, TaxRate } from "@prisma/client";

const prisma = new PrismaClient();

function parseSifenMode(raw: string | undefined): SifenMode {
  const normalized = (raw ?? "mock").toUpperCase();
  if (normalized === "TEST") return SifenMode.TEST;
  if (normalized === "PROD") return SifenMode.PROD;
  return SifenMode.MOCK;
}

async function main() {
  console.log("[seed] Verificando datos iniciales de emuBox...");

  // 1. Configuración del Emisor (singleton id=1)
  await prisma.emitterConfig.upsert({
    where: { id: 1 },
    update: {
      sifenMode: parseSifenMode(process.env.SIFEN_MODE),
    },
    create: {
      id: 1,
      ruc: process.env.EMITTER_RUC ?? "80012345",
      dv: process.env.EMITTER_DV ?? "6",
      razonSocial: process.env.EMITTER_RAZON_SOCIAL ?? "Comercio Demo emuBox S.R.L.",
      nombreFantasia: "emuBox Demo Store",
      timbrado: process.env.EMITTER_TIMBRADO ?? "12558946",
      establecimiento: process.env.EMITTER_ESTABLECIMIENTO ?? "001",
      puntoExpedicion: process.env.EMITTER_PUNTO_EXPEDICION ?? "001",
      sifenMode: parseSifenMode(process.env.SIFEN_MODE),
      cscId: process.env.SIFEN_CSC_ID ?? "0001",
      csc: process.env.SIFEN_CSC ?? "ABCD0000000000000000000000000000",
    },
  });

  // 2. Clientes base (Consumidor Final + Contribuyente demo)
  await prisma.customer.upsert({
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

  await prisma.customer.upsert({
    where: {
      documentType_documentNumber: {
        documentType: DocumentIdType.RUC,
        documentNumber: "80054321",
      },
    },
    update: {},
    create: {
      documentType: DocumentIdType.RUC,
      documentNumber: "80054321",
      dv: "9",
      name: "Cliente Contribuyente Demo S.A.",
      isTaxpayer: true,
      email: "facturacion@ejemplo.com.py",
      address: "Av. Mariscal López 1234, Asunción",
    },
  });

  // 3. Productos demo cubriendo las 3 tasas de IVA en Paraguay (10%, 5%, Exenta)
  const sampleProducts = [
    {
      sku: "YERBA-500",
      barcode: "7840001000011",
      name: "Yerba Mate Tradicional 500g",
      unit: "UNI",
      unitCodeSifen: 77,
      price: 12500,
      cost: 8500,
      taxRate: TaxRate.IVA_10,
      stock: 40,
      minStock: 10,
    },
    {
      sku: "ARROZ-1KG",
      barcode: "7840001000028",
      name: "Arroz Tipo 1 Bolsa 1kg",
      unit: "UNI",
      unitCodeSifen: 77,
      price: 7500,
      cost: 5200,
      taxRate: TaxRate.IVA_5,
      stock: 25,
      minStock: 10,
    },
    {
      sku: "ACEITE-900",
      barcode: "7840001000035",
      name: "Aceite de Girasol 900ml",
      unit: "UNI",
      unitCodeSifen: 77,
      price: 16000,
      cost: 12000,
      taxRate: TaxRate.IVA_5,
      stock: 6,
      minStock: 8, // Intencionalmente bajo stock mínimo para probar alertas
    },
    {
      sku: "AGUA-2L",
      barcode: "7840001000042",
      name: "Agua Mineral Sin Gas 2L",
      unit: "UNI",
      unitCodeSifen: 77,
      price: 5000,
      cost: 3000,
      taxRate: TaxRate.IVA_10,
      stock: 60,
      minStock: 15,
    },
    {
      sku: "LIBRO-PY",
      barcode: "7840001000059",
      name: "Cuaderno Escolar Educativo (Exento IVA)",
      unit: "UNI",
      unitCodeSifen: 77,
      price: 18000,
      cost: 11000,
      taxRate: TaxRate.EXENTA,
      stock: 15,
      minStock: 5,
    },
  ];

  for (const item of sampleProducts) {
    const existing = await prisma.product.findUnique({ where: { sku: item.sku } });
    if (!existing) {
      const created = await prisma.product.create({ data: item });
      await prisma.stockMovement.create({
        data: {
          productId: created.id,
          type: StockMovementType.IN,
          quantity: item.stock,
          previousStock: 0,
          newStock: item.stock,
          unitCost: item.cost,
          referenceType: "INITIAL_SEED",
          notes: "Stock inicial de demostración",
        },
      });
    }
  }

  console.log("[seed] Datos iniciales listos.");
}

main()
  .catch((err) => {
    console.error("[seed] Error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
