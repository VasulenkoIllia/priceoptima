import { Tabs } from 'antd';
import { PageHeader } from '@/components';
import { OwnCompaniesTab } from './OwnCompaniesTab';
import { ParamsTab } from './ParamsTab';
import { UnitsTab } from './UnitsTab';
import { UsersTab } from './UsersTab';
import './settings.css';

/** Налаштування (лише адміністратор): параметри, наші юрособи, користувачі, одиниці виміру. */
export default function SettingsPage() {
  return (
    <div className="po-page po-set-page">
      <PageHeader title="Налаштування" subtitle="Параметри системи, реквізити наших юросіб, користувачі й одиниці виміру" />
      <Tabs
        className="po-set-tabs"
        items={[
          { key: 'params', label: 'Параметри', children: <ParamsTab /> },
          { key: 'companies', label: 'Наші юрособи', children: <OwnCompaniesTab /> },
          { key: 'users', label: 'Користувачі', children: <UsersTab /> },
          { key: 'units', label: 'Одиниці виміру', children: <UnitsTab /> },
        ]}
      />
    </div>
  );
}
