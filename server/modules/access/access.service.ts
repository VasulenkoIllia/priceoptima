// Запрошення (разове, 7 днів, роль обирає адмін) і скидання пароля разовим посиланням.
import type { AccessLink, User, UserRole } from '@prisma/client';
import { shortNameOf } from '@shared/format';
import type { AccessLinkCreated, AccessLinkDto, AccessLinkInfo } from '@shared/types';
import { prisma } from '../../db';
import { ApiError, duplicate, notFound } from '../../http/errors';
import { audit, userRefs } from '../audit/audit.service';
import { hashPassword } from '../auth/password';
import { ROLE_LABEL } from '../users/users.mapper';
import { INVITE_TTL_MS, linkState, LINK_STATE_MESSAGES, linkTokenHash, newLinkToken, RESET_TTL_MS } from './access.rules';
import type { InviteCreateBody, RegisterBody } from './access.schemas';

export async function createInvite(actor: User, input: InviteCreateBody, now = new Date()): Promise<AccessLinkCreated> {
  const token = newLinkToken();
  const link = await prisma.accessLink.create({
    data: {
      kind: 'invite',
      tokenHash: linkTokenHash(token),
      role: input.role,
      note: input.note,
      createdById: actor.id,
      expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
    },
  });
  await audit({
    userId: actor.id,
    action: 'user.invite',
    entityType: 'user',
    summary: `Запрошення: роль «${ROLE_LABEL[input.role]}»${input.note ? `, ${input.note}` : ''}`,
  });
  return { id: link.id, token, expiresAt: link.expiresAt.toISOString() };
}

export async function createResetLink(actor: User, userId: string, now = new Date()): Promise<AccessLinkCreated> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound('Користувача не знайдено');
  if (!user.isActive) throw new ApiError('INVALID_STATE', 'Користувача заблоковано — спершу розблокуйте');
  const token = newLinkToken();
  // попередні невикористані посилання цього користувача більше не діють
  await prisma.accessLink.updateMany({ where: { kind: 'reset', userId, usedAt: null, revokedAt: null }, data: { revokedAt: now } });
  const link = await prisma.accessLink.create({
    data: {
      kind: 'reset',
      tokenHash: linkTokenHash(token),
      userId,
      createdById: actor.id,
      expiresAt: new Date(now.getTime() + RESET_TTL_MS),
    },
  });
  await audit({ userId: actor.id, action: 'user.reset_link', entityType: 'user', entityId: userId, summary: `Посилання для зміни пароля: ${user.shortName}` });
  return { id: link.id, token, expiresAt: link.expiresAt.toISOString() };
}

export async function listAccessLinks(now = new Date()): Promise<AccessLinkDto[]> {
  const links = await prisma.accessLink.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  const users = await userRefs(links.flatMap((l) => [l.userId, l.createdById]));
  return links.map((l) => ({
    id: l.id,
    kind: l.kind,
    role: l.role,
    note: l.note,
    user: l.userId ? (users.get(l.userId) ?? null) : null,
    createdBy: users.get(l.createdById) ?? null,
    createdAt: l.createdAt.toISOString(),
    expiresAt: l.expiresAt.toISOString(),
    usedAt: l.usedAt?.toISOString() ?? null,
    state: linkState(l, now),
  }));
}

export async function revokeAccessLink(actor: User, id: string, now = new Date()): Promise<void> {
  const link = await prisma.accessLink.findUnique({ where: { id } });
  if (!link) throw notFound('Посилання не знайдено');
  if (linkState(link, now) !== 'valid') return;
  await prisma.accessLink.update({ where: { id }, data: { revokedAt: now } });
  await audit({ userId: actor.id, action: 'user.link_revoke', entityType: 'user', entityId: link.userId, summary: link.kind === 'invite' ? 'Запрошення скасовано' : 'Посилання для зміни пароля скасовано' });
}

async function linkByToken(token: string): Promise<AccessLink> {
  const link = await prisma.accessLink.findUnique({ where: { tokenHash: linkTokenHash(token) } });
  if (!link) throw notFound('Посилання не знайдено або вже не діє');
  return link;
}

function assertValid(link: AccessLink, now: Date): void {
  const state = linkState(link, now);
  if (state !== 'valid') throw new ApiError('INVALID_STATE', LINK_STATE_MESSAGES[state]);
}

/** Що показати людині, яка відкрила посилання. */
export async function getLinkInfo(token: string, now = new Date()): Promise<AccessLinkInfo> {
  const link = await linkByToken(token);
  const user = link.kind === 'reset' && link.userId ? await prisma.user.findUnique({ where: { id: link.userId } }) : null;
  return {
    kind: link.kind,
    state: linkState(link, now),
    role: link.role,
    expiresAt: link.expiresAt.toISOString(),
    login: user?.login ?? null,
    fullName: user?.fullName ?? null,
  };
}

/** Реєстрація за запрошенням: посилання одноразове — друга людина ним не скористається. */
export async function registerByInvite(token: string, input: RegisterBody, now = new Date()): Promise<User> {
  const link = await linkByToken(token);
  if (link.kind !== 'invite') throw notFound('Посилання не знайдено або вже не діє');
  assertValid(link, now);
  const taken = await prisma.user.findUnique({ where: { login: input.login }, select: { id: true } });
  if (taken) throw duplicate(`Логін «${input.login}» уже зайнятий — оберіть інший`);
  const passwordHash = await hashPassword(input.password);
  const user = await prisma.$transaction(async (tx) => {
    // позначаємо посилання використаним лише якщо воно ще вільне (дві вкладки одночасно — зареєструється одна)
    const claimed = await tx.accessLink.updateMany({ where: { id: link.id, usedAt: null, revokedAt: null }, data: { usedAt: now } });
    if (claimed.count !== 1) throw new ApiError('INVALID_STATE', LINK_STATE_MESSAGES.used);
    const created = await tx.user.create({
      data: {
        login: input.login,
        fullName: input.fullName,
        shortName: shortNameOf(input.fullName),
        phone: input.phone,
        email: input.email,
        role: (link.role ?? 'user') as UserRole,
        passwordHash,
        createdById: link.createdById,
      },
    });
    await tx.accessLink.update({ where: { id: link.id }, data: { userId: created.id } });
    return created;
  });
  await audit({ userId: user.id, action: 'user.register', entityType: 'user', entityId: user.id, summary: `Зареєструвався за запрошенням: ${user.fullName} (${user.login})` });
  return user;
}

/** Новий пароль за посиланням: інші сесії користувача закриваються. */
export async function resetPasswordByLink(token: string, password: string, now = new Date()): Promise<User> {
  const link = await linkByToken(token);
  if (link.kind !== 'reset' || !link.userId) throw notFound('Посилання не знайдено або вже не діє');
  assertValid(link, now);
  const passwordHash = await hashPassword(password);
  const user = await prisma.$transaction(async (tx) => {
    const claimed = await tx.accessLink.updateMany({ where: { id: link.id, usedAt: null, revokedAt: null }, data: { usedAt: now } });
    if (claimed.count !== 1) throw new ApiError('INVALID_STATE', LINK_STATE_MESSAGES.used);
    const target = await tx.user.findUnique({ where: { id: link.userId! } });
    if (!target?.isActive) throw new ApiError('INVALID_STATE', 'Обліковий запис заблоковано');
    await tx.session.deleteMany({ where: { userId: target.id } });
    return tx.user.update({ where: { id: target.id }, data: { passwordHash, mustChangePassword: false } });
  });
  await audit({ userId: user.id, action: 'user.reset', entityType: 'user', entityId: user.id, summary: 'Пароль змінено за посиланням' });
  return user;
}
