import { Component } from '@angular/core';

@Component({
  selector: 'app-pagos',
  standalone: false,
  templateUrl: './pagos.component.html'
})
export class PagosComponent {

  rangoSeleccionado: string = 'Últimos 7 días';
  metodoSeleccionado: string = 'Todos';
  estadoSeleccionado: string = 'Todos';

  tendenciaIngresos: { mes: string; monto: number }[] = [];

  historialPagos: {
    id: string;
    cliente: string;
    fecha: string;
    monto: number;
    metodo: string;
    tipo: string;
    estado: string;
  }[] = [];

  alturaBarra(monto: number): number {
    if (!this.tendenciaIngresos.length) return 0;
    const max = Math.max(...this.tendenciaIngresos.map(t => t.monto), 1);
    return (monto / max) * 100;
  }
}