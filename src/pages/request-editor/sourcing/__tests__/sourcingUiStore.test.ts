import { beforeEach, describe, expect, it } from 'vitest';
import { useSourcingUi } from '../sourcingUiStore';

const ui = () => useSourcingUi.getState();

describe('вигляд підбору окремо для кожної заявки', () => {
  beforeEach(() => useSourcingUi.setState({ views: {}, requestId: null }));

  it('фільтр, пошук і прокрутка повертаються разом із заявкою', () => {
    ui().open('r1');
    ui().setFilter('unapproved');
    ui().setSearch('кран');
    ui().rememberScroll(40);
    ui().openDrawer({ lineId: 'l1', blockId: 'b1' });

    ui().open('r2');
    expect([ui().filter, ui().search, ui().pendingScroll, ui().drawer]).toEqual(['all', '', null, null]);
    ui().setSearch('труба');

    ui().open('r1');
    expect([ui().filter, ui().search, ui().pendingScroll]).toEqual(['unapproved', 'кран', 40]);
    expect(ui().takePendingScroll()).toBe(40);
    expect(ui().takePendingScroll()).toBeNull();
    // панелі й діалоги — не з пам'яті, а чисті
    expect(ui().drawer).toBeNull();

    ui().open('r2');
    expect(ui().search).toBe('труба');
  });
});
