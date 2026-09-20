import { Routes } from '@angular/router';
import { guestLeaveGuard } from './core/guards/guest-leave.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./workspace/projects/pages/home/home.component').then((m) => m.HomeComponent),
  },
  {
    path: 'board/:id',
    loadComponent: () =>
      import('./modeling/diagram/pages/board/board.component').then((m) => m.BoardComponent),
    canDeactivate: [guestLeaveGuard],
  },
];
