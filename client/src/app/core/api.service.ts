import { Inject, Injectable, InjectionToken } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { map, Observable, tap } from 'rxjs';

export interface User {
  id: string; username: string; employeeCode: string; fullName: string; position: string;
  departmentCode: string; departmentName: string; roles: string[]; active: boolean;
}

export const API_BASE = new InjectionToken<string>('API_BASE', { providedIn: 'root', factory: () => 'http://localhost:3000/api' });

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private http: HttpClient, @Inject(API_BASE) readonly base: string) { }
  get token(): string { return localStorage.getItem('ksnk_token') || ''; }
  get user(): User | null { try { return JSON.parse(localStorage.getItem('ksnk_user') || 'null') as User | null; } catch { return null; } }
  headers(): HttpHeaders { return new HttpHeaders({ Authorization: `Bearer ${this.token}` }); }
  login(username: string, password: string, portal: string, requiredRole?: string): Observable<{ token: string; user: User }> {
    return this.http.post<{ token: string; user: User }>(`${this.base}/auth/login`, { username, password, portal }).pipe(map(result => {
      if (requiredRole && !result.user.roles.includes(requiredRole)) {
        throw new HttpErrorResponse({ status: 403, error: { message: 'Tài khoản không thuộc vai trò đã chọn. Vui lòng chọn đúng vai trò hoặc trở lại trang chủ.' } });
      }
      return result;
    }), tap(result => {
      localStorage.setItem('ksnk_token', result.token); localStorage.setItem('ksnk_user', JSON.stringify(result.user)); localStorage.setItem('ksnk_portal', portal);
    }));
  }
  logout(): void { localStorage.removeItem('ksnk_token'); localStorage.removeItem('ksnk_user'); localStorage.removeItem('ksnk_portal'); }
  get<T>(path: string): Observable<T> { return this.http.get<T>(`${this.base}${path}`, { headers: this.headers() }); }
  post<T>(path: string, body: unknown): Observable<T> { return this.http.post<T>(`${this.base}${path}`, body, { headers: this.headers() }); }
  patch<T>(path: string, body: unknown): Observable<T> { return this.http.patch<T>(`${this.base}${path}`, body, { headers: this.headers() }); }
  put<T>(path: string, body: unknown): Observable<T> { return this.http.put<T>(`${this.base}${path}`, body, { headers: this.headers() }); }
}
