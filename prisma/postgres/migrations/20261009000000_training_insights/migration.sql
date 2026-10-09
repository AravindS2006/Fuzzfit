-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "coachNote" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Metric" ADD COLUMN     "quality" DOUBLE PRECISION,
ADD COLUMN     "rangeDegrees" DOUBLE PRECISION,
ADD COLUMN     "rejectedReps" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "repSeconds" DOUBLE PRECISION,
ADD COLUMN     "trackingCoverage" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "WorkoutSummary" ADD COLUMN     "totalHoldSeconds" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "WorkoutSet" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "classId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "exercise" TEXT NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "setNumber" INTEGER NOT NULL,
    "target" INTEGER NOT NULL,
    "reps" INTEGER NOT NULL,
    "holdMs" INTEGER NOT NULL DEFAULT 0,
    "activeMs" INTEGER NOT NULL,
    "trackedMs" INTEGER NOT NULL,
    "formScore" DOUBLE PRECISION,
    "qualityScore" DOUBLE PRECISION,
    "rangeDegrees" DOUBLE PRECISION,
    "repSeconds" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION,
    "rejectedReps" INTEGER NOT NULL DEFAULT 0,
    "loadKg" DOUBLE PRECISION,
    "completed" BOOLEAN NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkoutSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckIn" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "energy" INTEGER NOT NULL,
    "soreness" INTEGER NOT NULL,
    "effort" INTEGER,
    "sleepHours" DOUBLE PRECISION,
    "bodyweightKg" DOUBLE PRECISION,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanAssignment" (
    "id" TEXT NOT NULL,
    "studioId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkoutSet_userId_endedAt_idx" ON "WorkoutSet"("userId", "endedAt");

-- CreateIndex
CREATE INDEX "WorkoutSet_classId_idx" ON "WorkoutSet"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutSet_userId_clientId_key" ON "WorkoutSet"("userId", "clientId");

-- CreateIndex
CREATE INDEX "CheckIn_userId_createdAt_idx" ON "CheckIn"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PlanAssignment_userId_idx" ON "PlanAssignment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanAssignment_studioId_userId_key" ON "PlanAssignment"("studioId", "userId");

-- AddForeignKey
ALTER TABLE "WorkoutSet" ADD CONSTRAINT "WorkoutSet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutSet" ADD CONSTRAINT "WorkoutSet_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ClassSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanAssignment" ADD CONSTRAINT "PlanAssignment_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanAssignment" ADD CONSTRAINT "PlanAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanAssignment" ADD CONSTRAINT "PlanAssignment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "WorkoutPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

