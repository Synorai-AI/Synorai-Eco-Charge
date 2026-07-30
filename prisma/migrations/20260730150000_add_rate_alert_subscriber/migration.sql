-- CreateTable
CREATE TABLE "RateAlertSubscriber" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "src" TEXT NOT NULL DEFAULT 'direct',
    "unsubscribeToken" TEXT NOT NULL,
    "unsubscribedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateAlertSubscriber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RateAlertSubscriber_email_key" ON "RateAlertSubscriber"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RateAlertSubscriber_unsubscribeToken_key" ON "RateAlertSubscriber"("unsubscribeToken");

-- CreateIndex
CREATE INDEX "RateAlertSubscriber_unsubscribedAt_idx" ON "RateAlertSubscriber"("unsubscribedAt");
