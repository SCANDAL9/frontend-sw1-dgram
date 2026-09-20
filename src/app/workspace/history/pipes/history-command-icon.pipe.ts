import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'historyCommandIcon',
  standalone: true,
  pure: true,
})
export class HistoryCommandIconPipe implements PipeTransform {
  transform(commandType: string | null | undefined): string {
    const type = (commandType || '').toUpperCase();
    if (type.includes('CREATE_ENTITY') || type.includes('CREATE_CLASS')) {
      return 'M12 4v16m8-8H4';
    }
    if (type.includes('DELETE')) {
      return 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16';
    }
    if (type.includes('MOVE')) {
      return 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4';
    }
    if (type.includes('UPDATE') || type.includes('RENAME')) {
      return 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z';
    }
    if (type.includes('COLUMN') || type.includes('ATTRIBUTE')) {
      return 'M4 6h16M4 12h16m-7 6h7';
    }
    if (type.includes('RELATION') || type.includes('ASSOCIATION')) {
      return 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1';
    }
    if (type.includes('RESTORE')) {
      return 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15';
    }
    return 'M13 10V3L4 14h7v7l9-11h-7z';
  }
}
