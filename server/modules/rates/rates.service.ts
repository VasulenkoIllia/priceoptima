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
import type { ManualRateBody, RatesQuery } from './rates.schemas';

/** Скільки останніх записів по валюті достатньо, щоб знайти діючий курс на дату. */
const LOOKBACK_ROWS = 4;

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
    update: { rate: body.rate, note: body.note, fetchedAt: new Date(), createdById: actor.id },
  });
  await audit({ userId: actor.id, action: 'rate.manual', entityType: 'rate', summary: `Ручний курс ${body.currency} на ${body.rateDate}: ${body.rate}` });
  return toCurrencyRateDto(row);
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

/** Діючі курси на дату (за замовчуванням — на сьогодні). */
export async function getEffectiveRates(date: ISODate | null): Promise<EffectiveRates> {
  const on = date ?? today();
  const perCurrency = await Promise.all(
    FOREIGN_CURRENCIES.map((currency) =>
      prisma.currencyRate.findMany({
        where: { currency, rateDate: { lte: dateOnly(on) } },
        orderBy: [{ rateDate: 'desc' }],
        take: LOOKBACK_ROWS,
      }),
    ),
  );
  return effectiveRatesOn(perCurrency.flat().map(toCurrencyRateDto), on);
}
