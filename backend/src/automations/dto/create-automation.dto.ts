import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class AutomationStepDto {
  @IsString() @IsNotEmpty() @MaxLength(160)
  name!: string;

  @IsIn(['AGENT', 'HTTP_TOOL'])
  actionType!: 'AGENT' | 'HTTP_TOOL';

  @IsObject()
  configuration!: Record<string, unknown>;
}

export class CreateAutomationDto {
  @IsUUID()
  agentId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3600)
  timeoutSeconds?: number;

  @IsOptional() @IsInt() @Min(0) @Max(5)
  retries?: number;

  @IsOptional() @IsIn(['DRAFT', 'ACTIVE', 'PAUSED'])
  status?: 'DRAFT' | 'ACTIVE' | 'PAUSED';

  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => AutomationStepDto)
  steps?: AutomationStepDto[];
}

export class UpdateAutomationDto {
  @IsOptional() @IsUUID() agentId?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(160) name?: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsInt() @Min(1) @Max(3600) timeoutSeconds?: number;
  @IsOptional() @IsInt() @Min(0) @Max(5) retries?: number;
  @IsOptional() @IsIn(['DRAFT', 'ACTIVE', 'PAUSED']) status?: 'DRAFT' | 'ACTIVE' | 'PAUSED';
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => AutomationStepDto) steps?: AutomationStepDto[];
}

export class RunAutomationDto {
  @IsOptional() @IsObject() input?: Record<string, unknown>;
}
