// Поля, які повторюються в схемах довідників: обрізані тексти з межею довжини,
// необов'язкові тексти (порожній рядок = «не вказано») і дати у форматі ISO.
import { z } from 'zod';

/** Обов'язковий текст: обрізаний, непорожній, не довший за max. */
export const trimmed = (max: number, required: string) =>
  z.string({ message: required }).trim().min(1, required).max(max, `Задовге значення (до ${max} символів)`);

/** Необов'язковий текст: порожній рядок, null і undefined однаково означають «немає значення». */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Задовге значення (до ${max} символів)`)
    .nullish()
    .transform((v) => v || null);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;

/** Календарна дата '2026-09-11' (перевіряємо й існування дати: 31 лютого не пройде). */
export const isoDateString = (label: string) =>
  z
    .string({ message: `${label}: вкажіть дату` })
    .regex(ISO_DATE, `${label}: дата у форматі РРРР-ММ-ДД`)
    .refine(isRealDate, `${label}: такої дати не існує`);

function isRealDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export const optionalIsoDateString = (label: string) => isoDateString(label).nullish().transform((v) => v ?? null);

/** Число з межами (гроші, відсотки, курси). */
export const numberField = (min: number, max: number, label: string) =>
  z
    .number({ message: `${label}: вкажіть число` })
    .min(min, `${label}: не менше ${min}`)
    .max(max, `${label}: не більше ${max}`);

export const optionalNumberField = (min: number, max: number, label: string) =>
  numberField(min, max, label)
    .nullish()
    .transform((v) => v ?? null);
