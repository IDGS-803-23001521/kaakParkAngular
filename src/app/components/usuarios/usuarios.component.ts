import { Component, OnInit, OnDestroy } from '@angular/core';
import { FirebaseService } from '../../services/firebase.service';
import { Usuario, Genero } from '../../models/kaakpark.models';
import { Subscription } from 'rxjs';

@Component({
  standalone: false, selector: 'app-usuarios', templateUrl: './usuarios.component.html'
})
export class UsuariosComponent implements OnInit, OnDestroy {
  activos: Usuario[] = [];
  inactivos: Usuario[] = [];

  fNombre = ''; fApPat = ''; fApMat = ''; fPuesto = ''; fSexo: Genero = 'M'; fFecha = '';
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

  // ── Exportación a Excel (.xlsx nativo) ──────────────────────────────────
  async exportarExcel(): Promise<void> {
    const data = this.listaFiltrada;
    if (!data.length) return;

    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Usuarios', { views: [{ showGridLines: true }] });

    const hoy = new Date().toLocaleString('es-MX');

    // 1. Título principal
    worksheet.mergeCells('A1:D1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = `K'ÁAXPARK — PLANTILLA DE PERSONAL Y OPERADORES (${this.tabActual.toUpperCase()})`;
    titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A1E' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getRow(1).height = 36;

    // 2. Metadatos
    worksheet.getCell('A3').value = `Fecha de reporte: ${hoy}`;
    worksheet.getCell('A3').font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF666666' } };
    worksheet.getCell('A4').value = `Total en lista: ${data.length} usuarios`;
    worksheet.getCell('A4').font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF222222' } };

    // 3. Encabezados
    const headers = ['Nombre completo', 'Puesto / Rol', 'Correo de acceso', 'Estatus'];
    const headerRow = worksheet.getRow(6);
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC9A227' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    headerRow.height = 26;

    // 4. Datos
    let rIdx = 7;
    for (const u of data) {
      const row = worksheet.getRow(rIdx);
      const isEven = rIdx % 2 === 0;

      row.getCell(1).value = u.nombre || '';
      row.getCell(2).value = u.puesto || '';
      row.getCell(3).value = u.email || '—';
      row.getCell(4).value = u.activo ? 'ACTIVO' : 'INACTIVO';

      for (let col = 1; col <= 4; col++) {
        const cell = row.getCell(col);
        cell.font = { name: 'Calibri', size: 10 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? 'FFFAFAFA' : 'FFFFFFFF' } };
        cell.alignment = { horizontal: col === 4 ? 'center' : 'left', vertical: 'middle' };
        cell.border = { bottom: { style: 'thin', color: { argb: 'FFEFEFEF' } } };
      }
      rIdx++;
    }

    worksheet.columns = [
      { width: 30 },
      { width: 22 },
      { width: 30 },
      { width: 14 }
    ];

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Reporte_Usuarios_KaaxPark_${new Date().toISOString().slice(0, 10)}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // ── Exportación a PDF (Impresión nativa estilizada) ───────────────────────
  abrirReportePdf(): void {
    const data = this.listaFiltrada;
    if (!data.length) return;
    const hoy = new Date().toLocaleString('es-MX');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Directorio de Usuarios K'áaxPark - PDF</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #111; margin: 0; padding: 15px; background: #fff; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #C9A227; padding-bottom: 10px; margin-bottom: 15px; }
    .brand h2 { margin: 0; color: #C9A227; font-size: 22px; font-weight: 800; }
    .brand span { font-size: 11px; color: #777; }
    .meta { text-align: right; }
    .meta h3 { margin: 0; font-size: 14px; color: #111; text-transform: uppercase; }
    .meta span { font-size: 11px; color: #777; }
    
    .kpi-container { display: flex; gap: 10px; margin-bottom: 15px; background: #fafafa; border: 1px solid #eee; border-radius: 8px; padding: 10px; }
    .kpi-card { flex: 1; text-align: center; }
    .kpi-card span { display: block; font-size: 9px; color: #777; text-transform: uppercase; font-weight: 700; margin-bottom: 2px; }
    .kpi-card strong { font-size: 14px; color: #111; font-weight: 800; }
    .kpi-gold { color: #C9A227 !important; }

    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th { background: #C9A227; color: #ffffff; font-size: 10px; font-weight: 700; text-transform: uppercase; padding: 8px 6px; text-align: center; border: 1px solid #b38e1b; }
    td { padding: 6px 8px; font-size: 10px; border-bottom: 1px solid #eee; text-align: center; color: #222; }
    tr:nth-child(even) td { background: #fcfcfc; }
    .left { text-align: left; }
    .badge-ok { color: #2e7d32; font-weight: 700; }
    .badge-off { color: #c0392b; font-weight: 700; }
    .footer { margin-top: 20px; text-align: center; font-size: 9px; color: #aaa; border-top: 1px dashed #ddd; padding-top: 8px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <h2>K'ÁAXPARK</h2>
      <span>Gestión de Personal y Control Operativo</span>
    </div>
    <div class="meta">
      <h3>Plantilla de Personal (${this.tabActual.toUpperCase()})</h3>
      <span>Generado el: ${hoy}</span>
    </div>
  </div>

  <div class="kpi-container">
    <div class="kpi-card"><span>Pestaña</span><strong>${this.tabActual.toUpperCase()}</strong></div>
    <div class="kpi-card"><span>Personal en Lista</span><strong class="kpi-gold">${data.length}</strong></div>
    <div class="kpi-card"><span>Usuarios Activos</span><strong>${this.activos.length}</strong></div>
    <div class="kpi-card"><span>Usuarios Inactivos</span><strong>${this.inactivos.length}</strong></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Nombre del Empleado / Operador</th>
        <th>Puesto / Rol</th>
        <th>Correo de Acceso</th>
        <th>Estatus</th>
      </tr>
    </thead>
    <tbody>
      ${data.map(u => `
        <tr>
          <td class="left"><strong>${u.nombre || ''}</strong></td>
          <td>${u.puesto || ''}</td>
          <td class="left">${u.email || '—'}</td>
          <td class="${u.activo ? 'badge-ok' : 'badge-off'}">${u.activo ? 'ACTIVO' : 'INACTIVO'}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="footer">
    K'áaxPark Parking System &copy; ${new Date().getFullYear()} — Control de Accesos y Usuarios
  </div>
</body>
</html>`;

    let iframe = document.getElementById('pdf-print-iframe') as HTMLIFrameElement;
    if (iframe && iframe.parentNode) {
      iframe.parentNode.removeChild(iframe);
    }

    iframe = document.createElement('iframe');
    iframe.id = 'pdf-print-iframe';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();

      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (err) {
          console.error('Error al imprimir iframe:', err);
        } finally {
          setTimeout(() => {
            if (iframe && iframe.parentNode) {
              iframe.parentNode.removeChild(iframe);
            }
          }, 1000);
        }
      }, 250);
    }
  }
}