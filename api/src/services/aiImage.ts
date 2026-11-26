import { env } from "../config/env.js";

export interface GeneratedImageResult {
  data: Buffer;
  mimeType: string;
  source: string;
  usedFallback: boolean;
  iconName?: string;
  providerMessage?: string;
}

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB

interface CategoryMatch {
  keywords: string[];
  iconifyQueries: string[];
  bg1: string;
  bg2: string;
  stroke: string;
}

/**
 * Diccionario de productos comunes en comercios de Paraguay (español + términos locales)
 * mapeados a búsquedas limpias de íconos vectoriales de línea fina en Iconify.
 */
const PARAGUAY_PRODUCT_CATEGORIES: CategoryMatch[] = [
  {
    keywords: ["agua", "mineral", "bidon", "hielo"],
    iconifyQueries: ["droplet", "water", "bottle"],
    bg1: "#F0F9FF",
    bg2: "#E0F2FE",
    stroke: "#0369A1",
  },
  {
    keywords: ["yerba", "mate", "terere", "te", "cocido", "infusion"],
    iconifyQueries: ["leaf", "tea", "mug"],
    bg1: "#ECFDF5",
    bg2: "#D1FAE5",
    stroke: "#047857",
  },
  {
    keywords: ["arroz", "fideo", "pasta", "harina", "almidon", "azucar", "poroto", "lenteja", "sal", "grano", "bolsa"],
    iconifyQueries: ["rice", "sack", "wheat"],
    bg1: "#FFFBEB",
    bg2: "#FEF3C7",
    stroke: "#B45309",
  },
  {
    keywords: ["aceite", "girasol", "oliva", "vinagre", "salsa", "aderezo", "mayonesa", "ketchup"],
    iconifyQueries: ["bottle", "oil", "droplet"],
    bg1: "#FEFCE8",
    bg2: "#FEF08A",
    stroke: "#A16207",
  },
  {
    keywords: ["leche", "yogurt", "yogur", "crema", "manteca", "lacteo"],
    iconifyQueries: ["milk", "bottle"],
    bg1: "#F8FAFC",
    bg2: "#E2E8F0",
    stroke: "#1E40AF",
  },
  {
    keywords: ["queso", "paraguay"],
    iconifyQueries: ["cheese"],
    bg1: "#FFFBEB",
    bg2: "#FDE68A",
    stroke: "#B45309",
  },
  {
    keywords: ["pan", "chipa", "galleta", "galletita", "factura", "bizcocho", "torta", "empanada"],
    iconifyQueries: ["bread", "croissant", "cookie"],
    bg1: "#FFF7ED",
    bg2: "#FFEDD5",
    stroke: "#C2410C",
  },
  {
    keywords: ["helado", "paleta", "postre"],
    iconifyQueries: ["ice-cream", "popsicle"],
    bg1: "#FDF2F8",
    bg2: "#FCE7F3",
    stroke: "#BE185D",
  },
  {
    keywords: ["cafe", "capuchino", "espresso"],
    iconifyQueries: ["coffee", "cup"],
    bg1: "#FEF3C7",
    bg2: "#FDE68A",
    stroke: "#78350F",
  },
  {
    keywords: ["cerveza", "chopp", "pilsen", "vino", "fernet", "whisky", "bebida"],
    iconifyQueries: ["beer", "wine", "bottle"],
    bg1: "#FEF2F2",
    bg2: "#FEE2E2",
    stroke: "#B91C1C",
  },
  {
    keywords: ["gaseosa", "cola", "soda", "jugo", "refresco", "energizante"],
    iconifyQueries: ["cup-soda", "bottle", "drink"],
    bg1: "#FEF2F2",
    bg2: "#FCE7F3",
    stroke: "#BE123C",
  },
  {
    keywords: ["cuaderno", "libro", "libreta", "carpeta", "agenda", "escolar", "hoja"],
    iconifyQueries: ["notebook", "book", "pencil"],
    bg1: "#EEF2FF",
    bg2: "#E0E7FF",
    stroke: "#1D4ED8",
  },
  {
    keywords: ["lapiz", "boligrafo", "birome", "marcador", "regla", "borrador", "libreria"],
    iconifyQueries: ["pencil", "pen"],
    bg1: "#EEF2FF",
    bg2: "#DBEAFE",
    stroke: "#1E40AF",
  },
  {
    keywords: ["carne", "asado", "costilla", "vacio", "pollo", "chorizo", "embutido", "jamon", "mortadela"],
    iconifyQueries: ["meat", "drumstick"],
    bg1: "#FEF2F2",
    bg2: "#FECACA",
    stroke: "#991B1B",
  },
  {
    keywords: ["huevo", "huevos", "maple"],
    iconifyQueries: ["egg"],
    bg1: "#FFFBEB",
    bg2: "#FEF3C7",
    stroke: "#92400E",
  },
  {
    keywords: ["fruta", "manzana", "banana", "naranja", "limon", "tomate", "verdura", "papa", "cebolla"],
    iconifyQueries: ["apple", "carrot", "citrus"],
    bg1: "#F0FDF4",
    bg2: "#DCFCE7",
    stroke: "#15803D",
  },
  {
    keywords: ["jabon", "detergente", "lavandina", "shampoo", "acondicionador", "limpieza", "desodorante", "papel"],
    iconifyQueries: ["sparkles", "spray-can", "droplets"],
    bg1: "#ECFEFF",
    bg2: "#CFFAFE",
    stroke: "#0E7490",
  },
  {
    keywords: ["remedio", "medicamento", "pastilla", "ibuprofeno", "paracetamol", "vitamina", "farmacia"],
    iconifyQueries: ["pill", "heart-pulse"],
    bg1: "#FEF2F2",
    bg2: "#FFE4E6",
    stroke: "#BE123C",
  },
  {
    keywords: ["martillo", "tornillo", "clavo", "llave", "herramienta", "ferreteria", "pintura", "foco", "cable"],
    iconifyQueries: ["wrench", "hammer", "bulb"],
    bg1: "#F8FAFC",
    bg2: "#E2E8F0",
    stroke: "#334155",
  },
  {
    keywords: ["ropa", "remera", "camisa", "pantalon", "zapato", "zapatilla", "gorra"],
    iconifyQueries: ["shirt", "shoe"],
    bg1: "#F5F3FF",
    bg2: "#EDE9FE",
    stroke: "#6D28D9",
  },
  {
    keywords: ["celular", "cargador", "auricular", "pila", "bateria", "mouse", "teclado", "usb"],
    iconifyQueries: ["smartphone", "headphones", "battery"],
    bg1: "#F1F5F9",
    bg2: "#E2E8F0",
    stroke: "#0F172A",
  },
];

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const ENGLISH_STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "without",
  "pack",
  "packet",
  "unit",
  "units",
  "type",
  "brand",
  "classic",
  "traditional",
  "natural",
  "fresh",
  "big",
  "small",
  "mini",
  "extra",
  "super",
  "premium",
]);

