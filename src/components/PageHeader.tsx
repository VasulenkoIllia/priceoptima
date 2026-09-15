import { Typography } from 'antd';
import type { ReactNode } from 'react';

export interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Кнопки праворуч. */
  extra?: ReactNode;
}

export function PageHeader({ title, subtitle, extra }: PageHeaderProps) {
  return (
    <div className="po-page-header">
      <div>
        <Typography.Title level={4} className="po-page-title">
          {title}
        </Typography.Title>
        {subtitle ? <Typography.Text type="secondary">{subtitle}</Typography.Text> : null}
      </div>
      {extra ? <div className="po-toolbar">{extra}</div> : null}
    </div>
  );
}
