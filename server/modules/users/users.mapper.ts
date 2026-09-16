// Користувач із бази → UserDto для фронта. Хеш пароля назовні не потрапляє ніколи.
import type { User } from '@prisma/client';
import type { UserDto } from '@shared/types';

export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    login: user.login,
    fullName: user.fullName,
    shortName: user.shortName,
    email: user.email,
    phone: user.phone,
    role: user.role,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
  };
}
