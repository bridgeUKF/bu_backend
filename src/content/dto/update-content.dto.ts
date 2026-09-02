import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ContentKind, ContentStatus } from '@prisma/client';

export class UpdateContentDto {
  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Matches(/\S/)
  title?: string;

  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50000)
  body?: string;

  @IsOptional()
  @IsEnum(ContentKind)
  kind?: ContentKind;

  @IsOptional()
  @IsEnum(ContentStatus)
  status?: ContentStatus;
}
