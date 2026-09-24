// Вибір діючих курсів на дату — спільне правило (shared/pricing/general-rates.ts): сервер і сторінка курсів рахують однаково.
export { effectiveRatesOn, RATE_STALE_DAYS } from '@shared/pricing';
