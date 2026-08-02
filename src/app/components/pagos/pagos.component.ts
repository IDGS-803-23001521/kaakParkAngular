import { Component, OnInit, OnDestroy } from '@angular/core';
import { FirebaseService } from '../../services/firebase.service';
import { MqttRobotService } from '../../services/mqtt-robot.service';
import { AuthService } from '../../services/auth.service';
import { ActividadReciente, Cajon, HistorialTarifa, Pago } from '../../models/kaakpark.models';
import { Subscription } from 'rxjs';
import * as XLSX from 'xlsx';

@Component({
  standalone: false,
  selector: 'app-pagos',
  templateUrl: './pagos.component.html'
})
export class PagosComponent implements OnInit, OnDestroy {

  // ── Data ─────────────────────────────────────────────────────────────────
  cajones: Cajon[]              = [];
  pagos:   Pago[]               = [];
  historialTarifas: HistorialTarifa[] = [];
  tiempoAhora = new Date();

  // ── Tarifa dinámica ───────────────────────────────────────────────────────
  tarifaPorHora    = 60;
  editandoTarifa   = false;
  nuevaTarifa      = 60;
  guardandoTarifa  = false;
  mostrarHistorialTarifa = false;

  // ── Filtros de historial ──────────────────────────────────────────────────
  rangoSeleccionado   = 'Últimos 7 días';
  metodoSeleccionado  = 'Todos';
  estadoSeleccionado  = 'Todos';

  // ── Formulario de pago nuevo ──────────────────────────────────────────────
  cajonSeleccionadoId = '';
  metodoPago: 'Efectivo' | 'Transferencia' | 'Tarjeta' = 'Efectivo';
  procesando = false;

  // ── Confirmación de pagos en caja (desde app móvil) ───────────────────────
  confirmando = false;

  // ── Ticket ───────────────────────────────────────────────────────────────
  mostrarTicket = false;
  ticketPago: Pago | null = null;

  readonly DATOS_TRANSFERENCIA = {
    banco:   'BBVA',
    titular: "K'áaxPark S.A. de C.V.",
    clabe:   '012345678901234567',
  };

  private subs: Subscription[] = [];
  private tickInterval: any;

  // ── Getters: cajón seleccionado ──────────────────────────────────────────
  get cajonSeleccionado(): Cajon | undefined {
    return this.cajones.find(c => c.id === this.cajonSeleccionadoId);
  }

  get cajonesOcupados(): Cajon[] {
    return this.cajones.filter(c => c.estado === 'Ocupado');
  }

  get cajonesLibresCount(): number {
    return this.cajones.filter(c => c.estado === 'Libre').length;
  }

  get hayIngresosMensuales(): boolean {
    return this.tendenciaMensual.some(t => t.monto > 0);
  }

  get tiempoEstacionadoMin(): number {
    const cj = this.cajonSeleccionado;
    if (!cj?.horaEntrada) return 0;
    const [h, m] = cj.horaEntrada.split(':').map(Number);
    const entrada = new Date(this.tiempoAhora);
    entrada.setHours(h, m, 0, 0);
    return Math.max(0, Math.round((this.tiempoAhora.getTime() - entrada.getTime()) / 60000));
  }

  get tiempoTexto(): string {
    return this.formatTiempo(this.tiempoEstacionadoMin);
  }

  get montoCalculado(): number {
    const mins = this.tiempoEstacionadoMin;
    return Math.ceil(Math.max(1, Math.ceil(mins / 60))) * this.tarifaPorHora;
  }

