-- CreateIndex
CREATE INDEX "oauth_accounts_userId_idx" ON "oauth_accounts"("userId");

-- CreateIndex
CREATE INDEX "farms_userId_idx" ON "farms"("userId");

-- CreateIndex
CREATE INDEX "farm_invites_farmId_idx" ON "farm_invites"("farmId");

-- CreateIndex
CREATE INDEX "farm_members_userId_idx" ON "farm_members"("userId");

-- CreateIndex
CREATE INDEX "fields_farmId_idx" ON "fields"("farmId");

-- CreateIndex
CREATE INDEX "field_rows_fieldId_idx" ON "field_rows"("fieldId");

-- CreateIndex
CREATE INDEX "plant_instances_fieldId_idx" ON "plant_instances"("fieldId");

-- CreateIndex
CREATE INDEX "plant_instances_rowId_idx" ON "plant_instances"("rowId");

-- CreateIndex
CREATE INDEX "plant_instances_plantingEventId_idx" ON "plant_instances"("plantingEventId");

-- CreateIndex
CREATE INDEX "planting_events_fieldId_idx" ON "planting_events"("fieldId");

-- CreateIndex
CREATE INDEX "planting_events_recipeVersionId_idx" ON "planting_events"("recipeVersionId");

-- CreateIndex
CREATE INDEX "recommended_operations_plantingEventId_idx" ON "recommended_operations"("plantingEventId");

-- CreateIndex
CREATE INDEX "recommended_operations_livestockUnitId_idx" ON "recommended_operations"("livestockUnitId");

-- CreateIndex
CREATE INDEX "recommended_operations_completedOperationId_idx" ON "recommended_operations"("completedOperationId");

-- CreateIndex
CREATE INDEX "findings_fieldId_idx" ON "findings"("fieldId");

-- CreateIndex
CREATE INDEX "findings_treatmentRecommendedOperationId_idx" ON "findings"("treatmentRecommendedOperationId");

-- CreateIndex
CREATE INDEX "findings_performedByUserId_idx" ON "findings"("performedByUserId");

-- CreateIndex
CREATE INDEX "finding_observations_findingId_idx" ON "finding_observations"("findingId");

-- CreateIndex
CREATE INDEX "finding_observations_performedByUserId_idx" ON "finding_observations"("performedByUserId");

-- CreateIndex
CREATE INDEX "operations_farmId_idx" ON "operations"("farmId");

-- CreateIndex
CREATE INDEX "operations_fieldId_idx" ON "operations"("fieldId");

-- CreateIndex
CREATE INDEX "operations_plantingEventId_idx" ON "operations"("plantingEventId");

-- CreateIndex
CREATE INDEX "operations_livestockUnitId_idx" ON "operations"("livestockUnitId");

-- CreateIndex
CREATE INDEX "operations_performedByUserId_idx" ON "operations"("performedByUserId");

-- CreateIndex
CREATE INDEX "harvest_yields_farmId_idx" ON "harvest_yields"("farmId");

-- CreateIndex
CREATE INDEX "harvest_yields_fieldId_idx" ON "harvest_yields"("fieldId");

-- CreateIndex
CREATE INDEX "harvest_yields_operationId_idx" ON "harvest_yields"("operationId");

-- CreateIndex
CREATE INDEX "harvest_yields_livestockUnitId_idx" ON "harvest_yields"("livestockUnitId");

-- CreateIndex
CREATE INDEX "livestock_units_farmId_idx" ON "livestock_units"("farmId");

-- CreateIndex
CREATE INDEX "livestock_units_fieldId_idx" ON "livestock_units"("fieldId");

-- CreateIndex
CREATE INDEX "crop_types_userId_idx" ON "crop_types"("userId");

-- CreateIndex
CREATE INDEX "recipes_cropTypeId_idx" ON "recipes"("cropTypeId");

-- CreateIndex
CREATE INDEX "recipe_defaults_recipeId_idx" ON "recipe_defaults"("recipeId");

-- CreateIndex
CREATE INDEX "recipe_defaults_userId_idx" ON "recipe_defaults"("userId");

-- CreateIndex
CREATE INDEX "recipe_defaults_farmId_idx" ON "recipe_defaults"("farmId");

-- CreateIndex
CREATE INDEX "recipe_defaults_fieldId_idx" ON "recipe_defaults"("fieldId");

-- CreateIndex
CREATE INDEX "action_tokens_userId_idx" ON "action_tokens"("userId");

-- CreateIndex
CREATE INDEX "sensors_farmId_idx" ON "sensors"("farmId");

-- CreateIndex
CREATE INDEX "sensor_readings_sensorId_idx" ON "sensor_readings"("sensorId");

-- CreateIndex
CREATE INDEX "automation_rules_farmId_idx" ON "automation_rules"("farmId");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

