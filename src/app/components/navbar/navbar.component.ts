import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  standalone: false,
  selector: 'app-navbar',
  templateUrl: './navbar.component.html'
})
export class NavbarComponent {
  mobileOpen = false;

  constructor(public router: Router, private authService: AuthService) { }
  isActive(path: string): boolean { return this.router.url === path; }
  toggleMobile(): void { this.mobileOpen = !this.mobileOpen; }
  closeMobile(): void { this.mobileOpen = false; }
  onLogout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
