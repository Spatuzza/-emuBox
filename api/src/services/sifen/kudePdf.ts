import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { formatCDC } from "./cdc.js";

export interface KudePdfInput {
  format: "a4" | "80mm";
  emitter: {
    ruc: string;
    dv: string;
    razonSocial: string;
    timbrado: string;
    direccion: string;
    telefono: string;
    actividadEconomicaDesc: string;
  };
  documentFullNumber: string;
  cdc: string;
  mode: string;
  status: string;
  issuedAt: Date;
  customer: {
    name: string;
    documentType: string;
    documentNumber: string;
    dv?: string | null;
  };
  paymentCondition: string;
  paymentMethod: string;
  items: Array<{
    productSku: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    taxRate: string;
    lineTotal: number;
  }>;
  subtotalExenta: number;
  subtotalIva5: number;
  subtotalIva10: number;
  totalIva5: number;
  totalIva10: number;
  totalAmount: number;
  qrUrl: string;
}

const pygFmt = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });
const fmtGs = (n: number) => `Gs. ${pygFmt.format(Math.round(n))}`;

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("es-PY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function formatCustomerDoc(c: KudePdfInput["customer"]): string {
  if (c.documentType === "RUC") return `RUC ${c.documentNumber}-${c.dv ?? "0"}`;
  if (c.documentType === "CI") return `CI ${c.documentNumber}`;
  return "Sin Documento (Consumidor Final)";
}

export async function generateKudePdf(input: KudePdfInput): Promise<Buffer> {
  const qrPngBuffer = await QRCode.toBuffer(input.qrUrl, {
    type: "png",
    width: 180,
    margin: 1,
    errorCorrectionLevel: "M",
  });

  if (input.format === "80mm") {
    return buildThermal80mmPdf(input, qrPngBuffer);
  }
  return buildA4Pdf(input, qrPngBuffer);
}

function buildThermal80mmPdf(input: KudePdfInput, qrPng: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // 80mm = ~226.77 pt
    const estimatedHeight = 460 + input.items.length * 28;
    const doc = new PDFDocument({
      size: [226, Math.max(500, estimatedHeight)],
      margins: { top: 14, bottom: 14, left: 12, right: 12 },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Franja superior tricolor paraguaya
    doc.rect(12, 8, 67, 2.5).fill("#D52B1E");
    doc.rect(79, 8, 68, 2.5).fill("#E2E8F0");
    doc.rect(147, 8, 67, 2.5).fill("#0038A8");
    doc.fillColor("#0F172A");

    doc.moveDown(0.3);
    doc.font("Helvetica-Bold").fontSize(10).text(input.emitter.razonSocial, { align: "center" });
    doc.font("Helvetica").fontSize(7.5).text(input.emitter.direccion, { align: "center" });
    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .text(`RUC: ${input.emitter.ruc}-${input.emitter.dv}`, { align: "center" });
    doc.font("Helvetica").fontSize(7.5).text(`Timbrado N°: ${input.emitter.timbrado}`, {
      align: "center",
    });

    doc.moveDown(0.4);
    doc.font("Helvetica-Bold").fontSize(8.5).text("KuDE DE FACTURA ELECTRÓNICA", {
      align: "center",
    });
    doc.font("Courier-Bold").fontSize(9.5).text(input.documentFullNumber, { align: "center" });

    drawDashedLine(doc, 12, 214);

    doc.font("Helvetica").fontSize(7.5);
    doc.text(`Fecha: ${fmtDate(input.issuedAt)}`);
    doc.text(`Cliente: ${input.customer.name}`);
    doc.text(`Doc: ${formatCustomerDoc(input.customer)}`);
    doc.text(`Condición: ${input.paymentCondition} · ${input.paymentMethod}`);

    drawDashedLine(doc, 12, 214);

    doc.font("Helvetica-Bold").fontSize(7.5).text("Cant / Descripción                         Subtotal");
    doc.moveDown(0.2);

    for (const item of input.items) {
      const ivaTag =
        item.taxRate === "IVA_10" ? "10%" : item.taxRate === "IVA_5" ? "5%" : "Ex.";
      doc.font("Helvetica-Bold").fontSize(7.5).text(`${item.quantity}x ${item.productName}`);
      doc
        .font("Courier")
        .fontSize(7)
        .text(`${fmtGs(item.unitPrice)} c/u (${ivaTag})`, { continued: true })
        .text(fmtGs(item.lineTotal), { align: "right" });
    }

    drawDashedLine(doc, 12, 214);

    doc
      .font("Helvetica-Bold")
      .fontSize(9.5)
      .text("TOTAL A PAGAR", { continued: true })
      .text(fmtGs(input.totalAmount), { align: "right" });

    doc.moveDown(0.25);
    doc.font("Helvetica").fontSize(7.2).fillColor("#334155");
    doc.text("Liquidación IVA 10%:", { continued: true }).text(fmtGs(input.totalIva10), {
      align: "right",
    });
    doc.text("Liquidación IVA 5%:", { continued: true }).text(fmtGs(input.totalIva5), {
      align: "right",
    });
    doc.text("Exentas:", { continued: true }).text(fmtGs(input.subtotalExenta), { align: "right" });
    doc.fillColor("#0F172A");

    drawDashedLine(doc, 12, 214);

    // QR escaneable centrado
    const qrSize = 96;
    const qrX = (226 - qrSize) / 2;
    doc.image(qrPng, qrX, doc.y + 4, { width: qrSize, height: qrSize });
    doc.y += qrSize + 10;

    doc
      .font("Helvetica-Bold")
      .fontSize(6.8)
      .text("Consulte la validez de esta Factura Electrónica:", { align: "center" });
    doc.font("Courier-Bold").fontSize(6.8).text(formatCDC(input.cdc), { align: "center" });
    doc
      .font("Helvetica")
      .fontSize(6.5)
      .fillColor("#475569")
      .text("https://ekuatia.set.gov.py/consultas/", { align: "center" });
    if (input.mode !== "PROD") {
      doc
        .moveDown(0.2)
        .font("Helvetica-Bold")
        .fontSize(6.5)
        .fillColor("#B45309")
        .text(`DOCUMENTO DE PRUEBA (SIFEN_MODE=${input.mode})`, { align: "center" });
    }

    doc.end();
  });
}

