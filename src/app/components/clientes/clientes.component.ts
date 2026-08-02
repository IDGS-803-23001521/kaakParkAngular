import { Component, OnInit, OnDestroy } from '@angular/core';
import { FirebaseService } from '../../services/firebase.service';
import { Cliente, Genero } from '../../models/kaakpark.models';
import { Subscription } from 'rxjs';

interface Vehiculo {
  id?: string;
  id_cliente?: string;
  idCliente?: string;
  clienteId?: string;
  cliente_id?: string;
  uid?: string;
  userId?: string;
  user_id?: string;
  email?: string;
  clienteEmail?: string;
  correo?: string;
  placas?: string;
  placa?: string;
  matricula?: string;
  modelo?: string;
  marca?: string;
  color?: string;
}

@Component({
  standalone: false, selector: 'app-clientes', templateUrl: './clientes.component.html'
})
export class ClientesComponent implements OnInit, OnDestroy {
  activos: Cliente[] = [];
  inactivos: Cliente[] = [];
  todosLosVehiculos: any[] = [];
  vehiculosFiltrados: any[] = [];

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

  get totalClientesCount(): number {
    return this.activos.length + this.inactivos.length;
  }

  get totalVehiculosCount(): number {
    return this.todosLosVehiculos.length;
  }

  countVehiculos(c: Cliente): number {
    const clientAuthUid = (c.authUid || '').toString().trim();
    const clientDocId = (c.id || '').toString().trim();
    const clientEmail = (c.email || '').toString().toLowerCase().trim();

    return this.todosLosVehiculos.filter((v: any) => {
      const vAuth = (v.authUid || v.auth_uid || v.uid || v.uid_cliente || v.id_cliente || v.idCliente || v.clienteId || v.cliente_id || v.id_usuario || v.idUsuario || v.usuarioId || v.usuario_id || v.userId || v.user_id || '').toString().trim();
      const vEmail = (v.email || v.clienteEmail || v.correo || '').toString().toLowerCase().trim();

      const matchAuthUid = !!(clientAuthUid && vAuth && vAuth === clientAuthUid);
      const matchDocId = !!(clientDocId && vAuth && vAuth === clientDocId);
      const matchEmail = !!(clientEmail && vEmail && vEmail === clientEmail);

      return matchAuthUid || matchDocId || matchEmail;
    }).length;
  }

  get listaActual(): Cliente[] {
    return this.tabActual === 'activos' ? this.activos : this.inactivos;
  }