  // ── Getter: pagos en espera de cobro en caja (iniciados desde la app) ─────
  get pagosPendientesCaja(): Pago[] {
    return this.pagos
      .filter(p => p.estado === 'PendienteCaja')
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  // ── Getters: estadísticas ────────────────────────────────────────────────
  get totalHoy(): number {
    const hoy = new Date().toISOString().slice(0, 10);
    return this.pagos
      .filter(p => p.fecha === hoy && p.estado === 'Completado')
      .reduce((s, p) => s + p.monto, 0);
  }

  get pagosHoy(): number {
    const hoy = new Date().toISOString().slice(0, 10);
    return this.pagos.filter(p => p.fecha === hoy && p.estado === 'Completado').length;
  }

  get promedioVisita(): number {
    const c = this.pagos.filter(p => p.estado === 'Completado');
    if (!c.length) return 0;
    return Math.round(c.reduce((s, p) => s + p.monto, 0) / c.length);
  }

  // ── Getters: historial filtrado ──────────────────────────────────────────
  get pagosFiltrados(): Pago[] {
    // Solo pagos completados en el historial, no los pendientes de caja
    let lista = this.pagos.filter(p => p.estado !== 'PendienteCaja');
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

    if (this.rangoSeleccionado === 'Últimos 7 días') {
      const lim = new Date(hoy); lim.setDate(lim.getDate() - 6);
      lista = lista.filter(p => p.timestamp >= lim.getTime());
    } else if (this.rangoSeleccionado === 'Últimos 30 días') {
      const lim = new Date(hoy); lim.setDate(lim.getDate() - 29);
      lista = lista.filter(p => p.timestamp >= lim.getTime());
    } else if (this.rangoSeleccionado === 'Este mes') {
      lista = lista.filter(p => {
        const d = new Date(p.timestamp);
        return d.getMonth() === hoy.getMonth() && d.getFullYear() === hoy.getFullYear();
      });
    } else if (this.rangoSeleccionado === 'Este año') {
      lista = lista.filter(p => new Date(p.timestamp).getFullYear() === hoy.getFullYear());
    }

    if (this.metodoSeleccionado !== 'Todos')
      lista = lista.filter(p => p.metodo === this.metodoSeleccionado);
    if (this.estadoSeleccionado !== 'Todos')
      lista = lista.filter(p => p.estado === this.estadoSeleccionado);

    return lista.sort((a, b) => b.timestamp - a.timestamp);
  }

  // ── Getters: Resumen de pagos filtrados para exportación ───────────────
  get totalFiltrado(): number {
    return this.pagosFiltrados.reduce((s, p) => s + p.monto, 0);
  }

  get promedioFiltrado(): number {
    const list = this.pagosFiltrados;
    if (!list.length) return 0;
    return Math.round(this.totalFiltrado / list.length);
  }

  get metodoMasUsadoFiltrado(): string {
    const counts: Record<string, number> = {};
    for (const p of this.pagosFiltrados) {
      counts[p.metodo] = (counts[p.metodo] || 0) + 1;
    }
    let top = 'N/A';
    let max = 0;
    for (const m in counts) {
      if (counts[m] > max) { max = counts[m]; top = m; }
    }
    return top;
  }

  // ── Exportación a Excel (.xlsx binario nativo con diseño completo) ─────────
  async exportarExcel(): Promise<void> {
    const data = this.pagosFiltrados;
    if (!data.length) return;

    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Reporte de Pagos', {
      views: [{ showGridLines: true }]
    });

    const hoy = new Date().toLocaleString('es-MX');

    // 1. Título principal de K'ÁAXPARK
    worksheet.mergeCells('A1:I1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = "REPORTE FINANCIERO DE HISTORIAL DE PAGOS - K'ÁAXPARK";
    titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFC9A227' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getRow(1).height = 32;

    // Subtítulo con fecha y parámetros
    worksheet.mergeCells('A2:I2');
    const subCell = worksheet.getCell('A2');
    subCell.value = `Fecha de Generación: ${hoy}  |  Rango: ${this.rangoSeleccionado}  |  Método: ${this.metodoSeleccionado}  |  Estado: ${this.estadoSeleccionado}`;
    subCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF555555' } };
    subCell.alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getRow(2).height = 20;

    // 2. Bloque KPI de Información Adicional Resumida
    worksheet.getCell('A4').value = 'INFORMACIÓN ADICIONAL RESUMIDA';
    worksheet.getCell('A4').font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF111111' } };

    const kpiTitles = ['Rango Filtrado', 'Total Recaudado', 'Operaciones', 'Ticket Promedio', 'Método Preferido'];
    const kpiValues = [
      this.rangoSeleccionado,
      `$${this.totalFiltrado.toLocaleString('es-MX')} MXN`,
      `${data.length} pagos`,
      `$${this.promedioFiltrado.toLocaleString('es-MX')} MXN`,
      this.metodoMasUsadoFiltrado
    ];

    const kpiHeaderRow = worksheet.getRow(5);
    kpiTitles.forEach((t, i) => {
      const cell = kpiHeaderRow.getCell(i + 1);
      cell.value = t;
      cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF333333' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
      };
    });
    kpiHeaderRow.height = 22;

