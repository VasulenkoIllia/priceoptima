-- Налаштування інтерфейсу користувача на сервері (ширина колонок тощо): нова таблиця, наявні дані не змінюються.
CREATE TABLE "UserUiPrefs" (
    "userId" TEXT NOT NULL,
    "prefs" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserUiPrefs_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "UserUiPrefs" ADD CONSTRAINT "UserUiPrefs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
