// Вкладки застосунку: смуга вкладок у шапці й вміст, де кожна відкрита вкладка лишається змонтованою
// (фільтри, прокрутка, відкрита картка не губляться при переході в інший розділ).
// Заявка тримає блокування й свій документ в одному сторі, тому змонтованою лишається лише остання активна заявка —
// інша заявка при поверненні відкривається заново (усе збережено автоматично).
import {
  AppstoreOutlined,
  DollarOutlined,
  FileTextOutlined,
  ProfileOutlined,
  SettingOutlined,
  ShopOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { ConfigProvider, Tabs } from 'antd';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useRoutes, type Location } from 'react-router';
import { isRequestTab, tabKeyOf, tabPathOf, tabTitleOf, useTabs, type AppTab } from '@/stores/tabsStore';
import { APP_ROUTES } from './appRoutes';

interface TabContextValue {
  key: string;
  active: boolean;
}

const TabContext = createContext<TabContextValue>({ key: '', active: true });

/** Вкладка, у якій рендериться компонент, і чи вона зараз на екрані. */
export function useTabContext(): TabContextValue {
  return useContext(TabContext);
}

/** Назва своєї вкладки (напр. «Заявка 000008»); null — назва розділу. */
export function useTabTitle(title: string | null): void {
  const { key } = useTabContext();
  const setTitle = useTabs((s) => s.setTitle);
  useEffect(() => {
    if (key) setTitle(key, title);
  }, [key, title, setTitle]);
}

/** Перейти в розділ чи заявку: якщо вкладка вже відкрита — повертаємось туди, де в ній зупинились. */
export function useOpenTab(): (path: string) => void {
  const navigate = useNavigate();
  return useCallback(
    (path: string) => {
      const [pathname] = path.split('?');
      const existing = useTabs.getState().tabs.find((t) => t.key === tabKeyOf(pathname));
      // адреса розділу чи заявки без підсторінки — повертаємось у збережений стан вкладки; точна підсторінка — саме її
      if (existing && (existing.pathname === pathname || existing.pathname.startsWith(`${pathname}/`))) {
        navigate(tabPathOf(existing), { state: existing.state });
      } else {
        navigate(path);
      }
    },
    [navigate],
  );
}

const TAB_ICONS: Record<string, ReactNode> = {
  requests: <FileTextOutlined />,
  catalog: <AppstoreOutlined />,
  suppliers: <ShopOutlined />,
  clients: <TeamOutlined />,
  rates: <DollarOutlined />,
  settings: <SettingOutlined />,
};

const iconOf = (key: string) => (isRequestTab(key) ? <ProfileOutlined /> : (TAB_ICONS[key] ?? null));

/** Запам'ятовує кожну відкриту адресу у вкладках. Рендериться один раз у макеті. */
function useTrackLocation(): void {
  const location = useLocation();
  const visit = useTabs((s) => s.visit);
  useEffect(() => {
    visit({ pathname: location.pathname, search: location.search, state: location.state });
  }, [location.pathname, location.search, location.state, visit]);
}

/** Смуга вкладок у шапці. */
export function AppTabBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const tabs = useTabs((s) => s.tabs);
  const activeKey = tabKeyOf(location.pathname);
  const close = useTabs((s) => s.close);

  const goTo = (tab: AppTab) => navigate(tabPathOf(tab), { state: tab.state });

  const closeTab = (key: string) => {
    const next = close(key);
    if (next) goTo(next);
    else if (!useTabs.getState().tabs.length) navigate('/requests');
  };

  return (
    <Tabs
      className="po-app-tabs"
      type="editable-card"
      size="small"
      hideAdd
      activeKey={activeKey}
      onChange={(key) => {
        const tab = tabs.find((t) => t.key === key);
        if (tab) goTo(tab);
      }}
      onEdit={(key, action) => {
        if (action === 'remove' && typeof key === 'string') closeTab(key);
      }}
      items={tabs.map((t) => ({
        key: t.key,
        closable: tabs.length > 1,
        label: (
          <span
            className="po-app-tab-label"
            title={tabTitleOf(t)}
            // середня кнопка миші закриває вкладку, як у браузері
            onMouseDown={(e) => {
              if (e.button === 1 && tabs.length > 1) {
                e.preventDefault();
                closeTab(t.key);
              }
            }}
          >
            {iconOf(t.key)}
            <span className="po-app-tab-text">{tabTitleOf(t)}</span>
          </span>
        ),
      }))}
    />
  );
}

