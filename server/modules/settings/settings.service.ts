// Налаштування системи: один рядок у базі, назовні — тип AppSettings.
import type { AppSettings, AppSettingsPatch } from '@shared/types';
import { DEFAULT_APP_SETTINGS } from '@shared/pricing';
import { prisma } from '../../db';
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

export async function updateSettings(patch: AppSettingsPatch): Promise<AppSettings> {
  const current = await getSettings();
  assertCountersOnlyGrow(current, patch);
  const next = applySettingsPatch(current, patch);
  const row = await prisma.appSettings.update({ where: { id: SETTINGS_ID }, data: toSettingsRow(next) });
  return toAppSettings(row);
}