const translationCache = new Map<string, string[]>();

const FALLBACK_PALETTES = [
  { bg1: "#EFF6FF", bg2: "#DBEAFE", stroke: "#0038A8" },
  { bg1: "#ECFDF5", bg2: "#D1FAE5", stroke: "#047857" },
  { bg1: "#FFFBEB", bg2: "#FEF3C7", stroke: "#B45309" },
  { bg1: "#FEF2F2", bg2: "#FEE2E2", stroke: "#B91C1C" },
  { bg1: "#F5F3FF", bg2: "#EDE9FE", stroke: "#6D28D9" },
];

function pickDeterministicPalette(text: string) {
  const hash = text.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return FALLBACK_PALETTES[hash % FALLBACK_PALETTES.length];
}

/**
 * Traduce nombres/palabras en español a una lista ordenada de candidatos en inglés
 * (traducción principal + acepciones/sinónimos nominales) antes de consultar Iconify.
 * Ej: "collar" -> ["necklace", "collar", "beads", ...]
 */
async function translateSpanishToEnglishCandidates(text: string): Promise<string[]> {
  const key = normalizeText(text).trim();
  if (!key) return [];
  const cached = translationCache.get(key);
  if (cached) return cached;

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=es&tl=en&dt=t&dt=bd&dt=at&q=${encodeURIComponent(
      text.trim()
    )}`;
    const res = await fetchWithTimeout(url, { method: "GET" }, 6000);
    if (!res.ok) return [];
    const json = (await res.json()) as unknown[];

    const terms: string[] = [];
    const push = (val: unknown) => {
      if (typeof val !== "string") return;
      const cleaned = val.trim().toLowerCase();
      if (cleaned && !terms.includes(cleaned)) terms.push(cleaned);
    };

    // 1) Acepciones de diccionario (dt=bd) SOLO sustantivos primero (ej. "collar" -> "necklace")
    const dictGroups = Array.isArray(json[1]) ? (json[1] as unknown[][]) : [];
    for (const group of dictGroups) {
      if (Array.isArray(group) && group[0] === "noun" && Array.isArray(group[1])) {
        for (const t of group[1]) push(t);
      }
    }

    // 2) Traducción principal (dt=t) (ej. "velas" -> "candles")
    const primaryParts = Array.isArray(json[0]) ? (json[0] as unknown[][]) : [];
    const primary = primaryParts
      .map((p) => (Array.isArray(p) && typeof p[0] === "string" ? p[0] : ""))
      .join("")
      .trim();
    push(primary);

    // 3) Traducciones alternativas (dt=at)
    const altGroups = Array.isArray(json[5]) ? (json[5] as unknown[][]) : [];
    for (const group of altGroups) {
      if (Array.isArray(group) && Array.isArray(group[2])) {
        for (const item of group[2]) {
          if (Array.isArray(item)) push(item[0]);
        }
      }
    }

    const result = terms.slice(0, 10);
    if (result.length > 0) {
      translationCache.set(key, result);
    }
    return result;
  } catch {
    return [];
  }
}

function extractEnglishSearchQueries(candidates: string[]): string[] {
  const queries: string[] = [];

  for (const candidate of candidates) {
    const clean = normalizeText(candidate).replace(/[^a-z0-9\s-]/g, " ");
    const tokens = clean
      .split(/\s+/)
      .filter((w) => w.length >= 2 && !/^\d+(g|gr|kg|ml|l|lt|cc|cm|mm|un|uni)?$/.test(w))
      .filter((w) => !ENGLISH_STOPWORDS.has(w));

    if (tokens.length === 1) {
      const token = tokens[0];
      queries.push(token);
      if (token.endsWith("s") && token.length > 4 && !token.endsWith("ss")) {
        queries.push(token.slice(0, -1));
      }
    } else if (tokens.length >= 2) {
      queries.push(tokens.slice(0, 2).join("-"));
      for (const token of tokens) {
        queries.push(token);
        if (token.endsWith("s") && token.length > 4 && !token.endsWith("ss")) {
          queries.push(token.slice(0, -1));
        }
      }
    }
  }

  return Array.from(new Set(queries)).slice(0, 12);
}

function matchCategory(inputText: string): {
  matchedLocally: boolean;
  queries: string[];
  bg1: string;
  bg2: string;
  stroke: string;
} {
  const norm = normalizeText(inputText);
  const words = norm.split(/[^a-z0-9]+/).filter((w) => w.length >= 2);

  for (const cat of PARAGUAY_PRODUCT_CATEGORIES) {
    const matched = cat.keywords.some(
      (kw) =>
        words.includes(kw) ||
        (kw.length >= 5 && words.some((w) => w.startsWith(kw)))
    );
    if (matched) {
      return {
        matchedLocally: true,
        queries: cat.iconifyQueries,
        bg1: cat.bg1,
        bg2: cat.bg2,
        stroke: cat.stroke,
      };
    }
  }

  const palette = pickDeterministicPalette(norm || "nemubox");
  const fallbackWords = words.filter((w) => w.length >= 3).slice(0, 2);
  return {
    matchedLocally: false,
    queries: [...fallbackWords, "package", "box"],
    ...palette,
  };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 15000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Prioriza coincidencia exacta del símbolo en líneas simples (outline) antes de variantes compuestas.
 */
function pickBestLineIcon(icons: string[], query: string): string | null {
  if (icons.length === 0) return null;
  const q = query.toLowerCase();
  const isOutline = (id: string) =>
    !id.includes("-filled") && !id.includes("-solid") && !id.includes("-bold");
  const iconName = (id: string) => (id.split(":")[1] ?? "").toLowerCase();

  // 1) Coincidencia exacta de nombre en sets de línea fina (ej. "ring" -> hugeicons:ring / mdi:ring)
  const exactChecks = [
    (id: string) =>
      (id.startsWith("lucide:") ||
        id.startsWith("tabler:") ||
        id.startsWith("hugeicons:") ||
        id.startsWith("streamline:") ||
        id.startsWith("icon-park-outline:")) &&
      isOutline(id) &&
      iconName(id) === q,
    (id: string) => isOutline(id) && (iconName(id) === q || iconName(id) === `${q}-outline`),
  ];
  for (const check of exactChecks) {
    const found = icons.find(check);
    if (found) return found;
  }

  // 2) Mejor variante outline por preferencia de set
  const preferred = [
    (id: string) => id.startsWith("lucide:"),
    (id: string) => id.startsWith("tabler:") && !id.includes("-filled"),
    (id: string) => id.startsWith("hugeicons:"),
    (id: string) => id.startsWith("streamline:") && !id.includes("-solid"),
    (id: string) => id.startsWith("icon-park-outline:"),
    (id: string) => id.startsWith("mdi:") && id.endsWith("-outline"),
    isOutline,
  ];
  for (const check of preferred) {
    const found = icons.find(check);
    if (found) return found;
  }
  return icons[0];
}

/**
 * Compone una miniatura SVG minimalista (512x512) con el símbolo en líneas simples
 * perfectamente centrado (sin texto duplicado, nítido tanto en 44px como en 512px).
 */
function composeMinimalIconCard(params: {
  rawIconSvg: string;
  bg1: string;
  bg2: string;
  stroke: string;
}): Buffer {
  const viewBoxMatch = /viewBox="([^"]+)"/.exec(params.rawIconSvg);
  const viewBox = viewBoxMatch ? viewBoxMatch[1] : "0 0 24 24";
  const innerMatch = /<svg[^>]*>([\s\S]*?)<\/svg>/i.exec(params.rawIconSvg);
  const innerContent = (innerMatch ? innerMatch[1] : "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/on\w+="[^"]*"/gi, "");

  const composed = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${params.bg1}"/>
      <stop offset="100%" stop-color="${params.bg2}"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="64" fill="url(#bg)"/>
  <circle cx="256" cy="256" r="168" fill="#FFFFFF" fill-opacity="0.78"/>
  <g color="${params.stroke}">
    <svg x="136" y="136" width="240" height="240" viewBox="${viewBox}" fill="none">
      ${innerContent}
    </svg>
  </g>
</svg>`;

  return Buffer.from(composed, "utf-8");
}

