import { Routes } from '@angular/router';
import { ModuleComponent } from './pages/module.component';

export const routes: Routes = [
  { path: '', redirectTo: 'app/dashboard', pathMatch: 'full' },
  { path: 'management/members', redirectTo: 'app/manage', pathMatch: 'full' },
  { path: 'management/audit', redirectTo: 'app/audit', pathMatch: 'full' },
  { path: 'app/:section', component: ModuleComponent },
  { path: '**', redirectTo: 'app/dashboard' }
];
