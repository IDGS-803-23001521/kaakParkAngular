import { Component, OnInit, OnDestroy } from '@angular/core';
import { FirebaseService } from '../../services/firebase.service';
import { Usuario } from '../../models/kaakpark.models';
import { Subscription } from 'rxjs';

@Component({
  standalone: false, selector: 'app-usuarios', templateUrl: './usuarios.component.html'
})
export class UsuariosComponent implements OnInit, OnDestroy {
  activos: Usuario[] = [];
  inactivos: Usuario[] = [];

  fNombre = ''; fApPat = ''; fApMat = ''; fPuesto = ''; fSexo: 'M' | 'F' = 'M'; fFecha = '';
  fotoPreview = 'assets/images/UsuarioD.png';
  fotoBase64: string | null = null;

  mostrarModal = false;
  credUsuario = ''; credPass = ''; credNota = '';
  guardandoCreds = false;

  // --- Edición ---
  editando: Usuario | null = null;

  // --- Eliminar (modal personalizado) ---
  mostrarConfirmEliminar = false;
  usuarioAEliminar: Usuario | null = null;

  // --- Filtros ---
  filtroNombre = '';
  filtroPuesto = '';
  puestos = ['Administrador', 'Encargado', 'Guardia de seguridad', 'Mantenimiento'];

  // --- Paginación ---
  paginaActual = 1;
  usuariosPorPagina = 15;

  private subs: Subscription[] = [];

  constructor(private fb: FirebaseService) { }

