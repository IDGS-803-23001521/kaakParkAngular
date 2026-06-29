import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';
import { FirebaseService } from '../../services/firebase.service';
import { MqttRobotService, PasoSecuencia, Secuencia } from '../../services/mqtt-robot.service';

@Component({
  standalone: false,
  selector: 'app-control-motores',
  templateUrl: './control-motores.component.html'
  // Sin styleUrls: los estilos de esta página viven en tu hoja global (styles.css).
})
export class ControlMotoresComponent implements OnInit, OnDestroy {
  // URL del broker MQTT local (WebSocket). Ajusta la IP a la de tu PC.
  brokerUrl = localStorage.getItem('mqtt-broker-url') || 'ws://192.168.1.10:9001';

  // Getters en vez de campos normales: con useDefineForClassFields,
  // un campo normal se inicializa ANTES de que el constructor asigne
  // this.robot, y truena. El getter se evalúa después, ya con this.robot listo.
  get conexion$() {
    return this.robot.conexion$;
  }

  get estado$() {
    return this.robot.estado$;
  }

  get ocupado(): boolean {
    return !!this.robot.estado$.value?.ejecutando;
  }

  // Steppers
  p1Pasos = 100; p1Vel = 1000;
  p2Pasos = 100; p2Vel = 1000;

  // Motores DC
  dcVel: Record<string, number> = { M1: 0, M2: 0, M3: 0, M4: 0 };
  motoresDc = ['M1', 'M2', 'M3', 'M4'];

  // Acciones especiales (no pertenecen a un motor en particular)
  esperarMs = 1000;

  // Constructor de secuencias
  pasos: PasoSecuencia[] = [];
  nombreSecuencia = '';
  editandoId: string | null = null;

  // Firebase es la fuente de verdad — esta lista viene de un listener en vivo
  secuenciasFirebase: Secuencia[] = [];
  cargandoSecuencias = true;

  toastMsg = '';
  toastTipo: 'ok' | 'err' | 'info' = 'info';
  toastVisible = false;
  private toastTimer: any;
  private ultimoOnline = false;
  private subs: Subscription[] = [];

  constructor(private robot: MqttRobotService, private fb: FirebaseService) {}

