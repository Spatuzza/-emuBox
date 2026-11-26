# Ñemubox — Stock, POS y Facturación Electrónica (SIFEN / Paraguay)

Sistema **open-source**, liviano y auto-hospedable pensado para comercios y PyMEs de Paraguay que necesitan controlar su inventario, vender desde un punto de venta simple y emitir **Facturas Electrónicas (SIFEN / e-Kuatia v150)**.

## Hoja de ruta (Plan por fases)

| Fase | Rama | Alcance | Estado |
| :--- | :--- | :--- | :--- |
| **Parte 1** | `feat/01-infra` | Docker Compose, PostgreSQL + esquema SIFEN v150, API base + **Frontend completo** (Intro patriótica, Resumen, Stock/Kardex, Caja POS, KuDE 80mm/A4, SIFEN y Configuración) | Completada |
| **Parte 2** | `feat/02-stock-api` | API REST real de Productos (IVA PY `10%`/`5%`/`Exenta`), fotos en PostgreSQL (`product_images`), generador gratuito de íconos en líneas simples (`Iconify` + filtro ES→EN), Kardex auditable, Clientes (RUC + DV) y Emisor | Completada |
| **Parte 3** | `feat/03-pos-sifen-mock` | Endpoint transaccional de Ventas (descuento atómico de stock + Kardex + `sales`/`sifen_documents` en BD) + motor SIFEN v150 real en backend (XML oficial, CDC real, QR con hash SHA-256/CSC y KuDE PDF descargable 80mm/A4 en modo `mock`) | Completada |
| **Parte 4** | `feat/04-db-bridge` | **Modo Bridge / Metamórfico**: introspección de BD existente (`information_schema`), Wizard de mapeo inteligente ES/PY (`schema-map.json`), modo Solo Lectura / descuento atómico, Sidecar para SIFEN + fotos, e importación / reinicio limpio de BD | Siguiente |
| **Parte 5** | `feat/05-sifen-test-lotes` | Firma XMLDSig con certificado `.p12`, cola/worker de lotes asíncronos (hasta 50 DEs) contra `sifen-test.set.gov.py`, consulta RUC y eventos (cancelación/inutilización) | Pendiente |
| **Parte 6** | `feat/06-red-despliegue` | Reverse proxy Caddy HTTPS, monitor de IP pública / DDNS, perfil opcional de Cloudflare Tunnel (CGNAT) y guía de despliegue en producción | Pendiente |

## Modos SIFEN

Configurable mediante la variable `SIFEN_MODE` en `.env`:

- `mock`: Demo local inmediata sin certificado digital. Genera XML v150, CDC real y KuDE PDF simulando aprobación de SIFEN.
- `test`: Firma con certificado `.p12` y envía contra `sifen-test.set.gov.py` (requiere alta en Marangatu).
- `prod`: Mismo flujo apuntando a `sifen.set.gov.py` con timbrado y CSC definitivos.

## Inicio rápido con Docker

1. Copiá el archivo de entorno de ejemplo:
   ```bash
   cp .env.example .env
   ```
2. Levantá los servicios:
   ```bash
   docker compose up --build
   ```
3. Abrí en tu navegador:
   - **Frontend (Web):** `http://localhost:5173`
   - **API Healthcheck:** `http://localhost:3000/api/health`
   - **Estado del sistema:** `http://localhost:3000/api/system/status`

Al arrancar, el contenedor `api` aplica el esquema a PostgreSQL (`prisma db push`) y ejecuta un **seed idempotente** con un emisor de prueba, clientes base y 5 productos de ejemplo con IVA 10%, IVA 5% y Exenta.

## Estructura del repositorio

```text
.
├── api/                 # Backend Node.js + TypeScript + Fastify + Prisma
│   ├── prisma/          # schema.prisma y seed inicial Paraguay
│   └── src/             # Configuración, cliente Prisma y rutas REST
├── web/                 # Frontend React + Vite + Tailwind CSS
├── certs/               # Carpeta local para certificado .p12 (ignorado por Git)
├── docs/                # Arquitectura y documentación técnica
├── docker-compose.yml   # Orquestación PostgreSQL + API + Web
└── .env.example         # Plantilla de variables de entorno
```

Más detalles técnicos en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
