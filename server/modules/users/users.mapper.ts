// Користувач із бази → UserDto для фронта. Хеш пароля назовні не потрапляє ніколи.
import type { User, UserRole } from '@prisma/client';
import type { UserDto } from '@shared/types';

export const ROLE_LABEL: Record<UserRole, string> = { admin: 'Адміністратор', user: 'Менеджер' };

export function toUserDto(user: User, invitedBy: string | null = null): UserDto {
  return {
    id: user.id,
    login: user.login,
    fullName: user.fullName,
    shortName: user.shortName,
    email: user.email,
    phone: user.phone,
    role: user.role,
    isActive: user.isActive,
    blockedAt: user.blockedAt ? user.blockedAt.toISOString() : null,
    mustChangePassword: user.mustChangePassword,
    invitedBy,
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
  };
}
