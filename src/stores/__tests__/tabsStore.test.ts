import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_TABS, tabKeyOf, tabTitleOf, useTabs } from '../tabsStore';

const visit = (pathname: string, now: number, search = '') => useTabs.getState().visit({ pathname, search }, now);
const keys = () => useTabs.getState().tabs.map((t) => t.key);

beforeEach(() => {
  useTabs.getState().reset();
  sessionStorage.clear();
});

describe('ключ вкладки', () => {
  it('розділ — за першим сегментом, заявка — окремо за id, корінь — реєстр заявок', () => {
    expect(tabKeyOf('/catalog')).toBe('catalog');
    expect(tabKeyOf('/requests')).toBe('requests');
    expect(tabKeyOf('/requests/abc')).toBe('request:abc');
    expect(tabKeyOf('/requests/abc/kp')).toBe('request:abc');
    expect(tabKeyOf('/')).toBe('requests');
  });

  it('назва: власна або назва розділу', () => {
    expect(tabTitleOf({ key: 'catalog', title: null })).toBe('Номенклатура');
    expect(tabTitleOf({ key: 'request:abc', title: null })).toBe('Заявка');
    expect(tabTitleOf({ key: 'request:abc', title: 'Заявка 000008' })).toBe('Заявка 000008');
  });
});

describe('відкриття й закриття вкладок', () => {
  it('перехід у розділ відкриває вкладку, повернення — активує наявну й запам’ятовує адресу', () => {
    visit('/requests', 1);
    visit('/requests/abc', 2);
    visit('/catalog', 3, '?q=кран');
    visit('/requests/abc/kp', 4);
    expect(keys()).toEqual(['requests', 'request:abc', 'catalog']);
    expect(useTabs.getState().activeKey).toBe('request:abc');
    const request = useTabs.getState().tabs.find((t) => t.key === 'request:abc');
    expect(request?.pathname).toBe('/requests/abc/kp');
    expect(useTabs.getState().tabs.find((t) => t.key === 'catalog')?.search).toBe('?q=кран');
  });

  it('закриття активної вкладки активує сусідню праворуч, а крайньої — ліворуч', () => {
    visit('/requests', 1);
    visit('/catalog', 2);
    visit('/suppliers', 3);
    visit('/catalog', 4);
    expect(useTabs.getState().close('catalog')?.key).toBe('suppliers');
    expect(useTabs.getState().close('suppliers')?.key).toBe('requests');
    expect(keys()).toEqual(['requests']);
  });

  it('закриття неактивної вкладки не змінює активну', () => {
    visit('/requests', 1);
    visit('/catalog', 2);
    expect(useTabs.getState().close('requests')).toBeNull();
    expect(useTabs.getState().activeKey).toBe('catalog');
  });

  it(`понад ${MAX_TABS} вкладок — закривається та, яку найдовше не відкривали`, () => {
    visit('/requests', 1);
    for (let i = 0; i < MAX_TABS; i++) visit(`/requests/r${i}`, 10 + i);
    visit('/requests', 100);
    visit('/catalog', 101);
    expect(keys()).toHaveLength(MAX_TABS);
    expect(keys()).not.toContain('request:r0');
    expect(keys()).not.toContain('request:r1');
    expect(keys()).toContain('requests');
    expect(keys()).toContain('catalog');
  });

  it('назву задає сторінка; зайвого оновлення стану немає', () => {
    visit('/requests/abc', 1);
    useTabs.getState().setTitle('request:abc', 'Заявка 000008');
    const before = useTabs.getState().tabs;
    useTabs.getState().setTitle('request:abc', 'Заявка 000008');
    expect(useTabs.getState().tabs).toBe(before);
    expect(before[0].title).toBe('Заявка 000008');
  });
});
