-- «Довідник» (правки замовника 21.10, п.11): спільні аркуші-таблиці.
-- Лише нова таблиця: наявні дані не змінюються.
CREATE TABLE "ReferenceSheet" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "columns" JSONB NOT NULL,
    "rows" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "ReferenceSheet_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReferenceSheet_sortOrder_idx" ON "ReferenceSheet"("sortOrder");
