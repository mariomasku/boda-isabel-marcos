// Fuente de verdad única de las categorías del gestor de boda (/planner/<id>).
// Añadir una categoría nueva = añadir una entrada a CATEGORIES, nada de código nuevo.

export type FieldType = 'text' | 'tel' | 'email' | 'url' | 'number' | 'textarea' | 'select';

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldConfig {
  key: string;          // nombre interno (snake_case) = cabecera del Sheet en mayúsculas
  type: FieldType;
  label: string;
  options?: FieldOption[]; // solo para type: 'select'
  required?: boolean;
  isCost?: boolean;      // true = campo monetario, se suma en /presupuesto
}

export interface CategoryConfig {
  id: string;                              // slug de ruta (/planner/<id>)
  sheetTab: string;                        // nombre de la pestaña en Sheets (MAYÚSCULAS)
  group: 'organizacion' | 'proveedores';
  label: string;
  fields: FieldConfig[];
}

// ── Campos reutilizados entre categorías ─────────────────────
const nombre = (required = true): FieldConfig => ({ key: 'nombre', type: 'text', label: 'Nombre', required });
const contacto = (): FieldConfig => ({ key: 'contacto', type: 'text', label: 'Persona de contacto' });
const telefono = (): FieldConfig => ({ key: 'telefono', type: 'tel', label: 'Teléfono' });
const email = (): FieldConfig => ({ key: 'email', type: 'email', label: 'Email' });
const web = (): FieldConfig => ({ key: 'web', type: 'url', label: 'Web' });
const observaciones = (): FieldConfig => ({ key: 'observaciones', type: 'textarea', label: 'Observaciones' });
const costeTotal = (): FieldConfig => ({ key: 'coste_total', type: 'number', label: 'Coste total (€)', isCost: true });

