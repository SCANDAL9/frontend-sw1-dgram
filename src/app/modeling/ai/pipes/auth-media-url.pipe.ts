import { Pipe, PipeTransform, inject } from '@angular/core';
import { AuthService } from '../../../workspace/authentication/services/auth.service';

@Pipe({
  name: 'authMediaUrl',
  standalone: true,
  pure: false,
})
export class AuthMediaUrlPipe implements PipeTransform {
  private auth = inject(AuthService);

  transform(url: string | null | undefined): string {
    if (!url) return '';
    const token = this.auth.token();
    if (!token) return url;
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}token=${encodeURIComponent(token)}`;
  }
}
