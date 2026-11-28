import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { preventMobileZoom } from './mobile-zoom';

preventMobileZoom(document);
const routerFeatures = window.location.hostname.endsWith('.github.io') ? [withHashLocation()] : [];

bootstrapApplication(AppComponent, { providers: [provideRouter(routes, ...routerFeatures), provideHttpClient()] })
  .catch(error => {
    console.error(error);
    const loader = document.querySelector('.startup-loader');
    const status = loader?.querySelector('.startup-status');
    loader?.classList.add('startup-loader--failed');
    if (status) status.textContent = 'Không thể khởi động ứng dụng. Vui lòng tải lại trang.';
  });