function TabRoutes({ location }: { location: Partial<Location> }) {
  return useRoutes(APP_ROUTES, location);
}

function TabPane({ tab, active, location }: { tab: AppTab; active: boolean; location: Location }) {
  // активна вкладка бачить живу адресу (з state навігації), неактивна — ту, на якій її залишили
  const stored = useMemo<Partial<Location>>(
    () => ({ pathname: tab.pathname, search: tab.search, hash: '', state: tab.state, key: tab.key }),
    [tab.pathname, tab.search, tab.state, tab.key],
  );
  const context = useMemo(() => ({ key: tab.key, active }), [tab.key, active]);
  const paneRef = useRef<HTMLDivElement>(null);
  // вікна, бічні панелі й підказки вкладки рендеряться всередині неї: сховали вкладку — сховались і вони
  const popupContainer = useCallback(() => paneRef.current ?? document.body, []);
  return (
    <div ref={paneRef} className="po-tab-pane" hidden={!active}>
      <ConfigProvider getPopupContainer={popupContainer}>
        <TabContext.Provider value={context}>
          <TabRoutes location={active ? location : stored} />
        </TabContext.Provider>
      </ConfigProvider>
    </div>
  );
}

/** Вміст макета: усі відкриті (і вже показані хоч раз) вкладки, видно лише активну. */
export function AppTabPanes() {
  useTrackLocation();
  const location = useLocation();
  const tabs = useTabs((s) => s.tabs);
  const [shown, setShown] = useState<ReadonlySet<string>>(() => new Set());
  const lastRequestKey = useRef<string | null>(null);

  // активна вкладка — за адресою, а не за стором: стор оновлюється ефектом, на кадр пізніше
  const currentKey = tabKeyOf(location.pathname);

  // розділ монтуємо при першому показі (після перезавантаження не відкриваємо всі вкладки разом)
  useEffect(() => {
    if (!shown.has(currentKey)) setShown((prev) => new Set(prev).add(currentKey));
  }, [currentKey, shown]);

  // закриті вкладки — з пам'яті
  useEffect(() => {
    const open = new Set(tabs.map((t) => t.key));
    open.add(currentKey);
    if ([...shown].some((k) => !open.has(k))) setShown((prev) => new Set([...prev].filter((k) => open.has(k))));
  }, [tabs, shown, currentKey]);

  // заявка — одна змонтована: друга заявка в тому самому сторі не вміститься, а дві одночасно зіпсували б блокування
  if (isRequestTab(currentKey)) lastRequestKey.current = currentKey;
  else if (lastRequestKey.current && !tabs.some((t) => t.key === lastRequestKey.current)) lastRequestKey.current = null;

  // нова адреса з'являється в сторі ефектом — до того показуємо її тимчасовою вкладкою з тим самим ключем
  const list: AppTab[] = tabs.some((t) => t.key === currentKey)
    ? tabs
    : [...tabs, { key: currentKey, pathname: location.pathname, search: location.search, state: location.state ?? null, title: null, lastActiveAt: 0 }];

  const mounted = list.filter((t) => {
    if (t.key === currentKey) return true;
    if (isRequestTab(t.key)) return t.key === lastRequestKey.current;
    return shown.has(t.key);
  });

  return (
    <>
      {mounted.map((t) => (
        <TabPane key={t.key} tab={t} active={t.key === currentKey} location={location} />
      ))}
    </>
  );
}
