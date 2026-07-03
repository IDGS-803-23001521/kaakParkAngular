import { Injectable } from '@angular/core';
import { getApp, initializeApp, deleteApp } from 'firebase/app';
import {
  getFirestore, Firestore,
  collection, doc,
  addDoc, updateDoc, setDoc, getDocs, getDoc,
  onSnapshot,
  query, orderBy, limit, where
} from 'firebase/firestore';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { Observable } from 'rxjs';
import { Cajon, Usuario, Cliente, ActividadReciente, Pago, SustentabilidadData, ReporteHistorial, ConfigTarifa, HistorialTarifa } from '../models/kaakpark.models';
import { environment } from '../../environments/environment';
import { Secuencia } from '../services/mqtt-robot.service';

@Injectable({ providedIn: 'root' })
export class FirebaseService {

  private db: Firestore;
  private readonly CAJONES_COL = 'cajones-dev';

  constructor() {
    this.db = getFirestore(getApp());
  }

  private snapCollection<T>(ref: any): Observable<T[]> {
    return new Observable(observer => {
      const unsub = onSnapshot(ref,
        (snap: any) => {
          const data = snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as T));
          observer.next(data);
        },
        (err: any) => observer.error(err)
      );
      return () => unsub();
    });
  }

  private snapDoc<T>(ref: any): Observable<T> {
    return new Observable(observer => {
      const unsub = onSnapshot(ref,
        (snap: any) => observer.next({ id: snap.id, ...snap.data() } as T),
        (err: any) => observer.error(err)
      );
      return () => unsub();
    });
  }

  // ─── CAJONES ───────────────────────────────────────
  getCajones(): Observable<Cajon[]> {
    return this.snapCollection<Cajon>(collection(this.db, this.CAJONES_COL));
  }

  updateCajon(id: string, data: Partial<Cajon>): Promise<void> {
    return updateDoc(doc(this.db, `${this.CAJONES_COL}/${id}`), data as any);
  }

  
getSecuencias(): Observable<Secuencia[]> {
  return this.snapCollection<Secuencia>(collection(this.db, 'secuencias'));
}
 
addSecuencia(s: Secuencia): Promise<any> {
  return addDoc(collection(this.db, 'secuencias'), s);
}
 
