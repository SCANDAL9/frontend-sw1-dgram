import { CommandService } from '../services/command.service';
import { DiagramService } from '../services/diagram.service';

export function seedDemoDiagramIfEmpty(cmd: CommandService, diagram: DiagramService): void {
  const hasBadDemo = diagram.entities().some((e) =>
    /hola/i.test(e.name) || ['asdas', 'sdfdsfsd', 'sdfds', 'hgh', 'hghg', 'hghh'].includes(e.name.toLowerCase())
  );
  if (hasBadDemo) {
    for (const e of [...diagram.entities()]) {
      cmd.deleteEntity(e.id);
    }
  }
  if (diagram.entityCount() > 0 && !hasBadDemo) return;

  cmd.createEntity(
    'User',
    'User',
    [
      { name: 'id', type: 'UUID', pk: true, fk: false, nullable: false, references: null, visibility: '+' },
      { name: 'email', type: 'String', pk: false, fk: false, nullable: false, references: null, visibility: '+' },
      { name: 'name', type: 'String', pk: false, fk: false, nullable: false, references: null, visibility: '+' },
      { name: 'createdAt', type: 'DateTime', pk: false, fk: false, nullable: true, references: null, visibility: '-' },
    ],
    { x: 60, y: 60 }
  );

  cmd.createEntity(
    'Account',
    'Account',
    [
      { name: 'id', type: 'UUID', pk: true, fk: false, nullable: false, references: null, visibility: '+' },
      { name: 'ownerId', type: 'UUID', pk: false, fk: true, nullable: false, references: 'User.id', visibility: '#' },
      { name: 'balance', type: 'Money', pk: false, fk: false, nullable: false, references: null, visibility: '-' },
      { name: 'status', type: 'String', pk: false, fk: false, nullable: false, references: null, visibility: '+' },
    ],
    { x: 360, y: 60 }
  );

  cmd.createEntity(
    'Order',
    'Order',
    [
      { name: 'id', type: 'UUID', pk: true, fk: false, nullable: false, references: null, visibility: '+' },
      { name: 'total', type: 'Money', pk: false, fk: false, nullable: false, references: null, visibility: '+' },
      { name: 'status', type: 'OrderStatus', pk: false, fk: false, nullable: false, references: null, visibility: '+' },
      { name: 'createdAt', type: 'DateTime', pk: false, fk: false, nullable: true, references: null, visibility: '-' },
    ],
    { x: 60, y: 300 }
  );

  cmd.createEntity(
    'Product',
    'Product',
    [
      { name: 'id', type: 'UUID', pk: true, fk: false, nullable: false, references: null, visibility: '+' },
      { name: 'name', type: 'String', pk: false, fk: false, nullable: false, references: null, visibility: '+' },
      { name: 'price', type: 'Money', pk: false, fk: false, nullable: false, references: null, visibility: '+' },
      { name: 'sku', type: 'String', pk: false, fk: false, nullable: true, references: null, visibility: '#' },
    ],
    { x: 360, y: 300 }
  );

  cmd.createEntity(
    'Payment',
    'Payment',
    [
      { name: 'id', type: 'UUID', pk: true, fk: false, nullable: false, references: null, visibility: '+' },
      { name: 'amount', type: 'Money', pk: false, fk: false, nullable: false, references: null, visibility: '+' },
      { name: 'method', type: 'String', pk: false, fk: false, nullable: false, references: null, visibility: '+' },
      { name: 'paidAt', type: 'DateTime', pk: false, fk: false, nullable: true, references: null, visibility: '-' },
    ],
    { x: 660, y: 180 }
  );

  cmd.createRelation('User', 'Account', 'id', 'ownerId', '1:N');
  cmd.createRelation('User', 'Order', 'id', 'id', '1:N');
  cmd.createRelation('Order', 'Product', 'id', 'id', 'N:M');
  cmd.createRelation('Order', 'Payment', 'id', 'id', '1:1');
}
