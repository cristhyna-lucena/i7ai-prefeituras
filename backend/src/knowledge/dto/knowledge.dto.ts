import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';

export class CreateKnowledgeBaseDto {
  @IsString() @IsNotEmpty() @MaxLength(150) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
}

export class UpdateKnowledgeBaseDto {
  @ValidateIf((_object, value) => value !== undefined) @IsString() @IsNotEmpty() @MaxLength(150) name?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsIn(['ACTIVE', 'INACTIVE']) status?: string;
}

export class UploadDocumentDto {
  @IsOptional() @IsUUID() knowledgeBaseId?: string;
}

export class UpdateDocumentDto {
  @IsOptional() @IsUUID() knowledgeBaseId?: string | null;
}
