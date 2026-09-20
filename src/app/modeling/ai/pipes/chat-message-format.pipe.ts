import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'chatMessageFormat',
  standalone: true,
  pure: true,
})
export class ChatMessageFormatPipe implements PipeTransform {
  transform(text: string | null | undefined): string {
    if (!text) return '';
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br/>');
  }
}