/**
 * Fallback local instantáneo si no hay conexión a Internet.
 */
export function buildLocalFallbackSvg(productName: string, sku: string): Buffer {
  const words = productName.trim().split(/\s+/);
  const initials = words
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  const label = escapeXml(productName.slice(0, 26));
  const safeSku = escapeXml(sku.slice(0, 16));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="52" fill="#F1F5F9"/>
  <circle cx="256" cy="212" r="120" fill="#FFFFFF"/>
  <text x="256" y="236" text-anchor="middle" font-family="system-ui, sans-serif" font-size="76" font-weight="800" fill="#0038A8">${escapeXml(initials || "NB")}</text>
  <text x="256" y="396" text-anchor="middle" font-family="system-ui, sans-serif" font-size="24" font-weight="700" fill="#0F172A">${label}</text>
  <text x="256" y="432" text-anchor="middle" font-family="monospace" font-size="18" font-weight="600" fill="#64748B">${safeSku}</text>
</svg>`;

  return Buffer.from(svg, "utf-8");
}

/**
 * Genera una miniatura en líneas simples usando:
 *  1) Diccionario local paraguayo (0ms)
 *  2) Traducción automática Español -> Inglés con acepciones/sinónimos nominales
 *  3) API gratuita y abierta de Iconify (lucide, tabler, hugeicons, streamline, icon-park-outline, mdi)
 */
async function generateViaIconify(params: {
  productName: string;
  sku: string;
  customPrompt?: string;
}): Promise<GeneratedImageResult> {
  const searchSource = params.customPrompt?.trim() || params.productName;
  const matched = matchCategory(searchSource);
  const prefixes = "lucide,tabler,hugeicons,streamline,icon-park-outline,mdi";

  let queries = [...matched.queries];

  if (!matched.matchedLocally) {
    const candidates = await translateSpanishToEnglishCandidates(searchSource);
    const englishQueries = extractEnglishSearchQueries(candidates);
    if (englishQueries.length > 0) {
      // Probar todos los términos traducidos antes de caer al genérico "package"/"box"
      queries = [...englishQueries, ...matched.queries];
    }
  }

  const uniqueQueries = Array.from(new Set(queries));

  for (const query of uniqueQueries) {
    try {
      const searchUrl = `https://api.iconify.design/search?query=${encodeURIComponent(
        query
      )}&prefixes=${prefixes}&limit=10`;
      const searchRes = await fetchWithTimeout(searchUrl, { method: "GET" }, 8000);
      if (!searchRes.ok) continue;
      const searchJson = (await searchRes.json()) as { icons?: string[] };
      const picked = pickBestLineIcon(searchJson.icons ?? [], query);
      if (!picked) continue;

      const [prefix, name] = picked.split(":");
      if (!prefix || !name) continue;

      const svgUrl = `https://api.iconify.design/${encodeURIComponent(prefix)}/${encodeURIComponent(
        name
      )}.svg`;
      const svgRes = await fetchWithTimeout(svgUrl, { method: "GET" }, 8000);
      if (!svgRes.ok) continue;
      const rawSvg = await svgRes.text();
      if (!rawSvg.includes("<svg")) continue;

      const composed = composeMinimalIconCard({
        rawIconSvg: rawSvg,
        bg1: matched.bg1,
        bg2: matched.bg2,
        stroke: matched.stroke,
      });

      const translationHint =
        !matched.matchedLocally && normalizeText(query) !== normalizeText(searchSource)
          ? ` · "${searchSource}" → "${query}"`
          : "";

      return {
        data: composed,
        mimeType: "image/svg+xml",
        source: "ICON_ICONIFY",
        usedFallback: false,
        iconName: picked,
        providerMessage: `Ícono ${picked}${translationHint}`,
      };
    } catch {
      // Probar siguiente keyword
    }
  }

  throw new Error("No se encontró un ícono coincidente en Iconify");
}

function buildStudioPrompt(productName: string, customPrompt?: string): string {
  if (customPrompt && customPrompt.trim().length > 0) {
    return `${customPrompt.trim()}, minimal flat line-art product icon, clean simple strokes, centered on white background`;
  }
  return `Minimal clean line-art icon of ${productName}, simple vector strokes, centered on soft neutral background, no text`;
}

async function generateViaPollinations(prompt: string): Promise<{ data: Buffer; mimeType: string }> {
  const encoded = encodeURIComponent(prompt);
  const headers: Record<string, string> = { Accept: "image/*" };
  if (env.POLLINATIONS_API_KEY) {
    headers.Authorization = `Bearer ${env.POLLINATIONS_API_KEY}`;
  }
  const url = `https://gen.pollinations.ai/image/${encoded}?width=512&height=512&model=flux&nologo=true`;
  const res = await fetchWithTimeout(url, { method: "GET", headers }, 25000);
  const contentType = res.headers.get("content-type") ?? "";
  if (!res.ok || !contentType.startsWith("image/")) {
    throw new Error(`Pollinations HTTP ${res.status}`);
  }
  const data = Buffer.from(await res.arrayBuffer());
  if (data.length === 0 || data.length > MAX_IMAGE_BYTES) {
    throw new Error("Tamaño de imagen fuera de rango");
  }
  return { data, mimeType: contentType.split(";")[0] };
}

