import { CanDeactivateFn } from '@angular/router';
import { CanvasComponent } from '../../modeling/diagram/components/canvas/canvas.component';

export const guestLeaveGuard: CanDeactivateFn<CanvasComponent> = (component) => {
  if (component.shouldWarnGuestLeave && component.shouldWarnGuestLeave()) {
    return window.confirm(
      'Estás en modo invitado. Si sales de esta página perderás la información añadida. ¿Deseas salir de todas formas?'
    );
  }
  return true;
};
