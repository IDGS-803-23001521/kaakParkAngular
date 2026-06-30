import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { initializeApp, getApps } from 'firebase/app';
import { environment } from '../environments/environment';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent }             from './app.component';
import { NavbarComponent }          from './components/navbar/navbar.component';
import { LoginComponent }           from './components/login/login.component';
import { DashboardComponent }       from './components/dashboard/dashboard.component';
import { CajonesComponent }         from './components/cajones/cajones.component';
import { ReportesComponent }        from './components/reportes/reportes.component';
import { SustentabilidadComponent } from './components/sustentabilidad/sustentabilidad.component';
import { UsuariosComponent }        from './components/usuarios/usuarios.component';
import { ControlMotoresComponent }  from './components/motores/control-motores.component';
import { HorariosComponent } from './components/horarios/horarios.component';
import { ClientesComponent } from './components/clientes/clientes.component';
import { PagosComponent } from './components/pagos/pagos.component';

if (!getApps().length) {
  initializeApp(environment.firebase);
}

@NgModule({
  declarations: [
    AppComponent,
    NavbarComponent,
    LoginComponent,
    DashboardComponent,
    CajonesComponent,
    ReportesComponent,
    SustentabilidadComponent,
    UsuariosComponent,
    ControlMotoresComponent,
    HorariosComponent,
    ClientesComponent,
    PagosComponent,
  ],
  imports: [
    BrowserModule,
    FormsModule,
    ReactiveFormsModule,
    AppRoutingModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule {}
