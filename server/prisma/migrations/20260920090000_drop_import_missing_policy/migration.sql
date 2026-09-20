-- Налаштування «позиції, яких немає у прайсі» не використовувалось: позиції позначаються, а через 30 днів ідуть в архів.
ALTER TABLE "AppSettings" DROP COLUMN "importMissingPolicy";