function buildA4Pdf(input: KudePdfInput, qrPng: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 36, bottom: 36, left: 40, right: 40 },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = 595.28;
    const contentWidth = pageWidth - 80;

    // Franja superior tricolor paraguaya
    doc.rect(40, 24, contentWidth / 3, 4).fill("#D52B1E");
    doc.rect(40 + contentWidth / 3, 24, contentWidth / 3, 4).fill("#E2E8F0");
    doc.rect(40 + (contentWidth / 3) * 2, 24, contentWidth / 3, 4).fill("#0038A8");

    // Cabecera Emisor + Recuadro Timbrado
    const topY = 38;
    doc.roundedRect(40, topY, 315, 92, 6).stroke("#CBD5E1");
    doc.roundedRect(365, topY, 190, 92, 6).fillAndStroke("#F8FAFC", "#CBD5E1");

    doc
      .fillColor("#0F172A")
      .font("Helvetica-Bold")
      .fontSize(13)
      .text(input.emitter.razonSocial, 52, topY + 12, { width: 290 });
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor("#475569")
      .text(input.emitter.actividadEconomicaDesc, 52, topY + 34, { width: 290 })
      .text(input.emitter.direccion, 52, topY + 54, { width: 290 })
      .text(input.emitter.telefono || "Paraguay", 52, topY + 70, { width: 290 });

    doc
      .fillColor("#475569")
      .font("Helvetica-Bold")
      .fontSize(8.5)
      .text(`TIMBRADO N° ${input.emitter.timbrado}`, 375, topY + 12, {
        width: 170,
        align: "center",
      });
    doc
      .fillColor("#0F172A")
      .font("Courier-Bold")
      .fontSize(10.5)
      .text(`RUC: ${input.emitter.ruc}-${input.emitter.dv}`, 375, topY + 28, {
        width: 170,
        align: "center",
      });
    doc
      .fillColor("#0038A8")
      .font("Helvetica-Bold")
      .fontSize(9.5)
      .text("FACTURA ELECTRÓNICA", 375, topY + 48, { width: 170, align: "center" });
    doc
      .font("Courier-Bold")
      .fontSize(11)
      .text(input.documentFullNumber, 375, topY + 64, { width: 170, align: "center" });

    // Datos del Receptor
    const recY = topY + 104;
    doc.roundedRect(40, recY, contentWidth, 56, 6).stroke("#CBD5E1");
    doc.fillColor("#0F172A").font("Helvetica").fontSize(9);
    doc.text(`Fecha de emisión: ${fmtDate(input.issuedAt)}`, 52, recY + 10);
    doc.text(`Cliente / Razón Social: ${input.customer.name}`, 52, recY + 26);
    doc.text(`Documento: ${formatCustomerDoc(input.customer)}`, 330, recY + 10);
    doc.text(`Condición: ${input.paymentCondition} (${input.paymentMethod})`, 330, recY + 26);
    doc
      .fontSize(8)
      .fillColor("#64748B")
      .text(`Estado SIFEN: ${input.status} · Ambiente: ${input.mode}`, 52, recY + 42);

    // Tabla de ítems
    let y = recY + 72;
    doc.rect(40, y, contentWidth, 22).fill("#060E24");
    doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(8);
    doc.text("SKU", 48, y + 7, { width: 65 });
    doc.text("Descripción", 115, y + 7, { width: 155 });
    doc.text("Cant.", 272, y + 7, { width: 35, align: "right" });
    doc.text("P. Unit.", 310, y + 7, { width: 62, align: "right" });
    doc.text("Exenta", 374, y + 7, { width: 55, align: "right" });
    doc.text("IVA 5%", 431, y + 7, { width: 55, align: "right" });
    doc.text("IVA 10%", 488, y + 7, { width: 60, align: "right" });

    y += 26;
    doc.fillColor("#0F172A").font("Helvetica").fontSize(8.2);
    for (const item of input.items) {
      doc.font("Courier").text(item.productSku, 48, y, { width: 65 });
      doc.font("Helvetica").text(item.productName, 115, y, { width: 155 });
      doc.font("Courier").text(String(item.quantity), 272, y, { width: 35, align: "right" });
      doc.text(pygFmt.format(item.unitPrice), 310, y, { width: 62, align: "right" });
      doc.text(item.taxRate === "EXENTA" ? pygFmt.format(item.lineTotal) : "—", 374, y, {
        width: 55,
        align: "right",
      });
      doc.text(item.taxRate === "IVA_5" ? pygFmt.format(item.lineTotal) : "—", 431, y, {
        width: 55,
        align: "right",
      });
      doc.text(item.taxRate === "IVA_10" ? pygFmt.format(item.lineTotal) : "—", 488, y, {
        width: 60,
        align: "right",
      });
      y += 20;
      doc.moveTo(40, y - 4).lineTo(555, y - 4).stroke("#E2E8F0");
    }

    // Totales y Liquidación IVA
    y += 10;
    doc.roundedRect(330, y, 225, 76, 6).fillAndStroke("#F8FAFC", "#CBD5E1");
    doc.fillColor("#334155").font("Helvetica").fontSize(8.5);
    doc.text("Liquidación IVA 5%:", 342, y + 10);
    doc.font("Courier").text(fmtGs(input.totalIva5), 445, y + 10, { width: 98, align: "right" });
    doc.font("Helvetica").text("Liquidación IVA 10%:", 342, y + 26);
    doc.font("Courier").text(fmtGs(input.totalIva10), 445, y + 26, { width: 98, align: "right" });
    doc.font("Helvetica").text("Total IVA:", 342, y + 42);
    doc
      .font("Courier")
      .text(fmtGs(input.totalIva5 + input.totalIva10), 445, y + 42, { width: 98, align: "right" });
    doc
      .fillColor("#0038A8")
      .font("Helvetica-Bold")
      .fontSize(10.5)
      .text("TOTAL A PAGAR:", 342, y + 58);
    doc.font("Courier-Bold").text(fmtGs(input.totalAmount), 445, y + 58, {
      width: 98,
      align: "right",
    });

    // Recuadro QR + CDC oficial SIFEN
    const qrBoxY = y + 92;
    doc.roundedRect(40, qrBoxY, contentWidth, 118, 6).stroke("#CBD5E1");
    doc.image(qrPng, 52, qrBoxY + 11, { width: 96, height: 96 });

    doc
      .fillColor("#0F172A")
      .font("Helvetica-Bold")
      .fontSize(9.5)
      .text("Representación Gráfica del Documento Electrónico (KuDE)", 162, qrBoxY + 14);
    doc
      .font("Helvetica")
      .fontSize(8.2)
      .fillColor("#475569")
      .text(
        "Consulte la validez de esta Factura Electrónica escaneando el código QR o ingresando el CDC en https://ekuatia.set.gov.py/consultas/",
        162,
        qrBoxY + 30,
        { width: 380 }
      );
    doc
      .fillColor("#0F172A")
      .font("Helvetica-Bold")
      .fontSize(8)
      .text("CDC (Código de Control — 44 dígitos):", 162, qrBoxY + 62);
    doc.font("Courier-Bold").fontSize(9).text(formatCDC(input.cdc), 162, qrBoxY + 75, {
      width: 380,
    });

    if (input.mode !== "PROD") {
      doc
        .fillColor("#B45309")
        .font("Helvetica-Bold")
        .fontSize(8)
        .text(
          `SIN VALOR FISCAL — GENERADO EN AMBIENTE ${input.mode} (Ñemubox SIFEN v150)`,
          162,
          qrBoxY + 96
        );
    }

    doc.end();
  });
}

function drawDashedLine(doc: PDFKit.PDFDocument, x1: number, x2: number) {
  doc.moveDown(0.35);
  const y = doc.y;
  doc.save().dash(2, { space: 2 }).moveTo(x1, y).lineTo(x2, y).stroke("#94A3B8").undash().restore();
  doc.moveDown(0.4);
}
