-- CreateTable
CREATE TABLE "WorkoutSet" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "formScore" REAL,
    "qualityScore" REAL,
    "rangeDegrees" REAL,
    "repSeconds" REAL,
    "confidence" REAL,
    "rejectedReps" INTEGER NOT NULL DEFAULT 0,
    "loadKg" REAL,
    "completed" BOOLEAN NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "endedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkoutSet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkoutSet_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ClassSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CheckIn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "energy" INTEGER NOT NULL,
    "soreness" INTEGER NOT NULL,
    "effort" INTEGER,
    "sleepHours" REAL,
    "bodyweightKg" REAL,
    "note" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CheckIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlanAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studioId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlanAssignment_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlanAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlanAssignment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "WorkoutPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Membership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studioId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "coachNote" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "Membership_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Membership" ("createdAt", "id", "studioId", "userId") SELECT "createdAt", "id", "studioId", "userId" FROM "Membership";
DROP TABLE "Membership";
ALTER TABLE "new_Membership" RENAME TO "Membership";
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");
CREATE UNIQUE INDEX "Membership_studioId_userId_key" ON "Membership"("studioId", "userId");
CREATE TABLE "new_Metric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "enrollmentId" TEXT NOT NULL,
    "exercise" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "reps" INTEGER NOT NULL,
    "holdSeconds" INTEGER NOT NULL DEFAULT 0,
    "score" REAL,
    "confidence" REAL NOT NULL,
    "phase" TEXT NOT NULL,
    "cue" TEXT NOT NULL,
    "quality" REAL,
    "rangeDegrees" REAL,
    "repSeconds" REAL,
    "trackingCoverage" REAL,
    "rejectedReps" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Metric_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Metric" ("confidence", "cue", "enrollmentId", "exercise", "holdSeconds", "id", "phase", "reps", "revision", "score", "updatedAt") SELECT "confidence", "cue", "enrollmentId", "exercise", "holdSeconds", "id", "phase", "reps", "revision", "score", "updatedAt" FROM "Metric";
DROP TABLE "Metric";
ALTER TABLE "new_Metric" RENAME TO "Metric";
CREATE UNIQUE INDEX "Metric_enrollmentId_key" ON "Metric"("enrollmentId");
CREATE TABLE "new_WorkoutSummary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "enrollmentId" TEXT NOT NULL,
    "totalReps" INTEGER NOT NULL DEFAULT 0,
    "totalHoldSeconds" INTEGER NOT NULL DEFAULT 0,
    "trackedSamples" INTEGER NOT NULL DEFAULT 0,
    "scoreTotal" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkoutSummary_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_WorkoutSummary" ("createdAt", "enrollmentId", "id", "scoreTotal", "totalReps", "trackedSamples", "updatedAt") SELECT "createdAt", "enrollmentId", "id", "scoreTotal", "totalReps", "trackedSamples", "updatedAt" FROM "WorkoutSummary";
DROP TABLE "WorkoutSummary";
ALTER TABLE "new_WorkoutSummary" RENAME TO "WorkoutSummary";
CREATE UNIQUE INDEX "WorkoutSummary_enrollmentId_key" ON "WorkoutSummary"("enrollmentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

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

