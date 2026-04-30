-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "fullName" TEXT NOT NULL,
    "profilePhotoUrl" TEXT,
    "language" TEXT NOT NULL DEFAULT 'es',
    "unitSystem" TEXT NOT NULL DEFAULT 'imperial',
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,

    CONSTRAINT "oauth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farms" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "farmType" TEXT NOT NULL DEFAULT 'mixed',
    "boundary" JSONB NOT NULL DEFAULT '[]',
    "totalAreaAcres" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "farms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fields" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "shape" TEXT NOT NULL,
    "boundary" JSONB NOT NULL DEFAULT '[]',
    "widthFt" DECIMAL(10,2) NOT NULL,
    "heightFt" DECIMAL(10,2) NOT NULL,
    "farmLat" DECIMAL(12,8) NOT NULL,
    "farmLng" DECIMAL(12,8) NOT NULL,
    "displayMode" TEXT NOT NULL DEFAULT 'shape',
    "isPositioning" BOOLEAN NOT NULL DEFAULT false,
    "isSimulated" BOOLEAN NOT NULL DEFAULT false,
    "farmModelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_rows" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "startLat" DECIMAL(12,8) NOT NULL,
    "startLng" DECIMAL(12,8) NOT NULL,
    "endLat" DECIMAL(12,8) NOT NULL,
    "endLng" DECIMAL(12,8) NOT NULL,
    "spacingFt" DECIMAL(6,2) NOT NULL,
    "primaryCropTypeId" TEXT NOT NULL,
    "companionCropTypeId" TEXT,
    "plantingDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plant_instances" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "rowId" TEXT,
    "plantingEventId" TEXT,
    "cropTypeId" TEXT NOT NULL,
    "lat" DECIMAL(12,8) NOT NULL,
    "lng" DECIMAL(12,8) NOT NULL,
    "plantingDate" DATE NOT NULL,

    CONSTRAINT "plant_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planting_events" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "cropTypeId" TEXT NOT NULL,
    "plantingDate" DATE NOT NULL,
    "plantCount" INTEGER NOT NULL,
    "isSimulated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planting_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommended_operations" (
    "id" TEXT NOT NULL,
    "plantingEventId" TEXT,
    "livestockUnitId" TEXT,
    "templateId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "labelEs" TEXT NOT NULL,
    "recommendedDate" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "completedDate" DATE,
    "completedOperationId" TEXT,
    "notes" TEXT,
    "product" TEXT,
    "quantity" DECIMAL(10,3),
    "unit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recommended_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operations" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "fieldId" TEXT,
    "plantingEventId" TEXT,
    "livestockUnitId" TEXT,
    "recommendedOperationId" TEXT,
    "type" TEXT NOT NULL,
    "actualDate" DATE NOT NULL,
    "notes" TEXT,
    "product" TEXT,
    "quantity" DECIMAL(10,3),
    "unit" TEXT,
    "qualityRating" INTEGER,
    "photoUrls" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "livestock_units" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "animalType" TEXT NOT NULL,
    "currentCount" INTEGER NOT NULL,
    "acquisitionDate" DATE NOT NULL,
    "farmLat" DECIMAL(12,8),
    "farmLng" DECIMAL(12,8),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "livestock_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sensors" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "fieldId" TEXT,
    "name" TEXT NOT NULL,
    "sensorType" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sensors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sensor_readings" (
    "id" TEXT NOT NULL,
    "sensorId" TEXT NOT NULL,
    "value" DECIMAL(12,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sensor_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_rules" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sensorCondition" JSONB NOT NULL,
    "forecastCondition" JSONB,
    "action" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "minIntervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "lastTriggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_accounts_provider_providerAccountId_key" ON "oauth_accounts"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "sensors_apiKey_key" ON "sensors"("apiKey");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- AddForeignKey
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farms" ADD CONSTRAINT "farms_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fields" ADD CONSTRAINT "fields_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_rows" ADD CONSTRAINT "field_rows_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plant_instances" ADD CONSTRAINT "plant_instances_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plant_instances" ADD CONSTRAINT "plant_instances_rowId_fkey" FOREIGN KEY ("rowId") REFERENCES "field_rows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plant_instances" ADD CONSTRAINT "plant_instances_plantingEventId_fkey" FOREIGN KEY ("plantingEventId") REFERENCES "planting_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planting_events" ADD CONSTRAINT "planting_events_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommended_operations" ADD CONSTRAINT "recommended_operations_plantingEventId_fkey" FOREIGN KEY ("plantingEventId") REFERENCES "planting_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommended_operations" ADD CONSTRAINT "recommended_operations_livestockUnitId_fkey" FOREIGN KEY ("livestockUnitId") REFERENCES "livestock_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommended_operations" ADD CONSTRAINT "recommended_operations_completedOperationId_fkey" FOREIGN KEY ("completedOperationId") REFERENCES "operations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operations" ADD CONSTRAINT "operations_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operations" ADD CONSTRAINT "operations_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "fields"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operations" ADD CONSTRAINT "operations_plantingEventId_fkey" FOREIGN KEY ("plantingEventId") REFERENCES "planting_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operations" ADD CONSTRAINT "operations_livestockUnitId_fkey" FOREIGN KEY ("livestockUnitId") REFERENCES "livestock_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "livestock_units" ADD CONSTRAINT "livestock_units_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensors" ADD CONSTRAINT "sensors_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensor_readings" ADD CONSTRAINT "sensor_readings_sensorId_fkey" FOREIGN KEY ("sensorId") REFERENCES "sensors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