    const kpiValRow = worksheet.getRow(6);
    kpiValues.forEach((v, i) => {
      const cell = kpiValRow.getCell(i + 1);
      cell.value = v;
      cell.font = {
        name: 'Calibri',
        size: i === 1 ? 12 : 11,
        bold: true,
        color: { argb: i === 1 ? 'FFC9A227' : 'FF111111' }
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
      };
    });
    kpiValRow.height = 26;

    // 3. Encabezados de Tabla de Datos
    const tableHeaders = ['Folio', 'Cajón', 'Placa', 'Hora Entrada', 'Hora Salida', 'Duración', 'Método', 'Monto', 'Estado'];
    const headerRow = worksheet.getRow(8);
    tableHeaders.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC9A227' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FFB38E1B' } },
        bottom: { style: 'medium', color: { argb: 'FFB38E1B' } }
      };
    });
    headerRow.height = 26;

    // 4. Filas de Datos de Registros
    let rIdx = 9;
    for (const p of data) {
      const row = worksheet.getRow(rIdx);
      const values = [
        p.folio || '',
        p.cajonDescripcion || '',
        p.placa || '—',
        p.horaEntrada || '',
        p.horaSalida || '',
        `${p.duracionMin || 0} min`,
        p.metodo || '',
        `$${(p.monto || 0).toLocaleString('es-MX')}`,
        p.estado || ''
      ];

      const isEven = rIdx % 2 === 0;
      const bgArgb = isEven ? 'FFFAFAFA' : 'FFFFFFFF';

      values.forEach((v, cIdx) => {
        const cell = row.getCell(cIdx + 1);
        cell.value = v;
        cell.font = {
          name: 'Calibri',
          size: 10,
          bold: cIdx === 7, // Monto en negrita
          color: {
            argb: cIdx === 8 ? (p.estado === 'Completado' ? 'FF2E7D32' : 'FFC0392B') : 'FF222222'
          }
        };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } };
        cell.alignment = {
          horizontal: cIdx === 7 ? 'right' : (cIdx === 1 ? 'left' : 'center'),
          vertical: 'middle'
        };
        cell.border = {
          bottom: { style: 'thin', color: { argb: 'FFEFEFEF' } }
        };
      });
      row.height = 21;
      rIdx++;
    }

    // Configurar anchos de columna explícitos
    worksheet.columns = [
      { width: 18 }, // Folio
      { width: 26 }, // Cajón
      { width: 14 }, // Placa
      { width: 15 }, // Entrada
      { width: 15 }, // Salida
      { width: 14 }, // Duración
      { width: 16 }, // Método
      { width: 16 }, // Monto
      { width: 16 }  // Estado
    ];

    // 5. Generar y descargar archivo XLSX binario con diseño OpenXML
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Reporte_Pagos_KaaxPark_${new Date().toISOString().slice(0, 10)}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // ── Exportación a PDF (Abre una ventana de reporte limpia e imprimible) ─────
  mostrarReportePdf = false;

  abrirReportePdf(): void {
    this.imprimirReporteDirectoPdf();
  }

  cerrarReportePdf(): void {
    this.mostrarReportePdf = false;
  }

  imprimirReportePdf(): void {
    this.imprimirReporteDirectoPdf();
  }

  private imprimirReporteDirectoPdf(): void {
    const data = this.pagosFiltrados;
    if (!data.length) return;

    const hoy = new Date().toLocaleString('es-MX');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Reporte Financiero K'áaxPark - PDF</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #111; margin: 0; padding: 15px; background: #ffffff; }
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
    .mono { font-family: Consolas, monospace; color: #555; }
    .monto { font-weight: 700; color: #111; }
    .badge-ok { color: #2e7d32; font-weight: 700; }
    .badge-pending { color: #c0392b; font-weight: 700; }

    .footer { margin-top: 20px; text-align: center; font-size: 9px; color: #aaa; border-top: 1px dashed #ddd; padding-top: 8px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <h2>K'ÁAXPARK</h2>
      <span>Sistema de Gestión e Inteligencia de Estacionamientos</span>
    </div>
    <div class="meta">
      <h3>Reporte Financiero de Pagos</h3>
      <span>Generado el: ${hoy}</span>
    </div>
  </div>

  <div class="kpi-container">
    <div class="kpi-card"><span>Rango Filtrado</span><strong>${this.rangoSeleccionado}</strong></div>
    <div class="kpi-card"><span>Total Recaudado</span><strong class="kpi-gold">$${this.totalFiltrado.toLocaleString('es-MX')} MXN</strong></div>
    <div class="kpi-card"><span>Total Operaciones</span><strong>${data.length} pagos</strong></div>
    <div class="kpi-card"><span>Ticket Promedio</span><strong>$${this.promedioFiltrado.toLocaleString('es-MX')} MXN</strong></div>
    <div class="kpi-card"><span>Método Preferido</span><strong>${this.metodoMasUsadoFiltrado}</strong></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Folio</th>
        <th>Cajón</th>
        <th>Placa</th>
        <th>Entrada</th>
        <th>Salida</th>
        <th>Duración</th>
        <th>Método</th>
        <th>Monto</th>
        <th>Estado</th>
      </tr>
    </thead>
    <tbody>
      ${data.map(p => `
        <tr>
          <td class="mono">${p.folio || ''}</td>
          <td>${p.cajonDescripcion || ''}</td>
          <td>${p.placa || '—'}</td>
          <td>${p.horaEntrada || ''}</td>
          <td>${p.horaSalida || ''}</td>
          <td>${p.duracionMin || 0} min</td>
          <td>${p.metodo || ''}</td>
          <td class="monto">$${(p.monto || 0).toLocaleString('es-MX')}</td>
          <td class="${p.estado === 'Completado' ? 'badge-ok' : 'badge-pending'}">${p.estado || ''}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="footer">
    K'áaxPark Parking System &copy; ${new Date().getFullYear()} — Control Financiero Oficial
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

  // ── Getters: gráfica tendencia mensual ──────────────────────────────────
  get tendenciaMensual(): { mes: string; mesCompleto: string; monto: number; cantidad: number }[] {
    const meses = [
      { corto: 'ENE', largo: 'Enero' },
      { corto: 'FEB', largo: 'Febrero' },
      { corto: 'MAR', largo: 'Marzo' },
      { corto: 'ABR', largo: 'Abril' },
      { corto: 'MAY', largo: 'Mayo' },
      { corto: 'JUN', largo: 'Junio' },
      { corto: 'JUL', largo: 'Julio' },
      { corto: 'AGO', largo: 'Agosto' },
      { corto: 'SEP', largo: 'Septiembre' },
      { corto: 'OCT', largo: 'Octubre' },
      { corto: 'NOV', largo: 'Noviembre' },
      { corto: 'DIC', largo: 'Diciembre' }
    ];
    const anio = this.tiempoAhora.getFullYear();
    return meses.map((m, idx) => {
      const pagosDelMes = this.pagos.filter(p => {
        const d = new Date(p.timestamp);
        return d.getFullYear() === anio && d.getMonth() === idx && p.estado === 'Completado';
      });
      return {
        mes: m.corto,
        mesCompleto: m.largo,
        monto: pagosDelMes.reduce((s, p) => s + p.monto, 0),
        cantidad: pagosDelMes.length
      };
    });
  }

  alturaBarra(monto: number): number {
    const max = Math.max(...this.tendenciaMensual.map(t => t.monto), 1);
    return (monto / max) * 100;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────
  constructor(
    private fb: FirebaseService,
    private robot: MqttRobotService,
    private authService: AuthService
  ) {}

  // ...

  async guardarTarifa(): Promise<void> {
    if (this.nuevaTarifa <= 0 || this.guardandoTarifa) return;
    if (this.nuevaTarifa === this.tarifaPorHora) { this.editandoTarifa = false; return; }
    this.guardandoTarifa = true;
    try {
      const user = this.authService.currentUser;
      const modificadoPor = user?.displayName || user?.email || 'Administrador';
      await this.fb.updateTarifa(this.nuevaTarifa, this.tarifaPorHora, modificadoPor);
      this.editandoTarifa = false;
    } catch (e) {
      console.error('Error al guardar tarifa:', e);
    } finally {
      this.guardandoTarifa = false;
    }
  }

  ngOnInit(): void {
    this.subs.push(
      this.fb.getCajones().subscribe(cj => { this.cajones = cj.filter(c => c.nivel !== 4); }),
      this.fb.getPagos().subscribe(p => { this.pagos = p; }),
      this.fb.getTarifa().subscribe({
        next: cfg => {
          if (cfg?.tarifaPorHora) {
            this.tarifaPorHora = cfg.tarifaPorHora;
            this.nuevaTarifa   = cfg.tarifaPorHora;
          }
        },
        error: () => { /* documento aún no existe, usa default 60 */ }
      }),
      this.fb.getHistorialTarifas().subscribe(h => { this.historialTarifas = h; })
    );
    this.tickInterval = setInterval(() => { this.tiempoAhora = new Date(); }, 60000);
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    if (this.tickInterval) clearInterval(this.tickInterval);
  }

  // ── Confirmar pago en caja (solicitud llegada desde la app móvil) ─────────
  async confirmarPagoCaja(pago: Pago): Promise<void> {
    if (!pago.id || this.confirmando) return;
    this.confirmando = true;

    try {
      const ahora = new Date();
      const horaSalida = ahora.toLocaleTimeString('es-MX', {
        hour: '2-digit', minute: '2-digit', hour12: false
      });
      const fecha = ahora.toISOString().slice(0, 10);

      // 1. Marcar el pago como Completado (la app móvil detecta este cambio
      //    mediante su listener en tiempo real y muestra "vehículo en camino").
      await this.fb.updatePago(pago.id, {
        estado: 'Completado',
        horaSalida,
        fecha,
        timestamp: ahora.getTime()
      });

      // 2. Finalizar la estancia (cajón a Libre, estancia a FINALIZADA).
      if (pago.estanciaId && pago.cajonId) {
        await this.fb.finalizarEstanciaAdmin(pago.estanciaId, pago.cajonId);
      }

      // 3. Ejecutar la secuencia de salida del motor para ese cajón.
      const cajon = this.cajones.find(c => c.id === pago.cajonId);
      if (cajon?.secuenciaSalidaId) {
        const pasos = await this.fb.fetchPasosSecuencia(cajon.secuenciaSalidaId);
        if (pasos.length > 0) {
          this.robot.ejecutarPasos(pasos).catch(() => {
            // Si el robot no responde, el admin lo puede activar manualmente
            // desde la página de Control de Motores.
          });
        }
      }

      // 4. Registrar actividad (mismo patrón que registrarPago).
      const actividad: any = {
        tipo: 'salida',
        descripcion: `${pago.cajonDescripcion} · Folio ${pago.folio}`,
        hora: horaSalida,
        fecha,
        timestamp: ahora.getTime(),
        placa: pago.placa || '',
        duracionMin: pago.duracionMin
      };
      await this.fb.addActividad(actividad);

    } catch (e) {
      console.error('Error al confirmar pago en caja:', e);
    } finally {
      this.confirmando = false;
    }
  }

  // ── Tarifa: edición ──────────────────────────────────────────────────────
  // ── Tarifa: edición ──────────────────────────────────────────────────────
  abrirEdicionTarifa(): void {
    this.nuevaTarifa    = this.tarifaPorHora;
    this.editandoTarifa = true;
  }

  cancelarEdicionTarifa(): void {
    this.editandoTarifa = false;
  }

  formatFecha(ts: number): string {
    return new Date(ts).toLocaleString('es-MX', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false
    });
  }

  // ── Helpers de visualización ──────────────────────────────────────────────
  displayCajon(cj: Cajon): string {
    const tiempo = this.tiempoTextoCajon(cj);
    const monto  = this.montoCajon(cj);
    const placa  = cj.placa ? ` · ${cj.placa}` : '';
    return `Nivel ${cj.nivel} · Cajón ${cj.numeroCajon}${placa} — ${tiempo} — $${monto}`;
  }

  tiempoTextoCajon(cj: Cajon): string {
    if (!cj.horaEntrada) return '—';
    const [h, m] = cj.horaEntrada.split(':').map(Number);
    const entrada = new Date(this.tiempoAhora);
    entrada.setHours(h, m, 0, 0);
    const mins = Math.max(0, Math.round((this.tiempoAhora.getTime() - entrada.getTime()) / 60000));
    return this.formatTiempo(mins);
  }

  montoCajon(cj: Cajon): number {
    if (!cj.horaEntrada) return this.tarifaPorHora;
    const [h, m] = cj.horaEntrada.split(':').map(Number);
    const entrada = new Date(this.tiempoAhora);
    entrada.setHours(h, m, 0, 0);
    const mins = Math.max(0, Math.round((this.tiempoAhora.getTime() - entrada.getTime()) / 60000));
    return Math.ceil(Math.max(1, Math.ceil(mins / 60))) * this.tarifaPorHora;
  }

  private formatTiempo(min: number): string {
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  // ── Acciones ─────────────────────────────────────────────────────────────
  async registrarPago(): Promise<void> {
    const cj = this.cajonSeleccionado;
    if (!cj?.id || this.procesando) return;
    this.procesando = true;
    try {
      const ahora      = new Date();
      const horaSalida = ahora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
      const fecha      = ahora.toISOString().slice(0, 10);
      const folio      = `KP-${fecha.replace(/-/g, '')}-${Math.random().toString(36).slice(-4).toUpperCase()}`;

      const pago: Pago = {
        folio,
        cajonId:          cj.id,
        cajonDescripcion: `Nivel ${cj.nivel} · Cajón ${cj.numeroCajon}`,
        placa:            cj.placa || '—',
        horaEntrada:      cj.horaEntrada || '—',
        horaSalida,
        duracionMin:      this.tiempoEstacionadoMin,
        monto:            this.montoCalculado,
        metodo:           this.metodoPago,
        estado:           'Completado',
        fecha,
        timestamp:        ahora.getTime()
      };

      await this.fb.addPago(pago);
      await this.fb.updateCajon(cj.id, { estado: 'Libre', horaEntrada: '', placa: '' });

      const actividad: any = {
        tipo:        'salida',
        descripcion: `${pago.cajonDescripcion} · Folio ${folio}`,
        hora:        horaSalida,
        fecha,
        timestamp:   ahora.getTime(),
        placa:       cj.placa || '',
        duracionMin: this.tiempoEstacionadoMin
      };
      await this.fb.addActividad(actividad);

      this.ticketPago          = pago;
      this.mostrarTicket       = true;
      this.cajonSeleccionadoId = '';
      this.metodoPago          = 'Efectivo';
    } catch (e) {
      console.error('Error al registrar pago:', e);
    } finally {
      this.procesando = false;
    }
  }

  reimprimirTicket(pago: Pago): void {
    this.ticketPago    = pago;
    this.mostrarTicket = true;
  }

  imprimirTicket(): void {
    if (this.ticketPago) {
      this.imprimirTicketDirecto(this.ticketPago);
    } else {
      window.print();
    }
  }

  cerrarTicket(): void {
    this.mostrarTicket = false;
    this.ticketPago    = null;
  }

  private imprimirTicketDirecto(pago: Pago): void {
    if (!pago) return;

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Ticket ${pago.folio}</title>
  <style>
    @page { size: 80mm 150mm; margin: 5mm; }
    body { font-family: 'Courier New', Courier, monospace; color: #000; margin: 0; padding: 10px; font-size: 11px; text-align: center; }
    .title { font-size: 16px; font-weight: bold; margin-bottom: 2px; }
    .sub { font-size: 10px; border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 8px; }
    .folio { font-size: 12px; font-weight: bold; margin-bottom: 8px; }
    .row { display: flex; justify-content: space-between; margin-bottom: 4px; text-align: left; }
    .row span { color: #444; }
    .total { border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 8px 0; margin: 10px 0; font-size: 14px; font-weight: bold; display: flex; justify-content: space-between; }
    .footer { font-size: 9px; margin-top: 10px; color: #555; }
  </style>
</head>
<body>
  <div class="title">K'ÁAXPARK</div>
  <div class="sub">Sistema de Estacionamiento</div>
  <div class="folio">FOLIO: ${pago.folio}</div>

  <div class="row"><span>Cajón:</span><strong>${pago.cajonDescripcion}</strong></div>
  ${pago.placa && pago.placa !== '—' ? `<div class="row"><span>Placa:</span><strong>${pago.placa}</strong></div>` : ''}
  <div class="row"><span>Fecha:</span><strong>${pago.fecha}</strong></div>
  <div class="row"><span>Entrada:</span><strong>${pago.horaEntrada}</strong></div>
  <div class="row"><span>Salida:</span><strong>${pago.horaSalida || '—'}</strong></div>
  <div class="row"><span>Duración:</span><strong>${pago.duracionMin || 0} min</strong></div>
  <div class="row"><span>Método:</span><strong>${pago.metodo}</strong></div>

  <div class="total">
    <span>TOTAL:</span>
    <span>$${pago.monto} MXN</span>
  </div>

  <div class="footer">
    ¡Gracias por su visita!<br>
    Conserve este comprobante
  </div>
</body>
</html>`;

    let iframe = document.getElementById('ticket-print-iframe') as HTMLIFrameElement;
    if (iframe && iframe.parentNode) {
      iframe.parentNode.removeChild(iframe);
    }

    iframe = document.createElement('iframe');
    iframe.id = 'ticket-print-iframe';
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
          console.error('Error al imprimir ticket:', err);
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