async function generateViaCloudflare(prompt: string): Promise<{ data: Buffer; mimeType: string }> {
  if (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN) {
    throw new Error("Faltan CF_ACCOUNT_ID / CF_API_TOKEN en .env");
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell`;
  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.CF_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt, steps: 4 }),
    },
    25000
  );
  if (!res.ok) throw new Error(`Cloudflare Workers AI HTTP ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const json = (await res.json()) as { result?: { image?: string } };
    if (!json.result?.image) throw new Error("Sin imagen base64 de Cloudflare");
    return { data: Buffer.from(json.result.image, "base64"), mimeType: "image/jpeg" };
  }
  return {
    data: Buffer.from(await res.arrayBuffer()),
    mimeType: contentType.split(";")[0] || "image/png",
  };
}

async function generateViaHuggingFace(prompt: string): Promise<{ data: Buffer; mimeType: string }> {
  if (!env.HF_API_TOKEN) throw new Error("Falta HF_API_TOKEN en .env");
  const res = await fetchWithTimeout(
    "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.HF_API_TOKEN}`,
        "Content-Type": "application/json",
        Accept: "image/jpeg",
      },
      body: JSON.stringify({ inputs: prompt }),
    },
    25000
  );
  if (!res.ok) throw new Error(`Hugging Face HTTP ${res.status}`);
  return {
    data: Buffer.from(await res.arrayBuffer()),
    mimeType: (res.headers.get("content-type") ?? "image/jpeg").split(";")[0],
  };
}

