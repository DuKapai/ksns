import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home.component';
import { LoginComponent } from './pages/login.component';
import { WorkspaceComponent } from './pages/workspace.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'login/:portal', component: LoginComponent },
  { path: 'app/:section', component: WorkspaceComponent },
  { path: '**', redirectTo: '' }
];