export const CATEGORIES: CategoryConfig[] = [
  // ── Organización ──
  {
    id: 'tareas',
    sheetTab: 'TAREAS',
    group: 'organizacion',
    label: 'Tareas',
    fields: [
      { key: 'tarea', type: 'text', label: 'Tarea', required: true },
      { key: 'fecha_limite', type: 'text', label: 'Fecha límite' },
      {
        key: 'progreso', type: 'select', label: 'Progreso',
        options: [
          { value: 'Pendiente', label: 'Pendiente' },
          { value: 'En proceso', label: 'En proceso' },
          { value: 'Completado', label: 'Completado' },
        ],
      },
      observaciones(),
    ],
  },
  {
    id: 'coordinacion',
    sheetTab: 'COORDINACION',
    group: 'organizacion',
    label: 'Coordinación del día',
    fields: [
      nombre(),
      { key: 'rol', type: 'text', label: 'Rol' },
      telefono(),
      email(),
      web(),
      { key: 'tarifa', type: 'number', label: 'Tarifa (€)', isCost: true },
      observaciones(),
    ],
  },
  {
    id: 'planificacion',
    sheetTab: 'PLANIFICACION',
    group: 'organizacion',
    label: 'Planificación del día',
    fields: [
      { key: 'hora', type: 'text', label: 'Hora', required: true },
      { key: 'etapa', type: 'text', label: 'Etapa', required: true },
      observaciones(),
    ],
  },
  {
    id: 'musica',
    sheetTab: 'MUSICA',
    group: 'organizacion',
    label: 'Música',
    fields: [
      {
        key: 'momento', type: 'select', label: 'Momento',
        options: [
          { value: 'Ceremonia', label: 'Ceremonia' },
          { value: 'Cóctel', label: 'Cóctel' },
          { value: 'Banquete', label: 'Banquete' },
          { value: 'Fiesta', label: 'Fiesta' },
        ],
      },
      { key: 'cancion', type: 'text', label: 'Canción', required: true },
      { key: 'artista', type: 'text', label: 'Artista' },
      observaciones(),
    ],
  },

  // ── Proveedores ──
  {
    id: 'lugar',
    sheetTab: 'LUGAR',
    group: 'proveedores',
    label: 'Lugar',
    fields: [
      nombre(),
      contacto(),
      telefono(),
      email(),
      web(),
      { key: 'direccion', type: 'text', label: 'Dirección' },
      { key: 'capacidad', type: 'number', label: 'Capacidad' },
      { key: 'precio_salon', type: 'number', label: 'Precio del salón (€)', isCost: true },
      { key: 'coste_persona', type: 'number', label: 'Coste por persona (€)', isCost: true },
      observaciones(),
    ],
  },
  {
    id: 'hotel',
    sheetTab: 'HOTEL',
    group: 'proveedores',
    label: 'Hotel',
    fields: [
      nombre(),
      contacto(),
      telefono(),
      web(),
      { key: 'precio_habitacion', type: 'number', label: 'Precio habitación (€)', isCost: true },
      { key: 'precio_suite', type: 'number', label: 'Precio suite (€)', isCost: true },
      { key: 'habitaciones_min', type: 'number', label: 'Mínimo de habitaciones' },
      observaciones(),
    ],
  },
  {
    id: 'vestuario',
    sheetTab: 'VESTUARIO',
    group: 'proveedores',
    label: 'Vestuario',
    fields: [
      {
        key: 'categoria', type: 'select', label: 'Categoría', required: true,
        options: [
          { value: 'Novia', label: 'Novia' },
          { value: 'Novio', label: 'Novio' },
          { value: 'Damas de honor', label: 'Damas de honor' },
          { value: 'Padrinos', label: 'Padrinos' },
          { value: 'Otros', label: 'Otros' },
        ],
      },
      { key: 'nombre', type: 'text', label: 'Nombre' },
      telefono(),
      email(),
      web(),
      {
        key: 'arreglos', type: 'select', label: 'Arreglos',
        options: [
          { value: 'Sí', label: 'Sí' },
          { value: 'No', label: 'No' },
          { value: 'Pendiente', label: 'Pendiente' },
        ],
      },
      costeTotal(),
      observaciones(),
    ],
  },
  {
    id: 'peluqueria',
    sheetTab: 'PELUQUERIA',
    group: 'proveedores',
    label: 'Peluquería y maquillaje',
    fields: [
      nombre(),
      telefono(),
      email(),
      web(),
      {
        key: 'servicio', type: 'select', label: 'Servicio',
        options: [
          { value: 'Prueba', label: 'Prueba' },
          { value: 'Día de la boda', label: 'Día de la boda' },
          { value: 'Prueba + día de la boda', label: 'Prueba + día de la boda' },
        ],
      },
      { key: 'coste', type: 'number', label: 'Coste (€)', isCost: true },
      observaciones(),
    ],
  },
  {
    id: 'flores',
    sheetTab: 'FLORES',
    group: 'proveedores',
    label: 'Flores y decoración',
    fields: [
      nombre(),
      telefono(),
      email(),
      web(),
      {
        key: 'elemento', type: 'select', label: 'Elemento',
        options: [
          { value: 'Ramo de novia', label: 'Ramo de novia' },
          { value: 'Centros de mesa', label: 'Centros de mesa' },
          { value: 'Decoración ceremonia', label: 'Decoración ceremonia' },
          { value: 'Boutonnieres', label: 'Boutonnieres' },
          { value: 'Otros', label: 'Otros' },
        ],
      },
      costeTotal(),
      observaciones(),
    ],
  },
  {
    id: 'tarta',
    sheetTab: 'TARTA',
    group: 'proveedores',
    label: 'Tarta',
    fields: [
      nombre(),
      telefono(),
      email(),
      web(),
      { key: 'precio_racion', type: 'number', label: 'Precio por ración (€)', isCost: true },
      { key: 'coste_transporte', type: 'number', label: 'Coste de transporte (€)', isCost: true },
      observaciones(),
    ],
  },
  {
    id: 'catering',
    sheetTab: 'CATERING',
    group: 'proveedores',
    label: 'Catering',
    fields: [
      nombre(),
      contacto(),
      telefono(),
      email(),
      web(),
      { key: 'coste_persona', type: 'number', label: 'Coste por persona (€)', isCost: true },
      observaciones(),
    ],
  },
  {
    id: 'fotografo',
    sheetTab: 'FOTOGRAFO',
    group: 'proveedores',
    label: 'Fotógrafo',
    fields: [
      nombre(),
      telefono(),
      email(),
      web(),
      costeTotal(),
      observaciones(),
    ],
  },
  {
    id: 'videografo',
    sheetTab: 'VIDEOGRAFO',
    group: 'proveedores',
    label: 'Videógrafo',
    fields: [
      nombre(),
      telefono(),
      email(),
      web(),
      { key: 'tarifa', type: 'number', label: 'Tarifa (€)', isCost: true },
      observaciones(),
    ],
  },
  {
    id: 'entretenimiento',
    sheetTab: 'ENTRETENIMIENTO',
    group: 'proveedores',
    label: 'Entretenimiento',
    fields: [
      nombre(),
      telefono(),
      email(),
      web(),
      { key: 'coste_estimado', type: 'number', label: 'Coste estimado (€)', isCost: true },
      { key: 'horas', type: 'number', label: 'Horas contratadas' },
      observaciones(),
    ],
  },
  {
    id: 'regalos',
    sheetTab: 'REGALOS',
    group: 'proveedores',
    label: 'Regalos',
    fields: [
      nombre(),
      telefono(),
      email(),
      web(),
      { key: 'descripcion', type: 'textarea', label: 'Descripción' },
      { key: 'cantidad', type: 'number', label: 'Cantidad' },
      { key: 'precio', type: 'number', label: 'Precio (€)', isCost: true },
      observaciones(),
    ],
  },
];

export function getCategory(id: string): CategoryConfig | undefined {
  return CATEGORIES.find(c => c.id === id);
}

// Categorías que tienen al menos un campo monetario (para /presupuesto).
export const CATEGORIES_WITH_COST = CATEGORIES.filter(c => c.fields.some(f => f.isCost));
