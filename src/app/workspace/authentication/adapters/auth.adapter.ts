import {
  User,
  AuthResponse,
  UserProfileUpdate,
  ChangePasswordRequest,
  ResetPasswordRequest,
} from '../models/auth.models';

export interface UserDto {
  id?: string;
  user_id?: string;
  email: string;
  full_name?: string | null;
  name?: string | null;
  avatar_url?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface AuthResponseDto {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: UserDto;
}

/**
 * Adaptador puro para transformar DTOs de red del backend a modelos de UI de Autenticación.
 */
export class AuthAdapter {
  static toUserModel(dto: UserDto | null | undefined): User {
    if (!dto) {
      return {
        id: '',
        email: '',
        full_name: '',
        avatar_url: null,
      };
    }
    return {
      id: dto.id || dto.user_id || '',
      email: dto.email || '',
      full_name: dto.full_name || dto.name || '',
      avatar_url: dto.avatar_url || null,
      created_at: dto.created_at || null,
      updated_at: dto.updated_at || null,
    };
  }

  static toAuthResponseModel(dto: AuthResponseDto): AuthResponse {
    return {
      access_token: dto.access_token,
      refresh_token: dto.refresh_token,
      token_type: dto.token_type || 'Bearer',
      user: this.toUserModel(dto.user),
    };
  }

  static toProfileUpdatePayload(model: UserProfileUpdate): { full_name?: string; avatar_url?: string } {
    const payload: { full_name?: string; avatar_url?: string } = {};
    if (model.full_name !== undefined) payload.full_name = model.full_name.trim();
    if (model.avatar_url !== undefined) payload.avatar_url = model.avatar_url.trim();
    return payload;
  }

  static toChangePasswordPayload(model: ChangePasswordRequest): { current_password: string; new_password: string } {
    return {
      current_password: model.current_password,
      new_password: model.new_password,
    };
  }

  static toResetPasswordPayload(model: ResetPasswordRequest): { token: string; new_password: string } {
    return {
      token: model.token,
      new_password: model.new_password,
    };
  }
}
