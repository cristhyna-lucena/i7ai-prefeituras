import { ToolStatus, ToolType } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';

export class CredentialDto {
  @IsString() @IsNotEmpty() @MaxLength(128) label!: string;
  @IsString() @IsNotEmpty() @MaxLength(128) secretRef!: string;
}
export class CreateToolDto {
  @IsString() @IsNotEmpty() @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsEnum(ToolType) type!: ToolType;
  @IsOptional() @IsEnum(ToolStatus) status?: ToolStatus;
  @IsObject() config!: Record<string, unknown>;
  @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) allowedDomains!: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => CredentialDto) credentials?: CredentialDto[];
}
export class UpdateToolDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(160) name?: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsEnum(ToolType) type?: ToolType;
  @IsOptional() @IsEnum(ToolStatus) status?: ToolStatus;
  @IsOptional() @IsObject() config?: Record<string, unknown>;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) allowedDomains?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => CredentialDto) credentials?: CredentialDto[];
}
export class ExecuteToolDto {
  @IsUUID() agentId!: string;
  @IsOptional() @IsObject() input?: Record<string, unknown>;
}
