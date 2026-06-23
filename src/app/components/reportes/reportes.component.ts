import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { FirebaseService } from '../../services/firebase.service';
import { ReporteHistorial } from '../../models/kaakpark.models';
import { Subscription } from 'rxjs';

declare const Chart: any;

@Component({
  standalone: false, selector: 'app-reportes', templateUrl: './reportes.component.html' })
export class ReportesComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('donutMetricasCanvas') donutMetricasCanvas!: ElementRef;
  @ViewChild('barNivelCanvas')      barNivelCanvas!: ElementRef;
  @ViewChild('lineChartCanvas')     lineChartCanvas!: ElementRef;

  periodo = '7d'; modulo = 'general'; nivel = 'todos';
  historial: ReporteHistorial[] = [];
  private subs: Subscription[] = [];
  private charts: any[] = [];

  constructor(private fb: FirebaseService) {}

  ngOnInit(): void {
    const sub = this.fb.getReportesHistorial().subscribe(h => { this.historial = h; });
    this.subs.push(sub);
  }

  ngAfterViewInit(): void { setTimeout(() => this.initCharts(), 100); }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    this.charts.forEach(c => c?.destroy());
  }

  async generarReporte(): Promise<void> {
    const reporte: ReporteHistorial = {
      nombre: `Reporte ${this.modulo} – ${new Date().toLocaleDateString('es-MX', { month:'long', year:'numeric' })}`,
      fecha: new Date().toLocaleDateString('es-MX'),
      tipo: this.modulo
    };
    await this.fb.addReporte(reporte);
  }

  descargarReporte(nombre: string): void { alert(`Descargando: ${nombre}`); }

  private initCharts(): void {
    const c1 = new Chart(this.donutMetricasCanvas.nativeElement, {
      type: 'doughnut',
      data: { datasets: [{ data:[65,30,5], backgroundColor:['#C9A227','#aaa','#333'], borderWidth:0 }] },
      options: { responsive:false, cutout:'60%', plugins:{ legend:{display:false}, tooltip:{enabled:false} } }
    });
    const c2 = new Chart(this.barNivelCanvas.nativeElement, {
      type: 'bar',
      data: { labels:['N1','N2','N3','N4'], datasets:[{ data:[80,60,90,45], backgroundColor:'#C9A227', borderRadius:4, borderWidth:0 }] },
      options: { responsive:true, plugins:{legend:{display:false}},
        scales:{ y:{ min:0, max:100, ticks:{callback:(v:number)=>v+'%',font:{size:9}}, grid:{color:'#eee'} }, x:{grid:{display:false},ticks:{font:{size:9}}} } }
    });
    const c3 = new Chart(this.lineChartCanvas.nativeElement, {
      type: 'line',
      data: {
        labels:['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'],
        datasets:[
          { label:'Entradas', data:[210,195,230,240,280,260,310,295,270,285,300,315], borderColor:'#C9A227', backgroundColor:'rgba(201,162,39,0.08)', tension:0.4, fill:true, pointRadius:4 },
          { label:'Salidas',  data:[180,170,210,220,260,240,290,270,250,265,280,295], borderColor:'#0b131a', backgroundColor:'rgba(66,165,245,0.08)',  tension:0.4, fill:true, pointRadius:4 }
        ]
      },
      options: { scales:{ y:{grid:{color:'#eee'},ticks:{font:{size:10}}}, x:{grid:{color:'#eee'},ticks:{font:{size:10}}} }, plugins:{legend:{labels:{font:{size:10},boxWidth:16}}} }
    });
    this.charts = [c1, c2, c3];
  }
}
