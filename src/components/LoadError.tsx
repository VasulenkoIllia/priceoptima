// Помилка завантаження з кнопкою «Спробувати ще раз» (короткі збої запит уже повторив сам).
import { Alert, Button, Result } from 'antd';
import { errorMessage } from '@/data/errors';

export interface LoadErrorProps {
  title: string;
  error: unknown;
  onRetry(): unknown;
  /** Рядок у блоці сторінки замість заглушки на всю сторінку. */
  inline?: boolean;
  status?: 'error' | 'warning';
}

export function LoadError({ title, error, onRetry, inline, status = 'error' }: LoadErrorProps) {
  const retry = (
    <Button size={inline ? 'small' : 'middle'} onClick={() => void onRetry()}>
      Спробувати ще раз
    </Button>
  );
  if (inline) return <Alert type={status} showIcon message={title} description={errorMessage(error)} action={retry} />;
  return <Result status={status} title={title} subTitle={errorMessage(error)} extra={retry} />;
}
