import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

// mqtt.js se carga como script global en index.html (ver instrucciones).
// Esto evita problemas de bundling de Node (stream/buffer) con Angular.
declare const mqtt: any;

export interface EstadoRobot {
  online: boolean;
  ejecutando: boolean;
  dc: number[];
}

export interface PasoSecuencia {
  tipo: string;
  valor: number;
  velocidad?: number;
}

export interface Secuencia {
  id?: string;
  nombre: string;
  pasos: PasoSecuencia[];
  eliminado?: boolean;
}

export type EstadoConexion = 'desconectado' | 'conectando' | 'conectado' | 'error';

const TOPIC_ESTADO = 'robot1/estado';
const TOPIC_REQUEST = 'robot1/rpc/request';
const TOPIC_RESPONSE = 'robot1/rpc/response';

// Deben coincidir con las credenciales creadas con mosquitto_passwd
const MQTT_USER = 'motorctl';
const MQTT_PASS = '1234';

@Injectable({ providedIn: 'root' })
export class MqttRobotService {
  private client: any = null;
  private pendientes = new Map<string, { resolve: (v: any) => void; reject: (e: any) => void; timer: any }>();

  readonly estado$ = new BehaviorSubject<EstadoRobot>({ online: false, ejecutando: false, dc: [0, 0, 0, 0] });
  readonly conexion$ = new BehaviorSubject<EstadoConexion>('desconectado');

  constructor() {
    // Este servicio es providedIn:'root' — un único cliente para toda la app.
    // Se autoconecta con la última URL guardada para que la conexión no
    // dependa de tener abierta la página de Control de Motores.
    const url = localStorage.getItem('mqtt-broker-url');
    if (url) this.conectar(url);
  }

  conectar(url: string): void {
    if (this.client) this.client.end(true);
    this.conexion$.next('conectando');

    this.client = mqtt.connect(url, {
      username: MQTT_USER,
      password: MQTT_PASS,
      reconnectPeriod: 2000,
      connectTimeout: 4000
    });

    this.client.on('connect', () => {
      this.client.subscribe([TOPIC_ESTADO, TOPIC_RESPONSE]);
      this.conexion$.next('conectado');
    });

    this.client.on('message', (topic: string, payloadBuf: Uint8Array) => {
      let data: any;
      try { data = JSON.parse(payloadBuf.toString()); } catch { return; }

      if (topic === TOPIC_ESTADO) {
        this.estado$.next({
          online: !!data.online,
          ejecutando: !!data.ejecutando,
          dc: data.dc || [0, 0, 0, 0]
        });
        return;
      }

      if (topic === TOPIC_RESPONSE && data.id && this.pendientes.has(data.id)) {
        const pendiente = this.pendientes.get(data.id)!;
        clearTimeout(pendiente.timer);
        this.pendientes.delete(data.id);
        if (data.ok === false) pendiente.reject(new Error(data.error || 'error'));
        else pendiente.resolve(data);
      }
    });

    this.client.on('error', () => this.conexion$.next('error'));
    this.client.on('close', () => this.conexion$.next('error'));
  }

  desconectar(): void {
    if (this.client) { this.client.end(true); this.client = null; }
    this.conexion$.next('desconectado');
  }

  rpc(accion: string, datos: any = {}, timeoutMs = 4000): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.client || !this.client.connected) { reject(new Error('sin conexión al broker')); return; }
      const id = Math.random().toString(36).slice(2);
      const timer = setTimeout(() => {
        this.pendientes.delete(id);
        reject(new Error('sin respuesta del robot'));
      }, timeoutMs);
      this.pendientes.set(id, { resolve, reject, timer });
      this.client.publish(TOPIC_REQUEST, JSON.stringify({ id, accion, ...datos }));
    });
  }

  // ---- Atajos de alto nivel ----------------------------------------
  comando(tipo: string, valor: number, velocidad?: number): Promise<any> {
    return this.rpc('comando', velocidad !== undefined ? { tipo, valor, velocidad } : { tipo, valor });
  }

  parar(): Promise<any> { return this.rpc('parar'); }

  listarSecuencias(): Promise<string[]> {
    return this.rpc('secuencias_listar').then(r => r.secuencias || []);
  }

  obtenerSecuencia(nombre: string): Promise<PasoSecuencia[]> {
    return this.rpc('secuencias_obtener', { nombre }).then(r => r.pasos || []);
  }

  guardarSecuencia(nombre: string, pasos: PasoSecuencia[]): Promise<any> {
    return this.rpc('secuencias_guardar', { nombre, pasos });
  }

  eliminarSecuencia(nombre: string): Promise<any> {
    return this.rpc('secuencias_eliminar', { nombre });
  }

  ejecutarSecuencia(nombre: string): Promise<any> {
    return this.rpc('secuencias_ejecutar', { nombre });
  }

  // Ejecuta el arreglo de pasos directo — se usa cuando la página ya
  // tiene la secuencia en memoria (desde Firebase) y quiere garantizar
  // que el ESP32 corra exactamente esa versión, sin depender de si su
  // copia local en NVS está actualizada.
  ejecutarPasos(pasos: PasoSecuencia[]): Promise<any> {
    return this.rpc('ejecutar_pasos', { pasos });
  }
}