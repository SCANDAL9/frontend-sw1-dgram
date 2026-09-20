import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'historyTimeAgo',
  standalone: true,
  pure: true,
})
export class HistoryTimeAgoPipe implements PipeTransform {
  transform(isoStr?: string | null): string {
    if (!isoStr) return '';
    try {
      const date = new Date(isoStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHour = Math.floor(diffMin / 60);
      const diffDay = Math.floor(diffHour / 24);

      if (diffSec < 45) return 'hace un momento';
      if (diffMin < 60) return `hace ${diffMin} min`;
      if (diffHour < 24) return `hace ${diffHour} h`;
      if (diffDay < 7) return `hace ${diffDay} d`;
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoStr;
    }
  }
}
