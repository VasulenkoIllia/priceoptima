// Змінні збірки Vite, які читає застосунок.
interface ImportMetaEnv {
  /** Вхід у прототип на сервері: логін (docker compose → build arg). */
  readonly VITE_AUTH_LOGIN?: string;
  /** Вхід у прототип на сервері: hex SHA-256 пароля. */
  readonly VITE_AUTH_PASSWORD_SHA256?: string;
}
