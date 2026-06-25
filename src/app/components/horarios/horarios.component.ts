import { Component } from '@angular/core';

@Component({
  standalone: false,
  selector: 'app-horarios',
  templateUrl: './horarios.component.html'
})
export class HorariosComponent {
  dias = [
    { nombre: 'Lunes',     apertura: '08:00', cierre: '20:00', abierto: true },
    { nombre: 'Martes',    apertura: '08:00', cierre: '20:00', abierto: true },
    { nombre: 'Miércoles', apertura: '08:00', cierre: '20:00', abierto: true },
    { nombre: 'Jueves',    apertura: '08:00', cierre: '20:00', abierto: true },
    { nombre: 'Viernes',   apertura: '08:00', cierre: '22:00', abierto: true },
    { nombre: 'Sábado',    apertura: '09:00', cierre: '22:00', abierto: true },
    { nombre: 'Domingo',   apertura: '09:00', cierre: '18:00', abierto: true }
  ];

  especiales: { etiqueta: string; fecha: string; apertura: string; cierre: string }[] = [];
  nuevaEtiqueta = ''; nuevaFecha = ''; nuevaApertura = ''; nuevaCierre = '';

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

  agregarEspecial(): void {
    if (!this.nuevaEtiqueta || !this.nuevaFecha) { alert('Pon etiqueta y fecha.'); return; }
    this.especiales.push({ etiqueta: this.nuevaEtiqueta, fecha: this.nuevaFecha, apertura: this.nuevaApertura || '00:00', cierre: this.nuevaCierre || '00:00' });
    this.nuevaEtiqueta = ''; this.nuevaFecha = ''; this.nuevaApertura = ''; this.nuevaCierre = '';
  }

  eliminarEspecial(e: any): void {
    this.especiales = this.especiales.filter(x => x !== e);
  }
}