export async function generateProductMiniImage(params: {
  productName: string;
  sku: string;
  customPrompt?: string;
}): Promise<GeneratedImageResult> {
  const provider = env.AI_IMAGE_PROVIDER;

  if (provider === "local") {
    return {
      data: buildLocalFallbackSvg(params.productName, params.sku),
      mimeType: "image/svg+xml",
      source: "AI_LOCAL",
      usedFallback: false,
      providerMessage: "Miniatura SVG generada localmente",
    };
  }

  try {
    if (provider === "iconify") {
      return await generateViaIconify(params);
    }

    const prompt = buildStudioPrompt(params.productName, params.customPrompt);
    if (provider === "cloudflare") {
      const img = await generateViaCloudflare(prompt);
      return { ...img, source: "AI_CLOUDFLARE", usedFallback: false };
    }
    if (provider === "huggingface") {
      const img = await generateViaHuggingFace(prompt);
      return { ...img, source: "AI_HUGGINGFACE", usedFallback: false };
    }
    const img = await generateViaPollinations(prompt);
    return { ...img, source: "AI_POLLINATIONS", usedFallback: false };
  } catch (err) {
    // Si falla el proveedor de fotos IA, intentar primero Iconify antes del fallback de iniciales
    if (provider !== "iconify") {
      try {
        return await generateViaIconify(params);
      } catch {
        // Continuar al fallback local
      }
    }
    const reason = err instanceof Error ? err.message : "Proveedor no disponible";
    return {
      data: buildLocalFallbackSvg(params.productName, params.sku),
      mimeType: "image/svg+xml",
      source: "AI_LOCAL",
      usedFallback: true,
      providerMessage: `Se usó miniatura local de respaldo (${reason})`,
    };
  }
}
