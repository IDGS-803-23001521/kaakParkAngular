import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { FirebaseService } from '../../services/firebase.service';
import { SustentabilidadData } from '../../models/kaakpark.models';
import { Subscription } from 'rxjs';

declare const Chart: any;

@Component({
  standalone: false, selector: 'app-sustentabilidad', templateUrl: './sustentabilidad.component.html' })
export class SustentabilidadComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('donutAguaCanvas')   donutAguaCanvas!: ElementRef;
  @ViewChild('donutSolarCanvas')  donutSolarCanvas!: ElementRef;
  @ViewChild('lineSolarCanvas')   lineSolarCanvas!: ElementRef;
  @ViewChild('barCisternaCanvas') barCisternaCanvas!: ElementRef;

  data: SustentabilidadData = {
    energiaGeneradaKwh: 0, aguaCaptadaLitros: 0, aguaUsadaRiego: 0,
    porcentajeSolar: 0, nivelTanque: 0, capacidadCisternaLitros: 4,
    bombaAgua: false, alertas: []
  };

  get CISTERNA_CAPACIDAD_LITROS(): number {
    return this.data.capacidadCisternaLitros ?? 4;
  }

  private subs: Subscription[] = [];
  private chartsReady = false;
  private chartAgua: any = null;
  private chartSolar: any = null;
  private chartLineSolar: any = null;
  private chartCisterna: any = null;

  constructor(private fb: FirebaseService) {}

  get aguaPluvialPorcentaje(): number {
    if (!this.data.aguaCaptadaLitros) return 0;
    return Math.round((this.data.aguaUsadaRiego / this.data.aguaCaptadaLitros) * 100);
  }

  get nivelTanqueLitros(): number {
    return Math.round((this.data.nivelTanque / 100) * this.CISTERNA_CAPACIDAD_LITROS * 100) / 100;
  }

  async ngOnInit(): Promise<void> {
    await this.fb.seedSustentabilidadIfEmpty();
    const sub = this.fb.getSustentabilidad().subscribe(d => {
      if (d) { this.data = d; this.updateCharts(); }
    });
    this.subs.push(sub);
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.initCharts();
      this.chartsReady = true;
      this.updateCharts();
    }, 100);
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    [this.chartAgua, this.chartSolar, this.chartLineSolar, this.chartCisterna].forEach(c => c?.destroy());
  }

  async toggleBomba(estado: boolean): Promise<void> {
    this.data = { ...this.data, bombaAgua: estado };
    await this.fb.updateSustentabilidad({ bombaAgua: estado });
  }

  private initCharts(): void {
    this.chartAgua = new Chart(this.donutAguaCanvas.nativeElement, {
      type: 'doughnut',
      data: { datasets: [{ data: [this.data.aguaUsadaRiego, Math.max(0, this.data.aguaCaptadaLitros - this.data.aguaUsadaRiego)], backgroundColor: ['#0c141a', '#ccc'], borderWidth: 0 }] },
      options: { responsive: false, cutout: '60%', plugins: { legend: { display: false }, tooltip: { enabled: false } } },
      plugins: [{ id: 'ca', beforeDraw: (c: any) => {
        const { width, height, ctx } = c; ctx.save(); ctx.font = 'bold 13px Segoe UI'; ctx.fillStyle = '#333'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(`${this.aguaPluvialPorcentaje}%`, width / 2, height / 2); ctx.restore();
      } }]
    });

    this.chartSolar = new Chart(this.donutSolarCanvas.nativeElement, {
      type: 'doughnut',
      data: { datasets: [{ data: [this.data.porcentajeSolar, Math.max(0, 100 - this.data.porcentajeSolar)], backgroundColor: ['#C9A227', '#ccc'], borderWidth: 0 }] },
      options: { responsive: false, cutout: '60%', plugins: { legend: { display: false }, tooltip: { enabled: false } } },
      plugins: [{ id: 'cs', beforeDraw: (c: any) => {
        const { width, height, ctx } = c; ctx.save(); ctx.font = 'bold 13px Segoe UI'; ctx.fillStyle = '#333'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(`${this.data.porcentajeSolar}%`, width / 2, height / 2); ctx.restore();
      } }]
    });

    this.chartLineSolar = new Chart(this.lineSolarCanvas.nativeElement, {
      type: 'line',
      data: {
        labels: ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'],
        datasets: [
          { label: 'Solar', data: [3.2,4.1,3.8,4.7,3.9,2.1,1.5], borderColor: '#C9A227', backgroundColor: 'rgba(201,162,39,0.1)', tension: 0.4, fill: true, pointRadius: 4 },
          { label: 'Red',   data: [1.5,1.2,1.8,0.9,1.3,2.5,3.1], borderColor: '#0c141a', backgroundColor: 'rgba(66,165,245,0.1)',  tension: 0.4, fill: true, pointRadius: 4 }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { grid: { color: '#eee' }, ticks: { font: { size: 10 } } }, x: { grid: { color: '#eee' }, ticks: { font: { size: 10 } } } }, plugins: { legend: { labels: { font: { size: 10 }, boxWidth: 20 } } } }
    });

    this.chartCisterna = new Chart(this.barCisternaCanvas.nativeElement, {
      type: 'bar',
      data: {
        labels: ['Cisterna'],
        datasets: [{ data: [this.data.nivelTanque], backgroundColor: '#2D9CDB', borderRadius: 8, borderWidth: 0, barThickness: 70 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: {
          y: { min: 0, max: 100, ticks: { stepSize: 25, callback: (v: number) => v + '%', font: { size: 10 } }, grid: { color: '#eee' } },
          x: { grid: { display: false }, ticks: { font: { size: 10 } } }
        }
      }
    });
  }

  private updateCharts(): void {
    if (!this.chartsReady) return;
    this.chartAgua.data.datasets[0].data = [this.data.aguaUsadaRiego, Math.max(0, this.data.aguaCaptadaLitros - this.data.aguaUsadaRiego)];
    this.chartAgua.update();
    this.chartSolar.data.datasets[0].data = [this.data.porcentajeSolar, Math.max(0, 100 - this.data.porcentajeSolar)];
    this.chartSolar.update();
    this.chartCisterna.data.datasets[0].data = [this.data.nivelTanque];
    this.chartCisterna.update();
  }
}
