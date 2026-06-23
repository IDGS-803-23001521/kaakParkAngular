import { Component } from '@angular/core';
import { AuthService } from '../../services/auth.service';

@Component({
  standalone: false,
  selector: 'app-login',
  templateUrl: './login.component.html'
})
export class LoginComponent {
  email = '';
  password = '';
  showPassword = false;
  error = '';
  loading = false;

  constructor(private authService: AuthService) {}

  async onLogin(): Promise<void> {
    if (!this.email || !this.password) {
      this.error = 'Por favor ingresa usuario y contraseña.';
      return;
    }
    this.loading = true;
    this.error = '';
    try {
      await this.authService.login(this.email, this.password);
    } catch {
      this.error = 'Usuario o contraseña incorrectos.';
    } finally {
      this.loading = false;
    }
  }

  togglePassword(): void { this.showPassword = !this.showPassword; }
}
