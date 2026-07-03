import { Component, OnInit, OnDestroy } from '@angular/core';
import { FirebaseService } from '../../services/firebase.service';
import { Cliente, Genero } from '../../models/kaakpark.models';
import { Subscription } from 'rxjs';

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

  fNombre = ''; fApPat = ''; fApMat = ''; fEmail = ''; fTelefono = ''; fSexo: Genero = 'M';

  editando: Cliente | null = null;
  mostrarConfirmEliminar = false;
  clienteAEliminar: Cliente | null = null;
  mostrarModalVehiculos = false;
  clienteSeleccionado: Cliente | null = null;

  mostrarModalCreds = false;
  credEmail = ''; credPass = ''; credNota = '';
  guardando = false;

  filtroNombre = '';
  paginaActual = 1;
  clientesPorPagina = 15;

  private subs: Subscription[] = [];

  constructor(private fb: FirebaseService) { }

  tabActual: 'activos' | 'inactivos' = 'activos';
  errores = { nombre: false, apPat: false, email: false, telefono: false };
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
    const subClientes = this.fb.getClientes().subscribe((clients: Cliente[]) => {
      const vivos = clients.filter(c => !c.eliminado);
      this.activos = vivos.filter(c => c.estado === 'ACTIVO');
      this.inactivos = vivos.filter(c => c.estado !== 'ACTIVO');
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
    this.errores = { nombre: false, apPat: false, email: false, telefono: false };
    this.errorMensaje = '';
    let invalid = false;
    if (!this.fNombre.trim()) { this.errores.nombre = true; invalid = true; }
    if (!this.fApPat.trim()) { this.errores.apPat = true; invalid = true; }
    if (!this.editando && !this.fEmail.trim()) { this.errores.email = true; invalid = true; }
    if (!this.fTelefono.trim()) { this.errores.telefono = true; invalid = true; }
    if (invalid) {
      this.errorMensaje = 'Completa los campos obligatorios: Nombre, Apellido paterno, Email y Teléfono.';
      return;
    }

    const nombre = `${this.fNombre} ${this.fApPat}${this.fApMat ? ' ' + this.fApMat : ''}`;

    if (this.editando) {
      const cambios: Partial<Cliente> = {
        nombre,
        telefono: this.fTelefono,
        genero: this.fSexo
      };
      if (this.editando.id) await this.fb.updateCliente(this.editando.id, cambios);
      this.cancelarEdicion();
      return;
    }

    this.guardando = true;
    try {
      const pass = this.generarPassword();
      const authUid = await this.fb.crearAuthUsuarioConUid(this.fEmail.trim(), pass);

      const nuevo: Cliente = {
        authUid,
        email: this.fEmail.trim(),
        estado: 'ACTIVO',
        fechaRegistro: Date.now(),
        nombre,
        rol: 'CLIENTE',
        telefono: this.fTelefono,
        genero: this.fSexo,
        eliminado: false
      };
      await this.fb.addCliente(nuevo);

      this.credEmail = this.fEmail.trim();
      this.credPass = pass;
      this.credNota = 'Comparte estas credenciales con el cliente; la contraseña no se volverá a mostrar.';
      this.mostrarModalCreds = true;

      this.limpiarForm();
    } catch (e: any) {
      if (e.code === 'auth/email-already-in-use') {
        this.errorMensaje = 'Ya existe una cuenta con este correo electrónico.';
      } else {
        this.errorMensaje = 'Error al crear el cliente: ' + (e.message || e);
      }
    } finally {
      this.guardando = false;
    }
  }

  cerrarModalCreds(): void { this.mostrarModalCreds = false; }

  editarCliente(c: Cliente): void {
    this.editando = c;
    const partes = c.nombre.trim().split(' ');
    this.fNombre = partes[0] || '';
    this.fApPat = partes[1] || '';
    this.fApMat = partes.slice(2).join(' ');
    this.fEmail = c.email;
    this.fTelefono = c.telefono || '';
    this.fSexo = c.genero;
    this.errores = { nombre: false, apPat: false, email: false, telefono: false };
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
    this.fNombre = ''; this.fApPat = ''; this.fApMat = ''; this.fEmail = ''; this.fTelefono = ''; this.fSexo = 'M';
    this.errores = { nombre: false, apPat: false, email: false, telefono: false };
    this.errorMensaje = '';
  }

  private generarPassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const esp = ['!', '%', '*', '-', '+', '?'];
    let pass = '';
    for (let i = 0; i < 7; i++) pass += chars[Math.floor(Math.random() * chars.length)];
    return pass + esp[Math.floor(Math.random() * esp.length)];
  }
}
