// Налаштування системи: один рядок у базі, назовні — тип AppSettings.
import type { User } from '@prisma/client';
import type { AppSettings, AppSettingsPatch } from '@shared/types';
import { DEFAULT_APP_SETTINGS, MAX_DISCOUNT_PCT } from '@shared/pricing';
import { validationError } from '../../http/errors';
import { prisma } from '../../db';
import { audit } from '../audit/audit.service';
import { SETTINGS_ID, toAppSettings, toSettingsRow } from './settings.mapper';
import { applySettingsPatch, assertCountersOnlyGrow } from './settings.rules';

/** Налаштування; якщо рядка ще немає (база щойно створена) — створюємо зі значень за замовчуванням. */
export async function getSettings(): Promise<AppSettings> {
  const row = await prisma.appSettings.findUnique({ where: { id: SETTINGS_ID } });
  if (row) return toAppSettings(row);
  const created = await prisma.appSettings.create({
    data: { id: SETTINGS_ID, ...toSettingsRow(DEFAULT_APP_SETTINGS) },
  });
  return toAppSettings(created);
}

export async function updateSettings(patch: AppSettingsPatch, actor: User): Promise<AppSettings> {
  const current = await getSettings();
  assertCountersOnlyGrow(current, patch);
  const next = applySettingsPatch(current, patch);
  // інакше нові заявки отримають знижку, з якою їх не можна буде зберегти
  if (next.defaultMarkupMethod === 'discount_from_rrp' && (next.defaultMarkupValue < 0 || next.defaultMarkupValue > MAX_DISCOUNT_PCT)) {
    throw validationError(`Знижка від РРЦ: від 0 до ${MAX_DISCOUNT_PCT} %`);
  }
  const row = await prisma.appSettings.update({ where: { id: SETTINGS_ID }, data: { ...toSettingsRow(next), updatedById: actor.id } });
  const changed = (Object.keys(patch) as (keyof AppSettings)[]).filter((k) => JSON.stringify(current[k]) !== JSON.stringify(next[k]));
  if (changed.length) {
    await audit({ userId: actor.id, action: 'settings.update', entityType: 'settings', summary: `Змінено налаштування: ${changed.join(', ')}`, details: { changed } });
  }
  return toAppSettings(row);
}
