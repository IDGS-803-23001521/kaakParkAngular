import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { FirebaseService } from '../../services/firebase.service';
import { ActividadReciente, Cajon, Pago, ReporteHistorial, SustentabilidadData } from '../../models/kaakpark.models';
import { Subscription } from 'rxjs';
import { Secuencia } from '../../services/mqtt-robot.service';

declare const Chart: any;

const MODULO_LABEL: Record<string, string> = {
  'general':          'General',
  'pagos':            'Pagos',
  'cajones':          'Cajones',
  'sustentabilidad':  'Sustentabilidad',
  'control-motores':  'Control de Motores'
};

type ChartTipo = 'entradas-salidas' | 'ingresos' | 'metodos-pago' | 'ocupacion-nivel';

const CHART_TIPO_LABEL: Record<ChartTipo, string> = {
  'entradas-salidas': 'Entradas / Salidas',
  'ingresos':         'Ingresos',
  'metodos-pago':     'Métodos de pago',
  'ocupacion-nivel':  'Ocupación por nivel'
};

@Component({
  standalone: false,
  selector: 'app-reportes',
  templateUrl: './reportes.component.html'
})
export class ReportesComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('mainChartCanvas') mainChartCanvas!: ElementRef;
  @ViewChild('donutCanvas')     donutCanvas!: ElementRef;
  @ViewChild('barNivelCanvas')  barNivelCanvas!: ElementRef;

  // ── Datos reales ─────────────────────────────────────────────────────────
  cajones: Cajon[]                     = [];
  pagos: Pago[]                        = [];
  actividad: ActividadReciente[]       = [];
  sustentabilidad: SustentabilidadData | null = null;
  secuencias: Secuencia[]              = [];
  historial: ReporteHistorial[]        = [];

  // ── Rango de fechas — aplica a KPIs, gráficas y generador ────────────────
  fechaInicio = this.hace(6);
  fechaFin    = this.hoy();

  // ── Gráfica intercambiable ────────────────────────────────────────────────
  chartTipo: ChartTipo = 'entradas-salidas';

  // ── Generador de reportes ───────────────────────────────────────────────
  modulo  = 'general';
  generando = false;

  // ── Modal de reporte (preview / impresión) ──────────────────────────────
  mostrarReporte = false;
  reporteVer: ReporteHistorial | null = null;

  private subs: Subscription[] = [];
  private actividadSub?: Subscription;
  private chartsReady = false;
  private chartMain: any = null;
  private chartDonut: any = null;
  private chartBar: any = null;

  constructor(private fb: FirebaseService) {}

  private hoy(): string { return new Date().toISOString().slice(0, 10); }
  private hace(dias: number): string { return new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10); }

  // ── Rango en timestamps (inicio del día / fin del día) ───────────────────
  private get desdeTs(): number { return new Date(this.fechaInicio + 'T00:00:00').getTime(); }
  private get hastaTs(): number { return new Date(this.fechaFin + 'T23:59:59').getTime(); }

  get periodoLabel(): string {
    return `${this.formatDMY(this.fechaInicio)} – ${this.formatDMY(this.fechaFin)}`;
  }

  get moduloLabel(): string { return MODULO_LABEL[this.modulo] ?? this.modulo; }
  get chartTipoLabel(): string { return CHART_TIPO_LABEL[this.chartTipo]; }

  private formatDMY(iso: string): string {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  // ── Datos filtrados por el rango elegido ─────────────────────────────────
  get pagosPeriodo(): Pago[] {
    const desde = this.desdeTs, hasta = this.hastaTs;
    return this.pagos.filter(p => p.timestamp >= desde && p.timestamp <= hasta);
  }

  get actividadPeriodo(): ActividadReciente[] {
    return this.actividad; // ya viene acotada por la consulta a Firestore
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

  // ── Buckets de tiempo: por día si el rango es corto, por mes si es largo ──
  private get granularidad(): 'day' | 'month' {
    const dias = (this.hastaTs - this.desdeTs) / 86400000;
    return dias <= 31 ? 'day' : 'month';
  }

  private claveBucket(ts: number): string {
    const d = new Date(ts);
    if (this.granularidad === 'day') return d.toISOString().slice(0, 10);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  private etiquetaBucket(clave: string): string {
    if (this.granularidad === 'day') {
      const [, m, d] = clave.split('-');
      return `${d}/${m}`;
    }
    const [y, m] = clave.split('-');
    const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    return `${meses[Number(m) - 1]} ${y}`;
  }

  private get bucketsOrdenados(): string[] {
    const claves = new Set<string>();
    const paso = this.granularidad === 'day' ? 86400000 : 30 * 86400000;
    let cursor = this.desdeTs;
    while (cursor <= this.hastaTs) {
      claves.add(this.claveBucket(cursor));
      cursor += paso;
    }
    claves.add(this.claveBucket(this.hastaTs));
    return Array.from(claves).sort();
  }

  // ── Datos: Entradas / Salidas ─────────────────────────────────────────────
  get datosEntradasSalidas(): { labels: string[]; entradas: number[]; salidas: number[] } {
    const buckets = this.bucketsOrdenados;
    const entradas = buckets.map(b => this.actividadPeriodo.filter(a => a.tipo === 'entrada' && this.claveBucket(a.timestamp) === b).length);
    const salidas  = buckets.map(b => this.actividadPeriodo.filter(a => a.tipo === 'salida'  && this.claveBucket(a.timestamp) === b).length);
    return { labels: buckets.map(b => this.etiquetaBucket(b)), entradas, salidas };
  }

  // ── Datos: Ingresos ───────────────────────────────────────────────────────
  get datosIngresos(): { labels: string[]; ingresos: number[] } {
    const buckets = this.bucketsOrdenados;
    const completados = this.pagosPeriodo.filter(p => p.estado === 'Completado');
    const ingresos = buckets.map(b => completados.filter(p => this.claveBucket(p.timestamp) === b).reduce((s, p) => s + p.monto, 0));
    return { labels: buckets.map(b => this.etiquetaBucket(b)), ingresos };
  }

  // ── Datos: Métodos de pago ────────────────────────────────────────────────
  get datosMetodosPago(): { labels: string[]; data: number[] } {
    const completados = this.pagosPeriodo.filter(p => p.estado === 'Completado');
    return {
      labels: ['Efectivo', 'Transferencia', 'Tarjeta'],
      data: [
        completados.filter(p => p.metodo === 'Efectivo').length,
        completados.filter(p => p.metodo === 'Transferencia').length,
        completados.filter(p => p.metodo === 'Tarjeta').length
      ]
    };
  }

  // ── Datos para donut de "Métricas clave": distribución de duración de estancias ──
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

  // ── Ocupación actual por nivel (estado en vivo, no depende del rango) ────
  get usoPorNivel(): number[] {
    return [1, 2, 3].map(n => {
      const total = this.cajones.filter(c => c.nivel === n).length;
      if (!total) return 0;
      return Math.round(this.cajones.filter(c => c.nivel === n && c.estado === 'Ocupado').length / total * 100);
    });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.subs.push(
      this.fb.getCajones().subscribe(c => {
        this.cajones = c.filter(cj => cj.nivel !== 4);
        this.updateBarChart();
        this.updateMainChart();
      }),
      this.fb.getPagos().subscribe(p => {
        this.pagos = p;
        this.updateDonutChart();
        this.updateMainChart();
      }),
      this.fb.getSustentabilidad().subscribe({
        next: s => { this.sustentabilidad = s; },
        error: () => { this.sustentabilidad = null; }
      }),
      this.fb.getSecuencias().subscribe(s => { this.secuencias = s; }),
      this.fb.getReportesHistorial().subscribe(h => { this.historial = h; })
    );
    this.cargarActividad();
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.initCharts();
      this.chartsReady = true;
    }, 150);
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    this.actividadSub?.unsubscribe();
    [this.chartMain, this.chartDonut, this.chartBar].forEach(c => c?.destroy());
  }

  private cargarActividad(): void {
    this.actividadSub?.unsubscribe();
    this.actividadSub = this.fb.getActividadRango(this.desdeTs, this.hastaTs).subscribe(a => {
      this.actividad = a;
      this.updateMainChart();
    });
  }

  // ── Charts ────────────────────────────────────────────────────────────────
  private initCharts(): void {
    this.crearChartPrincipal();

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

  private crearChartPrincipal(): void {
    if (!this.mainChartCanvas) return;
    if (this.chartMain) { this.chartMain.destroy(); this.chartMain = null; }
    const canvas = this.mainChartCanvas.nativeElement;

    if (this.chartTipo === 'entradas-salidas') {
      const d = this.datosEntradasSalidas;
      this.chartMain = new Chart(canvas, {
        type: 'line',
        data: {
          labels: d.labels,
          datasets: [
            { label: 'Entradas', data: d.entradas, borderColor: '#C9A227', backgroundColor: 'rgba(201,162,39,0.08)', tension: 0.4, fill: true, pointRadius: 3 },
            { label: 'Salidas',  data: d.salidas,  borderColor: '#0b131a', backgroundColor: 'rgba(11,19,26,0.05)',    tension: 0.4, fill: true, pointRadius: 3 }
          ]
        },
        options: this.opcionesLineaBarra()
      });
    } else if (this.chartTipo === 'ingresos') {
      const d = this.datosIngresos;
      this.chartMain = new Chart(canvas, {
        type: 'bar',
        data: { labels: d.labels, datasets: [{ label: 'Ingresos', data: d.ingresos, backgroundColor: '#C9A227', borderRadius: 4 }] },
        options: this.opcionesLineaBarra(true)
      });
    } else if (this.chartTipo === 'metodos-pago') {
      const d = this.datosMetodosPago;
      this.chartMain = new Chart(canvas, {
        type: 'doughnut',
        data: { labels: d.labels, datasets: [{ data: d.data, backgroundColor: ['#C9A227', '#aaa', '#333'], borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '55%', plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 12 } } } }
      });
    } else {
      this.chartMain = new Chart(canvas, {
        type: 'bar',
        data: { labels: ['Nivel 1', 'Nivel 2', 'Nivel 3'], datasets: [{ label: 'Ocupación', data: this.usoPorNivel, backgroundColor: '#C9A227', borderRadius: 4 }] },
        options: this.opcionesLineaBarra(true, true)
      });
    }
  }

  private opcionesLineaBarra(esMoneda = false, esPorcentaje = false): any {
    return {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true, grid: { color: '#eee' },
          ticks: {
            font: { size: 10 },
            callback: (v: number) => esPorcentaje ? v + '%' : (esMoneda ? '$' + v : v)
          },
          ...(esPorcentaje ? { max: 100 } : {})
        },
        x: { grid: { color: '#eee' }, ticks: { font: { size: 10 } } }
      },
      plugins: { legend: { labels: { font: { size: 10 }, boxWidth: 16 } } }
    };
  }

  private updateMainChart(): void {
    if (!this.chartsReady) return;
    this.crearChartPrincipal();
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

  onChartTipoChange(): void { this.updateMainChart(); }

  onRangoChange(): void {
    this.cargarActividad();
    this.updateDonutChart();
    // updateMainChart() se dispara solo cuando llegue la nueva actividad (cargarActividad)
    // pero si la gráfica activa es de ingresos/métodos de pago (que no dependen de "actividad"),
    // hay que refrescarla también aquí:
    if (this.chartTipo !== 'entradas-salidas') this.updateMainChart();
  }

  // ── Generar reporte ───────────────────────────────────────────────────────
  async generarReporte(): Promise<void> {
    if (this.generando) return;
    this.generando = true;
    try {
      const hoy    = new Date().toISOString().slice(0, 10);
      const nombre = `Reporte ${this.moduloLabel} — ${this.periodoLabel}`;
      const resumen = this.computarResumen();

      const reporte: ReporteHistorial = {
        nombre, fecha: hoy, tipo: this.modulo,
        periodo: `${this.fechaInicio}_${this.fechaFin}`,
        resumen
      };
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
    const items: { label: string; valor: string }[] = [
      { label: 'Rango de fechas', valor: this.periodoLabel }
    ];
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