import { Component, OnInit, OnDestroy } from '@angular/core';
import { FirebaseService } from '../../services/firebase.service';
import { Subscription } from 'rxjs';

interface Cliente {
  id?: string;
  nombre: string;
  usuario: string;
  genero: 'M' | 'F';
  fechaIngreso: string;
  activo: boolean;
  eliminado: boolean;
}

interface Vehiculo {
  id?: string;
  id_cliente: string;
  placas: string;
  modelo?: string;
}

@Component({
  standalone: false, selector: 'app-clientes', templateUrl: './clientes.component.html'
})
export class ClientesComponent implements OnInit, OnDestroy {
  activos: Cliente[] = [];
  inactivos: Cliente[] = [];
  todosLosVehiculos: Vehiculo[] = [];
  vehiculosFiltrados: Vehiculo[] = [];

  fNombre = ''; fApPat = ''; fApMat = ''; fSexo: 'M' | 'F' = 'M'; fFecha = '';

  editando: Cliente | null = null;
  mostrarConfirmEliminar = false;
  clienteAEliminar: Cliente | null = null;
  mostrarModalVehiculos = false;
  clienteSeleccionado: Cliente | null = null;

  filtroNombre = '';
  paginaActual = 1;
  clientesPorPagina = 15;

  private subs: Subscription[] = [];

  constructor(private fb: FirebaseService) { }

  tabActual: 'activos' | 'inactivos' = 'activos';
  errores = { nombre: false, apPat: false };
  errorMensaje = '';

  clearError(campo: keyof typeof this.errores) {
    this.errores[campo] = false;
    if (!Object.values(this.errores).some(Boolean)) this.errorMensaje = '';
  }

  initials(nombre: string): string {
    const p = nombre.trim().split(' ');
    return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase();
  }

  ngOnInit(): void {
    const subClientes = this.fb.getClientes().subscribe((clients: any[]) => {
      const vivos = clients.filter(c => !c.eliminado);
      this.activos = vivos.filter(c => c.activo);
      this.inactivos = vivos.filter(c => !c.activo);
    });
    this.subs.push(subClientes);

    const subVehiculos = this.fb.getVehiculos().subscribe((vehicles: any[]) => {
      this.todosLosVehiculos = vehicles;
    });
    this.subs.push(subVehiculos);
  }

  ngOnDestroy(): void { 
    this.subs.forEach(s => s.unsubscribe()); 
  }

  cambiarTab(tab: 'activos' | 'inactivos'): void {
    this.tabActual = tab;
    this.paginaActual = 1;
  }

  onFiltroChange(): void { 
    this.paginaActual = 1; 
  }

  limpiarFiltros(): void {
    this.filtroNombre = '';
    this.paginaActual = 1;
  }

  get listaActual(): Cliente[] {
    return this.tabActual === 'activos' ? this.activos : this.inactivos;
  }

  get listaFiltrada(): Cliente[] {
    const nombre = this.filtroNombre.trim().toLowerCase();
    return this.listaActual.filter(c =>
      !nombre || c.nombre.toLowerCase().includes(nombre)
    );
  }

  get totalPaginas(): number {
    return Math.max(1, Math.ceil(this.listaFiltrada.length / this.clientesPorPagina));
  }

  get listaPaginada(): Cliente[] {
    if (this.paginaActual > this.totalPaginas) this.paginaActual = this.totalPaginas;
    const inicio = (this.paginaActual - 1) * this.clientesPorPagina;
    return this.listaFiltrada.slice(inicio, inicio + this.clientesPorPagina);
  }

  paginaAnterior(): void { 
    if (this.paginaActual > 1) this.paginaActual--; 
  }
  
  paginaSiguiente(): void { 
    if (this.paginaActual < this.totalPaginas) this.paginaActual++; 
  }

  async guardarCliente(): Promise<void> {
    this.errores = { nombre: false, apPat: false };
    this.errorMensaje = '';
    let invalid = false;
    if (!this.fNombre.trim()) { this.errores.nombre = true; invalid = true; }
    if (!this.fApPat.trim()) { this.errores.apPat = true; invalid = true; }
    if (invalid) {
      this.errorMensaje = 'Completa los campos obligatorios: Nombre y Apellido paterno.';
      return;
    }

    const nombre = `${this.fNombre} ${this.fApPat}${this.fApMat ? ' ' + this.fApMat : ''}`;

    if (this.editando) {
      const cambios: Partial<Cliente> = {
        nombre,
        genero: this.fSexo,
        fechaIngreso: this.fFecha || this.editando.fechaIngreso
      };
      if (this.editando.id) await this.fb.updateCliente(this.editando.id, cambios);
      this.cancelarEdicion();
      return;
    }

    const usuario = (this.fNombre[0] + this.fApPat).toLowerCase().replace(/[^a-z]/g, '') + Math.floor(Math.random() * 900 + 100);
    const nuevo: Cliente = {
      nombre, usuario,
      genero: this.fSexo,
      fechaIngreso: this.fFecha || new Date().toISOString().split('T')[0],
      activo: true,
      eliminado: false
    };
    await this.fb.addCliente(nuevo);
    this.limpiarForm();
  }

  editarCliente(c: Cliente): void {
    this.editando = c;
    const partes = c.nombre.trim().split(' ');
    this.fNombre = partes[0] || '';
    this.fApPat = partes[1] || '';
    this.fApMat = partes.slice(2).join(' ');
    this.fSexo = c.genero;
    this.fFecha = c.fechaIngreso || '';
    this.errores = { nombre: false, apPat: false };
    this.errorMensaje = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelarEdicion(): void {
    this.editando = null;
    this.limpiarForm();
  }

  solicitarEliminar(c: Cliente): void {
    this.clienteAEliminar = c;
    this.mostrarConfirmEliminar = true;
  }

  cancelarEliminar(): void {
    this.clienteAEliminar = null;
    this.mostrarConfirmEliminar = false;
  }

  async confirmarEliminar(): Promise<void> {
    const c = this.clienteAEliminar;
    if (!c?.id) { this.cancelarEliminar(); return; }
    await this.fb.updateCliente(c.id, { eliminado: true });
    if (this.editando?.id === c.id) this.cancelarEdicion();
    this.cancelarEliminar();
  }

  async inactivarCliente(c: Cliente): Promise<void> {
    if (c.id) await this.fb.toggleClienteActivo(c.id, false);
  }

  async activarCliente(c: Cliente): Promise<void> {
    if (c.id) await this.fb.toggleClienteActivo(c.id, true);
  }

  abrirModalVehiculos(c: Cliente): void {
    this.clienteSeleccionado = c;
    this.vehiculosFiltrados = this.todosLosVehiculos.filter(v => v.id_cliente === c.id);
    this.mostrarModalVehiculos = true;
  }

  cerrarModalVehiculos(): void {
    this.mostrarModalVehiculos = false;
    this.clienteSeleccionado = null;
    this.vehiculosFiltrados = [];
  }

  limpiarForm(): void {
    this.fNombre = ''; this.fApPat = ''; this.fApMat = ''; this.fSexo = 'M'; this.fFecha = '';
    this.errores = { nombre: false, apPat: false };
    this.errorMensaje = '';
  }
}