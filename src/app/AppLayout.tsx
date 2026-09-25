import {
  AppstoreOutlined,
  ColumnWidthOutlined,
  DollarOutlined,
  DownOutlined,
  FileTextOutlined,
  LogoutOutlined,
  SettingOutlined,
  ShopOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Avatar, Button, Dropdown, Layout, Menu, type MenuProps } from 'antd';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { USER_ROLE_LABELS } from '@shared/enums';
import { ds, errorMessage, qk } from '@/data';
import { initialsOf } from '@/lib/initials';
import { getRequestDocStore } from '@/stores/requestDocStore';
import { useTabs } from '@/stores/tabsStore';
import { useUiPrefs } from '@/stores/uiPrefsStore';
import { flushUiPrefs } from '@/stores/uiPrefsSync';
import { BRAND_COLOR } from '@/theme';
import { AppTabBar, AppTabPanes, useOpenTab } from './AppTabs';
import { ProfileDialog } from './ProfileDialog';
import { useSession } from './session';

const NAV_ITEMS: { key: string; label: string; icon: React.ReactNode; adminOnly?: boolean }[] = [
  { key: '/requests', label: 'Заявки', icon: <FileTextOutlined /> },
  { key: '/catalog', label: 'Номенклатура', icon: <AppstoreOutlined /> },
  { key: '/suppliers', label: 'Постачальники', icon: <ShopOutlined /> },
  { key: '/clients', label: 'Клієнти', icon: <TeamOutlined /> },
  { key: '/rates', label: 'Курси валют', icon: <DollarOutlined /> },
  { key: '/settings', label: 'Налаштування', icon: <SettingOutlined />, adminOnly: true },
];

export function AppLayout() {
  const { user } = useSession();
  const { message, modal } = App.useApp();
  const [profileOpen, setProfileOpen] = useState(false);
  const navigate = useNavigate();
  const openTab = useOpenTab();
  const location = useLocation();
  const queryClient = useQueryClient();
  const siderCollapsed = useUiPrefs((s) => s.siderCollapsed);
  const setSiderCollapsed = useUiPrefs((s) => s.setSiderCollapsed);
  const ownCompanies = useQuery({ queryKey: qk.ownCompanies, queryFn: () => ds.listOwnCompanies() });

  const isAdmin = user.role === 'admin';
  const company = ownCompanies.data?.find((c) => c.isDefault) ?? ownCompanies.data?.[0];
  const brand = company?.brandName || company?.nameShort;
  const selectedKey = `/${location.pathname.split('/')[1] || 'requests'}`;

  const menuItems: MenuProps['items'] = NAV_ITEMS.filter((i) => !i.adminOnly || isAdmin).map((i) => ({
    key: i.key,
    icon: i.icon,
    label: i.label,
  }));

  const logout = async () => {
    try {
      await getRequestDocStore().getState().flush();
      await flushUiPrefs();
      await ds.logout();
    } catch (e) {
      message.error(errorMessage(e));
    }
    queryClient.clear();
    queryClient.setQueryData(qk.me, null);
    useTabs.getState().reset();
    navigate('/login', { replace: true });
  };

  // ширина й порядок колонок зберігаються для користувача на сервері — повернути стандартні в усіх таблицях
  const resetLayout = () =>
    modal.confirm({
      title: 'Скинути вигляд таблиць?',
      content: 'У всіх таблицях колонки повернуться до стандартної ширини й порядку (на всіх ваших комп’ютерах).',
      okText: 'Скинути',
      cancelText: 'Скасувати',
      onOk: () => {
        useUiPrefs.getState().resetColumnLayout();
        message.success('Вигляд таблиць скинуто');
      },
    });

  const userMenu: MenuProps = {
    items: [
      { key: 'who', label: `${user.fullName} · ${USER_ROLE_LABELS[user.role]}`, disabled: true },
      { type: 'divider' },
      { key: 'profile', icon: <UserOutlined />, label: 'Мій профіль' },
      { key: 'layout', icon: <ColumnWidthOutlined />, label: 'Скинути вигляд таблиць' },
      { key: 'logout', icon: <LogoutOutlined />, label: 'Вийти' },
    ],
    onClick: ({ key }) => {
      if (key === 'logout') void logout();
      if (key === 'profile') setProfileOpen(true);
      if (key === 'layout') resetLayout();
    },
  };

  return (
    <Layout className="po-layout">
      <Layout.Header className="po-header">
        <div className="po-header-brand">
          <span className="po-header-product">PriceOptima</span>
          {brand ? (
            <span className="po-header-company" title={company?.nameShort}>
              {company?.logoUrl ? <img src={company.logoUrl} alt="" /> : null}
              <span>{brand}</span>
            </span>
          ) : null}
        </div>
        <div className="po-header-tabs">
          <AppTabBar />
        </div>
        <Dropdown menu={userMenu} trigger={['click']} placement="bottomRight">
          <Button type="text" style={{ height: 40, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Avatar size={28} style={{ background: BRAND_COLOR, fontSize: 12 }}>
              {initialsOf(user.shortName)}
            </Avatar>
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.15 }}>
              <span style={{ fontWeight: 600 }}>{user.shortName}</span>
              <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)' }}>{USER_ROLE_LABELS[user.role]}</span>
            </span>
            <DownOutlined style={{ fontSize: 10 }} />
          </Button>
        </Dropdown>
      </Layout.Header>
      <Layout>
        <Layout.Sider
          className="po-sider"
          width={216}
          collapsedWidth={56}
          collapsible
          collapsed={siderCollapsed}
          onCollapse={setSiderCollapsed}
          theme="light"
        >
          <Menu mode="inline" selectedKeys={[selectedKey]} items={menuItems} onClick={({ key }) => openTab(key)} style={{ paddingTop: 8 }} />
        </Layout.Sider>
        <Layout.Content className="po-content">
          <AppTabPanes />
        </Layout.Content>
      </Layout>
      <ProfileDialog open={profileOpen} user={user} onClose={() => setProfileOpen(false)} />
    </Layout>
  );
}
