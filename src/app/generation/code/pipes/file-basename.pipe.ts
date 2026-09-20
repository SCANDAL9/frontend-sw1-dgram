import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'fileBasename',
  standalone: true,
  pure: true,
})
export class FileBasenamePipe implements PipeTransform {
  transform(path: string | null | undefined): string {
    if (!path) return '';
    const parts = path.split('/');
    return parts[parts.length - 1] || path;
  }
}

@Pipe({
  name: 'fileIcon',
  standalone: true,
  pure: true,
})
export class FileIconPipe implements PipeTransform {
  transform(path: string | null | undefined): string {
    if (!path) return 'FILE';
    if (path.includes('/entity/')) return 'JPA';
    if (path.includes('/service/')) return 'SRV';
    if (path.includes('/controller/')) return 'REST';
    if (path.includes('/repository/')) return 'REPO';
    if (path.includes('/dto/')) return 'DTO';
    if (path.includes('/mapper/')) return 'MAP';
    if (path.includes('/enums/')) return 'ENUM';
    if (path.includes('Tests.java')) return 'TEST';
    if (path.endsWith('.xml')) return 'POM';
    if (path.endsWith('.properties') || path.endsWith('.yml')) return 'CONF';
    if (path.endsWith('.java')) return 'JAVA';
    return 'FILE';
  }
}
