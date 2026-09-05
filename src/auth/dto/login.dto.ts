import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'student@example.com', maxLength: 320 })
  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(320)
  email: string;

  @ApiProperty({ example: 'StrongPass123', maxLength: 128 })
  @IsString()
  @Matches(/\S/)
  @MaxLength(128)
  password: string;
}
