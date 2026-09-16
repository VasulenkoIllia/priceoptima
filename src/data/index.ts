// Єдина точка доступу до даних: модулі, які вже на сервері, ідуть у REST, решта — демо-дані в браузері.
import type { DataSource } from './DataSource';
import { createDataSource, SERVER_ENABLED } from './hybrid';

export const ds: DataSource = createDataSource();
export { SERVER_ENABLED };

// Один екземпляр джерела даних на вкладку — при зміні модуля в dev повне перезавантаження.
import.meta.hot?.accept(() => window.location.reload());

export type { DataSource, DataSourceEvent, LockAcquireResult, CallOptions } from './DataSource';
export { DataSourceError, errorMessage, isDataSourceError } from './errors';
export { qk } from './queryKeys';
