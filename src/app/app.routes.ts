import { Routes } from '@angular/router';
import { HomeComponent } from './workspace/projects/pages/home/home.component';
import { CanvasComponent } from './modeling/diagram/components/canvas/canvas.component';
import { guestLeaveGuard } from './core/guards/guest-leave.guard';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'board/:id', component: CanvasComponent, canDeactivate: [guestLeaveGuard] },
];
