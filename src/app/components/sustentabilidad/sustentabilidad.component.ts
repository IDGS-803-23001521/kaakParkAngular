import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { FirebaseService } from '../../services/firebase.service';
import { SustentabilidadData } from '../../models/kaakpark.models';
import { Subscription } from 'rxjs';

declare const Chart: any;

@Component({
  standalone: false, selector: 'app-sustentabilidad', templateUrl: './sustentabilidad.component.html' })
export class SustentabilidadComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('donutAguaCanvas')   donutAguaCanvas!: ElementRef;
  @ViewChild('donutSolarCanvas')  donutSolarCanvas!: ElementRef;
  @ViewChild('lineSolarCanvas')   lineSolarCanvas!: ElementRef;
  @ViewChild('barCisternaCanvas') barCisternaCanvas!: ElementRef;

  data: SustentabilidadData = {
    energiaGeneradaKwh: 0, aguaCaptadaLitros: 0, aguaUsadaRiego: 0,
    porcentajeSolar: 0, nivelTanque: 0, capacidadCisternaLitros: 4,
    bombaAgua: false, alertas: []
  };

  get CISTERNA_CAPACIDAD_LITROS(): number {
    return this.data.capacidadCisternaLitros ?? 4;
  }

  private subs: Subscription[] = [];
  private chartsReady = false;
  private chartAgua: any = null;
  private chartSolar: any = null;
  private chartLineSolar: any = null;
  private chartCisterna: any = null;

  constructor(private fb: FirebaseService) {}

  get aguaPluvialPorcentaje(): number {
    if (!this.data.aguaCaptadaLitros) return 0;
    return Math.round((this.data.aguaUsadaRiego / this.data.aguaCaptadaLitros) * 100);
  }

  get nivelTanqueLitros(): number {
    return Math.round((this.data.nivelTanque / 100) * this.CISTERNA_CAPACIDAD_LITROS * 100) / 100;
  }

  get aguaDisponibleLitros(): number {
    return Math.max(0, this.data.aguaCaptadaLitros - this.data.aguaUsadaRiego);
  }

  async ngOnInit(): Promise<void> {
    await this.fb.seedSustentabilidadIfEmpty();
    const sub = this.fb.getSustentabilidad().subscribe(d => {
      if (d) { this.data = d; this.updateCharts(); }
    });
    this.subs.push(sub);
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.initCharts();
      this.chartsReady = true;
      this.updateCharts();
    }, 100);
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    [this.chartAgua, this.chartSolar, this.chartLineSolar, this.chartCisterna].forEach(c => c?.destroy());
  }

  async toggleBomba(estado: boolean): Promise<void> {
    this.data = { ...this.data, bombaAgua: estado };
    await this.fb.updateSustentabilidad({ bombaAgua: estado });
  }

  private initCharts(): void {
    this.chartAgua = new Chart(this.donutAguaCanvas.nativeElement, {
      type: 'doughnut',
      data: { datasets: [{ data: [this.data.aguaUsadaRiego, Math.max(0, this.data.aguaCaptadaLitros - this.data.aguaUsadaRiego)], backgroundColor: ['#0c141a', '#ccc'], borderWidth: 0 }] },
      options: { responsive: false, cutout: '60%', plugins: { legend: { display: false }, tooltip: { enabled: false } } },
      plugins: [{ id: 'ca', beforeDraw: (c: any) => {
        const { width, height, ctx } = c; ctx.save(); ctx.font = 'bold 13px Segoe UI'; ctx.fillStyle = '#333'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(`${this.aguaPluvialPorcentaje}%`, width / 2, height / 2); ctx.restore();
      } }]
    });

    this.chartSolar = new Chart(this.donutSolarCanvas.nativeElement, {
      type: 'doughnut',
      data: { datasets: [{ data: [this.data.porcentajeSolar, Math.max(0, 100 - this.data.porcentajeSolar)], backgroundColor: ['#C9A227', '#ccc'], borderWidth: 0 }] },
      options: { responsive: false, cutout: '60%', plugins: { legend: { display: false }, tooltip: { enabled: false } } },
      plugins: [{ id: 'cs', beforeDraw: (c: any) => {
        const { width, height, ctx } = c; ctx.save(); ctx.font = 'bold 13px Segoe UI'; ctx.fillStyle = '#333'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(`${this.data.porcentajeSolar}%`, width / 2, height / 2); ctx.restore();
      } }]
    });

    this.chartLineSolar = new Chart(this.lineSolarCanvas.nativeElement, {
      type: 'line',
      data: {
        labels: ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'],
        datasets: [
          { label: 'Solar', data: [3.2,4.1,3.8,4.7,3.9,2.1,1.5], borderColor: '#C9A227', backgroundColor: 'rgba(201,162,39,0.1)', tension: 0.4, fill: true, pointRadius: 4 },
          { label: 'Red',   data: [1.5,1.2,1.8,0.9,1.3,2.5,3.1], borderColor: '#0c141a', backgroundColor: 'rgba(66,165,245,0.1)',  tension: 0.4, fill: true, pointRadius: 4 }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { grid: { color: '#eee' }, ticks: { font: { size: 10 } } }, x: { grid: { color: '#eee' }, ticks: { font: { size: 10 } } } }, plugins: { legend: { labels: { font: { size: 10 }, boxWidth: 20 } } } }
    });

    this.chartCisterna = new Chart(this.barCisternaCanvas.nativeElement, {
      type: 'bar',
      data: {
        labels: ['Cisterna'],
        datasets: [{ data: [this.data.nivelTanque], backgroundColor: '#2D9CDB', borderRadius: 8, borderWidth: 0, barThickness: 70 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: {
          y: { min: 0, max: 100, ticks: { stepSize: 25, callback: (v: number) => v + '%', font: { size: 10 } }, grid: { color: '#eee' } },
          x: { grid: { display: false }, ticks: { font: { size: 10 } } }
        }
      }
    });
  }

  private updateCharts(): void {
    if (!this.chartsReady) return;
    this.chartAgua.data.datasets[0].data = [this.data.aguaUsadaRiego, Math.max(0, this.data.aguaCaptadaLitros - this.data.aguaUsadaRiego)];
    this.chartAgua.update();
    this.chartSolar.data.datasets[0].data = [this.data.porcentajeSolar, Math.max(0, 100 - this.data.porcentajeSolar)];
    this.chartSolar.update();
    this.chartCisterna.data.datasets[0].data = [this.data.nivelTanque];
    this.chartCisterna.update();
  }

  // ── Exportación a Excel (.xlsx nativo) ──────────────────────────────────
  async exportarExcel(): Promise<void> {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sustentabilidad', { views: [{ showGridLines: true }] });

    const hoy = new Date().toLocaleString('es-MX');

    // 1. Título
    worksheet.mergeCells('A1:D1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = `K'ÁAXPARK — INFORME DE SUSTENTABILIDAD E IMPACTO AMBIENTAL (ESG)`;
    titleCell.font = { name: 'Calibri', size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E7E34' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getRow(1).height = 36;

    // 2. Metadatos
    worksheet.getCell('A3').value = `Fecha del informe: ${hoy}`;
    worksheet.getCell('A3').font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF666666' } };

    // 3. Tabla de Indicadores Clave (KPIs)
    worksheet.mergeCells('A5:D5');
    const sec1 = worksheet.getCell('A5');
    sec1.value = 'MÉTRICAS ECOLÓGICAS Y EFICIENCIA ENERGÉTICA';
    sec1.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    sec1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC9A227' } };
    sec1.alignment = { horizontal: 'left', vertical: 'middle' };

    const kpis = [
      ['Nivel Actual de Cisterna', `${this.data.nivelTanque}%`, `${this.nivelTanqueLitros} L de ${this.CISTERNA_CAPACIDAD_LITROS} L`, 'Gestión hídrica'],
      ['Energía Solar Generada', `${this.data.energiaGeneradaKwh} kWh`, `Aporte solar: ${this.data.porcentajeSolar}% de la red`, 'Eficiencia limpia'],
      ['Agua Pluvial Captada', `${this.data.aguaCaptadaLitros} L`, `Usada en riego: ${this.data.aguaUsadaRiego} L`, 'Reciclaje de agua'],
      ['Agua Disponible', `${this.aguaDisponibleLitros} L`, `${this.aguaPluvialPorcentaje}% de uso`, 'Reserva de riego'],
      ['Bomba de Agua Pluvial', this.data.bombaAgua ? 'ENCENDIDA' : 'APAGADA', 'Automatización de riego', 'Sistemas']
    ];

    const headers = ['Indicador Ambiental', 'Valor Actual', 'Detalle / Capacidad', 'Categoría'];
    const hRow = worksheet.getRow(6);
    headers.forEach((h, i) => {
      const cell = hRow.getCell(i + 1);
      cell.value = h;
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF333333' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
    });

    let rIdx = 7;
    for (const k of kpis) {
      const row = worksheet.getRow(rIdx);
      row.getCell(1).value = k[0];
      row.getCell(2).value = k[1];
      row.getCell(3).value = k[2];
      row.getCell(4).value = k[3];
      for (let col = 1; col <= 4; col++) {
        const cell = row.getCell(col);
        cell.font = { name: 'Calibri', size: 10 };
        cell.border = { bottom: { style: 'thin', color: { argb: 'FFEFEFEF' } } };
      }
      rIdx++;
    }

    worksheet.columns = [
      { width: 28 },
      { width: 18 },
      { width: 32 },
      { width: 20 }
    ];

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Reporte_Sustentabilidad_KaaxPark_${new Date().toISOString().slice(0, 10)}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // ── Exportación a PDF (Informe Ejecutivo ESG) ─────────────────────────────
  abrirReportePdf(): void {
    const hoy = new Date().toLocaleString('es-MX');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Informe de Sustentabilidad ESG K'áaxPark - PDF</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #111; margin: 0; padding: 15px; background: #fff; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #1e7e34; padding-bottom: 10px; margin-bottom: 15px; }
    .brand h2 { margin: 0; color: #1e7e34; font-size: 22px; font-weight: 800; }
    .brand span { font-size: 11px; color: #555; }
    .meta { text-align: right; }
    .meta h3 { margin: 0; font-size: 14px; color: #111; text-transform: uppercase; }
    .meta span { font-size: 11px; color: #777; }
    
    .kpi-container { display: flex; gap: 10px; margin-bottom: 15px; background: #f4f9f4; border: 1px solid #c3e6cb; border-radius: 8px; padding: 12px; }
    .kpi-card { flex: 1; text-align: center; }
    .kpi-card span { display: block; font-size: 9px; color: #555; text-transform: uppercase; font-weight: 700; margin-bottom: 2px; }
    .kpi-card strong { font-size: 16px; color: #111; font-weight: 800; }
    .kpi-green { color: #1e7e34 !important; }
    .kpi-gold { color: #C9A227 !important; }

    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th { background: #1e7e34; color: #ffffff; font-size: 10px; font-weight: 700; text-transform: uppercase; padding: 8px 6px; text-align: center; }
    td { padding: 8px 10px; font-size: 10px; border-bottom: 1px solid #eee; text-align: center; color: #222; }
    tr:nth-child(even) td { background: #fcfcfc; }
    .left { text-align: left; }
    .badge-ok { color: #1e7e34; font-weight: 700; }
    .footer { margin-top: 25px; text-align: center; font-size: 9px; color: #aaa; border-top: 1px dashed #ddd; padding-top: 8px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <h2>🌱 K'ÁAXPARK SUSTENTABLE</h2>
      <span>Informe de Responsabilidad Social e Impacto Ambiental (ESG)</span>
    </div>
    <div class="meta">
      <h3>Certificado de Eficiencia Ecológica</h3>
      <span>Generado el: ${hoy}</span>
    </div>
  </div>

  <div class="kpi-container">
    <div class="kpi-card"><span>Nivel Cisterna</span><strong class="kpi-green">${this.data.nivelTanque}%</strong></div>
    <div class="kpi-card"><span>Energía Solar</span><strong class="kpi-gold">${this.data.energiaGeneradaKwh} kWh</strong></div>
    <div class="kpi-card"><span>Aporte a la Red</span><strong>${this.data.porcentajeSolar}% limpio</strong></div>
    <div class="kpi-card"><span>Agua Pluvial Captada</span><strong class="kpi-green">${this.data.aguaCaptadaLitros} L</strong></div>
    <div class="kpi-card"><span>Bomba Riego</span><strong>${this.data.bombaAgua ? 'ENCENDIDA' : 'APAGADA'}</strong></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Indicador Ambiental</th>
        <th>Valor Medido</th>
        <th>Capacidad / Detalle Operativo</th>
        <th>Estado</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="left"><strong>Nivel de Cisterna Pluvial</strong></td>
        <td>${this.data.nivelTanque}%</td>
        <td>${this.nivelTanqueLitros} L de ${this.CISTERNA_CAPACIDAD_LITROS} L de capacidad total</td>
        <td class="badge-ok">Óptimo</td>
      </tr>
      <tr>
        <td class="left"><strong>Generación Solar Fotovoltaica</strong></td>
        <td>${this.data.energiaGeneradaKwh} kWh</td>
        <td>Aporte solar cubre el ${this.data.porcentajeSolar}% de la demanda del parque</td>
        <td class="badge-ok">Operativo</td>
      </tr>
      <tr>
        <td class="left"><strong>Captación y Reciclaje de Agua</strong></td>
        <td>${this.data.aguaCaptadaLitros} L</td>
        <td>Agua reutilizada en riego: ${this.data.aguaUsadaRiego} L (${this.aguaPluvialPorcentaje}%)</td>
        <td class="badge-ok">Sostenible</td>
      </tr>
      <tr>
        <td class="left"><strong>Reserva de Agua Disponible</strong></td>
        <td>${this.aguaDisponibleLitros} L</td>
        <td>Almacenamiento disponible para áreas verdes</td>
        <td class="badge-ok">Disponible</td>
      </tr>
    </tbody>
  </table>

  <div class="footer">
    K'áaxPark Parking System &copy; ${new Date().getFullYear()} — Control de Gestión Ecológica e Impacto Ambiental
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
