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

  totalCajones = 0;
  cajonesOcupados = 0;
  cajonesLibres = 0;
  porcentajeOcupacion = 0;

  horas = '00'; minutos = '00'; segundos = '00';
  private h = 0; private m = 0; private s = 0;
  private clockInterval: any;
  private subs: Subscription[] = [];
  private donutChart: any;
  private lineChart: any;

  get entradasHoy(): number { return this.actividad.filter(a => a.tipo === 'entrada').length; }
  get salidasHoy():  number { return this.actividad.filter(a => a.tipo === 'salida').length; }

  constructor(private fb: FirebaseService) {}

  ngOnInit(): void {
    const now = new Date();
    this.h = now.getHours(); this.m = now.getMinutes(); this.s = now.getSeconds();
    this.horas    = String(this.h).padStart(2, '0');
    this.minutos  = String(this.m).padStart(2, '0');
    this.segundos = String(this.s).padStart(2, '0');

    const s1 = this.fb.getCajones().subscribe(cajones => {
      this.cajones = cajones;
      this.totalCajones = cajones.length;
      this.cajonesOcupados = cajones.filter(c => c.estado === 'Ocupado').length;
      this.cajonesLibres   = cajones.filter(c => c.estado === 'Libre').length;
      this.porcentajeOcupacion = this.totalCajones
        ? Math.round((this.cajonesOcupados / this.totalCajones) * 100)
        : 0;
      this.updateDonut();
    });

    const s2 = this.fb.getActividadReciente().subscribe(act => { this.actividad = act; });
    this.subs.push(s1, s2);

    this.clockInterval = setInterval(() => {
      this.s++;
      if (this.s >= 60) { this.s = 0; this.m++; }
      if (this.m >= 60) { this.m = 0; this.h++; }
      if (this.h >= 24) { this.h = 0; }
      this.horas    = String(this.h).padStart(2, '0');
      this.minutos  = String(this.m).padStart(2, '0');
      this.segundos = String(this.s).padStart(2, '0');
    }, 1000);
  }

  ngAfterViewInit(): void { setTimeout(() => this.initCharts(), 100); }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    if (this.clockInterval) clearInterval(this.clockInterval);
    if (this.donutChart) this.donutChart.destroy();
    if (this.lineChart)  this.lineChart.destroy();
  }

  private initCharts(): void {
    const pct = this.porcentajeOcupacion;
    this.donutChart = new Chart(this.donutCanvas.nativeElement, {
      type: 'doughnut',
      data: { datasets: [{ data: [pct, 100 - pct], backgroundColor: ['#C9A227','#222'], borderWidth: 0 }] },
      options: { responsive: false, cutout: '72%', plugins: { legend: { display: false }, tooltip: { enabled: false } } },
      plugins: [{ id: 'center', beforeDraw(c: any) {
        const { width, height, ctx } = c;
        ctx.save(); ctx.font = 'bold 13px Segoe UI'; ctx.fillStyle = '#111';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(pct + '%', width / 2, height / 2); ctx.restore();
      }}]
    });

    this.lineChart = new Chart(this.lineCanvas.nativeElement, {
      type: 'line',
      data: {
        labels: ['00:00','04:00','08:00','12:00','16:00','20:00','24:00'],
        datasets: [{ data: [25,20,55,75,100,80,25], borderColor: '#C9A227',
          backgroundColor: 'rgba(201,162,39,0.12)', tension: 0.4, fill: true,
          pointRadius: 5, pointBackgroundColor: '#C9A227' }]
      },
      options: {
        scales: {
          y: { min:0, max:125, ticks: { callback: (v: number) => v+'%' }, grid: { color:'#eee' } },
          x: { grid: { color:'#eee' } }
        },
        plugins: { legend: { display: false } }
      }
    });
  }

  private updateDonut(): void {
    if (!this.donutChart) return;
    const pct = this.porcentajeOcupacion;
    this.donutChart.data.datasets[0].data = [pct, 100 - pct];
    this.donutChart.update();
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
