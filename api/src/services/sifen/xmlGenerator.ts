import crypto from "node:crypto";
import type {
  Customer,
  EmitterConfig,
  PaymentCondition,
  PaymentMethod,
  SifenMode,
  TaxRate,
} from "@prisma/client";

export interface SifenLineItem {
  productSku: string;
  productName: string;
  unitCodeSifen: number;
  quantity: number;
  unitPrice: number;
  taxRate: TaxRate;
  lineTotal: number;
  ivaAmount: number;
}

export function computeItemIva(lineTotal: number, rate: TaxRate): number {
  if (rate === "IVA_10") return Math.round(lineTotal / 11);
  if (rate === "IVA_5") return Math.round(lineTotal / 21);
  return 0;
}

export function computeSaleTotals(items: SifenLineItem[]) {
  let subtotalExenta = 0;
  let subtotalIva5 = 0;
  let subtotalIva10 = 0;
  let totalIva5 = 0;
  let totalIva10 = 0;

  for (const item of items) {
    if (item.taxRate === "EXENTA") {
      subtotalExenta += item.lineTotal;
    } else if (item.taxRate === "IVA_5") {
      subtotalIva5 += item.lineTotal;
      totalIva5 += item.ivaAmount;
    } else {
      subtotalIva10 += item.lineTotal;
      totalIva10 += item.ivaAmount;
    }
  }

  return {
    subtotalExenta,
    subtotalIva5,
    subtotalIva10,
    totalIva5,
    totalIva10,
    totalIva: totalIva5 + totalIva10,
    baseGrav5: subtotalIva5 - totalIva5,
    baseGrav10: subtotalIva10 - totalIva10,
    totalAmount: subtotalExenta + subtotalIva5 + subtotalIva10,
  };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatIsoLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatDateYMD(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function mapPaymentMethodCode(method: PaymentMethod): { code: number; desc: string } {
  switch (method) {
    case "EFECTIVO":
      return { code: 1, desc: "Efectivo" };
    case "TARJETA":
      return { code: 3, desc: "Tarjeta de crédito/débito" };
    case "TRANSFERENCIA":
      return { code: 5, desc: "Transferencia bancaria" };
    case "QR":
      return { code: 9, desc: "Pago electrónico / QR" };
    default:
      return { code: 99, desc: "Otro" };
  }
}

/**
 * Genera la URL oficial de consulta QR de SIFEN v150 incluyendo el hash SHA-256 con CSC:
 * cHashQR = SHA256(parametrosSinHash + CSC)
 */
export function buildSifenQrUrl(params: {
  mode: SifenMode;
  cdc: string;
  issuedAt: Date;
  customer: Customer;
  totalAmount: number;
  totalIva: number;
  itemCount: number;
  digestValueHex: string;
  cscId: string;
  csc: string;
}): string {
  const baseUrl =
    params.mode === "PROD"
      ? "https://ekuatia.set.gov.py/consultas/qr?"
      : "https://ekuatia.set.gov.py/consultas-test/qr?";

  const dFeEmiHex = Buffer.from(formatIsoLocal(params.issuedAt), "utf-8").toString("hex");
  const receiverParam =
    params.customer.documentType === "RUC"
      ? `dRucRec=${encodeURIComponent(params.customer.documentNumber)}`
      : `dNumIDRec=${encodeURIComponent(params.customer.documentNumber || "0")}`;

  const queryWithoutHash = [
    "nVersion=150",
    `Id=${params.cdc}`,
    `dFeEmiDE=${dFeEmiHex}`,
    receiverParam,
    `dTotGralOpe=${Math.round(params.totalAmount)}`,
    `dTotIVA=${Math.round(params.totalIva)}`,
    `cItems=${params.itemCount}`,
    `DigestValue=${params.digestValueHex}`,
    `IdCSC=${params.cscId}`,
  ].join("&");

  const cHashQR = crypto
    .createHash("sha256")
    .update(`${queryWithoutHash}${params.csc}`, "utf-8")
    .digest("hex");

  return `${baseUrl}${queryWithoutHash}&cHashQR=${cHashQR}`;
}

/**
 * Genera el Documento Electrónico XML conforme a la estructura del Manual Técnico SIFEN v150.
 */
export function buildSifenXmlV150(params: {
  cdc: string;
  securityCode: string;
  documentNumberPadded: string;
  emitter: EmitterConfig;
  customer: Customer;
  paymentCondition: PaymentCondition;
  paymentMethod: PaymentMethod;
  items: SifenLineItem[];
  issuedAt: Date;
}): { xml: string; qrUrl: string } {
  const totals = computeSaleTotals(params.items);
  const feEmi = formatIsoLocal(params.issuedAt);
  const feIniT = formatDateYMD(params.emitter.timbradoFechaInicio);
  const payment = mapPaymentMethodCode(params.paymentMethod);
  const isTaxpayer = params.customer.documentType === "RUC";

  const itemsXml = params.items
    .map((item) => {
      const afecIva = item.taxRate === "EXENTA" ? 3 : 1;
      const desAfecIva = item.taxRate === "EXENTA" ? "Exento" : "Gravado IVA";
      const propIva = item.taxRate === "EXENTA" ? 0 : 100;
      const tasaIva = item.taxRate === "IVA_10" ? 10 : item.taxRate === "IVA_5" ? 5 : 0;
      const baseGrav = item.taxRate === "EXENTA" ? 0 : item.lineTotal - item.ivaAmount;

      return `      <gCamItem>
        <dCodInt>${escapeXml(item.productSku)}</dCodInt>
        <dDesProSer>${escapeXml(item.productName)}</dDesProSer>
        <cUniMed>${item.unitCodeSifen}</cUniMed>
        <dDesUniMed>UNI</dDesUniMed>
        <dCantProSer>${item.quantity}</dCantProSer>
        <gValorItem>
          <dPUniProSer>${Math.round(item.unitPrice)}</dPUniProSer>
          <dTotBruOpeItem>${Math.round(item.lineTotal)}</dTotBruOpeItem>
          <gValorRestaItem>
            <dDescItem>0</dDescItem>
            <dTotOpeItem>${Math.round(item.lineTotal)}</dTotOpeItem>
          </gValorRestaItem>
        </gValorItem>
        <gCamIVA>
          <iAfecIVA>${afecIva}</iAfecIVA>
          <dDesAfecIVA>${desAfecIva}</dDesAfecIVA>
          <dPropIVA>${propIva}</dPropIVA>
          <dTasaIVA>${tasaIva}</dTasaIVA>
          <dBasGravIVA>${Math.round(baseGrav)}</dBasGravIVA>
          <dLiqIVAItem>${Math.round(item.ivaAmount)}</dLiqIVAItem>
        </gCamIVA>
      </gCamItem>`;
    })
    .join("\n");

  const receiverXml = isTaxpayer
    ? `      <gDatRec>
        <iNatRec>1</iNatRec>
        <iTiOpe>1</iTiOpe>
        <cPaisRec>PRY</cPaisRec>
        <dDesPaisRe>Paraguay</dDesPaisRe>
        <iTiContRec>2</iTiContRec>
        <dRucRec>${escapeXml(params.customer.documentNumber)}</dRucRec>
        <dDVRec>${escapeXml(params.customer.dv ?? "0")}</dDVRec>
        <dNomRec>${escapeXml(params.customer.name)}</dNomRec>
      </gDatRec>`
    : `      <gDatRec>
        <iNatRec>2</iNatRec>
        <iTiOpe>2</iTiOpe>
        <cPaisRec>PRY</cPaisRec>
        <dDesPaisRe>Paraguay</dDesPaisRe>
        <iTipIDRec>${params.customer.documentType === "CI" ? 1 : 5}</iTipIDRec>
        <dDTipIDRec>${params.customer.documentType === "CI" ? "Cédula paraguaya" : "Innominado"}</dDTipIDRec>
        <dNumIDRec>${escapeXml(params.customer.documentNumber || "0")}</dNumIDRec>
        <dNomRec>${escapeXml(params.customer.name)}</dNomRec>
      </gDatRec>`;

  const deBody = `  <DE Id="${params.cdc}">
    <dDVId>${params.cdc.slice(-1)}</dDVId>
    <dFecFirma>${feEmi}</dFecFirma>
    <dSisFact>1</dSisFact>
    <gOpeDE>
      <iTipEmi>1</iTipEmi>
      <dDesTipEmi>Normal</dDesTipEmi>
      <dCodSeg>${params.securityCode}</dCodSeg>
    </gOpeDE>
    <gTimb>
      <iTiDE>1</iTiDE>
      <dDesTiDE>Factura electrónica</dDesTiDE>
      <dNumTim>${escapeXml(params.emitter.timbrado)}</dNumTim>
      <dEst>${escapeXml(params.emitter.establecimiento)}</dEst>
      <dPunExp>${escapeXml(params.emitter.puntoExpedicion)}</dPunExp>
      <dNumDoc>${params.documentNumberPadded}</dNumDoc>
      <dFeIniT>${feIniT}</dFeIniT>
    </gTimb>
    <gDatGralOpe>
      <dFeEmiDE>${feEmi}</dFeEmiDE>
      <gOpeCom>
        <iTipTra>1</iTipTra>
        <dDesTipTra>Venta de mercadería</dDesTipTra>
        <iTImp>1</iTImp>
        <dDesTImp>IVA</dDesTImp>
        <cMoneOpe>PYG</cMoneOpe>
        <dDesMoneOpe>Guarani</dDesMoneOpe>
      </gOpeCom>
      <gEmis>
        <dRucEm>${escapeXml(params.emitter.ruc)}</dRucEm>
        <dDVEmi>${escapeXml(params.emitter.dv)}</dDVEmi>
        <iTipCont>2</iTipCont>
        <dNomEmi>${escapeXml(params.emitter.razonSocial)}</dNomEmi>
        <dDirEmi>${escapeXml(params.emitter.direccion)}</dDirEmi>
        <dNumCas>0</dNumCas>
        <cDepEmi>${params.emitter.departamentoCod}</cDepEmi>
        <cDisEmi>${params.emitter.distritoCod}</cDisEmi>
        <cCiuEmi>${params.emitter.ciudadCod}</cCiuEmi>
        <dTelEmi>${escapeXml(params.emitter.telefono || "021000000")}</dTelEmi>
        <dEmailE>${escapeXml(params.emitter.email || "facturacion@nemubox.com.py")}</dEmailE>
        <gActEco>
          <cActEco>${escapeXml(params.emitter.actividadEconomicaCod)}</cActEco>
          <dDesActEco>${escapeXml(params.emitter.actividadEconomicaDesc)}</dDesActEco>
        </gActEco>
      </gEmis>
${receiverXml}
    </gDatGralOpe>
    <gDtipDE>
      <gCamFE>
        <iIndPres>1</iIndPres>
        <dDesIndPres>Operación presencial</dDesIndPres>
      </gCamFE>
      <gCamCond>
        <iCondOpe>${params.paymentCondition === "CONTADO" ? 1 : 2}</iCondOpe>
        <dDCondOpe>${params.paymentCondition === "CONTADO" ? "Contado" : "Crédito"}</dDCondOpe>
        <gPaConEIni>
          <iTiPago>${payment.code}</iTiPago>
          <dDesTiPag>${payment.desc}</dDesTiPag>
          <dMonTiPag>${Math.round(totals.totalAmount)}</dMonTiPag>
          <cMoneTiPag>PYG</cMoneTiPag>
          <dDMoneTiPag>Guarani</dDMoneTiPag>
        </gPaConEIni>
      </gCamCond>
${itemsXml}
    </gDtipDE>
    <gTotSub>
      <dSubExe>${Math.round(totals.subtotalExenta)}</dSubExe>
      <dSub5>${Math.round(totals.subtotalIva5)}</dSub5>
      <dSub10>${Math.round(totals.subtotalIva10)}</dSub10>
      <dTotOpe>${Math.round(totals.totalAmount)}</dTotOpe>
      <dTotDesc>0</dTotDesc>
      <dTotGralOpe>${Math.round(totals.totalAmount)}</dTotGralOpe>
      <dIVA5>${Math.round(totals.totalIva5)}</dIVA5>
      <dIVA10>${Math.round(totals.totalIva10)}</dIVA10>
      <dLiqTotIVA5>${Math.round(totals.totalIva5)}</dLiqTotIVA5>
      <dLiqTotIVA10>${Math.round(totals.totalIva10)}</dLiqTotIVA10>
      <dTotIVA>${Math.round(totals.totalIva)}</dTotIVA>
      <dBaseGrav5>${Math.round(totals.baseGrav5)}</dBaseGrav5>
      <dBaseGrav10>${Math.round(totals.baseGrav10)}</dBaseGrav10>
      <dTBasGraIVA>${Math.round(totals.baseGrav5 + totals.baseGrav10)}</dTBasGraIVA>
    </gTotSub>
  </DE>`;

  const digestValueHex = crypto
    .createHash("sha256")
    .update(deBody, "utf-8")
    .digest("hex")
    .slice(0, 64);

  const qrUrl = buildSifenQrUrl({
    mode: params.emitter.sifenMode,
    cdc: params.cdc,
    issuedAt: params.issuedAt,
    customer: params.customer,
    totalAmount: totals.totalAmount,
    totalIva: totals.totalIva,
    itemCount: params.items.length,
    digestValueHex,
    cscId: params.emitter.cscId,
    csc: params.emitter.csc,
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rDE xmlns="http://ekuatia.set.gov.py/sifen/xsd" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dVerFor>150</dVerFor>
${deBody}
  <gCamFuFD>
    <dCarQR>${escapeXml(qrUrl)}</dCarQR>
  </gCamFuFD>
</rDE>`;

  return { xml, qrUrl };
}
