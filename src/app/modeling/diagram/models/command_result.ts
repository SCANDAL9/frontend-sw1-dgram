export interface CommandResult {
  success: boolean;
  command_id: string;
  error?: string;
  new_model_version: number;
}
