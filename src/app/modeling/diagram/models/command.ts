import { CommandType } from './command_type';
import { CommandPayload } from './command_payload';

export interface Command {
  command_id: string;
  command_type: CommandType;
  payload: CommandPayload;
  actor: string;
  timestamp: string;
  model_version: number;
}
