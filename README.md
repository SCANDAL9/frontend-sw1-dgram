# dgram — Frontend Client

Cliente web reactivo y colaborativo en tiempo real para **dgram**, construido con Angular 19, diseño visual con Tailwind CSS v4 y soporte de lienzo interactivo para diagramas UML y entidad-relación.

---

## Stack Tecnológico

- **Framework**: Angular 19 (Standalone Components & Signals)
- **Estilos**: Tailwind CSS v4 (100% utilidades, cero archivos CSS por componente)
- **Motor de Diagramación**: `@foblex/flow` & SVG
- **Sincronización en Tiempo Real**: Yjs (CRDT) + WebSocket nativo
- **Testing Unitario**: Node.js Test Runner nativo (`node:test` y `node:assert/strict`)
- **Testing End-to-End**: Playwright (Chromium headless)

---

## Estructura del Repositorio

```
frontend/
├── src/
│   ├── app/
│   │   ├── components/       # 20 componentes desacoplados (.component.ts + .component.html)
│   │   │   ├── canvas/       # Lienzo interactivo, barra de herramientas y nodos UML
│   │   │   ├── studio-drawer/# Panel lateral de asistencia IA y chat multimodal
│   │   │   ├── auth-modal/   # Modal de autenticación y registro
│   │   │   └── ...
│   │   ├── services/         # Servicios de dominio, comandos, outbox y WebSocket
│   │   └── models/           # Interfaces y tipos del dominio de diagramación
│   └── environments/         # Configuración de entornos (local y producción con proxy)
├── tests/                    # Suite de pruebas separada de la aplicación
│   ├── *.test.ts             # 26 pruebas unitarias de dominio y resiliencia
│   └── e2e/                  # 3 flujos críticos End-to-End con Playwright
├── playwright.config.ts      # Configuración de Playwright E2E
├── angular.json              # Configuración de compilación Angular y fileReplacements
├── Dockerfile                # Construcción multi-stage y servidor Nginx
├── nginx.conf                # Configuración de Nginx con Reverse Proxy y headers
└── package.json              # Scripts y dependencias con pnpm
```

---

## Requisitos Previos

- **Node.js**: v20+ o v22+
- **Gestor de Paquetes**: `pnpm` (recomendado v9+)

---

## Instalación y Ejecución Local

### 1. Instalar dependencias
```bash
pnpm install
```

### 2. Iniciar el servidor de desarrollo
```bash
pnpm start
```
La aplicación se levantará en `http://localhost:4200` conectándose por defecto a la API en `http://localhost:8000`.

### 3. Compilación de Producción
```bash
pnpm build
```
Genera el bundle optimizado en `dist/dgram/browser` aplicando automáticamente `environment.prod.ts` (rutas relativas `/api` y resolución dinámica de WebSockets).

---

## Ejecución de Pruebas

### Pruebas Unitarias de Dominio (`node:test`)
Ejecuta las 26 pruebas unitarias de forma ultrarrápida sin dependencias externas:
```bash
pnpm test
```

### Pruebas End-to-End (`Playwright`)
Ejecuta las pruebas en navegador real (Chromium headless) validando autenticación, manipulación de clases en el lienzo y el chat de IA:
```bash
pnpm test:e2e
```
