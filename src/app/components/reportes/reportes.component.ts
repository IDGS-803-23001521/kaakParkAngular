import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { FirebaseService } from '../../services/firebase.service';
import { ActividadReciente, Cajon, Pago, ReporteHistorial, SustentabilidadData } from '../../models/kaakpark.models';
import { Subscription } from 'rxjs';
import { Secuencia } from '../../services/mqtt-robot.service';

declare const Chart: any;

const PERIODO_MS: Record<string, number> = {
  '7d': 7   * 86400000,
  '1m': 30  * 86400000,
  '3m': 90  * 86400000,
  '6m': 180 * 86400000,
  '1y': 365 * 86400000
};

const PERIODO_LABEL: Record<string, string> = {
  '7d': 'Últimos 7 días',
  '1m': 'Último mes',
  '3m': 'Últimos 3 meses',
  '6m': 'Últimos 6 meses',
  '1y': 'Último año'
};

const MODULO_LABEL: Record<string, string> = {
  'general':          'General',
  'pagos':            'Pagos',
  'cajones':          'Cajones',
  'sustentabilidad':  'Sustentabilidad',
  'control-motores':  'Control de Motores'
};

@Component({
  standalone: false,
  selector: 'app-reportes',
  templateUrl: './reportes.component.html'
})
export class ReportesComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('donutCanvas')    donutCanvas!: ElementRef;
  @ViewChild('barNivelCanvas') barNivelCanvas!: ElementRef;
  @ViewChild('lineChartCanvas') lineChartCanvas!: ElementRef;

  // ── Datos reales ─────────────────────────────────────────────────────────
  cajones: Cajon[]                     = [];
  pagos: Pago[]                        = [];
  actividadAnio: ActividadReciente[]   = [];
  sustentabilidad: SustentabilidadData | null = null;
  secuencias: Secuencia[]              = [];
  historial: ReporteHistorial[]        = [];

  // ── Filtros del generador ───────────────────────────────────────────────
  periodo = '7d';
  modulo  = 'general';
  generando = false;

  // ── Modal de reporte (preview / impresión) ──────────────────────────────
  mostrarReporte = false;
  reporteVer: ReporteHistorial | null = null;

  private subs: Subscription[] = [];
  private chartsReady = false;
  private chartLine: any = null;
  private chartDonut: any = null;
  private chartBar: any = null;

  constructor(private fb: FirebaseService) {}

  // ── Helpers de período ───────────────────────────────────────────────────
  get periodoLabel(): string { return PERIODO_LABEL[this.periodo] ?? 'Período'; }
  get moduloLabel(): string { return MODULO_LABEL[this.modulo] ?? this.modulo; }

  private get desdePeriodo(): number {
    return Date.now() - (PERIODO_MS[this.periodo] ?? PERIODO_MS['7d']);
  }

  // ── Datos filtrados por período ──────────────────────────────────────────
  get pagosPeriodo(): Pago[] {
    const desde = this.desdePeriodo;
    return this.pagos.filter(p => p.timestamp >= desde);
  }

  get actividadPeriodo(): ActividadReciente[] {
    const desde = this.desdePeriodo;
    return this.actividadAnio.filter(a => a.timestamp >= desde);
  }

  // ── KPIs del período ──────────────────────────────────────────────────────
  get ingresosPeriodo(): number {
    return this.pagosPeriodo
      .filter(p => p.estado === 'Completado')
      .reduce((s, p) => s + p.monto, 0);
  }

  get transaccionesPeriodo(): number {
    return this.pagosPeriodo.filter(p => p.estado === 'Completado').length;
  }

  get ticketPromedio(): number {
    const c = this.pagosPeriodo.filter(p => p.estado === 'Completado');
    if (!c.length) return 0;
    return Math.round(c.reduce((s, p) => s + p.monto, 0) / c.length);
  }

  get entradasPeriodo(): number {
    return this.actividadPeriodo.filter(a => a.tipo === 'entrada').length;
  }

  get salidasPeriodo(): number {
    return this.actividadPeriodo.filter(a => a.tipo === 'salida').length;
  }

  get tiempoPromedioEstancia(): string {
    const duraciones = this.pagosPeriodo
      .filter(p => p.estado === 'Completado' && p.duracionMin > 0)
      .map(p => p.duracionMin);
    if (!duraciones.length) return '—';
    const avg = Math.round(duraciones.reduce((s, m) => s + m, 0) / duraciones.length);
    return avg < 60 ? `${avg} min` : `${Math.floor(avg / 60)}h ${avg % 60}m`;
  }

  get ocupacionActual(): number {
    const total = this.cajones.length;
    if (!total) return 0;
    return Math.round(this.cajones.filter(c => c.estado === 'Ocupado').length / total * 100);
  }

  // ── Datos para gráfica de líneas: entradas/salidas mensuales del año ─────
  get datosLineaMensual(): { entradas: number[]; salidas: number[] } {
    const anio = new Date().getFullYear();
    const entradas = Array(12).fill(0);
    const salidas  = Array(12).fill(0);
    for (const a of this.actividadAnio) {
      const d = new Date(a.timestamp);
      if (d.getFullYear() !== anio) continue;
      if (a.tipo === 'entrada') entradas[d.getMonth()]++;
      else if (a.tipo === 'salida') salidas[d.getMonth()]++;
    }
    return { entradas, salidas };
  }

  // ── Datos para donut: distribución de estancias del período ─────────────
  get distribucionEstancias(): number[] {
    const completados = this.pagosPeriodo.filter(p => p.estado === 'Completado');
    const total = completados.length;
    if (!total) return [0, 0, 0];
    const menosUna = completados.filter(p => p.duracionMin < 60).length;
    const unaATres = completados.filter(p => p.duracionMin >= 60 && p.duracionMin < 180).length;
    const masTres  = completados.filter(p => p.duracionMin >= 180).length;
    return [
      Math.round(menosUna / total * 100),
      Math.round(unaATres / total * 100),
      Math.round(masTres / total * 100)
    ];
  }

  get hayDatosEstancias(): boolean {
    return this.pagosPeriodo.some(p => p.estado === 'Completado');
  }

  // ── Datos para barras: ocupación actual por nivel ────────────────────────
  get usoPorNivel(): number[] {
    return [1, 2, 3].map(n => {
      const total = this.cajones.filter(c => c.nivel === n).length;
      if (!total) return 0;
      return Math.round(this.cajones.filter(c => c.nivel === n && c.estado === 'Ocupado').length / total * 100);
    });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    const anio      = new Date().getFullYear();
    const inicioAnio = new Date(anio, 0, 1).getTime();
    const finAnio    = new Date(anio, 11, 31, 23, 59, 59).getTime();

    this.subs.push(
      this.fb.getCajones().subscribe(c => {
        this.cajones = c.filter(cj => cj.nivel !== 4);
        this.updateBarChart();
      }),
      this.fb.getPagos().subscribe(p => {
        this.pagos = p;
        this.updateDonutChart();
      }),
      this.fb.getActividadRango(inicioAnio, finAnio).subscribe(a => {
        this.actividadAnio = a;
        this.updateLineChart();
      }),
      this.fb.getSustentabilidad().subscribe({
        next: s => { this.sustentabilidad = s; },
        error: () => { this.sustentabilidad = null; }
      }),
      this.fb.getSecuencias().subscribe(s => { this.secuencias = s; }),
      this.fb.getReportesHistorial().subscribe(h => { this.historial = h; })
    );
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.initCharts();
      this.chartsReady = true;
    }, 150);
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    [this.chartLine, this.chartDonut, this.chartBar].forEach(c => c?.destroy());
  }

  // ── Charts ────────────────────────────────────────────────────────────────
  private initCharts(): void {
    const linea = this.datosLineaMensual;
    this.chartLine = new Chart(this.lineChartCanvas.nativeElement, {
      type: 'line',
      data: {
        labels: ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'],
        datasets: [
          { label: 'Entradas', data: linea.entradas, borderColor: '#C9A227', backgroundColor: 'rgba(201,162,39,0.08)', tension: 0.4, fill: true, pointRadius: 4 },
          { label: 'Salidas',  data: linea.salidas,  borderColor: '#0b131a', backgroundColor: 'rgba(11,19,26,0.05)',    tension: 0.4, fill: true, pointRadius: 4 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true, grid: { color: '#eee' }, ticks: { font: { size: 10 } } },
          x: { grid: { color: '#eee' }, ticks: { font: { size: 10 } } }
        },
        plugins: { legend: { labels: { font: { size: 10 }, boxWidth: 16 } } }
      }
    });

    this.chartDonut = new Chart(this.donutCanvas.nativeElement, {
      type: 'doughnut',
      data: { datasets: [{ data: this.distribucionEstancias, backgroundColor: ['#C9A227', '#aaa', '#333'], borderWidth: 0 }] },
      options: { responsive: false, cutout: '60%', plugins: { legend: { display: false } } }
    });

    this.chartBar = new Chart(this.barNivelCanvas.nativeElement, {
      type: 'bar',
      data: { labels: ['N1', 'N2', 'N3'], datasets: [{ data: this.usoPorNivel, backgroundColor: '#C9A227', borderRadius: 4, borderWidth: 0 }] },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { min: 0, max: 100, ticks: { callback: (v: number) => v + '%', font: { size: 9 } }, grid: { color: '#eee' } },
          x: { grid: { display: false }, ticks: { font: { size: 9 } } }
        }
      }
    });
  }

  private updateLineChart(): void {
    if (!this.chartsReady || !this.chartLine) return;
    const d = this.datosLineaMensual;
    this.chartLine.data.datasets[0].data = d.entradas;
    this.chartLine.data.datasets[1].data = d.salidas;
    this.chartLine.update();
  }

  private updateDonutChart(): void {
    if (!this.chartsReady || !this.chartDonut) return;
    this.chartDonut.data.datasets[0].data = this.distribucionEstancias;
    this.chartDonut.update();
  }

  private updateBarChart(): void {
    if (!this.chartsReady || !this.chartBar) return;
    this.chartBar.data.datasets[0].data = this.usoPorNivel;
    this.chartBar.update();
  }

  onPeriodoChange(): void { this.updateDonutChart(); }

  // ── Generar reporte ───────────────────────────────────────────────────────
  async generarReporte(): Promise<void> {
    if (this.generando) return;
    this.generando = true;
    try {
      const hoy    = new Date().toISOString().slice(0, 10);
      const nombre = `Reporte ${this.moduloLabel} — ${this.periodoLabel} — ${hoy}`;
      const resumen = this.computarResumen();

      const reporte: ReporteHistorial = { nombre, fecha: hoy, tipo: this.modulo, periodo: this.periodo, resumen };
      await this.fb.addReporte(reporte);

      this.reporteVer    = reporte;
      this.mostrarReporte = true;
    } catch (e) {
      console.error('Error al generar reporte:', e);
    } finally {
      this.generando = false;
    }
  }

  private computarResumen(): { label: string; valor: string }[] {
    const items: { label: string; valor: string }[] = [];
    const m = this.modulo;

    if (m === 'general' || m === 'pagos') {
      items.push(
        { label: 'Ingresos del período',      valor: `$${this.ingresosPeriodo} MXN` },
        { label: 'Transacciones completadas', valor: `${this.transaccionesPeriodo}` },
        { label: 'Ticket promedio',           valor: this.transaccionesPeriodo > 0 ? `$${this.ticketPromedio} MXN` : '—' },
        { label: 'Pagos en efectivo',         valor: `${this.pagosPeriodo.filter(p => p.metodo === 'Efectivo').length}` },
        { label: 'Pagos por transferencia',   valor: `${this.pagosPeriodo.filter(p => p.metodo === 'Transferencia').length}` },
        { label: 'Pagos con tarjeta',         valor: `${this.pagosPeriodo.filter(p => p.metodo === 'Tarjeta').length}` }
      );
    }

    if (m === 'general' || m === 'cajones') {
      items.push(
        { label: 'Entradas registradas',  valor: `${this.entradasPeriodo}` },
        { label: 'Salidas registradas',   valor: `${this.salidasPeriodo}` },
        { label: 'Tiempo prom. de estancia', valor: this.tiempoPromedioEstancia },
        { label: 'Ocupación actual',      valor: `${this.ocupacionActual}%` },
        { label: 'Cajones activos',       valor: `${this.cajones.length}` }
      );
    }

    if (m === 'general' || m === 'sustentabilidad') {
      const s = this.sustentabilidad;
      items.push(
        { label: 'Energía solar generada', valor: s ? `${s.energiaGeneradaKwh} kWh` : '—' },
        { label: 'Agua captada',           valor: s ? `${s.aguaCaptadaLitros} L` : '—' },
        { label: 'Porcentaje solar',       valor: s ? `${s.porcentajeSolar}%` : '—' },
        { label: 'Nivel del tanque',       valor: s ? `${s.nivelTanque}%` : '—' }
      );
    }

    if (m === 'general' || m === 'control-motores') {
      items.push(
        { label: 'Secuencias configuradas', valor: `${this.secuencias.length}` }
      );
    }

    return items;
  }

  // ── Ver / imprimir reportes del historial ────────────────────────────────
  verReporte(r: ReporteHistorial): void {
    this.reporteVer    = r;
    this.mostrarReporte = true;
  }

  cerrarReporte(): void {
    this.mostrarReporte = false;
    this.reporteVer    = null;
  }

  imprimirReporte(): void { window.print(); }
}
