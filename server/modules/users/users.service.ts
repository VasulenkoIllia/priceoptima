// Користувачі: довідник для всіх, зміни — лише адміністратору (свій профіль може виправити кожен).
import type { User } from '@prisma/client';
import type { UserDto } from '@shared/types';
import { prisma } from '../../db';
import { ApiError, duplicate, notFound } from '../../http/errors';
import { hashPassword } from '../auth/password';
import { toUserDto } from './users.mapper';
import type { SelfProfileBody, UserInputBody } from './users.schemas';

export async function listUsers(): Promise<UserDto[]> {
  const users = await prisma.user.findMany({ orderBy: [{ isActive: 'desc' }, { shortName: 'asc' }] });
  return users.map(toUserDto);
}

export async function createUser(input: UserInputBody): Promise<UserDto> {
  await assertLoginFree(input.login, null);
  await assertAdminLeft(null, input.role, input.isActive ?? true);
  const user = await prisma.user.create({
    data: {
      login: input.login,
      fullName: input.fullName,
      shortName: input.shortName,
      email: input.email,
      phone: input.phone,
      role: input.role,
      isActive: input.isActive ?? true,
      passwordHash: input.password ? await hashPassword(input.password) : null,
    },
  });
  return toUserDto(user);
}

export async function updateUser(id: string, input: UserInputBody): Promise<UserDto> {
  await getUserOrFail(id);
  await assertLoginFree(input.login, id);
  await assertAdminLeft(id, input.role, input.isActive ?? true);
  const user = await prisma.user.update({
    where: { id },
    data: {
      login: input.login,
      fullName: input.fullName,
      shortName: input.shortName,
      email: input.email,
      phone: input.phone,
      role: input.role,
      isActive: input.isActive ?? true,
      // пароль змінюємо, лише якщо його справді передали
      ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}),
    },
  });
  return toUserDto(user);
}

/** Користувач правит себе: логін, роль і доступ лишаються як були. */
export async function updateOwnProfile(id: string, input: SelfProfileBody): Promise<UserDto> {
  await getUserOrFail(id);
  const user = await prisma.user.update({
    where: { id },
    data: { fullName: input.fullName, shortName: input.shortName, email: input.email, phone: input.phone },
  });
  return toUserDto(user);
}

async function getUserOrFail(id: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw notFound('Користувача не знайдено');
  return user;
}

async function assertLoginFree(login: string, exceptId: string | null): Promise<void> {
  const taken = await prisma.user.findFirst({
    where: { login, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { id: true },
  });
  if (taken) throw duplicate(`Логін «${login}» уже зайнятий`);
}

/** В системі має лишитися хоча б один активний адміністратор. */
async function assertAdminLeft(userId: string | null, role: string, isActive: boolean): Promise<void> {
  if (role === 'admin' && isActive) return;
  const others = await prisma.user.count({
    where: { role: 'admin', isActive: true, ...(userId ? { NOT: { id: userId } } : {}) },
  });
  if (others === 0) throw new ApiError('VALIDATION_ERROR', 'Потрібен хоча б один активний адміністратор');
}
