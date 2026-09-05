import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({
    description: 'Email verification token from the verification link',
    example: 'a3f9c1d2e5b74890abcdef1234567890abcdef1234567890abcdef1234567890',
    maxLength: 128,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  token: string;
}
