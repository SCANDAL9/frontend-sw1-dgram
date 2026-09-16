import { Component, Input } from '@angular/core';
import { DBAttribute } from '../../../models/diagram.model';

@Component({
  selector: 'app-column-connector',
  standalone: true,
  templateUrl: './column-connector.component.html',
})
export class ColumnConnectorComponent {
  @Input({ required: true }) column!: DBAttribute;
  @Input({ required: true }) entityId!: string;
}
