import { Component, OnInit, AfterViewInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { FirebaseService } from '../../services/firebase.service';
import { MqttRobotService, Secuencia } from '../../services/mqtt-robot.service';
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
  secuencias: Secuencia[] = [];
  niveles = [3, 2, 1];
  tiempoAhora = new Date();

  toastMsg = '';
  toastTipo: 'ok' | 'err' | 'info' = 'info';
  toastVisible = false;
  private toastTimer: any;

  private subs: Subscription[] = [];
  private donutChart: any;
  private timeInterval: any;

  get ocupado(): boolean {
    return !!this.robot.estado$.value?.ejecutando;
  }

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

  constructor(private fb: FirebaseService, private robot: MqttRobotService) { }

  async ngOnInit(): Promise<void> {
    await this.fb.seedCajonesIfEmpty();
    this.subs.push(
      this.fb.getCajones().subscribe(cajones => {
        this.cajones = cajones.filter(c => c.nivel !== 4);
        this.updateDonut();
      })
    );
    this.subs.push(
      this.fb.getSecuencias().subscribe(secs => {
        this.secuencias = (secs || []).filter(s => !s.eliminado);
      })
    );
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

  // ---- Estado manual (sin cambios respecto a lo que ya tenías) -------
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

  // ---- Vínculo de secuencias por cajón -------------------------------
  async vincularSecuencia(cajon: Cajon, tipo: 'ingreso' | 'salida', secuenciaId: string): Promise<void> {
    if (!cajon.id) return;
    const cambios = tipo === 'ingreso'
      ? { secuenciaIngresoId: secuenciaId }
      : { secuenciaSalidaId: secuenciaId };
    try {
      await this.fb.updateCajon(cajon.id, cambios as Partial<Cajon>);
      this.toast(`Secuencia de ${tipo} actualizada`, 'ok');
    } catch {
      this.toast('Error al vincular la secuencia', 'err');
    }
  }

  nombreSecuencia(id?: string): string {
    if (!id) return '';
    return this.secuencias.find(s => s.id === id)?.nombre || '(secuencia eliminada)';
  }

  // ---- Ejecutar: mueve los motores Y actualiza el estado del cajón ---
  async ejecutarSecuenciaCajon(cajon: Cajon, tipo: 'ingreso' | 'salida'): Promise<void> {
    const id = tipo === 'ingreso' ? cajon.secuenciaIngresoId : cajon.secuenciaSalidaId;
    const secuencia = this.secuencias.find(s => s.id === id);
    if (!secuencia) { this.toast('Este cajón no tiene secuencia asignada', 'err'); return; }

    try {
      this.toast(`Ejecutando "${secuencia.nombre}"…`, 'info');
      await this.robot.ejecutarPasos(secuencia.pasos);

      // El estado sigue siendo editable a mano (Ocupar/Desocupar en la tabla);
      // esto solo lo refleja automáticamente cuando la secuencia corrió bien.
      if (cajon.id) {
        if (tipo === 'ingreso') {
          const horaEntrada = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
          await this.fb.updateCajon(cajon.id, { estado: 'Ocupado', horaEntrada });
        } else {
          await this.fb.updateCajon(cajon.id, { estado: 'Libre', horaEntrada: '', placa: '' });
        }
      }
      this.toast(`"${secuencia.nombre}" ejecutada`, 'ok');
    } catch (e: any) {
      this.toast(e?.message === 'ocupado' ? 'El robot está ocupado con otra acción, espera' : 'Error al ejecutar — ¿está conectado el robot?', 'err');
    }
  }

  private toast(msg: string, tipo: 'ok' | 'err' | 'info'): void {
    this.toastMsg = msg;
    this.toastTipo = tipo;
    this.toastVisible = true;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toastVisible = false), 2800);
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