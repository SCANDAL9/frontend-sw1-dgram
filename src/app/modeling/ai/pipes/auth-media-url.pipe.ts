import { Pipe, PipeTransform, inject } from '@angular/core';
import { AuthService } from '../../../workspace/authentication/services/auth.service';
import { environment } from '../../../../environments/environment';

@Pipe({
  name: 'authMediaUrl',
  standalone: true,
  pure: false,
})
export class AuthMediaUrlPipe implements PipeTransform {
  private auth = inject(AuthService);

  transform(url: string | null | undefined): string {
    if (!url) return '';
    if (url.startsWith('blob:') || url.startsWith('data:')) return url;

    let fullUrl = url;
    if (url.startsWith('/api')) {
      const backendBase = environment.apiUrl.replace(/\/api\/?$/, '');
      fullUrl = `${backendBase}${url}`;
    }

    const token = this.auth.token();
    if (!token) return fullUrl;
    const separator = fullUrl.includes('?') ? '&' : '?';
    return `${fullUrl}${separator}token=${encodeURIComponent(token)}`;
  }
}
