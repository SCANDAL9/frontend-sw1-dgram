import { Component, input } from '@angular/core';
import { DBAttribute } from '../../../models/diagram.model';

@Component({
  selector: 'app-column-connector',
  standalone: true,
  templateUrl: './column-connector.component.html',
})
export class ColumnConnectorComponent {
  column = input.required<DBAttribute>();
  entityId = input.required<string>();
}
