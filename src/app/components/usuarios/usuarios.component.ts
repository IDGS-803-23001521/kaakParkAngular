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

  fNombre=''; fApPat=''; fApMat=''; fPuesto=''; fSexo: 'M'|'F' = 'M'; fFecha='';
  fotoPreview = 'assets/images/UsuarioD.png';

  mostrarModal = false;
  credUsuario = ''; credPass = ''; credNota = '';
  guardandoCreds = false;

  private subs: Subscription[] = [];

  constructor(private fb: FirebaseService) {}

  ngOnInit(): void {
    const sub = this.fb.getUsuarios().subscribe(users => {
      this.activos   = users.filter(u => u.activo);
      this.inactivos = users.filter(u => !u.activo);
    });
    this.subs.push(sub);
  }

  ngOnDestroy(): void { this.subs.forEach(s => s.unsubscribe()); }

  async guardarUsuario(): Promise<void> {
    if (!this.fNombre || !this.fApPat || !this.fPuesto) {
      alert('Llena Nombre, Apellido Paterno y Puesto.');
      return;
    }
    const nombre  = `${this.fNombre} ${this.fApPat}${this.fApMat ? ' '+this.fApMat : ''}`;
    const usuario = (this.fNombre[0]+this.fApPat).toLowerCase().replace(/[^a-z]/g,'') + Math.floor(Math.random()*900+100);
    const nuevo: Usuario = {
      nombre, usuario,
      puesto: this.fPuesto,
      genero: this.fSexo,
      fechaIngreso: this.fFecha || new Date().toISOString().split('T')[0],
      activo: true
    };
    await this.fb.addUsuario(nuevo);
    this.limpiarForm();
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
      this.credPass    = u.contrasena;
      this.credNota    = 'Credenciales ya existentes. Muéstralas solo al usuario.';
      this.mostrarModal = true;
      return;
    }

    this.guardandoCreds = true;
    try {
      const partes  = u.nombre.trim().split(' ');
      const base    = (partes[0][0]+(partes[1]||'')).toLowerCase().replace(/[^a-z]/g,'');
      const usuario = base + Math.floor(Math.random()*900+100);
      const email   = usuario + '@kaakpark.com';
      const pass    = this.generarPassword();

      await this.fb.crearAuthUsuario(email, pass);

      if (u.id) {
        await this.fb.updateUsuario(u.id, { email, contrasena: pass, usuario });
      }

      this.credUsuario  = email;
      this.credPass     = pass;
      this.credNota     = 'Credenciales creadas.';
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
      reader.onload = (e) => { this.fotoPreview = e.target?.result as string; };
      reader.readAsDataURL(input.files[0]);
    }
  }

  limpiarForm(): void {
    this.fNombre=''; this.fApPat=''; this.fApMat=''; this.fPuesto=''; this.fSexo='M'; this.fFecha='';
    this.fotoPreview='assets/images/UsuarioD.png';
  }

  private generarPassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const esp   = ['!','%','*','-','+','?'];
    let pass = '';
    for (let i = 0; i < 7; i++) pass += chars[Math.floor(Math.random()*chars.length)];
    return pass + esp[Math.floor(Math.random()*esp.length)];
  }
}
