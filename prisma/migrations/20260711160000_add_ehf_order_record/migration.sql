-- CreateTable
CREATE TABLE "EhfOrderRecord" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderName" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL,
    "destinationCountry" TEXT,
    "destinationProvince" TEXT,
    "chargedCents" INTEGER NOT NULL DEFAULT 0,
    "expectedCents" INTEGER,
    "chargedLinesJson" TEXT NOT NULL DEFAULT '[]',
    "expectedLinesJson" TEXT NOT NULL DEFAULT '[]',
    "mismatch" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EhfOrderRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EhfOrderRecord_shop_processedAt_idx" ON "EhfOrderRecord"("shop", "processedAt");