  ngOnInit(): void {
    this.subs.push(
      combineLatest([this.fb.getSecuencias(), this.robot.estado$]).pipe(
        map(([secs, estado]) => ({ secs: (secs || []).filter(s => !s.eliminado), online: !!estado?.online }))
      ).subscribe(({ secs, online }) => {
        this.secuenciasFirebase = secs;
        this.cargandoSecuencias = false;
        console.log('[secuencias] Firebase emitió', secs.length, 'secuencia(s):', secs);
        // Si el ESP32 acaba de pasar de desconectado a en línea, le mandamos
        // todo lo que diga Firebase para refrescar su copia local en NVS.
        if (online && !this.ultimoOnline) this.sincronizarConESP32(secs);
        this.ultimoOnline = online;
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  conectar(): void {
    const url = this.brokerUrl.trim();
    if (!url) return;
    localStorage.setItem('mqtt-broker-url', url);
    this.robot.conectar(url);
  }

  private async sincronizarConESP32(secs: Secuencia[]): Promise<void> {
    for (const s of secs) {
      try { await this.robot.guardarSecuencia(s.nombre, s.pasos); } catch { /* se reintenta en la próxima reconexión */ }
    }
  }

  // ---- Control manual ----------------------------------------------
  async enviarComando(motor: 'P1' | 'P2'): Promise<void> {
    const pasos = motor === 'P1' ? this.p1Pasos : this.p2Pasos;
    const vel = motor === 'P1' ? this.p1Vel : this.p2Vel;
    try {
      await this.robot.comando(motor, pasos, vel);
      this.toast(`${motor}: ${pasos} pasos`, 'ok');
    } catch (e: any) {
      this.toast(e?.message === 'ocupado' ? 'El robot está ocupado con otra acción, espera' : 'Error de comunicación', 'err');
    }
  }

  async enviarDC(motor: string): Promise<void> {
    try {
      await this.robot.comando(motor, this.dcVel[motor]);
      this.toast(`${motor}: velocidad ${this.dcVel[motor]}`, 'ok');
    } catch (e: any) {
      this.toast(e?.message === 'ocupado' ? 'El robot está ocupado con otra acción, espera' : 'Error de comunicación', 'err');
    }
  }

  async pararTodo(): Promise<void> {
    try {
      await this.robot.parar();
      this.motoresDc.forEach(m => (this.dcVel[m] = 0));
      this.toast('Motores DC detenidos', 'info');
    } catch {
      this.toast('Error de comunicación', 'err');
    }
  }

  // ---- Constructor de secuencias: agregar directo desde cada tarjeta ----
  agregarDesdeMotor(motor: 'P1' | 'P2'): void {
    const valor = motor === 'P1' ? this.p1Pasos : this.p2Pasos;
    const velocidad = motor === 'P1' ? this.p1Vel : this.p2Vel;
    this.pasos.push({ tipo: motor, valor, velocidad });
    console.log('[pasos] agregado', motor, '-> lista actual:', this.pasos);
    this.toast(`${motor} agregado a la secuencia`, 'info');
  }

  agregarDC(motor: string): void {
    this.pasos.push({ tipo: motor, valor: this.dcVel[motor] });
    console.log('[pasos] agregado', motor, '-> lista actual:', this.pasos);
    this.toast(`${motor} agregado a la secuencia`, 'info');
  }

  agregarEsperar(): void {
    this.pasos.push({ tipo: 'ESPERAR', valor: this.esperarMs });
    this.toast('Espera agregada', 'info');
  }

  agregarPararDc(): void {
    this.pasos.push({ tipo: 'PARAR_DC', valor: 0 });
    this.toast('Parar DC agregado', 'info');
  }

  borrarPaso(i: number): void {
    this.pasos.splice(i, 1);
  }

  moverPaso(i: number, dir: number): void {
    const j = i + dir;
    if (j < 0 || j >= this.pasos.length) return;
    [this.pasos[i], this.pasos[j]] = [this.pasos[j], this.pasos[i]];
  }

  limpiarSecuencia(): void {
    this.pasos = [];
    this.nombreSecuencia = '';
    this.editandoId = null;
  }

  descripcionPaso(p: PasoSecuencia): string {
    if (p.tipo === 'PARAR_DC') return 'Parar motores DC';
    if (p.tipo.startsWith('P')) return `${p.valor} pasos (${p.velocidad}µs)`;
    if (p.tipo === 'ESPERAR') return `${p.valor} ms`;
    return `velocidad ${p.valor}`;
  }

  // ---- Guardar: siempre en Firebase; en el ESP32 solo si está en línea ----
  async guardarSecuencia(): Promise<void> {
    const nombre = this.nombreSecuencia.trim();
    if (!nombre) { this.toast('Escribe un nombre para la secuencia', 'err'); return; }
    if (this.pasos.length === 0) { this.toast('La secuencia está vacía', 'err'); return; }

    const pasosACopiar = [...this.pasos];
    console.log('[guardar] enviando a Firebase:', { nombre, pasos: pasosACopiar });

    try {
      if (this.editandoId) {
        await this.fb.updateSecuencia(this.editandoId, { nombre, pasos: pasosACopiar });
      } else {
        await this.fb.addSecuencia({ nombre, pasos: pasosACopiar, eliminado: false });
      }
      this.toast(`"${nombre}" guardada en Firebase`, 'ok');
      this.limpiarSecuencia();

      if (this.robot.estado$.value?.online) {
        this.robot.guardarSecuencia(nombre, pasosACopiar).catch(() => {});
      }
    } catch (e) {
      console.error('[guardar] ERROR al escribir en Firebase:', e);
      this.toast('Error al guardar en Firebase', 'err');
    }
  }

  editarSecuencia(s: Secuencia): void {
    this.editandoId = s.id || null;
    this.nombreSecuencia = s.nombre;
    this.pasos = JSON.parse(JSON.stringify(s.pasos || []));
    this.toast(`Editando "${s.nombre}"`, 'info');
  }

  async eliminarSecuencia(s: Secuencia): Promise<void> {
    if (!s.id) return;
    if (!confirm(`¿Eliminar la secuencia "${s.nombre}"?`)) return;
    try {
      await this.fb.updateSecuencia(s.id, { eliminado: true });
      this.toast(`"${s.nombre}" eliminada`, 'ok');
      if (this.robot.estado$.value?.online) this.robot.eliminarSecuencia(s.nombre).catch(() => {});
    } catch {
      this.toast('Error al eliminar', 'err');
    }
  }

  // ---- Ejecutar: siempre manda lo que diga Firebase en este momento ----
  async ejecutarSecuencia(s: Secuencia): Promise<void> {
    try {
      this.toast(`Ejecutando "${s.nombre}"…`, 'info');
      await this.robot.ejecutarPasos(s.pasos);
    } catch (e: any) {
      this.toast(e?.message === 'ocupado' ? 'El robot está ocupado con otra acción, espera' : 'Error al ejecutar — ¿está conectado el robot?', 'err');
    }
  }

  private toast(msg: string, tipo: 'ok' | 'err' | 'info'): void {
    this.toastMsg = msg;
    this.toastTipo = tipo;
    this.toastVisible = true;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toastVisible = false), 2800);
  }
}