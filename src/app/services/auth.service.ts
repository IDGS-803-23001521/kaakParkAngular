import { Injectable } from '@angular/core';
import { getApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, User, Auth } from 'firebase/auth';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthService {

  private auth: Auth;

  currentUser$: Observable<User | null>;

  constructor(private router: Router) {
    this.auth = getAuth(getApp());
    this.currentUser$ = new Observable(observer => {
      return onAuthStateChanged(this.auth, user => observer.next(user));
    });
  }

  async login(email: string, password: string): Promise<void> {
    await signInWithEmailAndPassword(this.auth, email, password);
    this.router.navigate(['/dashboard']);
  }

  async logout(): Promise<void> {
    await signOut(this.auth);
    this.router.navigate(['/login']);
  }

  get currentUser(): User | null {
    return this.auth.currentUser;
  }
}
