import { Component, OnInit, OnDestroy, AfterViewInit, ElementRef, ViewChild } from '@angular/core';
import { FirebaseService } from '../../services/firebase.service';
import { ActividadReciente, Cajon } from '../../models/kaakpark.models';
import { Subscription } from 'rxjs';

declare const Chart: any;

@Component({
  standalone: false,
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html'
})
export class DashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('donutCanvas') donutCanvas!: ElementRef;
  @ViewChild('lineCanvas')  lineCanvas!: ElementRef;

  cajones: Cajon[] = [];
  actividad: ActividadReciente[] = [];
  actividadHoy: ActividadReciente[] = [];

  totalCajones = 0;
  cajonesOcupados = 0;
  cajonesLibres = 0;
  porcentajeOcupacion = 0;

  tiempoAhora = new Date();
  private tickInterval: any;
  private subs: Subscription[] = [];
  private donutChart: any;
  private lineChart: any;
  private donutCenterLabel = { text: '0%' };

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
    });

    const s2 = this.fb.getActividadReciente().subscribe(act => { this.actividad = act; });

    const hoy = this.tiempoAhora.toISOString().slice(0, 10);
    const s3 = this.fb.getActividadPorFecha(hoy).subscribe(act => {
      this.actividadHoy = act;
      this.updateLineChart();
    });

    this.subs.push(s1, s2, s3);

    this.tickInterval = setInterval(() => { this.tiempoAhora = new Date(); }, 60000);
  }

  ngAfterViewInit(): void { setTimeout(() => this.initCharts(), 100); }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    if (this.tickInterval) clearInterval(this.tickInterval);
    if (this.donutChart) this.donutChart.destroy();
    if (this.lineChart)  this.lineChart.destroy();
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
