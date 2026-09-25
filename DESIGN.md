# Design System Specification: dgram

## 1. Context & Mode
- **Product**: `dgram` (Herramienta de modelado y arquitectura de software / diagramas UML).
- **Surface Mode**: **Operate** (según el estándar *Impeccable*).
  - *Prioridades*: Escaneabilidad, densidad de información óptima, precisión milimétrica, consistencia visual y que los paneles laterales/barras de herramientas nunca compitan visualmente con el lienzo de trabajo (*canvas*).

---

## 2. Core Principles (Impeccable + Shadcn)

1. **Tokens Semánticos Primero**:
   - Queda estrictamente prohibido el uso de valores hexadecimales arbitrarios (`#090d16`, `#181825`, `#313244`) o nombres de colores fijos directos en componentes (`bg-blue-500`, `text-zinc-400`).
   - Todo color debe expresarse mediante los tokens semánticos: `bg-background`, `bg-card`, `bg-popover`, `text-foreground`, `text-muted-foreground`, `border-border`, etc.
2. **Layout & Spacing**:
   - Prohibido el uso de `space-x-*` o `space-y-*`. Toda separación en listas o layouts flexibles se realiza con `flex` + `gap-*` (o `grid` + `gap-*`).
   - Dimensiones cuadradas/simétricas deben usar `size-*` (ejemplo: `size-8` en lugar de `w-8 h-8`).
3. **Tipografía Jerárquica**:
   - Interfaz general: Sans-serif moderna (`Inter`).
   - Entidades técnicas, atributos, tipos y cardinalidades: Monospace (`ui-monospace`, `font-mono`).
4. **Estados & Accesibilidad**:
   - Estados de foco mediante `focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none`.
   - Elementos interactivos con feedback táctil inmediato (`transition-colors duration-150`, `active:scale-[0.98]`).

---

## 3. Diccionario de Tokens Semánticos (`tailwind.css`)

| Token | Propósito | Clase Tailwind v4 |
| :--- | :--- | :--- |
| `--background` | Fondo principal de la aplicación y páginas | `bg-background` |
| `--foreground` | Color de texto principal de alto contraste | `text-foreground` |
| `--card` | Superficies elevadas: paneles, sidebars, modales, cards | `bg-card` |
| `--card-foreground` | Texto legible sobre superficies elevadas | `text-card-foreground` |
| `--popover` | Menús contextuales, popovers, dropdowns | `bg-popover` |
| `--popover-foreground` | Texto dentro de popovers y menús | `text-popover-foreground` |
| `--primary` | Color de acción principal, selección activa, CTA | `bg-primary`, `text-primary` |
| `--primary-foreground` | Texto/icono contrastado sobre fondo primario | `text-primary-foreground` |
| `--secondary` | Acciones secundarias, badges neutros | `bg-secondary` |
| `--secondary-foreground` | Texto sobre elementos secundarios | `text-secondary-foreground` |
| `--muted` | Fondos atenuados (toolbars, chips inactivos, divisores) | `bg-muted` |
| `--muted-foreground` | Texto secundario, subtítulos, atajos de teclado | `text-muted-foreground` |
| `--accent` | Hover en filas de tablas, items de menús | `bg-accent`, `text-accent-foreground` |
| `--destructive` | Acciones peligrosas (eliminar, resetear) | `bg-destructive`, `text-destructive-foreground` |
| `--border` | Bordes estructurales sutiles entre paneles | `border-border` |
| `--input` | Bordes de inputs, selects, textareas | `border-input` |
| `--ring` | Anillo de foco accesible | `ring-ring` |

### Tokens Específicos del Lienzo de Modelado (*Canvas*)

| Token | Propósito | Clase Tailwind v4 |
| :--- | :--- | :--- |
| `--canvas-bg` | Color de fondo infinito del lienzo | `bg-canvas-bg` |
| `--canvas-grid` | Patrón de rejilla (puntos/líneas) | `text-canvas-grid`, CSS var |
| `--node-bg` | Fondo del nodo UML / tabla | `bg-node-bg` |
| `--node-border` | Borde estructural del nodo UML | `border-node-border` |
| `--node-selected` | Resalte y borde de nodo seleccionado | `border-node-selected`, `ring-node-selected` |

---

## 4. Radios y Elevaciones

- `rounded-sm`: 6px (`calc(var(--radius) - 4px)`) - inputs compactos, badges.
- `rounded-md`: 8px (`calc(var(--radius) - 2px)`) - botones estándar, dropdown items.
- `rounded-lg`: 10px (`var(--radius)`) - modales internos, nodos UML.
- `rounded-xl`: 14px (`calc(var(--radius) + 4px)`) - paneles flotantes, drawers, diálogos principales.
