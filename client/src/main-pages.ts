import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, withHashLocation } from '@angular/router';
import { HttpErrorResponse, HttpInterceptorFn, HttpResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { defer, mergeMap, of, throwError } from 'rxjs';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { API_BASE } from './app/core/api.service';
import { dispatch } from './demo-api.generated.mjs';

const demoApi: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith('/api/')) return next(request);
  const headers: Record<string, string> = {};
  request.headers.keys().forEach(key => { headers[key.toLowerCase()] = request.headers.get(key) || ''; });
  return defer(() => dispatch(request.method, request.urlWithParams, request.body, headers)).pipe(
    mergeMap(result => result.status >= 400
      ? throwError(() => new HttpErrorResponse({ status: result.status, error: result.body, url: request.urlWithParams }))
      : of(new HttpResponse({ status: result.status, body: result.body, url: request.urlWithParams })))
  );
};

bootstrapApplication(AppComponent, {
  providers: [provideRouter(routes, withHashLocation()), provideHttpClient(withInterceptors([demoApi])), { provide: API_BASE, useValue: '/api' }]
}).catch(error => console.error(error));
