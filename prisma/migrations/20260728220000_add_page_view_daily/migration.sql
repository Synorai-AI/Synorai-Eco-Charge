-- CreateTable
CREATE TABLE "PageViewDaily" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "src" TEXT NOT NULL DEFAULT 'direct',
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageViewDaily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PageViewDaily_path_date_idx" ON "PageViewDaily"("path", "date");
