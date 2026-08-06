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

/**
 * Parsea cualquier formato de hora ('15:51', '15:51:00', '03:51 PM', '3:51 p.m.', ISO) a horas y minutos.
 */
export function parseHoraToMinutesFromMidnight(horaStr: string): { h: number; m: number } | null {
  if (!horaStr || typeof horaStr !== 'string') return null;

  // Formato ISO: '2026-08-05T15:51:00'
  if (horaStr.includes('T')) {
    const d = new Date(horaStr);
    if (!isNaN(d.getTime())) {
      return { h: d.getHours(), m: d.getMinutes() };
    }
  }

  const clean = horaStr.trim().toLowerCase().replace(/\./g, '');
  const isPM = clean.includes('pm') || clean.includes('p m');
  const isAM = clean.includes('am') || clean.includes('a m');

  const match = clean.match(/(\d{1,2}):(\d{1,2})/);
  if (!match) return null;

  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);

  if (isNaN(h) || isNaN(m)) return null;

  if (isPM && h < 12) h += 12;
  if (isAM && h === 12) h = 0;

  return { h, m };
}

/**
 * Calcula los minutos estacionados entre horaEntrada y el momento actual.
 */
export function calcularMinutosEstacionado(horaEntradaStr?: string, ahora: Date = new Date()): number {
  if (!horaEntradaStr || horaEntradaStr === '—') return 0;

  const str = String(horaEntradaStr).trim();

  // 1. Timestamp numérico (ej. 1754400000000)
  if (!isNaN(Number(str)) && Number(str) > 1000000000) {
    const ts = Number(str);
    return Math.max(0, Math.round((ahora.getTime() - ts) / 60000));
  }

  // 2. Fecha y hora completa (ISO o 'YYYY-MM-DD HH:mm') -> Soporta estancias de varios días
  if (str.includes('-') || str.includes('/') || str.includes('T')) {
    const isoClean = str.replace(' ', 'T');
    const d = new Date(isoClean);
    if (!isNaN(d.getTime()) && d.getFullYear() > 2000) {
      const diffMs = ahora.getTime() - d.getTime();
      return Math.max(0, Math.round(diffMs / 60000));
    }
  }

  // 3. Solo hora ('15:51', '03:51 PM')
  const parsed = parseHoraToMinutesFromMidnight(str);
  if (!parsed) return 0;

  const entrada = new Date(ahora);
  entrada.setHours(parsed.h, parsed.m, 0, 0);

  let diffMs = ahora.getTime() - entrada.getTime();

  // Si diffMs < -300000 (-5 min), significa que la entrada ocurrió el día anterior (ej. entró 23:55 y ahora son 00:05)
  if (diffMs < -300000) {
    entrada.setDate(entrada.getDate() - 1);
    diffMs = ahora.getTime() - entrada.getTime();
  }

  // Si por desfase de segundos de reloj diffMs es levemente negativo, fijar a 0
  if (diffMs < 0) diffMs = 0;

  return Math.max(0, Math.round(diffMs / 60000));
}

/**
 * Calcula la duración en minutos entre horaEntrada y horaSalida.
 * Soporta estancias que cruzan la medianoche.
 */
export function calcularDuracionMinutos(horaEntrada?: string, horaSalida?: string, timestamp?: number): number {
  if (!horaEntrada || !horaSalida || horaEntrada === '—' || horaSalida === '—') return 0;

  const parsedEnt = parseHoraToMinutesFromMidnight(horaEntrada);
  const parsedSal = parseHoraToMinutesFromMidnight(horaSalida);

  if (!parsedEnt || !parsedSal) return 0;

  const refSalida = timestamp ? new Date(timestamp) : new Date();
  refSalida.setHours(parsedSal.h, parsedSal.m, 0, 0);

  const refEntrada = new Date(refSalida);
  refEntrada.setHours(parsedEnt.h, parsedEnt.m, 0, 0);

  if (refEntrada > refSalida) {
    refEntrada.setDate(refEntrada.getDate() - 1);
  }

  const diffMs = refSalida.getTime() - refEntrada.getTime();
  return Math.max(0, Math.round(diffMs / 60000));
}

/**
 * Obtiene la duración real de un pago. Si la duración calculada entre horaEntrada y horaSalida
 * es mayor a 0, la utiliza; de lo contrario, recurre a pago.duracionMin.
 */
export function obtenerDuracionPago(pago: Pago | null | undefined): number {
  if (!pago) return 0;
  const durCalculada = calcularDuracionMinutos(pago.horaEntrada, pago.horaSalida, pago.timestamp);
  if (durCalculada > 0) return durCalculada;
  return pago.duracionMin || 0;
}

/**
 * Calcula el monto a cobrar en base a la duración en minutos y la tarifa por hora (hora o fracción).
 * Cualquier estancia (incluso de 0 minutos recién ingresada) cobra al menos 1 hora de tarifa.
 */
export function calcularMontoCobro(duracionMin: number, tarifaPorHora: number): number {
  const mins = Math.max(0, duracionMin || 0);
  const horas = Math.max(1, Math.ceil(mins / 60));
  return horas * (tarifaPorHora || 60);
}

export interface ReporteHistorial {
  id?: string;
  nombre: string;
  fecha: string;
  tipo: string;
  periodo?: string;
  resumen?: { label: string; valor: string; seccion?: string }[];
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
