import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';

bootstrapApplication(AppComponent, { providers: [provideRouter(routes), provideHttpClient()] })
  .catch(error => {
    console.error(error);
    const loader = document.querySelector('.startup-loader');
    const status = loader?.querySelector('.startup-status');
    loader?.classList.add('startup-loader--failed');
    if (status) status.textContent = 'Không thể khởi động ứng dụng. Vui lòng tải lại trang.';
  });
