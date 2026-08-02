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

  // ── Exportación a Excel (.xlsx nativo) ──────────────────────────────────
  async exportarExcel(): Promise<void> {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Horarios', { views: [{ showGridLines: true }] });

    const hoy = new Date().toLocaleString('es-MX');

    // 1. Título principal
    worksheet.mergeCells('A1:D1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = `K'ÁAXPARK — HORARIOS DE OPERACIÓN Y DÍAS ESPECIALES`;
    titleCell.font = { name: 'Calibri', size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC9A227' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getRow(1).height = 36;

    // 2. Metadatos
    worksheet.getCell('A3').value = `Fecha del informe: ${hoy}`;
    worksheet.getCell('A3').font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF666666' } };

    // 3. Sección 1: Horarios Regulares
    worksheet.mergeCells('A5:D5');
    const sec1 = worksheet.getCell('A5');
    sec1.value = 'HORARIO REGULAR DE ATENCIÓN SEMANAL';
    sec1.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    sec1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A1E' } };

    const headers1 = ['Día de la Semana', 'Estatus', 'Hora de Apertura', 'Hora de Cierre'];
    const hRow1 = worksheet.getRow(6);
    headers1.forEach((h, i) => {
      const cell = hRow1.getCell(i + 1);
      cell.value = h;
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF333333' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
    });

    let rIdx = 7;
    for (const d of this.dias) {
      const row = worksheet.getRow(rIdx);
      row.getCell(1).value = d.nombre;
      row.getCell(2).value = d.abierto ? 'Abierto' : 'Cerrado';
      row.getCell(3).value = d.abierto ? d.apertura : '—';
      row.getCell(4).value = d.abierto ? d.cierre : '—';
      for (let col = 1; col <= 4; col++) {
        const cell = row.getCell(col);
        cell.font = { name: 'Calibri', size: 10 };
        cell.alignment = { horizontal: col === 1 ? 'left' : 'center', vertical: 'middle' };
        cell.border = { bottom: { style: 'thin', color: { argb: 'FFEFEFEF' } } };
      }
      rIdx++;
    }

    // 4. Sección 2: Días Especiales / Festivos
    rIdx += 2;
    worksheet.mergeCells(`A${rIdx}:D${rIdx}`);
    const sec2 = worksheet.getCell(`A${rIdx}`);
    sec2.value = 'CALENDARIO DE DÍAS ESPECIALES Y FESTIVOS';
    sec2.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    sec2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A1E' } };

    rIdx++;
    const headers2 = ['Fecha (YYYY-MM-DD)', 'Motivo / Festividad', 'Estatus Servicio', 'Tipo'];
    const hRow2 = worksheet.getRow(rIdx);
    headers2.forEach((h, i) => {
      const cell = hRow2.getCell(i + 1);
      cell.value = h;
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF333333' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
    });

    rIdx++;
    if (this.especiales.length === 0) {
      const row = worksheet.getRow(rIdx);
      row.getCell(1).value = 'Sin días especiales registrados';
      rIdx++;
    } else {
      for (const e of this.especiales) {
        const row = worksheet.getRow(rIdx);
        row.getCell(1).value = e.fecha || '—';
        row.getCell(2).value = e.etiqueta || 'Día Especial';
        row.getCell(3).value = (!e.apertura && !e.cierre) ? 'Cerrado todo el día' : `${e.apertura || '00:00'} a ${e.cierre || '00:00'}`;
        row.getCell(4).value = 'Festivo / Excepción';
        for (let col = 1; col <= 4; col++) {
          const cell = row.getCell(col);
          cell.font = { name: 'Calibri', size: 10 };
          cell.border = { bottom: { style: 'thin', color: { argb: 'FFEFEFEF' } } };
        }
        rIdx++;
      }
    }

    worksheet.columns = [
      { width: 25 },
      { width: 30 },
      { width: 25 },
      { width: 25 }
    ];

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Reporte_Horarios_KaaxPark_${new Date().toISOString().slice(0, 10)}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // ── Exportación a PDF (Ficha Imprimible) ──────────────────────────────────
  abrirReportePdf(): void {
    const hoy = new Date().toLocaleString('es-MX');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Horarios de Operación K'áaxPark - PDF</title>
  <style>
    @page { size: A4 portrait; margin: 15mm; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #111; margin: 0; padding: 15px; background: #fff; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #C9A227; padding-bottom: 10px; margin-bottom: 15px; }
    .brand h2 { margin: 0; color: #C9A227; font-size: 22px; font-weight: 800; }
    .brand span { font-size: 11px; color: #777; }
    .meta { text-align: right; }
    .meta h3 { margin: 0; font-size: 14px; color: #111; text-transform: uppercase; }
    .meta span { font-size: 11px; color: #777; }

    .sec-title { font-size: 12px; font-weight: 700; color: #C9A227; text-transform: uppercase; margin-top: 15px; margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 4px; }

    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th { background: #1A1A1E; color: #ffffff; font-size: 10px; font-weight: 700; text-transform: uppercase; padding: 8px 6px; text-align: center; }
    td { padding: 8px 10px; font-size: 11px; border-bottom: 1px solid #eee; text-align: center; color: #222; }
    tr:nth-child(even) td { background: #fcfcfc; }
    .left { text-align: left; }
    .badge-ok { color: #2e7d32; font-weight: 700; }
    .badge-off { color: #c0392b; font-weight: 700; }
    .footer { margin-top: 30px; text-align: center; font-size: 9px; color: #aaa; border-top: 1px dashed #ddd; padding-top: 8px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <h2>K'ÁAXPARK</h2>
      <span>Horarios de Atención y Calendario Oficial</span>
    </div>
    <div class="meta">
      <h3>Ficha Informativa de Servicio</h3>
      <span>Generado el: ${hoy}</span>
    </div>
  </div>

  <div class="sec-title">1. Horario Regular de Operación</div>
  <table>
    <thead>
      <tr>
        <th>Día de la Semana</th>
        <th>Estatus</th>
        <th>Horario de Servicio</th>
      </tr>
    </thead>
    <tbody>
      ${this.dias.map(d => `
        <tr>
          <td class="left"><strong>${d.nombre}</strong></td>
          <td class="${d.abierto ? 'badge-ok' : 'badge-off'}">${d.abierto ? 'ABIERTO' : 'CERRADO'}</td>
          <td>${d.abierto ? `${d.apertura} hrs – ${d.cierre} hrs` : 'Sin servicio'}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="sec-title">2. Calendario de Días Festivos y Excepciones</div>
  <table>
    <thead>
      <tr>
        <th>Fecha</th>
        <th>Motivo / Evento</th>
        <th>Estatus de Atención</th>
      </tr>
    </thead>
    <tbody>
      ${this.especiales.length === 0 ? `<tr><td colspan="3" style="color:#aaa;">Sin días festivos programados</td></tr>` : ''}
      ${this.especiales.map((e: DiaEspecial) => `
        <tr>
          <td><strong>${e.fecha}</strong></td>
          <td class="left">${e.etiqueta || 'Día Especial'}</td>
          <td class="${(e.apertura || e.cierre) ? 'badge-ok' : 'badge-off'}">${(e.apertura || e.cierre) ? `${e.apertura || '00:00'} - ${e.cierre || '00:00'} hrs` : 'Cerrado todo el día'}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="footer">
    K'áaxPark Parking System &copy; ${new Date().getFullYear()} — Información de Horarios
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
