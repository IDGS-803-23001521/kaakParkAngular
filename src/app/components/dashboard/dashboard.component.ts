import { Component, OnInit, OnDestroy, AfterViewInit, ElementRef, ViewChild } from '@angular/core';
import { FirebaseService } from '../../services/firebase.service';
import { ActividadReciente, Cajon, Pago, SustentabilidadData } from '../../models/kaakpark.models';
import { Subscription } from 'rxjs';

declare const Chart: any;

interface Insight {
  tipo: 'good' | 'warning' | 'info' | 'critical';
  texto: string;
}

@Component({
  standalone: false,
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html'
})
export class DashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('donutCanvas') donutCanvas!: ElementRef;
  @ViewChild('lineCanvas')  lineCanvas!: ElementRef;
  @ViewChild('ingresosCanvas') ingresosCanvas!: ElementRef;
  @ViewChild('nivelCanvas') nivelCanvas!: ElementRef;
  @ViewChild('metodosCanvas') metodosCanvas!: ElementRef;

  cajones: Cajon[] = [];
  actividad: ActividadReciente[] = [];
  actividadHoy: ActividadReciente[] = [];
  pagos: Pago[] = [];
  sustentabilidad: SustentabilidadData | null = null;

  /** Calculados una sola vez cuando llegan datos nuevos (no en cada ciclo de detección de cambios). */
  pagosHoy: Pago[] = [];
  ingresoHoy = 0;
  ticketPromedioHoy = 0;
  insights: Insight[] = [];

  totalCajones = 0;
  cajonesOcupados = 0;
  cajonesLibres = 0;
  porcentajeOcupacion = 0;

  tiempoAhora = new Date();
  private tickInterval: any;
  private subs: Subscription[] = [];
  private donutChart: any;
  private lineChart: any;
  private ingresosChart: any;
  private nivelChart: any;
  private metodosChart: any;
  private donutCenterLabel = { text: '0%' };

  private readonly METODOS: Array<Pago['metodo']> = ['Efectivo', 'Transferencia', 'Tarjeta'];

  get entradasHoy(): number { return this.actividadHoy.filter(a => a.tipo === 'entrada').length; }
  get salidasHoy():  number { return this.actividadHoy.filter(a => a.tipo === 'salida').length; }

  /** Promedio real de estancias YA COMPLETADAS hoy (no de los autos que siguen dentro). */
  get tiempoPromedioEstancia(): string {
    const duraciones = this.actividadHoy
      .filter(a => a.tipo === 'salida' && typeof a.duracionMin === 'number')
      .map(a => a.duracionMin as number);
    if (!duraciones.length) return '—';
    const avg = Math.round(duraciones.reduce((s, m) => s + m, 0) / duraciones.length);
    return this.formatTiempo(avg);
  }

  formatTiempo(min: number): string {
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  formatMonto(v: number): string {
    return '$' + Math.round(v || 0).toLocaleString('es-MX');
  }

  private get hoyStr(): string { return this.tiempoAhora.toISOString().slice(0, 10); }

  private calcPagosHoy(): Pago[] {
    const hoy = this.hoyStr;
    return this.pagos.filter(p => p.fecha === hoy);
  }

  /** Recalcula los agregados de pagos (campos, no getters, para no repetir el trabajo en cada ciclo de detección de cambios). */
  private refreshPagosAgregados(): void {
    this.pagosHoy = this.calcPagosHoy();
    this.ingresoHoy = this.pagosHoy.reduce((s, p) => s + (p.monto || 0), 0);
    const n = this.pagosHoy.length;
    this.ticketPromedioHoy = n ? Math.round(this.ingresoHoy / n) : 0;
  }

  /** Ingresos de los últimos 7 días (incluye hoy), agrupados por día calendario. */
  get ingresosUltimos7Dias(): { labels: string[]; data: number[] } {
    const dias: { fecha: string; label: string }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(this.tiempoAhora);
      d.setDate(d.getDate() - i);
      dias.push({
        fecha: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString('es-MX', { weekday: 'short' }).replace('.', '')
      });
    }
    const data = dias.map(d => this.pagos
      .filter(p => p.fecha === d.fecha)
      .reduce((s, p) => s + (p.monto || 0), 0));
    return { labels: dias.map(d => d.label), data };
  }

  /** Promedio de ingresos de los 6 días previos a hoy, usado como línea base de comparación. */
  get promedioIngresoPrevio(): number {
    const { data } = this.ingresosUltimos7Dias;
    const previos = data.slice(0, -1);
    if (!previos.length) return 0;
    return Math.round(previos.reduce((s, v) => s + v, 0) / previos.length);
  }

  /** Distribución de métodos de pago: hoy si hay datos, si no las últimas transacciones registradas. */
  get distribucionMetodosPago(): { labels: string[]; data: number[] } {
    const base = this.pagosHoy.length ? this.pagosHoy : this.pagos.slice(0, 50);
    const data = this.METODOS.map(m => base.filter(p => p.metodo === m).length);
    return { labels: this.METODOS as string[], data };
  }

  /** Ocupación desglosada por nivel del estacionamiento. */
  get ocupacionPorNivel(): { labels: string[]; libres: number[]; ocupados: number[]; mantenimiento: number[] } {
    const niveles = Array.from(new Set(this.cajones.map(c => c.nivel))).sort((a, b) => a - b);
    return {
      labels: niveles.map(n => `Nivel ${n}`),
      libres: niveles.map(n => this.cajones.filter(c => c.nivel === n && c.estado === 'Libre').length),
      ocupados: niveles.map(n => this.cajones.filter(c => c.nivel === n && c.estado === 'Ocupado').length),
      mantenimiento: niveles.map(n => this.cajones.filter(c => c.nivel === n && c.estado === 'Mantenimiento').length)
    };
  }

  /** Reconstruye la ocupación neta acumulada (entradas - salidas) por hora, a partir de la actividad real de hoy. */
  get ocupacionPorHora(): { labels: string[]; data: number[] } {
    const horaActual = this.tiempoAhora.getHours();
    const labels: string[] = [];
    const data: number[] = [];
    let acumulado = 0;

    for (let h = 0; h <= horaActual; h++) {
      const eventosDeLaHora = this.actividadHoy.filter(a => {
        const [hh] = a.hora.split(':').map(Number);
        return hh === h;
      });
      for (const ev of eventosDeLaHora) {
        if (ev.tipo === 'entrada') acumulado++;
        if (ev.tipo === 'salida') acumulado = Math.max(0, acumulado - 1);
      }
      labels.push(`${String(h).padStart(2, '0')}:00`);
      data.push(this.totalCajones ? Math.round((acumulado / this.totalCajones) * 100) : 0);
    }
    return { labels, data };
  }

  /** Interpretación automática de los resultados mostrados en el dashboard. Se invoca solo cuando cambian los datos, no en cada ciclo de detección de cambios. */
  private computeInsights(): Insight[] {
    const out: Insight[] = [];

    const pct = this.porcentajeOcupacion;
    if (pct >= 85) {
      out.push({ tipo: 'critical', texto: `Ocupación muy alta (${pct}%). Considera gestionar la espera o habilitar cajones adicionales.` });
    } else if (pct >= 60) {
      out.push({ tipo: 'warning', texto: `Ocupación moderada-alta (${pct}%). Monitorea la disponibilidad en los próximos accesos.` });
    } else {
      out.push({ tipo: 'good', texto: `Ocupación estable (${pct}%). El estacionamiento opera con disponibilidad suficiente.` });
    }

    const { labels: horaLabels, data: horaData } = this.ocupacionPorHora;
    if (horaData.length) {
      const maxIdx = horaData.indexOf(Math.max(...horaData));
      if (horaData[maxIdx] > 0) {
        out.push({ tipo: 'info', texto: `La hora de mayor afluencia hoy fue las ${horaLabels[maxIdx]}, con ${horaData[maxIdx]}% de ocupación.` });
      }
    }

    const ingHoy = this.ingresoHoy;
    const prom = this.promedioIngresoPrevio;
    if (prom > 0) {
      const delta = Math.round(((ingHoy - prom) / prom) * 100);
      if (delta >= 0) {
        out.push({ tipo: 'good', texto: `Los ingresos de hoy (${this.formatMonto(ingHoy)}) están ${delta}% por encima del promedio de los últimos 6 días (${this.formatMonto(prom)}).` });
      } else {
        out.push({ tipo: 'warning', texto: `Los ingresos de hoy (${this.formatMonto(ingHoy)}) están ${Math.abs(delta)}% por debajo del promedio de los últimos 6 días (${this.formatMonto(prom)}).` });
      }
    } else if (ingHoy > 0) {
      out.push({ tipo: 'info', texto: `Ingresos acumulados hoy: ${this.formatMonto(ingHoy)}.` });
    }

    const { labels: metLabels, data: metData } = this.distribucionMetodosPago;
    const totalMet = metData.reduce((s, v) => s + v, 0);
    if (totalMet > 0) {
      const idxMax = metData.indexOf(Math.max(...metData));
      const share = Math.round((metData[idxMax] / totalMet) * 100);
      out.push({ tipo: 'info', texto: `El método de pago más usado es ${metLabels[idxMax]} (${share}% de las transacciones recientes).` });
    }

    const nivel = this.ocupacionPorNivel;
    if (nivel.labels.length) {
      const totales = nivel.labels.map((_, i) => nivel.libres[i] + nivel.ocupados[i] + nivel.mantenimiento[i]);
      const pctPorNivel = nivel.labels.map((_, i) => totales[i] ? Math.round((nivel.ocupados[i] / totales[i]) * 100) : 0);
      const idxMax = pctPorNivel.indexOf(Math.max(...pctPorNivel));
      if (pctPorNivel[idxMax] >= 80) {
        out.push({ tipo: 'warning', texto: `${nivel.labels[idxMax]} está casi saturado (${pctPorNivel[idxMax]}% ocupado).` });
      }
    }

    if (this.sustentabilidad) {
      const s = this.sustentabilidad;
      if (s.nivelTanque <= 20) {
        out.push({ tipo: 'critical', texto: `Nivel de cisterna bajo (${s.nivelTanque}%). Se recomienda revisar el suministro de agua.` });
      } else {
        out.push({ tipo: 'good', texto: `Nivel de cisterna saludable (${s.nivelTanque}%).` });
      }
      out.push({ tipo: 'info', texto: `El ${s.porcentajeSolar}% de la energía consumida proviene de paneles solares (${s.energiaGeneradaKwh} kWh generados).` });
      (s.alertas || []).forEach(a => out.push({ tipo: 'warning', texto: a }));
    }

    return out;
  }

  constructor(private fb: FirebaseService) {}

  ngOnInit(): void {
    const s1 = this.fb.getCajones().subscribe(cajones => {
      this.cajones = cajones;
      this.totalCajones = cajones.length;
      this.cajonesOcupados = cajones.filter(c => c.estado === 'Ocupado').length;
      this.cajonesLibres   = cajones.filter(c => c.estado === 'Libre').length;
      this.porcentajeOcupacion = this.totalCajones
        ? Math.round((this.cajonesOcupados / this.totalCajones) * 100)
        : 0;
      this.updateDonut();
      this.updateLineChart();
      this.updateNivelChart();
      this.insights = this.computeInsights();
    });

    const s2 = this.fb.getActividadReciente().subscribe(act => { this.actividad = act; });

    const hoy = this.hoyStr;
    const s3 = this.fb.getActividadPorFecha(hoy).subscribe(act => {
      this.actividadHoy = act;
      this.updateLineChart();
      this.insights = this.computeInsights();
    });

    const s4 = this.fb.getPagos().subscribe(pagos => {
      this.pagos = pagos;
      this.refreshPagosAgregados();
      this.updateIngresosChart();
      this.updateMetodosChart();
      this.insights = this.computeInsights();
    });

    const s5 = this.fb.getSustentabilidad().subscribe(s => {
      this.sustentabilidad = s;
      this.insights = this.computeInsights();
    });

    this.subs.push(s1, s2, s3, s4, s5);

    this.tickInterval = setInterval(() => { this.tiempoAhora = new Date(); }, 60000);
  }

  ngAfterViewInit(): void { setTimeout(() => this.initCharts(), 100); }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    if (this.tickInterval) clearInterval(this.tickInterval);
    [this.donutChart, this.lineChart, this.ingresosChart, this.nivelChart, this.metodosChart]
      .forEach(c => c?.destroy());
  }

  private initCharts(): void {
    const pct = this.porcentajeOcupacion;
    this.donutCenterLabel.text = pct + '%';
    const centerLabel = this.donutCenterLabel;
    this.donutChart = new Chart(this.donutCanvas.nativeElement, {
      type: 'doughnut',
      data: { datasets: [{ data: [pct, 100 - pct], backgroundColor: ['#C9A227','#222'], borderWidth: 0 }] },
      options: { responsive: false, cutout: '72%', plugins: { legend: { display: false }, tooltip: { enabled: false } } },
      plugins: [{ id: 'center', beforeDraw(c: any) {
        const { width, height, ctx } = c;
        ctx.save(); ctx.font = 'bold 13px Inter'; ctx.fillStyle = '#111';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(centerLabel.text, width / 2, height / 2); ctx.restore();
      }}]
    });

    const { labels, data } = this.ocupacionPorHora;
    this.lineChart = new Chart(this.lineCanvas.nativeElement, {
      type: 'line',
      data: {
        labels,
        datasets: [{ data, borderColor: '#C9A227',
          backgroundColor: 'rgba(201,162,39,0.12)', tension: 0.4, fill: true,
          pointRadius: 4, pointBackgroundColor: '#C9A227' }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { min:0, max:100, ticks: { callback: (v: number) => v+'%' }, grid: { color:'#eee' } },
          x: { grid: { color:'#eee' } }
        },
        plugins: { legend: { display: false } }
      }
    });

    const ing = this.ingresosUltimos7Dias;
    this.ingresosChart = new Chart(this.ingresosCanvas.nativeElement, {
      type: 'bar',
      data: { labels: ing.labels, datasets: [{ data: ing.data, backgroundColor: '#C9A227', borderRadius: 4, borderWidth: 0 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { callback: (v: number) => '$' + v }, grid: { color: '#eee' } },
          x: { grid: { display: false } }
        }
      }
    });

    const nivel = this.ocupacionPorNivel;
    this.nivelChart = new Chart(this.nivelCanvas.nativeElement, {
      type: 'bar',
      data: {
        labels: nivel.labels,
        datasets: [
          { label: 'Libres',       data: nivel.libres,       backgroundColor: '#4CAF50', borderRadius: 4 },
          { label: 'Ocupados',     data: nivel.ocupados,     backgroundColor: '#e57373', borderRadius: 4 },
          { label: 'Mantenimiento', data: nivel.mantenimiento, backgroundColor: '#FFA726', borderRadius: 4 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } },
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: { stacked: true, beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#eee' } }
        }
      }
    });

    const met = this.distribucionMetodosPago;
    this.metodosChart = new Chart(this.metodosCanvas.nativeElement, {
      type: 'doughnut',
      data: { labels: met.labels, datasets: [{ data: met.data, backgroundColor: ['#C9A227', '#aaa', '#333'], borderWidth: 0 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '60%',
        plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } }
      }
    });
  }

  private updateDonut(): void {
    if (!this.donutChart) return;
    const pct = this.porcentajeOcupacion;
    this.donutCenterLabel.text = pct + '%';
    this.donutChart.data.datasets[0].data = [pct, 100 - pct];
    this.donutChart.update();
  }

  private updateLineChart(): void {
    if (!this.lineChart) return;
    const { labels, data } = this.ocupacionPorHora;
    this.lineChart.data.labels = labels;
    this.lineChart.data.datasets[0].data = data;
    this.lineChart.update();
  }

  private updateIngresosChart(): void {
    if (!this.ingresosChart) return;
    const { labels, data } = this.ingresosUltimos7Dias;
    this.ingresosChart.data.labels = labels;
    this.ingresosChart.data.datasets[0].data = data;
    this.ingresosChart.update();
  }

  private updateMetodosChart(): void {
    if (!this.metodosChart) return;
    const { labels, data } = this.distribucionMetodosPago;
    this.metodosChart.data.labels = labels;
    this.metodosChart.data.datasets[0].data = data;
    this.metodosChart.update();
  }

  private updateNivelChart(): void {
    if (!this.nivelChart) return;
    const nivel = this.ocupacionPorNivel;
    this.nivelChart.data.labels = nivel.labels;
    this.nivelChart.data.datasets[0].data = nivel.libres;
    this.nivelChart.data.datasets[1].data = nivel.ocupados;
    this.nivelChart.data.datasets[2].data = nivel.mantenimiento;
    this.nivelChart.update();
  }

  getActIcon(tipo: string): string {
    if (tipo === 'entrada') return 'assets/images/CocheVerde.png';
    if (tipo === 'salida')  return 'assets/images/CocheRojo.png';
    return 'assets/images/Alerta.png';
  }

  getActLabel(tipo: string): string {
    if (tipo === 'entrada') return 'Entrada de Vehículo';
    if (tipo === 'salida')  return 'Salida de Vehículo';
    return 'Recuperación solicitada';
  }
}
