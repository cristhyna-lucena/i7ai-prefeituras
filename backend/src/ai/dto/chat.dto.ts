import { ArrayMaxSize, ArrayUnique, IsArray, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ChatDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(16000)
  message!: string;

  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @IsOptional() @IsUUID()
  modelId?: string;

  @IsOptional() @IsArray() @ArrayUnique() @ArrayMaxSize(5) @IsUUID('all', { each: true })
  attachmentIds?: string[];
}
