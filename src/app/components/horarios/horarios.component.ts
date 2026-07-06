import { Component, OnInit, OnDestroy } from '@angular/core';
import { FirebaseService } from '../../services/firebase.service';
import { HorarioDia, DiaEspecial } from '../../models/kaakpark.models';
import { Subscription } from 'rxjs';

const DIAS_DEFAULT: HorarioDia[] = [
  { nombre: 'Lunes',     apertura: '08:00', cierre: '20:00', abierto: true },
  { nombre: 'Martes',    apertura: '08:00', cierre: '20:00', abierto: true },
  { nombre: 'Miércoles', apertura: '08:00', cierre: '20:00', abierto: true },
  { nombre: 'Jueves',    apertura: '08:00', cierre: '20:00', abierto: true },
  { nombre: 'Viernes',   apertura: '08:00', cierre: '22:00', abierto: true },
  { nombre: 'Sábado',    apertura: '09:00', cierre: '22:00', abierto: true },
  { nombre: 'Domingo',   apertura: '09:00', cierre: '18:00', abierto: true }
];

@Component({
  standalone: false,
  selector: 'app-horarios',
  templateUrl: './horarios.component.html'
})
export class HorariosComponent implements OnInit, OnDestroy {
  dias: HorarioDia[] = DIAS_DEFAULT.map(d => ({ ...d }));
  private diasGuardados: HorarioDia[] = DIAS_DEFAULT.map(d => ({ ...d }));
  private horarioCargado = false;
  guardandoHorario = false;

  especiales: DiaEspecial[] = [];
  nuevaEtiqueta = ''; nuevaFecha = ''; nuevaApertura = ''; nuevaCierre = '';
  guardandoEspecial = false;

  toastMsg = '';
  toastTipo: 'ok' | 'err' | 'info' = 'info';
  toastVisible = false;
  private toastTimer: any;

  private subs: Subscription[] = [];

  constructor(private fb: FirebaseService) {}

  ngOnInit(): void {
    this.fb.seedHorarioIfEmpty().then(() => {
      const subH = this.fb.getHorario().subscribe(h => {
        if (h?.dias?.length) {
          this.diasGuardados = h.dias.map(d => ({ ...d }));
          if (!this.horarioCargado) {
            this.dias = this.diasGuardados.map(d => ({ ...d }));
            this.horarioCargado = true;
          }
        }
      });
      this.subs.push(subH);
    });

    const subE = this.fb.getDiasEspeciales().subscribe(lista => this.especiales = lista);
    this.subs.push(subE);
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    clearTimeout(this.toastTimer);
  }

  get hayCambiosHorario(): boolean {
    return JSON.stringify(this.dias) !== JSON.stringify(this.diasGuardados);
  }

  async guardarHorario(): Promise<void> {
    this.guardandoHorario = true;
    try {
      await this.fb.updateHorario(this.dias);
      this.toast('Horario guardado', 'ok');
    } catch {
      this.toast('Error al guardar el horario', 'err');
    } finally {
      this.guardandoHorario = false;
    }
  }

  cancelarHorario(): void {
    this.dias = this.diasGuardados.map(d => ({ ...d }));
  }

  private minutos(hora: string): number {
    const [h, m] = hora.split(':').map(Number);
    return h * 60 + m;
  }

  private diaActualNombre(): string {
    const nombres = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    return nombres[new Date().getDay()];
  }

  private diaActual() {
    return this.dias.find(d => d.nombre === this.diaActualNombre());
  }

  wPct(d: { apertura: string; cierre: string }): number {
    const inicio = this.minutos(d.apertura);
    const fin = this.minutos(d.cierre);
    const dur = fin > inicio ? fin - inicio : 1440 - inicio + fin;
    return Math.max((dur / 1440) * 100, 4);
  }

  horasHoy(): number {
    const hoy = this.diaActual();
    if (!hoy || !hoy.abierto) return 0;
    return Math.round((this.wPct(hoy) / 100) * 24);
  }

  donutBg(): string {
    const pct = (this.horasHoy() / 24) * 100;
    return `conic-gradient(var(--gold) 0% ${pct}%, #e6e6e6 ${pct}% 100%)`;
  }

  abiertoAhora(): boolean {
    const hoy = this.diaActual();
    if (!hoy || !hoy.abierto) return false;
    const ahora = new Date();
    const min = ahora.getHours() * 60 + ahora.getMinutes();
    const inicio = this.minutos(hoy.apertura);
    const fin = this.minutos(hoy.cierre);
    return fin > inicio ? (min >= inicio && min < fin) : (min >= inicio || min < fin);
  }

  horarioHoyTexto(): string {
    const hoy = this.diaActual();
    if (!hoy || !hoy.abierto) return 'Cerrado todo el día';
    return `${hoy.apertura} – ${hoy.cierre}`;
  }

  proximoCambio(): string {
    const hoy = this.diaActual();
    if (!hoy || !hoy.abierto) return '—';
    return this.abiertoAhora() ? `Cierra a las ${hoy.cierre}` : `Abre a las ${hoy.apertura}`;
  }

  async agregarEspecial(): Promise<void> {
    if (!this.nuevaEtiqueta || !this.nuevaFecha) { this.toast('Pon etiqueta y fecha.', 'err'); return; }
    this.guardandoEspecial = true;
    try {
      await this.fb.addDiaEspecial({
        etiqueta: this.nuevaEtiqueta,
        fecha: this.nuevaFecha,
        apertura: this.nuevaApertura || '00:00',
        cierre: this.nuevaCierre || '00:00'
      });
      this.nuevaEtiqueta = ''; this.nuevaFecha = ''; this.nuevaApertura = ''; this.nuevaCierre = '';
      this.toast('Día especial agregado', 'ok');
    } catch {
      this.toast('Error al agregar el día especial', 'err');
    } finally {
      this.guardandoEspecial = false;
    }
  }

  async eliminarEspecial(e: DiaEspecial): Promise<void> {
    if (!e.id) return;
    try {
      await this.fb.eliminarDiaEspecial(e.id);
      this.toast('Día especial eliminado', 'ok');
    } catch {
      this.toast('Error al eliminar el día especial', 'err');
    }
  }

  private toast(msg: string, tipo: 'ok' | 'err' | 'info'): void {
    this.toastMsg = msg;
    this.toastTipo = tipo;
    this.toastVisible = true;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toastVisible = false), 2800);
  }
}
