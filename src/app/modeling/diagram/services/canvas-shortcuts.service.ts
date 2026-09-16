import { Injectable, signal } from '@angular/core';
import { CanvasKeyboardController, CanvasShortcutActions } from './canvas-keyboard.controller';

export type { CanvasShortcutActions } from './canvas-keyboard.controller';

@Injectable({
  providedIn: 'root',
})
export class CanvasShortcutsService {
  private controller = new CanvasKeyboardController();
  readonly isSpacePressed = signal(false);

  handleKeyDown(event: KeyboardEvent, actions: CanvasShortcutActions): boolean {
    const handled = this.controller.handleKeyDown(event, actions);
    this.isSpacePressed.set(this.controller.isSpacePressed);
    return handled;
  }

  handleKeyUp(event: KeyboardEvent): boolean {
    const handled = this.controller.handleKeyUp(event);
    this.isSpacePressed.set(this.controller.isSpacePressed);
    return handled;
  }
}
