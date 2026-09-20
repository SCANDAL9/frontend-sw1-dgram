import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'memberRole',
  standalone: true,
  pure: true,
})
export class MemberRolePipe implements PipeTransform {
  transform(role: string | null | undefined): string {
    switch (role) {
      case 'owner':
        return 'Propietario';
      case 'editor':
        return 'Editor';
      case 'viewer':
        return 'Lector';
      default:
        return role || '';
    }
  }
}
