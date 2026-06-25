import { Component } from '@angular/core';

@Component({
  standalone: false,
  selector: 'app-horarios',
  templateUrl: './horarios.component.html'
})
export class HorariosComponent {
  dias: { nombre: string; apertura: string; cierre: string }[] = [];
}