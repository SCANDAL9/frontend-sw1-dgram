import { CanDeactivateFn } from '@angular/router';

export interface CanWarnGuestLeave {
  shouldWarnGuestLeave?: () => boolean;
}

export const guestLeaveGuard: CanDeactivateFn<CanWarnGuestLeave> = (component) => {
  if (component.shouldWarnGuestLeave && component.shouldWarnGuestLeave()) {
    return window.confirm(
      'Estás en modo invitado. Si sales de esta página perderás la información añadida. ¿Deseas salir de todas formas?'
    );
  }
  return true;
};

