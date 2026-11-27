import { Inject, Injectable, InjectionToken } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

export interface User {
  id: string; username: string; employeeCode: string; fullName: string; position: string;
  departmentCode: string; departmentName: string; roles: string[]; active: boolean;
}

export const API_BASE = new InjectionToken<string>('API_BASE', { providedIn: 'root', factory: () => '/api' });

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private http: HttpClient, @Inject(API_BASE) readonly base: string) { }
  get token(): string { return localStorage.getItem('ksnk_token') || ''; }
  get user(): User | null { try { return JSON.parse(localStorage.getItem('ksnk_user') || 'null') as User | null; } catch { return null; } }
  headers(): HttpHeaders { return new HttpHeaders({ Authorization: `Bearer ${this.token}` }); }
  logout(): void { localStorage.removeItem('ksnk_token'); localStorage.removeItem('ksnk_user'); localStorage.removeItem('ksnk_portal'); localStorage.removeItem('ksnk_demo'); localStorage.removeItem('ksnk_session_source'); }
  get usesHospitalSession(): boolean { return localStorage.getItem('ksnk_session_source') === 'myhv'; }
  login(username: string, password: string): Observable<{ token: string; user: User }> {
    return this.http.post<{ token: string; user: User }>(`${this.base}/auth/login`, { username, password }).pipe(tap(result => {
      localStorage.setItem('ksnk_token', result.token);
      localStorage.setItem('ksnk_user', JSON.stringify(result.user));
      localStorage.removeItem('ksnk_demo');
      localStorage.removeItem('ksnk_session_source');
    }));
  }
  restoreSession(): Observable<{ token: string; user: User }> {
    return this.http.post<{ token: string; user: User }>(`${this.base}/auth/session`, {}, { withCredentials: true }).pipe(tap(result => {
      localStorage.setItem('ksnk_token', result.token);
      localStorage.setItem('ksnk_user', JSON.stringify(result.user));
      localStorage.removeItem('ksnk_demo');
      localStorage.setItem('ksnk_session_source', 'myhv');
    }));
  }
  get<T>(path: string): Observable<T> { return this.http.get<T>(`${this.base}${path}`, { headers: this.headers() }); }
  post<T>(path: string, body: unknown): Observable<T> { return this.http.post<T>(`${this.base}${path}`, body, { headers: this.headers() }); }
  patch<T>(path: string, body: unknown): Observable<T> { return this.http.patch<T>(`${this.base}${path}`, body, { headers: this.headers() }); }
  put<T>(path: string, body: unknown): Observable<T> { return this.http.put<T>(`${this.base}${path}`, body, { headers: this.headers() }); }
}
