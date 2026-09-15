import { Empty } from 'antd';
import type { ReactNode } from 'react';

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  image?: ReactNode;
}

export function EmptyState({ title, description, action, image }: EmptyStateProps) {
  return (
    <Empty
      image={image ?? Empty.PRESENTED_IMAGE_SIMPLE}
      style={{ margin: '32px auto' }}
      description={
        <div>
          <div style={{ fontWeight: 600, color: 'rgba(0,0,0,0.85)' }}>{title}</div>
          {description ? <div style={{ marginTop: 4, color: 'rgba(0,0,0,0.55)' }}>{description}</div> : null}
        </div>
      }
    >
      {action}
    </Empty>
  );
}