updateSecuencia(id: string, cambios: Partial<Secuencia>): Promise<void> {
  return updateDoc(doc(this.db, `secuencias/${id}`), cambios as any);
}

  async seedCajonesIfEmpty(): Promise<void> {
    const snap = await getDocs(collection(this.db, this.CAJONES_COL));
    if (!snap.empty) return;
    const seed: Promise<void>[] = [];
    for (let nivel = 1; nivel <= 4; nivel++) {
      for (let num = 1; num <= 2; num++) {
        const id = `n${nivel}c${num}`;
        const data: Omit<Cajon, 'id'> = { nivel, numeroCajon: num, estado: 'Libre' };
        seed.push(setDoc(doc(this.db, `${this.CAJONES_COL}/${id}`), data));
      }
    }
    await Promise.all(seed);
  }

  // ─── USUARIOS ──────────────────────────────────────
  getUsuarios(): Observable<Usuario[]> {
    return this.snapCollection<Usuario>(collection(this.db, 'usuarios'));
  }

  async addUsuario(usuario: Usuario): Promise<void> {
    await addDoc(collection(this.db, 'usuarios'), usuario as any);
  }

  updateUsuario(id: string, data: Partial<Usuario>): Promise<void> {
    return updateDoc(doc(this.db, `usuarios/${id}`), data as any);
  }

  toggleUsuarioActivo(id: string, activo: boolean): Promise<void> {
    return this.updateUsuario(id, { activo });
  }

  async crearAuthUsuario(email: string, password: string): Promise<void> {
    const tempApp = initializeApp(environment.firebase, `auth-temp-${Date.now()}`);
    try {
      const tempAuth = getAuth(tempApp);
      await createUserWithEmailAndPassword(tempAuth, email, password);
    } finally {
      await deleteApp(tempApp);
    }
  }

  /** Igual que crearAuthUsuario pero devuelve el UID generado (necesario para ligar el doc de Firestore). */
  async crearAuthUsuarioConUid(email: string, password: string): Promise<string> {
    const tempApp = initializeApp(environment.firebase, `auth-temp-${Date.now()}`);
    try {
      const tempAuth = getAuth(tempApp);
      const cred = await createUserWithEmailAndPassword(tempAuth, email, password);
      return cred.user.uid;
    } finally {
      await deleteApp(tempApp);
    }
  }

    // ─── CLIENTES ──────────────────────────────────────
    private readonly CLIENTES_COL = 'usuariosc';

  getClientes(): Observable<Cliente[]> {
    return this.snapCollection<Cliente>(collection(this.db, this.CLIENTES_COL));
  }

  async addCliente(cliente: Cliente): Promise<void> {
    await addDoc(collection(this.db, this.CLIENTES_COL), cliente as any);
  }

  updateCliente(id: string, data: Partial<Cliente>): Promise<void> {
    return updateDoc(doc(this.db, `${this.CLIENTES_COL}/${id}`), data as any);
  }

  toggleClienteActivo(id: string, activo: boolean): Promise<void> {
    return this.updateCliente(id, { estado: activo ? 'ACTIVO' : 'INACTIVO' });
  }

  // ─── Auto ────────────────────────────

  getVehiculos(): Observable<any[]> {
    return this.snapCollection<any>(collection(this.db, 'vehiculos'));
  }

  // ─── ACTIVIDAD RECIENTE ────────────────────────────
  getActividadReciente(): Observable<ActividadReciente[]> {
    const q = query(collection(this.db, 'actividad'), orderBy('timestamp', 'desc'), limit(5));
    return this.snapCollection<ActividadReciente>(q);
  }

  /** Actividad del día (fecha = 'YYYY-MM-DD'), sin límite — para conteos y gráficas reales. */
  getActividadPorFecha(fecha: string): Observable<ActividadReciente[]> {
    const q = query(collection(this.db, 'actividad'), where('fecha', '==', fecha));
    return this.snapCollection<ActividadReciente>(q);
  }

  async addActividad(actividad: ActividadReciente): Promise<void> {
    await addDoc(collection(this.db, 'actividad'), actividad as any);
  }

  /** Actividad entre dos timestamps (ms), ordenada — para gráficas y reportes históricos. */
  getActividadRango(inicio: number, fin: number): Observable<ActividadReciente[]> {
    const q = query(
      collection(this.db, 'actividad'),
      where('timestamp', '>=', inicio),
      where('timestamp', '<=', fin),
      orderBy('timestamp', 'asc')
    );
    return this.snapCollection<ActividadReciente>(q);
  }

  // ─── SUSTENTABILIDAD ──────────────────────────────
  getSustentabilidad(): Observable<SustentabilidadData> {
    return this.snapDoc<SustentabilidadData>(doc(this.db, 'sustentabilidad/actual'));
  }

  updateSustentabilidad(data: Partial<SustentabilidadData>): Promise<void> {
    return updateDoc(doc(this.db, 'sustentabilidad/actual'), data as any);
  }

  async seedSustentabilidadIfEmpty(): Promise<void> {
    const ref = doc(this.db, 'sustentabilidad/actual');
    const snap = await getDoc(ref);
    if (snap.exists()) return;
    const defaults: SustentabilidadData = {
      energiaGeneradaKwh: 0, aguaCaptadaLitros: 0, aguaUsadaRiego: 0,
      porcentajeSolar: 0, nivelTanque: 0, capacidadCisternaLitros: 4,
      bombaAgua: false, alertas: []
    };
    await setDoc(ref, defaults);
  }

  // ─── PAGOS ─────────────────────────────────────────
  getPagos(): Observable<Pago[]> {
    const q = query(collection(this.db, 'pagos'), orderBy('timestamp', 'desc'));
    return this.snapCollection<Pago>(q);
  }

  async addPago(pago: Pago): Promise<any> {
    return addDoc(collection(this.db, 'pagos'), pago as any);
  }

  // ─── TARIFA ────────────────────────────────────────
  getTarifa(): Observable<ConfigTarifa> {
    return this.snapDoc<ConfigTarifa>(doc(this.db, 'configuracion/tarifas'));
  }

  async updateTarifa(nueva: number, anterior: number, actualizadoPor?: string): Promise<void> {
    const ahora = Date.now();
    const fecha = new Date().toISOString().slice(0, 10);
    await setDoc(doc(this.db, 'configuracion/tarifas'), {
      tarifaPorHora: nueva,
      actualizadoEn: ahora,
      actualizadoPor: actualizadoPor ?? ''
    } as ConfigTarifa);
    await addDoc(collection(this.db, 'historial-tarifas'), {
      tarifaAnterior: anterior,
      tarifaNueva: nueva,
      fecha,
      timestamp: ahora,
      actualizadoPor: actualizadoPor ?? ''
    } as HistorialTarifa);
  }

  getHistorialTarifas(): Observable<HistorialTarifa[]> {
    const q = query(collection(this.db, 'historial-tarifas'), orderBy('timestamp', 'desc'));
    return this.snapCollection<HistorialTarifa>(q);
  }

  // ─── REPORTES ──────────────────────────────────────
  getReportesHistorial(): Observable<ReporteHistorial[]> {
    const q = query(collection(this.db, 'reportes'), orderBy('fecha', 'desc'));
    return this.snapCollection<ReporteHistorial>(q);
  }

  async addReporte(reporte: ReporteHistorial): Promise<void> {
    await addDoc(collection(this.db, 'reportes'), reporte as any);
  }
  
}
