export interface Usuario {
  id?: string;
  nombre: string;
  usuario: string;
  email?: string;
  contrasena?: string;
  puesto: string;
  genero: 'M' | 'F';
  fechaIngreso: string;
  activo: boolean;
  eliminado?: boolean;
  foto?: string;
}

export interface Cajon {
  id?: string;
  nivel: number;
  numeroCajon: number;
  estado: 'Libre' | 'Ocupado' | 'Mantenimiento';
  placa?: string;
  horaEntrada?: string;
}

export interface ActividadReciente {
  id?: string;
  tipo: 'entrada' | 'salida' | 'pago';
  descripcion: string;
  hora: string;
  placa?: string;
}

export interface SustentabilidadData {
  energiaGeneradaKwh: number;
  aguaCaptadaLitros: number;
  aguaUsadaRiego: number;
  porcentajeSolar: number;
  nivelTanque: number;
  bombaAgua: boolean;
  alertas: string[];
}

export interface ReporteHistorial {
  id?: string;
  nombre: string;
  fecha: string;
  tipo: string;
}