  get listaFiltrada(): Cliente[] {
    const query = this.filtroNombre.trim().toLowerCase();
    if (!query) return this.listaActual;
    return this.listaActual.filter(c =>
      (c.nombre || '').toLowerCase().includes(query) ||
      (c.email || '').toLowerCase().includes(query) ||
      (c.telefono || '').toLowerCase().includes(query)
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
    const clientAuthUid = (c.authUid || '').toString().trim();
    const clientDocId = (c.id || '').toString().trim();
    const clientEmail = (c.email || '').toString().toLowerCase().trim();

    this.vehiculosFiltrados = this.todosLosVehiculos.filter((v: any) => {
      const vAuth = (v.authUid || v.auth_uid || v.uid || v.uid_cliente || v.id_cliente || v.idCliente || v.clienteId || v.cliente_id || v.id_usuario || v.idUsuario || v.usuarioId || v.usuario_id || v.userId || v.user_id || '').toString().trim();
      const vEmail = (v.email || v.clienteEmail || v.correo || '').toString().toLowerCase().trim();

      const matchAuthUid = !!(clientAuthUid && vAuth && vAuth === clientAuthUid);
      const matchDocId = !!(clientDocId && vAuth && vAuth === clientDocId);
      const matchEmail = !!(clientEmail && vEmail && vEmail === clientEmail);

      return matchAuthUid || matchDocId || matchEmail;
    });

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

  // ── Exportación a Excel (.xlsx nativo) ──────────────────────────────────
  async exportarExcel(): Promise<void> {
    const data = this.listaFiltrada;
    if (!data.length) return;

    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Clientes', { views: [{ showGridLines: true }] });

    const hoy = new Date().toLocaleString('es-MX');

    // 1. Título principal
    worksheet.mergeCells('A1:F1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = `K'ÁAXPARK — DIRECTORIO DE CLIENTES (${this.tabActual.toUpperCase()})`;
    titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A1E' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getRow(1).height = 36;

    // 2. Metadatos
    worksheet.getCell('A3').value = `Fecha de reporte: ${hoy}`;
    worksheet.getCell('A3').font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF666666' } };
    worksheet.getCell('A4').value = `Total en lista: ${data.length} clientes`;
    worksheet.getCell('A4').font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF222222' } };

    // 3. Encabezados de tabla
    const headers = ['Nombre completo', 'Teléfono', 'Correo electrónico', 'Cant. Vehículos', 'Vehículos / Placas', 'Estado'];
    const headerRow = worksheet.getRow(6);
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC9A227' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    headerRow.height = 26;

    // 4. Filas de Datos
    let rIdx = 7;
    for (const c of data) {
      const row = worksheet.getRow(rIdx);
      const cantV = this.countVehiculos(c);
      const isEven = rIdx % 2 === 0;

      row.getCell(1).value = c.nombre || '';
      row.getCell(2).value = c.telefono || '—';
      row.getCell(3).value = c.email || '—';
      row.getCell(4).value = cantV;
      row.getCell(5).value = `${cantV} registrado(s)`;
      row.getCell(6).value = c.estado || 'ACTIVO';

      for (let col = 1; col <= 6; col++) {
        const cell = row.getCell(col);
        cell.font = { name: 'Calibri', size: 10 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? 'FFFAFAFA' : 'FFFFFFFF' } };
        cell.alignment = { horizontal: col === 4 || col === 6 ? 'center' : 'left', vertical: 'middle' };
        cell.border = { bottom: { style: 'thin', color: { argb: 'FFEFEFEF' } } };
      }
      rIdx++;
    }

    worksheet.columns = [
      { width: 28 },
      { width: 16 },
      { width: 28 },
      { width: 16 },
      { width: 22 },
      { width: 14 }
    ];

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Reporte_Clientes_KaaxPark_${new Date().toISOString().slice(0, 10)}.xlsx`;
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
  <title>Directorio de Clientes K'áaxPark - PDF</title>
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
    .footer { margin-top: 20px; text-align: center; font-size: 9px; color: #aaa; border-top: 1px dashed #ddd; padding-top: 8px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <h2>K'ÁAXPARK</h2>
      <span>Sistema de Gestión de Estacionamiento</span>
    </div>
    <div class="meta">
      <h3>Directorio de Clientes (${this.tabActual.toUpperCase()})</h3>
      <span>Generado el: ${hoy}</span>
    </div>
  </div>

  <div class="kpi-container">
    <div class="kpi-card"><span>Pestaña</span><strong>${this.tabActual.toUpperCase()}</strong></div>
    <div class="kpi-card"><span>Clientes en Lista</span><strong class="kpi-gold">${data.length}</strong></div>
    <div class="kpi-card"><span>Total Registrados</span><strong>${this.totalClientesCount} clientes</strong></div>
    <div class="kpi-card"><span>Vehículos Totales</span><strong>${this.totalVehiculosCount} registrados</strong></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Nombre del Cliente</th>
        <th>Teléfono</th>
        <th>Correo Electrónico</th>
        <th>Vehículos</th>
        <th>Estatus</th>
      </tr>
    </thead>
    <tbody>
      ${data.map(c => `
        <tr>
          <td class="left"><strong>${c.nombre || ''}</strong></td>
          <td>${c.telefono || '—'}</td>
          <td class="left">${c.email || '—'}</td>
          <td>🚗 ${this.countVehiculos(c)} vehículo(s)</td>
          <td class="badge-ok">${c.estado || 'ACTIVO'}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="footer">
    K'áaxPark Parking System &copy; ${new Date().getFullYear()} — Control de Clientes
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
