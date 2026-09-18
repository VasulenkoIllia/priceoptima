// Користувачі: довідник для всіх; дані, роль і доступ змінює адміністратор, свій профіль — кожен.
import type { User, UserRole } from '@prisma/client';
import type { UserDto } from '@shared/types';
import { prisma } from '../../db';
import { ApiError, duplicate, notFound } from '../../http/errors';
import { audit, userRefs } from '../audit/audit.service';
import { hashPassword, verifyPassword } from '../auth/password';
import { ROLE_LABEL, toUserDto } from './users.mapper';
import type { ProfileBody, UserUpdateBody } from './users.schemas';

/** Хто зняв блокування заявок заблокованого користувача (модуль заявок підставляє свою функцію). */
let releaseUserLocks: (userId: string) => Promise<void> = async () => undefined;
export function onUserBlocked(fn: (userId: string) => Promise<void>): void {
  releaseUserLocks = fn;
}

export async function listUsers(): Promise<UserDto[]> {
  const users = await prisma.user.findMany({ orderBy: [{ isActive: 'desc' }, { shortName: 'asc' }] });
  const inviters = await userRefs(users.map((u) => u.createdById));
  return users.map((u) => toUserDto(u, u.createdById ? (inviters.get(u.createdById)?.shortName ?? null) : null));
}

async function withInviter(user: User): Promise<UserDto> {
  const inviter = user.createdById ? (await userRefs([user.createdById])).get(user.createdById) : undefined;
  return toUserDto(user, inviter?.shortName ?? null);
}

export async function updateUser(actor: User, id: string, input: UserUpdateBody): Promise<UserDto> {
  await getUserOrFail(id);
  await assertLoginFree(input.login, id);
  const user = await prisma.user.update({
    where: { id },
    data: { login: input.login, fullName: input.fullName, shortName: input.shortName, email: input.email, phone: input.phone },
  });
  await audit({ userId: actor.id, action: 'user.update', entityType: 'user', entityId: id, summary: `Змінено дані користувача ${user.shortName}` });
  return withInviter(user);
}

export async function setUserRole(actor: User, id: string, role: UserRole): Promise<UserDto> {
  const current = await getUserOrFail(id);
  if (current.role === role) return withInviter(current);
  await assertAdminLeft(id, role, current.isActive);
  const user = await prisma.user.update({ where: { id }, data: { role } });
  await audit({ userId: actor.id, action: 'user.role', entityType: 'user', entityId: id, summary: `${user.shortName}: роль «${ROLE_LABEL[role]}»` });
  return withInviter(user);
}

/** Блокування: вхід закрито, сесії й блокування заявок знімаються одразу; заявки й історія лишаються. */
export async function blockUser(actor: User, id: string, now = new Date()): Promise<UserDto> {
  if (actor.id === id) throw new ApiError('VALIDATION_ERROR', 'Не можна заблокувати себе');
  const current = await getUserOrFail(id);
  if (!current.isActive) return withInviter(current);
  await assertAdminLeft(id, current.role, false);
  const user = await prisma.$transaction(async (tx) => {
    await tx.session.deleteMany({ where: { userId: id } });
    await tx.accessLink.updateMany({ where: { kind: 'reset', userId: id, usedAt: null, revokedAt: null }, data: { revokedAt: now } });
    return tx.user.update({ where: { id }, data: { isActive: false, blockedAt: now } });
  });
  await releaseUserLocks(id);
  await audit({ userId: actor.id, action: 'user.block', entityType: 'user', entityId: id, summary: `Заблоковано: ${user.shortName}` });
  return withInviter(user);
}

export async function unblockUser(actor: User, id: string): Promise<UserDto> {
  const current = await getUserOrFail(id);
  if (current.isActive) return withInviter(current);
  const user = await prisma.user.update({ where: { id }, data: { isActive: true, blockedAt: null } });
  await audit({ userId: actor.id, action: 'user.unblock', entityType: 'user', entityId: id, summary: `Розблоковано: ${user.shortName}` });
  return withInviter(user);
}

/** Мій профіль: логін, роль і доступ лишаються як були. */
export async function updateProfile(actor: User, input: ProfileBody): Promise<UserDto> {
  const user = await prisma.user.update({
    where: { id: actor.id },
    data: { fullName: input.fullName, shortName: input.shortName, email: input.email, phone: input.phone },
  });
  await audit({ userId: actor.id, action: 'user.profile', entityType: 'user', entityId: actor.id, summary: 'Змінено свій профіль' });
  return withInviter(user);
}

/** Зміна власного пароля: інші сесії закриваються, поточна лишається. */
export async function changePassword(actor: User, currentPassword: string, newPassword: string, keepSessionId: string | null): Promise<UserDto> {
  if (!(await verifyPassword(actor.passwordHash, currentPassword))) throw new ApiError('VALIDATION_ERROR', 'Поточний пароль невірний');
  if (currentPassword === newPassword) throw new ApiError('VALIDATION_ERROR', 'Новий пароль має відрізнятися від поточного');
  const passwordHash = await hashPassword(newPassword);
  const user = await prisma.$transaction(async (tx) => {
    await tx.session.deleteMany({ where: { userId: actor.id, ...(keepSessionId ? { NOT: { id: keepSessionId } } : {}) } });
    return tx.user.update({ where: { id: actor.id }, data: { passwordHash, mustChangePassword: false } });
  });
  await audit({ userId: actor.id, action: 'user.password', entityType: 'user', entityId: actor.id, summary: 'Змінено пароль' });
  return withInviter(user);
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
async function assertAdminLeft(userId: string, role: string, isActive: boolean): Promise<void> {
  if (role === 'admin' && isActive) return;
  const others = await prisma.user.count({ where: { role: 'admin', isActive: true, NOT: { id: userId } } });
  if (others === 0) throw new ApiError('VALIDATION_ERROR', 'Потрібен хоча б один активний адміністратор');
}
