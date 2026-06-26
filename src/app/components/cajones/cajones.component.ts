import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { FirebaseService } from '../../services/firebase.service';
import { Cajon } from '../../models/kaakpark.models';
import { Subscription } from 'rxjs';

declare const Chart: any;

@Component({
  standalone: false,
  selector: 'app-cajones',
  templateUrl: './cajones.component.html'
})
export class CajonesComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('donutCapCanvas') donutCapCanvas!: ElementRef;

  cajones: Cajon[] = [];
  niveles = [3, 2, 1];
  tiempoAhora = new Date();

  private subs: Subscription[] = [];
  private donutChart: any;
  private timeInterval: any;

  get totalCajones() { return this.cajones.length; }
  get totalOcupados() { return this.cajones.filter(c => c.estado === 'Ocupado').length; }
  get totalLibres() { return this.cajones.filter(c => c.estado === 'Libre').length; }
  get totalMantenimiento() { return this.cajones.filter(c => c.estado === 'Mantenimiento').length; }
  get pctOcupado() { return this.totalCajones ? Math.round((this.totalOcupados / this.totalCajones) * 100) : 0; }
  get pctLibre() { return this.totalCajones ? Math.round((this.totalLibres / this.totalCajones) * 100) : 0; }

  get cajonesOcupadosConTiempo(): Array<Cajon & { tiempoMin: number }> {
    return this.cajones
      .filter(c => c.estado === 'Ocupado' && c.horaEntrada)
      .map(c => {
        const [h, m] = c.horaEntrada!.split(':').map(Number);
        const entrada = new Date(this.tiempoAhora);
        entrada.setHours(h, m, 0, 0);
        const diff = Math.max(0, Math.round((this.tiempoAhora.getTime() - entrada.getTime()) / 60000));
        return { ...c, tiempoMin: diff };
      })
      .sort((a, b) => b.tiempoMin - a.tiempoMin);
  }

  get tiempoPromedioOcupacion(): string {
    const lista = this.cajonesOcupadosConTiempo;
    if (!lista.length) return '—';
    const avg = Math.round(lista.reduce((s, c) => s + c.tiempoMin, 0) / lista.length);
    return this.formatTiempo(avg);
  }

  formatTiempo(min: number): string {
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  constructor(private fb: FirebaseService) { }

  async ngOnInit(): Promise<void> {
    await this.fb.seedCajonesIfEmpty();
    const sub = this.fb.getCajones().subscribe(cajones => {
      this.cajones = cajones.filter(c => c.nivel !== 4);
      this.updateDonut();
    });
    this.subs.push(sub);
    this.timeInterval = setInterval(() => { this.tiempoAhora = new Date(); }, 60000);
  }

  ngAfterViewInit(): void { setTimeout(() => this.initDonut(), 200); }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    if (this.donutChart) this.donutChart.destroy();
    if (this.timeInterval) clearInterval(this.timeInterval);
  }

  getCajonesDeNivel(nivel: number): Cajon[] {
    return this.cajones.filter(c => c.nivel === nivel).sort((a, b) => a.numeroCajon - b.numeroCajon);
  }

  getCajon(nivel: number, num: number): Cajon | undefined {
    return this.cajones.find(c => c.nivel === nivel && c.numeroCajon === num);
  }

  getEstadoClass(estado: string): string { return estado?.toLowerCase() || 'libre'; }

  async ocupar(cajon: Cajon): Promise<void> {
    if (!cajon.id || cajon.estado === 'Ocupado') return;
    const ahora = new Date();
    const horaEntrada = ahora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
    await this.fb.updateCajon(cajon.id, { estado: 'Ocupado', horaEntrada });
  }

  async desocupar(cajon: Cajon): Promise<void> {
    if (!cajon.id || cajon.estado !== 'Ocupado') return;
    await this.fb.updateCajon(cajon.id, { estado: 'Libre', horaEntrada: '', placa: '' });
  }

  async toggleMantenimiento(cajon: Cajon): Promise<void> {
    if (!cajon.id || cajon.estado === 'Ocupado') return;
    const nuevoEstado = cajon.estado === 'Mantenimiento' ? 'Libre' : 'Mantenimiento';
    await this.fb.updateCajon(cajon.id, { estado: nuevoEstado });
  }

  private initDonut(): void {
    if (!this.donutCapCanvas) return;
    this.donutChart = new Chart(this.donutCapCanvas.nativeElement, {
      type: 'doughnut',
      data: {
        datasets: [{
          data: [this.pctOcupado, this.pctLibre, Math.max(100 - this.pctOcupado - this.pctLibre, 0)],
          backgroundColor: ['#1a1a1a', '#aaa', '#C9A227'],
          borderWidth: 0
        }]
      },
      options: { responsive: false, cutout: '70%', plugins: { legend: { display: false }, tooltip: { enabled: false } } }
    });
  }

  private updateDonut(): void {
    if (!this.donutChart) return;
    const pctMant = Math.max(100 - this.pctOcupado - this.pctLibre, 0);
    this.donutChart.data.datasets[0].data = [this.pctOcupado, this.pctLibre, pctMant];
    this.donutChart.update();
  }
}
