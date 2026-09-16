export interface CanvasShortcutActions {
  onToggleSidebar?: () => void;
  onToggleCommandPalette?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onDuplicate?: () => void;
  onFitToScreen?: () => void;
}

export class CanvasKeyboardController {
  private _isSpacePressed = false;

  get isSpacePressed(): boolean {
    return this._isSpacePressed;
  }

  handleKeyDown(event: KeyboardEvent, actions: CanvasShortcutActions): boolean {
    const target = event.target as any;
    if (
      (typeof HTMLInputElement !== 'undefined' && target instanceof HTMLInputElement) ||
      (typeof HTMLTextAreaElement !== 'undefined' && target instanceof HTMLTextAreaElement) ||
      target?.tagName === 'INPUT' ||
      target?.tagName === 'TEXTAREA' ||
      target?.isContentEditable
    ) {
      return false;
    }

    // Spacebar Hand tool pan toggle
    if (event.code === 'Space' && !this._isSpacePressed) {
      event.preventDefault();
      this._isSpacePressed = true;
      return true;
    }

    // Ctrl+K / Cmd+K -> Command Palette
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      actions.onToggleCommandPalette?.();
      return true;
    }

    // Ctrl+B / Cmd+B -> Toggle Explorer Sidebar
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
      event.preventDefault();
      actions.onToggleSidebar?.();
      return true;
    }

    if (event.ctrlKey || event.metaKey) {
      if (event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        actions.onUndo?.();
        return true;
      } else if (event.key.toLowerCase() === 'z' && event.shiftKey) {
        event.preventDefault();
        actions.onRedo?.();
        return true;
      } else if (event.key.toLowerCase() === 'y') {
        event.preventDefault();
        actions.onRedo?.();
        return true;
      } else if (event.key.toLowerCase() === 'd') {
        event.preventDefault();
        actions.onDuplicate?.();
        return true;
      }
    } else if (event.key.toLowerCase() === 'f') {
      actions.onFitToScreen?.();
      return true;
    }

    return false;
  }

  handleKeyUp(event: KeyboardEvent): boolean {
    if (event.code === 'Space') {
      this._isSpacePressed = false;
      return true;
    }
    return false;
  }
}
