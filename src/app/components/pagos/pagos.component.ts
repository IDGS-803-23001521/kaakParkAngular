import { Component, OnInit, OnDestroy } from '@angular/core';
import { FirebaseService } from '../../services/firebase.service';
import { ActividadReciente, Cajon, HistorialTarifa, Pago } from '../../models/kaakpark.models';
import { Subscription } from 'rxjs';

@Component({
  standalone: false,
  selector: 'app-pagos',
  templateUrl: './pagos.component.html'
})
export class PagosComponent implements OnInit, OnDestroy {

  // ── Data ─────────────────────────────────────────────────────────────────
  cajones: Cajon[]              = [];
  pagos:   Pago[]               = [];
  historialTarifas: HistorialTarifa[] = [];
  tiempoAhora = new Date();

  // ── Tarifa dinámica ───────────────────────────────────────────────────────
  tarifaPorHora    = 60;
  editandoTarifa   = false;
  nuevaTarifa      = 60;
  guardandoTarifa  = false;
  mostrarHistorialTarifa = false;

  // ── Filtros de historial ──────────────────────────────────────────────────
  rangoSeleccionado   = 'Últimos 7 días';
  metodoSeleccionado  = 'Todos';
  estadoSeleccionado  = 'Todos';

  // ── Formulario de pago nuevo ──────────────────────────────────────────────
  cajonSeleccionadoId = '';
  metodoPago: 'Efectivo' | 'Transferencia' | 'Tarjeta' = 'Efectivo';
  procesando = false;

  // ── Ticket ───────────────────────────────────────────────────────────────
  mostrarTicket = false;
  ticketPago: Pago | null = null;

  // ── Datos bancarios (reemplaza con los reales) ────────────────────────────
  readonly DATOS_TRANSFERENCIA = {
    banco:   'BBVA',
    titular: "K'áaxPark S.A. de C.V.",
    clabe:   '012345678901234567',
  };

  private subs: Subscription[] = [];
  private tickInterval: any;

  // ── Getters: cajón seleccionado ──────────────────────────────────────────
  get cajonSeleccionado(): Cajon | undefined {
    return this.cajones.find(c => c.id === this.cajonSeleccionadoId);
  }

  get cajonesOcupados(): Cajon[] {
    return this.cajones.filter(c => c.estado === 'Ocupado');
  }

  get cajonesLibresCount(): number {
    return this.cajones.filter(c => c.estado === 'Libre').length;
  }

  get hayIngresosMensuales(): boolean {
    return this.tendenciaMensual.some(t => t.monto > 0);
  }

  get tiempoEstacionadoMin(): number {
    const cj = this.cajonSeleccionado;
    if (!cj?.horaEntrada) return 0;
    const [h, m] = cj.horaEntrada.split(':').map(Number);
    const entrada = new Date(this.tiempoAhora);
    entrada.setHours(h, m, 0, 0);
    return Math.max(0, Math.round((this.tiempoAhora.getTime() - entrada.getTime()) / 60000));
  }

  get tiempoTexto(): string {
    return this.formatTiempo(this.tiempoEstacionadoMin);
  }

  get montoCalculado(): number {
    const mins = this.tiempoEstacionadoMin;
    return Math.ceil(Math.max(1, Math.ceil(mins / 60))) * this.tarifaPorHora;
  }

  // ── Getters: estadísticas ────────────────────────────────────────────────
  get totalHoy(): number {
    const hoy = new Date().toISOString().slice(0, 10);
    return this.pagos
      .filter(p => p.fecha === hoy && p.estado === 'Completado')
      .reduce((s, p) => s + p.monto, 0);
  }

  get pagosHoy(): number {
    const hoy = new Date().toISOString().slice(0, 10);
    return this.pagos.filter(p => p.fecha === hoy).length;
  }

  get promedioVisita(): number {
    const c = this.pagos.filter(p => p.estado === 'Completado');
    if (!c.length) return 0;
    return Math.round(c.reduce((s, p) => s + p.monto, 0) / c.length);
  }

  // ── Getters: historial filtrado ──────────────────────────────────────────
  get pagosFiltrados(): Pago[] {
    let lista = [...this.pagos];
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

    if (this.rangoSeleccionado === 'Últimos 7 días') {
      const lim = new Date(hoy); lim.setDate(lim.getDate() - 6);
      lista = lista.filter(p => p.timestamp >= lim.getTime());
    } else if (this.rangoSeleccionado === 'Últimos 30 días') {
      const lim = new Date(hoy); lim.setDate(lim.getDate() - 29);
      lista = lista.filter(p => p.timestamp >= lim.getTime());
    } else if (this.rangoSeleccionado === 'Este mes') {
      lista = lista.filter(p => {
        const d = new Date(p.timestamp);
        return d.getMonth() === hoy.getMonth() && d.getFullYear() === hoy.getFullYear();
      });
    } else if (this.rangoSeleccionado === 'Este año') {
      lista = lista.filter(p => new Date(p.timestamp).getFullYear() === hoy.getFullYear());
    }

    if (this.metodoSeleccionado !== 'Todos')
      lista = lista.filter(p => p.metodo === this.metodoSeleccionado);
    if (this.estadoSeleccionado !== 'Todos')
      lista = lista.filter(p => p.estado === this.estadoSeleccionado);

    return lista.sort((a, b) => b.timestamp - a.timestamp);
  }

  // ── Getters: gráfica tendencia mensual ──────────────────────────────────
  get tendenciaMensual(): { mes: string; monto: number }[] {
    const meses = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
    const anio  = this.tiempoAhora.getFullYear();
    return meses.map((mes, idx) => ({
      mes,
      monto: this.pagos
        .filter(p => {
          const d = new Date(p.timestamp);
          return d.getFullYear() === anio && d.getMonth() === idx && p.estado === 'Completado';
        })
        .reduce((s, p) => s + p.monto, 0)
    }));
  }

