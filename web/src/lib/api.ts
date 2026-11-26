import type {
  Customer,
  EmitterProfile,
  HealthResponse,
  Product,
  StockMovement,
  StockMovementType,
  SystemStatusResponse,
} from "../types/domain";

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    let message = `Error HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Sin cuerpo JSON
    }
    throw new Error(message);
  }

  return (await res.json()) as T;
}

export const api = {
  getHealth: () => apiJson<HealthResponse>("/api/health"),
  getSystemStatus: () => apiJson<SystemStatusResponse>("/api/system/status"),

  // Emisor
  getEmitter: () => apiJson<EmitterProfile>("/api/emitter"),
  updateEmitter: (data: Partial<EmitterProfile>) =>
    apiJson<EmitterProfile>("/api/emitter", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  // Productos
  listProducts: () => apiJson<Product[]>("/api/products"),
  createProduct: (data: Omit<Product, "id" | "hasImage" | "imageUrl" | "imageSource" | "imageSizeBytes">) =>
    apiJson<Product>("/api/products", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateProduct: (id: string, data: Partial<Product>) =>
    apiJson<Product>(`/api/products/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteProduct: (id: string) =>
    apiJson<{ ok: boolean }>(`/api/products/${id}`, { method: "DELETE" }),

  // Fotos de producto en PostgreSQL + Generación IA
  uploadProductImage: (productId: string, dataUrl: string) =>
    apiJson<{
      hasImage: boolean;
      imageUrl: string;
      imageSource: string;
      imageSizeBytes: number;
    }>(`/api/products/${productId}/image`, {
      method: "PUT",
      body: JSON.stringify({ dataUrl }),
    }),
  deleteProductImage: (productId: string) =>
    apiJson<{ hasImage: boolean }>(`/api/products/${productId}/image`, {
      method: "DELETE",
    }),
  generateProductImage: (productId: string, prompt?: string) =>
    apiJson<{
      hasImage: boolean;
      imageUrl: string;
      imageSource: string;
      imageSizeBytes: number;
      usedFallback?: boolean;
      message?: string;
    }>(`/api/products/${productId}/image/generate`, {
      method: "POST",
      body: JSON.stringify(prompt ? { prompt } : {}),
    }),

  // Kardex
  listMovements: (limit = 100) =>
    apiJson<StockMovement[]>(`/api/stock/movements?limit=${limit}`),
  createMovement: (data: {
    productId: string;
    type: StockMovementType;
    quantity: number;
    notes?: string;
    referenceType?: string;
    referenceId?: string;
  }) =>
    apiJson<{ movement: StockMovement; newStock: number }>("/api/stock/movements", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Clientes
  listCustomers: () => apiJson<Customer[]>("/api/customers"),
  createCustomer: (data: Omit<Customer, "id">) =>
    apiJson<Customer>("/api/customers", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

/**
 * Redimensiona y comprime una foto local en el navegador (máx 512px) antes de
 * guardarla en PostgreSQL para mantener la BD ágil y liviana (~25–70 KB por foto).
 */
export async function compressImageFileToDataUrl(file: File, maxDim = 512): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo procesar la imagen en el navegador");

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);

    const webp = canvas.toDataURL("image/webp", 0.84);
    if (webp.startsWith("data:image/webp")) {
      return webp;
    }
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    bitmap.close();
  }
}
