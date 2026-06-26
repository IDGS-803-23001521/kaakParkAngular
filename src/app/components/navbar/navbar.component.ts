import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  standalone: false,
  selector: 'app-navbar',
  templateUrl: './navbar.component.html'
})
export class NavbarComponent {
  constructor(public router: Router, private authService: AuthService) { }
  isActive(path: string): boolean { return this.router.url === path; }
  onLogout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
