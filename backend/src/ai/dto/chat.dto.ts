import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ChatDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(16000)
  message!: string;

  @IsOptional()
  @IsUUID()
  conversationId?: string;
}
