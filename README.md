# Ñemubox — Stock, POS y Facturación Electrónica (SIFEN / Paraguay)

Sistema **open-source**, liviano y auto-hospedable pensado para comercios y PyMEs de Paraguay que necesitan controlar su inventario, vender desde un punto de venta simple y emitir **Facturas Electrónicas (SIFEN / e-Kuatia v150)**.

## Características principales (Plan por fases)

| Fase | Rama | Alcance | Estado |
| :--- | :--- | :--- | :--- |
| **Parte 1** | `feat/01-infra` | Docker Compose, PostgreSQL, esquema de datos Paraguay/SIFEN, API Fastify + Web React conectados | En progreso |
| **Parte 2** | `feat/02-stock` | ABM de productos, tasas IVA PY (`10%`, `5%`, `Exenta`), Kardex de movimientos y alertas de stock mínimo | Pendiente |
| **Parte 3** | `feat/03-pos-sifen-mock` | Caja rápida (descuento de stock transaccional), XML v150, cálculo de CDC (44 dígitos), QR y KuDE PDF en modo `mock` | Pendiente |
| **Parte 4** | `feat/04-sifen-test-lotes` | Firma XMLDSig (`.p12`), envío por lotes asíncrono a `sifen-test.set.gov.py`, consulta RUC y eventos | Pendiente |
| **Parte 5** | `feat/05-red-despliegue` | Reverse proxy Caddy HTTPS, monitor de IP pública / DDNS y perfil opcional de Cloudflare Tunnel (CGNAT) | Pendiente |

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
