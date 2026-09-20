import { describe, expect, it } from 'vitest';
import { kpBuyerOf } from '../../pricing';
import { makeBlock, makeCtx, makeHeader, makeLine, makeSupplier, uah } from '../../pricing/__tests__/fixtures';
import type { KpDocumentDto, KpSettings, OwnCompanyDto } from '../../types';
import type { RequestDocState } from '../document';
import { statusEventSummary } from '../events';
import { buildKpVersion, KpBuildError, kpEventSummary, type KpBuildInput } from '../kp';

const OWN = {
  id: 'own-1',
  nameShort: 'ТОВ «ТЕСТ ТРЕЙД»',
  nameFull: 'ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ «ТЕСТ ТРЕЙД»',
  edrpou: '12345678',
  ipn: null,
  isVatPayer: true,
  iban: null,
  bankName: null,
  addressLegal: null,
  phone: null,
  email: null,
  website: null,
  slogan: null,
  logoUrl: null,
  kpFooter: null,
} as unknown as OwnCompanyDto;

const state = (): RequestDocState => ({
  header: makeHeader({ number: 7 }),
  markup: { method: 'markup_on_cost', value: 20, rounding: 'kopecks', excludeUnavailable: false },
  lines: [makeLine('L1', 2, { position: 1 }), makeLine('L2', 5, { position: 2 }), makeLine('L3', 1, { position: 3 })],
  blocks: [makeBlock('A', 1)],
  offers: [uah('L1', 'A', 100), uah('L2', 'A', 50)],
});

function input(s: RequestDocState, kps: KpDocumentDto[] = [], patch: Partial<KpBuildInput> = {}): KpBuildInput {
  return {
    state: s,
    kps,
    settings: s.header.kpSettings as KpSettings,
    final: false,
    kpNumber: 2114,
    date: '2026-09-18',
    ctx: makeCtx([makeSupplier('A')]),
    parties: { ownCompanyId: OWN.id, seller: OWN, buyer: kpBuyerOf(undefined, 'Клієнт', undefined), managerName: 'Коваль О.В.' },
    defaultTerms: [{ label: 'Умови поставки', value: 'Самовивіз' }],
    ...patch,
  };
}

/** Версія КП, як її зберігає сервер. */
function asDto(built: ReturnType<typeof buildKpVersion>, version: number, final: boolean): KpDocumentDto {
  const t = built.snapshot.totals;
  return {
    id: `kp-${version}`,
    requestId: 'r',
    kpNumber: built.snapshot.kpNumber!,
    numberLabel: built.snapshot.numberLabel,
    version,
    vatMode: t.vatMode,
    ownCompanyId: built.ownCompanyId,
    onlyApproved: final,
    settings: built.settings,
    totalNet: t.totalNet,
    totalVat: t.vat,
    totalGross: t.totalGross,
    snapshot: built.snapshot,
    sentAt: null,
    createdAt: '2026-09-18T10:00:00Z',
    createdBy: null,
  };
}

describe('версія КП', () => {
  it('номер сталий «2114 / номер заявки»; рядки без ціни продажу в КП не йдуть; типові умови з Налаштувань', () => {
    const built = buildKpVersion(input(state()));
    expect(built.snapshot.numberLabel).toBe('2114 / 000007');
    expect(built.snapshot.rows.map((r) => r.lineId)).toEqual(['L1', 'L2']);
    expect(built.snapshot.terms).toEqual([{ label: 'Умови поставки', value: 'Самовивіз' }]);
    expect(kpEventSummary(asDto(built, 1, false), OWN.nameShort)).toContain('Сформовано КП № 2114 / 000007 · ТОВ «ТЕСТ ТРЕЙД»');
  });

  it('без жодної ціни продажу — помилка, номер не витрачається', () => {
    const s = { ...state(), offers: [] };
    expect(() => buildKpVersion(input(s))).toThrow(KpBuildError);
  });

  it('«Назва 1С»: актуальна з каталогу, навіть якщо її завантажили після підбору товару', () => {
    const s = state();
    s.offers = s.offers.map((o) => (o.lineId === 'L1' ? { ...o, name1c: null, catalog: { name1c: 'Назва з 1С для КП' } as never } : o));
    const built = buildKpVersion(input(s, [], { settings: { ...(s.header.kpSettings as KpSettings), nameSource: 'name1c' } }));
    expect(built.snapshot.rows.find((r) => r.lineId === 'L1')?.name).toBe('Назва з 1С для КП');
  });

  it('фото: лише коли ввімкнено «Додати фото», і лише для товарів каталогу', () => {
    const s = state();
    const images = new Map([['p-L1-A', '/api/images/photo-1']]);
    const settings = s.header.kpSettings as KpSettings;
    expect(buildKpVersion(input(s, [], { images })).snapshot.rows.map((r) => r.imagePath)).toEqual([null, null]);
    const withPhotos = buildKpVersion(input(s, [], { images, settings: { ...settings, showImages: true } })).snapshot;
    expect(withPhotos.columns.showImages).toBe(true);
    expect(withPhotos.rows.map((r) => r.imagePath)).toEqual(['/api/images/photo-1', null]);
  });

  it('фінальне: лише погоджені рядки КП-основи з погодженою к-стю; без основи чи без погоджених — помилка', () => {
    const s = state();
    expect(() => buildKpVersion(input(s, [], { final: true }))).toThrow('Спершу сформуйте КП');
    const base = asDto(buildKpVersion(input(s)), 1, false);
    expect(() => buildKpVersion(input(s, [base], { final: true }))).toThrow('Немає погоджених позицій');

    s.lines = s.lines.map((l) => (l.id === 'L2' ? { ...l, approval: { approved: true, approvedQty: 3 } } : l));
    const fin = buildKpVersion(input(s, [base], { final: true }));
    expect(fin.snapshot.final).toBe(true);
    expect(fin.snapshot.numberLabel).toBe(base.numberLabel);
    expect(fin.snapshot.rows.map((r) => [r.lineId, r.qty])).toEqual([['L2', 3]]);
    expect(fin.settings.onlyApproved).toBe(true);
    expect(kpEventSummary(asDto(fin, 2, true), OWN.nameShort)).toMatch(/^Сформовано фінальне КП № 2114 \/ 000007 · позицій: 1 · [\d\s\u00a0]+,\d{2} грн$/u);
  });
});

describe('подія статусу', () => {
  it('скасування — з причиною', () => {
    expect(statusEventSummary('in_progress', 'cancelled', 'Клієнт відмовився')).toBe('Статус: «В роботі» → «Скасовано». Причина: Клієнт відмовився');
    expect(statusEventSummary('done', 'in_progress', null)).toBe('Статус: «Виконано» → «В роботі»');
  });
});
