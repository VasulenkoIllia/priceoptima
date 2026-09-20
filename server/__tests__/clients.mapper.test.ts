// @vitest-environment node
import type { Client, ClientContact, Counterparty, User } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import type { ClientRow } from '../modules/clients/clients.mapper';
import { lookupLabel, lookupTokens, toClientDetail, toClientListItem, toLookupItems } from '../modules/clients/clients.mapper';

const CLIENT_ID = 'aa000000-0000-4000-8000-000000000001';
const CP_ID = 'bb000000-0000-4000-8000-000000000001';

const responsible: User = {
  id: 'cc000000-0000-4000-8000-000000000001',
  login: 'koval',
  passwordHash: null,
  fullName: 'Коваль Олексій Вікторович',
  shortName: 'Коваль О.В.',
  role: 'user',
  email: null,
  phone: null,
  isActive: true,
  lastLoginAt: null,
  blockedAt: null,
  mustChangePassword: false,
  createdById: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const counterparty: Counterparty = {
  id: CP_ID,
  clientId: CLIENT_ID,
  nameShort: 'ТОВ «ВК АВТОСТРАДА»',
  nameFull: 'ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ «ВК АВТОСТРАДА»',
  edrpou: '44305608',
  ipn: null,
  isVatPayer: true,
  legalAddress: 'м. Київ, вул. Прикладна, 2',
  actualAddress: null,
  note: 'Оплата через тендерний відділ',
  isDefault: true,
  isActive: true,
};

const contact: ClientContact = {
  id: 'dd000000-0000-4000-8000-000000000001',
  clientId: CLIENT_ID,
  counterpartyId: CP_ID,
  fullName: 'Петренко Андрій',
  position: 'Менеджер з постачання',
  phone: '067-000-12-34',
  email: null,
  note: null,
  isDefault: true,
  isActive: true,
};

const client: Client = {
  id: CLIENT_ID,
  version: 1,
  name: 'АВТОСТРАДА',
  notes: 'Працюємо з 2024 року',
  responsibleUserId: responsible.id,
  isActive: true,
  createdAt: new Date('2026-01-10T08:00:00.000Z'),
  updatedAt: new Date('2026-09-15T10:30:00.000Z'),
  createdById: null,
  updatedById: null,
};

const row: ClientRow = {
  ...client,
  counterparties: [counterparty],
  contacts: [contact],
  responsibleUser: responsible,
};

describe('картка клієнта', () => {
  it('поля бази лягають у назви, які чекає фронт', () => {
    const detail = toClientDetail(row);
    expect(detail.note).toBe('Працюємо з 2024 року');
    expect(detail.counterparties[0].addressLegal).toBe('м. Київ, вул. Прикладна, 2');
    expect(detail.counterparties[0].addressActual).toBeNull();
    expect(detail.counterparties[0].note).toBe('Оплата через тендерний відділ');
    expect(detail.contacts[0].isPrimary).toBe(true);
    expect(detail.contacts[0].clientId).toBe(CLIENT_ID);
    expect(detail.contacts[0].counterpartyId).toBe(CP_ID);
    expect(detail.createdAt).toBe('2026-01-10T08:00:00.000Z');
    expect(detail.updatedAt).toBe('2026-09-15T10:30:00.000Z');
  });

  it('контакт без юрособи лишається контактом клієнта', () => {
    const detail = toClientDetail({ ...row, contacts: [{ ...contact, counterpartyId: null }] });
    expect(detail.contacts[0].counterpartyId).toBeNull();
    expect(detail.contacts[0].clientId).toBe(CLIENT_ID);
  });
});

describe('клієнт у списку', () => {
  it('короткі відомості про контрагентів, контакти й відповідального', () => {
    const item = toClientListItem(row);
    expect(item.counterparties).toEqual([{ id: CP_ID, nameShort: counterparty.nameShort, edrpou: '44305608' }]);
    expect(item.contactsCount).toBe(1);
    expect(item.responsible).toEqual({ id: responsible.id, shortName: 'Коваль О.В.' });
    // заявки з'являться в модулі 2
    expect(item.requestsCount).toBe(0);
    expect(item.lastRequestDate).toBeNull();
  });

  it('без відповідального — null, а не порожній об’єкт', () => {
    expect(toClientListItem({ ...row, responsibleUser: null }).responsible).toBeNull();
  });
});

describe('підказки пошуку клієнта', () => {
  it('рядок підказки — клієнт / контрагент (ЄДРПОУ)', () => {
    expect(lookupLabel('АВТОСТРАДА', counterparty)).toBe('АВТОСТРАДА / ТОВ «ВК АВТОСТРАДА» (44305608)');
    expect(lookupLabel('АВТОСТРАДА', { nameShort: 'ФОП Іванов', edrpou: null })).toBe('АВТОСТРАДА / ФОП Іванов');
    expect(lookupLabel('АВТОСТРАДА', null)).toBe('АВТОСТРАДА');
  });

  it('по рядку на кожного контрагента', () => {
    const second: Counterparty = { ...counterparty, id: 'bb000000-0000-4000-8000-000000000002', nameShort: 'ФОП Іванов', edrpou: null, isDefault: false };
    expect(toLookupItems({ ...row, counterparties: [counterparty, second] }, [])).toHaveLength(2);
  });

  it('клієнт без контрагентів теж потрапляє в підказки', () => {
    const items = toLookupItems({ ...row, counterparties: [] }, lookupTokens('автострада'));
    expect(items).toEqual([
      { clientId: CLIENT_ID, clientName: 'АВТОСТРАДА', counterpartyId: null, counterpartyName: null, edrpou: null, label: 'АВТОСТРАДА' },
    ]);
  });

  it('шукаємо за назвою, назвою контрагента й ЄДРПОУ', () => {
    expect(toLookupItems(row, lookupTokens('автострада'))).toHaveLength(1);
    expect(toLookupItems(row, lookupTokens('44305608'))).toHaveLength(1);
    expect(toLookupItems(row, lookupTokens('вк автострада'))).toHaveLength(1);
    expect(toLookupItems(row, lookupTokens('епіцентр'))).toHaveLength(0);
  });

  it('усі слова запиту мають знайтися', () => {
    expect(toLookupItems(row, lookupTokens('автострада 44305608'))).toHaveLength(1);
    expect(toLookupItems(row, lookupTokens('автострада 11111111'))).toHaveLength(0);
  });

  it('порожній запит — без слів, тож підходять усі', () => {
    expect(lookupTokens('   ')).toEqual([]);
    expect(toLookupItems(row, lookupTokens(''))).toHaveLength(1);
  });
});
