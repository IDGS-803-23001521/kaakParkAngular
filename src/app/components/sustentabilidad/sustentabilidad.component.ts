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
  @ViewChild('donutHuellaCanvas') donutHuellaCanvas!: ElementRef;
  @ViewChild('lineSolarCanvas')   lineSolarCanvas!: ElementRef;
  @ViewChild('barHuellaCanvas')   barHuellaCanvas!: ElementRef;

  data: SustentabilidadData = {
    energiaGeneradaKwh: 0, aguaCaptadaLitros: 0, aguaUsadaRiego: 0,
    porcentajeSolar: 0, nivelTanque: 0, bombaAgua: false, alertas: []
  };

  private subs: Subscription[] = [];
  private charts: any[] = [];

  constructor(private fb: FirebaseService) {}

  async ngOnInit(): Promise<void> {
    await this.fb.seedSustentabilidadIfEmpty();
    const sub = this.fb.getSustentabilidad().subscribe(d => { if (d) this.data = d; });
    this.subs.push(sub);
  }

  ngAfterViewInit(): void { setTimeout(() => this.initCharts(), 100); }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    this.charts.forEach(c => c?.destroy());
  }

  async toggleBomba(estado: boolean): Promise<void> {
    this.data = { ...this.data, bombaAgua: estado };
    await this.fb.updateSustentabilidad({ bombaAgua: estado });
  }

  private initCharts(): void {
    const c1 = new Chart(this.donutAguaCanvas.nativeElement, {
      type:'doughnut',
      data:{ datasets:[{ data:[this.data.aguaUsadaRiego, this.data.aguaCaptadaLitros-this.data.aguaUsadaRiego], backgroundColor:['#0c141a','#ccc'], borderWidth:0 }] },
      options:{ responsive:false, cutout:'60%', plugins:{legend:{display:false},tooltip:{enabled:false}} },
      plugins:[{ id:'ca', beforeDraw(c:any){ const {width,height,ctx}=c; ctx.save(); ctx.font='bold 13px Segoe UI'; ctx.fillStyle='#333'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('62%',width/2,height/2); ctx.restore(); } }]
    });
    const c2 = new Chart(this.donutSolarCanvas.nativeElement, {
      type:'doughnut',
      data:{ datasets:[{ data:[this.data.porcentajeSolar, 100-this.data.porcentajeSolar], backgroundColor:['#C9A227','#ccc'], borderWidth:0 }] },
      options:{ responsive:false, cutout:'60%', plugins:{legend:{display:false},tooltip:{enabled:false}} },
      plugins:[{ id:'cs', beforeDraw(c:any){ const {width,height,ctx}=c; ctx.save(); ctx.font='bold 13px Segoe UI'; ctx.fillStyle='#333'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('78%',width/2,height/2); ctx.restore(); } }]
    });
    const c3 = new Chart(this.lineSolarCanvas.nativeElement, {
      type:'line',
      data:{ labels:['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'],
        datasets:[
          { label:'Solar', data:[3.2,4.1,3.8,4.7,3.9,2.1,1.5], borderColor:'#C9A227', backgroundColor:'rgba(201,162,39,0.1)', tension:0.4, fill:true, pointRadius:4 },
          { label:'Red',   data:[1.5,1.2,1.8,0.9,1.3,2.5,3.1], borderColor:'#0c141a', backgroundColor:'rgba(66,165,245,0.1)',  tension:0.4, fill:true, pointRadius:4 }
        ] },
      options:{ scales:{ y:{grid:{color:'#eee'},ticks:{font:{size:10}}}, x:{grid:{color:'#eee'},ticks:{font:{size:10}}} }, plugins:{legend:{labels:{font:{size:10},boxWidth:20}}} }
    });
    const c4 = new Chart(this.donutHuellaCanvas.nativeElement, {
      type:'doughnut',
      data:{ datasets:[{ data:[30,25,25,20], backgroundColor:['#C9A227','#ccc','#888','#333'], borderWidth:0 }] },
      options:{ responsive:false, cutout:'60%', plugins:{legend:{display:false},tooltip:{enabled:false}} }
    });
    const c5 = new Chart(this.barHuellaCanvas.nativeElement, {
      type:'bar',
      data:{ labels:['Huella Red','Huella Total'],
        datasets:[
          { label:'Gasto', data:[7,5], backgroundColor:'#C9A227', borderRadius:3, borderWidth:0 },
          { label:'Ahorro',data:[9,5], backgroundColor:'#ccc',    borderRadius:3, borderWidth:0 }
        ] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
        scales:{ y:{min:0,max:10,ticks:{callback:(v:number)=>v+'%',font:{size:9}},grid:{color:'#eee'}}, x:{grid:{display:false},ticks:{font:{size:9}}} } }
    });
    this.charts = [c1,c2,c3,c4,c5];
  }
}
