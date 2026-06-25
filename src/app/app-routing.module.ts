import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './guards/auth.guard';

import { LoginComponent }           from './components/login/login.component';
import { DashboardComponent }       from './components/dashboard/dashboard.component';
import { CajonesComponent }         from './components/cajones/cajones.component';
import { ReportesComponent }        from './components/reportes/reportes.component';
import { SustentabilidadComponent } from './components/sustentabilidad/sustentabilidad.component';
import { UsuariosComponent }        from './components/usuarios/usuarios.component';
import { ClientesComponent } from './components/clientes/clientes.component';
import { HorariosComponent } from './components/horarios/horarios.component';

const routes: Routes = [
  { path: '',             redirectTo: '/login', pathMatch: 'full' },
  { path: 'login',        component: LoginComponent },
  { path: 'dashboard',        component: DashboardComponent,       canActivate: [AuthGuard] },
  { path: 'cajones',          component: CajonesComponent,         canActivate: [AuthGuard] },
  { path: 'reportes',         component: ReportesComponent,        canActivate: [AuthGuard] },
  { path: 'sustentabilidad',  component: SustentabilidadComponent, canActivate: [AuthGuard] },
  { path: 'usuarios',         component: UsuariosComponent,        canActivate: [AuthGuard] },
  { path: 'clientes',         component: ClientesComponent,        canActivate: [AuthGuard] },
  { path: 'horarios', component: HorariosComponent, canActivate: [AuthGuard] },
  { path: '**', redirectTo: '/login' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
