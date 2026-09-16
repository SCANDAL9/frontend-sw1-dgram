import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-alignment-toolbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './alignment-toolbar.component.html',
})
export class AlignmentToolbarComponent {
  @Input() selectedCount = 0;
  @Output() align = new EventEmitter<'left' | 'centerH' | 'right' | 'top' | 'centerV' | 'bottom'>();
  @Output() distribute = new EventEmitter<'h' | 'v'>();
}
