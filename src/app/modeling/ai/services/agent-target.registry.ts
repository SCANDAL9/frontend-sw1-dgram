/**
 * agent-target.registry.ts — Catálogo estático de elementos de la interfaz de dgram.
 * Provee respuestas inmediatas (zero-latency) para elementos conocidos de la UI
 * sin necesidad de consultar al modelo de lenguaje.
 */

export interface AgentTargetDef {
  key: string;
  title: string;
  explanation: string;
  tip?: string;
  nextStep?: {
    label: string;
    actionHint: string;
  };
  followups: string[];
}

export const AGENT_TARGET_CATALOG: Record<string, AgentTargetDef> = {
  'toolbar:create-entity': {
    key: 'toolbar:create-entity',
    title: 'Crear Clase o Entidad',
    explanation:
      'Añade una nueva clase al diagrama UML o tabla en el modelo relacional. ' +
      'Puedes asignarle nombre, estereotipo (ej. <<entity>>, <<service>>) y visibilidad.',
    tip: 'Tip: También puedes pulsar la tecla **C** directamente en el canvas o usar Ctrl+K.',
    nextStep: {
      label: 'Crear tu primera clase',
      actionHint: 'Haz clic en este botón o presiona C.',
    },
    followups: [
      '¿Qué diferencia hay entre una clase y una interfaz?',
      '¿Cómo defino una clase abstracta?',
      '¿Cómo organizo clases en paquetes?',
    ],
  },
  'toolbar:create-relation': {
    key: 'toolbar:create-relation',
    title: 'Crear Relación o Asociación',
    explanation:
      'Permite conectar dos clases definiendo su tipo semántico: Asociación (1:1, 1:N, N:M), ' +
      'Agregación (rombo vacío), Composición (rombo lleno) o Generalización/Herencia (triángulo).',
    tip: 'Tip: Arrastra directamente desde los conectores circulares en los bordes de cualquier clase.',
    nextStep: {
      label: 'Conectar dos clases',
      actionHint: 'Selecciona este modo y haz clic en origen y destino.',
    },
    followups: [
      '¿Cuándo usar agregación versus composición?',
      '¿Cómo se representa la herencia múltiple?',
      '¿Qué multiplicidad por defecto debo asignar?',
    ],
  },
  'toolbar:auto-layout': {
    key: 'toolbar:auto-layout',
    title: 'Organización Automática (Auto-Layout)',
    explanation:
      'Ejecuta un algoritmo de ordenamiento jerárquico que minimiza los cruces de líneas ' +
      'y alinea las clases por dependencias y cardinalidad.',
    tip: 'Tip: Úsalo cuando el diagrama crezca para recuperar legibilidad instantáneamente.',
    nextStep: {
      label: 'Reorganizar el lienzo',
      actionHint: 'Haz clic para ordenar todas las entidades automáticamente.',
    },
    followups: [
      '¿El auto-layout altera las posiciones guardadas?',
      '¿Se puede revertir con Ctrl+Z?',
    ],
  },
  'toolbar:open-studio': {
    key: 'toolbar:open-studio',
    title: 'Chat IA y Asistente Multimodal',
    explanation:
      'Abre el panel de IA de Vertex Gemini. Puedes pedirle que cree modelos completos por texto, ' +
      'dictarle por voz o subir una fotografía de una pizarra para convertirla en diagrama interactivo.',
    tip: 'Tip: Prueba escribiendo "Crea un modelo de e-commerce con Usuario, Pedido y Producto".',
    nextStep: {
      label: 'Abrir Chat IA',
      actionHint: 'Haz clic en el icono de estrella/chispa en la barra superior.',
    },
    followups: [
      '¿Qué comandos puede ejecutar la IA?',
      '¿Cómo funciona la lectura de diagramas dibujados a mano?',
    ],
  },
  'toolbar:export': {
    key: 'toolbar:export',
    title: 'Exportación y Generación de Código',
    explanation:
      'Exporta tu diagrama a múltiples formatos: imagen PNG/SVG de alta resolución, ' +
      'scripts DDL de PostgreSQL, código Java, Python, TypeScript o estándar XMI/UML.',
    tip: 'Tip: Las exportaciones a SQL respetan claves primarias, foráneas y tipos de datos.',
    nextStep: {
      label: 'Ver opciones de exportación',
      actionHint: 'Despliega el menú para elegir tu lenguaje o formato.',
    },
    followups: [
      '¿Cómo exporto para importar en Enterprise Architect?',
      '¿Genera migraciones SQLAlchemy o TypeORM?',
    ],
  },
  'sidebar:classes-section': {
    key: 'sidebar:classes-section',
    title: 'Explorador del Modelo',
    explanation:
      'Árbol de navegación jerárquico con todas las entidades, atributos y relaciones del proyecto. ' +
      'Permite buscar y seleccionar elementos sin tener que buscarlos visualmente en lienzos grandes.',
    tip: 'Tip: Haz clic en cualquier entidad de la lista para centrar la cámara en ella.',
    nextStep: {
      label: 'Filtrar entidades',
      actionHint: 'Escribe en el buscador del explorador para filtrar.',
    },
    followups: [
      '¿Cómo oculto temporalmente el explorador?',
      '¿Se pueden agrupar por paquetes o módulos?',
    ],
  },
  'canvas:empty': {
    key: 'canvas:empty',
    title: 'Lienzo Infinito dgram',
    explanation:
      'Área de trabajo infinita con soporte de zoom, paneo espacial, guías inteligentes y sincronización ' +
      'colaborativa en tiempo real basada en WebSockets y CRDTs.',
    tip: 'Tip: Mantén presionada la barra espaciadora o la rueda del ratón para arrastrar el lienzo.',
    nextStep: {
      label: 'Comenzar a diagramar',
      actionHint: 'Haz doble clic o presiona C para colocar tu primera clase.',
    },
    followups: [
      '¿Cuántas personas pueden colaborar a la vez?',
      '¿Cómo comparto el enlace de este tablero?',
      '¿Se guardan los cambios automáticamente?',
    ],
  },
};
