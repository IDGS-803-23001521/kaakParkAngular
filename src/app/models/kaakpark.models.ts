export type Genero = 'M' | 'F' | 'O' | 'N';

export interface Usuario {
  id?: string;
  nombre: string;
  usuario: string;
  email?: string;
  contrasena?: string;
  puesto: string;
  genero: Genero;
  fechaIngreso: string;
  activo: boolean;
  eliminado?: boolean;
  foto?: string;
}

export interface Cliente {
  id?: string;
  authUid: string;
  email: string;
  estado: 'ACTIVO' | 'INACTIVO';
  fechaRegistro: number;
  nombre: string;
  rol: 'CLIENTE';
  telefono: string;
  genero: Genero;
  eliminado?: boolean;
}

export interface Cajon {
  id?: string;
  nivel: number;
  numeroCajon: number;
  estado: 'Libre' | 'Ocupado' | 'Mantenimiento';
  placa?: string;
  horaEntrada?: string;
  secuenciaIngresoId?: string;
  secuenciaSalidaId?: string;
}

export interface ActividadReciente {
  id?: string;
  tipo: 'entrada' | 'salida' | 'pago';
  descripcion: string;
  hora: string;
  fecha: string;
  timestamp: number;
  placa?: string;
  /** Solo presente en eventos de tipo 'salida': duración real de la estancia que terminó. */
  duracionMin?: number;
}

export interface SustentabilidadData {
  energiaGeneradaKwh: number;
  aguaCaptadaLitros: number;
  aguaUsadaRiego: number;
  porcentajeSolar: number;
  nivelTanque: number;
  capacidadCisternaLitros?: number;
  bombaAgua: boolean;
  alertas: string[];
}

export interface Pago {
  id?: string;
  folio: string;
  cajonId: string;
  cajonDescripcion: string;
  placa: string;
  horaEntrada: string;
  horaSalida: string;
  duracionMin: number;
  monto: number;
  metodo: 'Efectivo' | 'Transferencia' | 'Tarjeta';
  estado: 'Completado' | 'Pendiente' | 'PendienteCaja';
  fecha: string;
  timestamp: number;
  estanciaId?: string;
  pagadoPorApp?: boolean;
}

export interface ReporteHistorial {
  id?: string;
  nombre: string;
  fecha: string;
  tipo: string;
  periodo?: string;
  resumen?: { label: string; valor: string }[];
}

export interface ConfigTarifa {
  tarifaPorHora: number;
  actualizadoEn: number;
  actualizadoPor?: string;
}

export interface HistorialTarifa {
  id?: string;
  tarifaAnterior: number;
  tarifaNueva: number;
  fecha: string;
  timestamp: number;
  actualizadoPor?: string;
}

export interface HorarioDia {
  nombre: string;
  apertura: string;
  cierre: string;
  abierto: boolean;
}

export interface HorarioSemanal {
  dias: HorarioDia[];
}

export interface DiaEspecial {
  id?: string;
  etiqueta: string;
  fecha: string;
  apertura: string;
  cierre: string;
}