  alturaBarra(monto: number): number {
    const max = Math.max(...this.tendenciaMensual.map(t => t.monto), 1);
    return (monto / max) * 100;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────
  constructor(private fb: FirebaseService) {}

  ngOnInit(): void {
    this.subs.push(
      this.fb.getCajones().subscribe(cj => { this.cajones = cj.filter(c => c.nivel !== 4); }),
      this.fb.getPagos().subscribe(p => { this.pagos = p; }),
      this.fb.getTarifa().subscribe({
        next: cfg => {
          if (cfg?.tarifaPorHora) {
            this.tarifaPorHora = cfg.tarifaPorHora;
            this.nuevaTarifa   = cfg.tarifaPorHora;
          }
        },
        error: () => { /* documento aún no existe, usa default 60 */ }
      }),
      this.fb.getHistorialTarifas().subscribe(h => { this.historialTarifas = h; })
    );
    this.tickInterval = setInterval(() => { this.tiempoAhora = new Date(); }, 60000);
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    if (this.tickInterval) clearInterval(this.tickInterval);
  }

  // ── Tarifa: edición ──────────────────────────────────────────────────────
  abrirEdicionTarifa(): void {
    this.nuevaTarifa    = this.tarifaPorHora;
    this.editandoTarifa = true;
  }

  cancelarEdicionTarifa(): void {
    this.editandoTarifa = false;
  }

  async guardarTarifa(): Promise<void> {
    if (this.nuevaTarifa <= 0 || this.guardandoTarifa) return;
    if (this.nuevaTarifa === this.tarifaPorHora) { this.editandoTarifa = false; return; }
    this.guardandoTarifa = true;
    try {
      await this.fb.updateTarifa(this.nuevaTarifa, this.tarifaPorHora);
      this.editandoTarifa = false;
    } catch (e) {
      console.error('Error al guardar tarifa:', e);
    } finally {
      this.guardandoTarifa = false;
    }
  }

  formatFecha(ts: number): string {
    return new Date(ts).toLocaleString('es-MX', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false
    });
  }

  // ── Helpers de visualización ──────────────────────────────────────────────
  displayCajon(cj: Cajon): string {
    const tiempo = this.tiempoTextoCajon(cj);
    const monto  = this.montoCajon(cj);
    const placa  = cj.placa ? ` · ${cj.placa}` : '';
    return `Nivel ${cj.nivel} · Cajón ${cj.numeroCajon}${placa} — ${tiempo} — $${monto}`;
  }

  tiempoTextoCajon(cj: Cajon): string {
    if (!cj.horaEntrada) return '—';
    const [h, m] = cj.horaEntrada.split(':').map(Number);
    const entrada = new Date(this.tiempoAhora);
    entrada.setHours(h, m, 0, 0);
    const mins = Math.max(0, Math.round((this.tiempoAhora.getTime() - entrada.getTime()) / 60000));
    return this.formatTiempo(mins);
  }

  montoCajon(cj: Cajon): number {
    if (!cj.horaEntrada) return this.tarifaPorHora;
    const [h, m] = cj.horaEntrada.split(':').map(Number);
    const entrada = new Date(this.tiempoAhora);
    entrada.setHours(h, m, 0, 0);
    const mins = Math.max(0, Math.round((this.tiempoAhora.getTime() - entrada.getTime()) / 60000));
    return Math.ceil(Math.max(1, Math.ceil(mins / 60))) * this.tarifaPorHora;
  }

  private formatTiempo(min: number): string {
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  // ── Acciones ─────────────────────────────────────────────────────────────
  async registrarPago(): Promise<void> {
    const cj = this.cajonSeleccionado;
    if (!cj?.id || this.procesando) return;
    this.procesando = true;
    try {
      const ahora      = new Date();
      const horaSalida = ahora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
      const fecha      = ahora.toISOString().slice(0, 10);
      const folio      = `KP-${fecha.replace(/-/g, '')}-${Math.random().toString(36).slice(-4).toUpperCase()}`;

      const pago: Pago = {
        folio,
        cajonId:          cj.id,
        cajonDescripcion: `Nivel ${cj.nivel} · Cajón ${cj.numeroCajon}`,
        placa:            cj.placa || '—',
        horaEntrada:      cj.horaEntrada || '—',
        horaSalida,
        duracionMin:      this.tiempoEstacionadoMin,
        monto:            this.montoCalculado,
        metodo:           this.metodoPago,
        estado:           'Completado',
        fecha,
        timestamp:        ahora.getTime()
      };

      await this.fb.addPago(pago);
      await this.fb.updateCajon(cj.id, { estado: 'Libre', horaEntrada: '', placa: '' });

      const actividad: ActividadReciente = {
        tipo:        'salida',
        descripcion: `${pago.cajonDescripcion} · Folio ${folio}`,
        hora:        horaSalida,
        fecha,
        timestamp:   ahora.getTime(),
        placa:       cj.placa || '',
        duracionMin: this.tiempoEstacionadoMin
      };
      await this.fb.addActividad(actividad);

      this.ticketPago          = pago;
      this.mostrarTicket       = true;
      this.cajonSeleccionadoId = '';
      this.metodoPago          = 'Efectivo';
    } catch (e) {
      console.error('Error al registrar pago:', e);
    } finally {
      this.procesando = false;
    }
  }

  imprimirTicket(): void { window.print(); }

  cerrarTicket(): void {
    this.mostrarTicket = false;
    this.ticketPago    = null;
  }
}