  tabActual: 'activos' | 'inactivos' = 'activos';
  errores = { nombre: false, apPat: false, puesto: false };
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
    const sub = this.fb.getUsuarios().subscribe(users => {
      const vivos = users.filter(u => !u.eliminado);
      this.activos = vivos.filter(u => u.activo);
      this.inactivos = vivos.filter(u => !u.activo);
    });
    this.subs.push(sub);
  }

  ngOnDestroy(): void { this.subs.forEach(s => s.unsubscribe()); }

  // ================= FILTROS / TABS =================
  cambiarTab(tab: 'activos' | 'inactivos'): void {
    this.tabActual = tab;
    this.paginaActual = 1;
  }

  onFiltroChange(): void {
    this.paginaActual = 1;
  }

  limpiarFiltros(): void {
    this.filtroNombre = '';
    this.filtroPuesto = '';
    this.paginaActual = 1;
  }

  get listaActual(): Usuario[] {
    return this.tabActual === 'activos' ? this.activos : this.inactivos;
  }

  get listaFiltrada(): Usuario[] {
    const nombre = this.filtroNombre.trim().toLowerCase();
    const puesto = this.filtroPuesto;
    return this.listaActual.filter(u =>
      (!nombre || u.nombre.toLowerCase().includes(nombre)) &&
      (!puesto || u.puesto === puesto)
    );
  }

  // ================= PAGINACIÓN =================
  get totalPaginas(): number {
    return Math.max(1, Math.ceil(this.listaFiltrada.length / this.usuariosPorPagina));
  }

  get listaPaginada(): Usuario[] {
    if (this.paginaActual > this.totalPaginas) this.paginaActual = this.totalPaginas;
    const inicio = (this.paginaActual - 1) * this.usuariosPorPagina;
    return this.listaFiltrada.slice(inicio, inicio + this.usuariosPorPagina);
  }

  paginaAnterior(): void { if (this.paginaActual > 1) this.paginaActual--; }
  paginaSiguiente(): void { if (this.paginaActual < this.totalPaginas) this.paginaActual++; }

  // ================= CRUD =================
  async guardarUsuario(): Promise<void> {
    this.errores = { nombre: false, apPat: false, puesto: false };
    this.errorMensaje = '';
    let invalid = false;
    if (!this.fNombre.trim()) { this.errores.nombre = true; invalid = true; }
    if (!this.fApPat.trim()) { this.errores.apPat = true; invalid = true; }
    if (!this.fPuesto) { this.errores.puesto = true; invalid = true; }
    if (invalid) {
      this.errorMensaje = 'Completa los campos obligatorios: Nombre, Apellido paterno y Puesto.';
      return;
    }

    const nombre = `${this.fNombre} ${this.fApPat}${this.fApMat ? ' ' + this.fApMat : ''}`;

    if (this.editando) {
      // ---- ACTUALIZAR ----
      const cambios: Partial<Usuario> = {
        nombre,
        puesto: this.fPuesto,
        genero: this.fSexo,
        fechaIngreso: this.fFecha || this.editando.fechaIngreso
      };
      if (this.fotoBase64) cambios.foto = this.fotoBase64;
      if (this.editando.id) await this.fb.updateUsuario(this.editando.id, cambios);
      this.cancelarEdicion();
      return;
    }

    // ---- CREAR ----
    const usuario = (this.fNombre[0] + this.fApPat).toLowerCase().replace(/[^a-z]/g, '') + Math.floor(Math.random() * 900 + 100);
    const nuevo: Usuario = {
      nombre, usuario,
      puesto: this.fPuesto,
      genero: this.fSexo,
      fechaIngreso: this.fFecha || new Date().toISOString().split('T')[0],
      activo: true,
      eliminado: false
    };
    if (this.fotoBase64) nuevo.foto = this.fotoBase64;
    await this.fb.addUsuario(nuevo);
    this.limpiarForm();
  }

  editarUsuario(u: Usuario): void {
    this.editando = u;
    const partes = u.nombre.trim().split(' ');
    this.fNombre = partes[0] || '';
    this.fApPat = partes[1] || '';
    this.fApMat = partes.slice(2).join(' ');
    this.fPuesto = u.puesto;
    this.fSexo = u.genero;
    this.fFecha = u.fechaIngreso || '';
    this.fotoPreview = u.foto || 'assets/images/UsuarioD.png';
    this.fotoBase64 = null;
    this.errores = { nombre: false, apPat: false, puesto: false };
    this.errorMensaje = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelarEdicion(): void {
    this.editando = null;
    this.limpiarForm();
  }

  solicitarEliminar(u: Usuario): void {
    this.usuarioAEliminar = u;
    this.mostrarConfirmEliminar = true;
  }

  cancelarEliminar(): void {
    this.usuarioAEliminar = null;
    this.mostrarConfirmEliminar = false;
  }

  async confirmarEliminar(): Promise<void> {
    const u = this.usuarioAEliminar;
    if (!u?.id) { this.cancelarEliminar(); return; }
    await this.fb.updateUsuario(u.id, { eliminado: true });
    if (this.editando?.id === u.id) this.cancelarEdicion();
    this.cancelarEliminar();
  }

  async inactivarUsuario(u: Usuario): Promise<void> {
    if (u.id) await this.fb.toggleUsuarioActivo(u.id, false);
  }

  async activarUsuario(u: Usuario): Promise<void> {
    if (u.id) await this.fb.toggleUsuarioActivo(u.id, true);
  }

  async generarCredenciales(u: Usuario): Promise<void> {
    if (u.email && u.contrasena) {
      this.credUsuario = u.email;
      this.credPass = u.contrasena;
      this.credNota = 'Credenciales ya existentes. Muéstralas solo al usuario.';
      this.mostrarModal = true;
      return;
    }

    this.guardandoCreds = true;
    try {
      const partes = u.nombre.trim().split(' ');
      const base = (partes[0][0] + (partes[1] || '')).toLowerCase().replace(/[^a-z]/g, '');
      const usuario = base + Math.floor(Math.random() * 900 + 100);
      const email = usuario + '@kaakpark.com';
      const pass = this.generarPassword();

      await this.fb.crearAuthUsuario(email, pass);

      if (u.id) {
        await this.fb.updateUsuario(u.id, { email, contrasena: pass, usuario });
      }

      this.credUsuario = email;
      this.credPass = pass;
      this.credNota = 'Credenciales creadas.';
      this.mostrarModal = true;
    } catch (e: any) {
      if (e.code === 'auth/email-already-in-use') {
        this.credNota = 'Ya existe una cuenta para este usuario.';
      } else {
        alert('Error al crear credenciales: ' + (e.message || e));
      }
    } finally {
      this.guardandoCreds = false;
    }
  }

  cerrarModal(): void { this.mostrarModal = false; }

  previsualizarFoto(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.[0]) {
      const reader = new FileReader();
      reader.onload = (e) => {
        this.fotoPreview = e.target?.result as string;
        this.fotoBase64 = e.target?.result as string;
      };
      reader.readAsDataURL(input.files[0]);
    }
  }

  limpiarForm(): void {
    this.fNombre = ''; this.fApPat = ''; this.fApMat = ''; this.fPuesto = ''; this.fSexo = 'M'; this.fFecha = '';
    this.fotoPreview = 'assets/images/UsuarioD.png';
    this.fotoBase64 = null;
    this.errores = { nombre: false, apPat: false, puesto: false };
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