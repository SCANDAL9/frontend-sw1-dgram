import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-alignment-toolbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './alignment-toolbar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlignmentToolbarComponent {
  selectedCount = input<number>(0);
  align = output<'left' | 'centerH' | 'right' | 'top' | 'centerV' | 'bottom'>();
  distribute = output<'h' | 'v'>();
}
