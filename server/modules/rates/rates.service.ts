// Довідник курсів валют: історія НБУ (заповнює щоденне завдання) і ручні виправлення.
import type { Prisma, User } from '@prisma/client';
import type { ForeignCurrency } from '@shared/enums';
import { FOREIGN_CURRENCIES } from '@shared/enums';
import { toIsoDate } from '@shared/format';
import type { CurrencyRateDto, EffectiveRates, ISODate } from '@shared/types';
import { prisma } from '../../db';
import { ApiError } from '../../http/errors';
import { dateOnly } from '../../lib/mapping';
import { audit } from '../audit/audit.service';
import { toCurrencyRateDto } from './rates.mapper';
import { effectiveRatesOn } from './rates.rules';
import type { CancelManualRateBody, ManualRateBody, RatesQuery } from './rates.schemas';

/** Сьогоднішня календарна дата за київським часом. */
export function today(now = new Date()): ISODate {
  return toIsoDate(now);
}

export async function listRates(query: RatesQuery): Promise<CurrencyRateDto[]> {
  if (query.from && query.to && query.from > query.to) {
    throw new ApiError('VALIDATION_ERROR', 'Дата «з» пізніша за дату «по»');
  }
  const where: Prisma.CurrencyRateWhereInput = {
    currency: query.currency ?? { in: [...FOREIGN_CURRENCIES] },
  };
  if (query.from || query.to) {
    where.rateDate = {
      ...(query.from ? { gte: dateOnly(query.from) } : {}),
      ...(query.to ? { lte: dateOnly(query.to) } : {}),
    };
  }
  const rows = await prisma.currencyRate.findMany({ where, orderBy: [{ rateDate: 'asc' }, { currency: 'asc' }] });
  return rows.map(toCurrencyRateDto);
}

/** Ручний курс на дату; повторне введення на ту саму дату замінює попереднє значення. */
export async function addManualRate(body: ManualRateBody, actor: User): Promise<CurrencyRateDto> {
  const row = await prisma.currencyRate.upsert({
    where: {
      currency_rateDate_source: { currency: body.currency, rateDate: dateOnly(body.rateDate), source: 'manual' },
    },
    create: {
      currency: body.currency,
      rateDate: dateOnly(body.rateDate),
      rate: body.rate,
      source: 'manual',
      note: body.note,
      createdById: actor.id,
    },
    // повторне введення на ту саму дату знімає й скасування
    update: { rate: body.rate, note: body.note, fetchedAt: new Date(), createdById: actor.id, cancelledAt: null },
  });
  await audit({ userId: actor.id, action: 'rate.manual', entityType: 'rate', summary: `Ручний курс ${body.currency} на ${body.rateDate}: ${body.rate}` });
  return toCurrencyRateDto(row);
}

/**
 * «Скасувати ручний курс»: усі чинні ручні курси валюти позначаються скасованими (записи лишаються в історії),
 * далі діє НБУ, доки не введуть новий ручний. Повертає, скільки записів скасовано.
 */
export async function cancelManualRates(body: CancelManualRateBody, actor: User): Promise<{ cancelled: number }> {
  const { count } = await prisma.currencyRate.updateMany({
    where: { currency: body.currency, source: 'manual', cancelledAt: null },
    data: { cancelledAt: new Date() },
  });
  if (count) await audit({ userId: actor.id, action: 'rate.manual_cancel', entityType: 'rate', summary: `Скасовано ручний курс ${body.currency}` });
  return { cancelled: count };
}

/** Курс НБУ зі щоденного завдання. */
export async function saveNbuRate(currency: ForeignCurrency, rateDate: ISODate, rate: number): Promise<CurrencyRateDto> {
  const row = await prisma.currencyRate.upsert({
    where: { currency_rateDate_source: { currency, rateDate: dateOnly(rateDate), source: 'nbu' } },
    create: { currency, rateDate: dateOnly(rateDate), rate, source: 'nbu' },
    update: { rate, fetchedAt: new Date() },
  });
  return toCurrencyRateDto(row);
}

/** Діючі курси на дату (за замовчуванням — на сьогодні): більший із останнього курсу НБУ й останнього чинного ручного. */
export async function getEffectiveRates(date: ISODate | null): Promise<EffectiveRates> {
  const on = date ?? today();
  const rateDate = { lte: dateOnly(on) };
  const rows = await Promise.all(
    FOREIGN_CURRENCIES.flatMap((currency) => [
      prisma.currencyRate.findFirst({ where: { currency, source: 'nbu', rateDate }, orderBy: { rateDate: 'desc' } }),
      prisma.currencyRate.findFirst({ where: { currency, source: 'manual', cancelledAt: null, rateDate }, orderBy: { rateDate: 'desc' } }),
    ]),
  );
  return effectiveRatesOn(
    rows.filter((r) => r !== null).map(toCurrencyRateDto),
    on,
  );
}
