import {
  ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsEnum, IsInt, IsNotEmpty,
  IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min,
} from 'class-validator';
import { AgentStatus } from '@prisma/client';

export class CreateAgentDto {
  @IsString() @IsNotEmpty() @MaxLength(160) name!: string;
  @IsString() @IsNotEmpty() @MaxLength(50000) systemPrompt!: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsUUID() departmentId?: string | null;
  @IsOptional() @IsUUID() modelId?: string | null;
  @IsOptional() @IsArray() @ArrayUnique() @ArrayMaxSize(100) @IsUUID('all', { each: true }) knowledgeBaseIds?: string[];
  @IsOptional() @IsArray() @ArrayUnique() @ArrayMaxSize(100) @IsUUID('all', { each: true }) toolIds?: string[];
  @IsOptional() @IsEnum(AgentStatus) status?: AgentStatus;
  @IsOptional() @IsNumber() @Min(0) @Max(2) temperature?: number;
  @IsOptional() @IsInt() @Min(1) @Max(128000) maxTokens?: number;
  @IsOptional() @IsBoolean() advancedReasoning?: boolean;
}

export class UpdateAgentDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(160) name?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(50000) systemPrompt?: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsUUID() departmentId?: string | null;
  @IsOptional() @IsUUID() modelId?: string | null;
  @IsOptional() @IsArray() @ArrayUnique() @ArrayMaxSize(100) @IsUUID('all', { each: true }) knowledgeBaseIds?: string[];
  @IsOptional() @IsArray() @ArrayUnique() @ArrayMaxSize(100) @IsUUID('all', { each: true }) toolIds?: string[];
  @IsOptional() @IsEnum(AgentStatus) status?: AgentStatus;
  @IsOptional() @IsNumber() @Min(0) @Max(2) temperature?: number;
  @IsOptional() @IsInt() @Min(1) @Max(128000) maxTokens?: number;
  @IsOptional() @IsBoolean() advancedReasoning?: boolean;
}
