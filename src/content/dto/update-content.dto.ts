import { ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiPropertyOptional({ example: 'Updated title', maxLength: 200 })
  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Matches(/\S/)
  title?: string;

  @ApiPropertyOptional({ example: 'Updated body...', maxLength: 50000 })
  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50000)
  body?: string;

  @ApiPropertyOptional({ enum: ContentKind, example: ContentKind.GUIDE })
  @IsOptional()
  @IsEnum(ContentKind)
  kind?: ContentKind;

  @ApiPropertyOptional({
    enum: ContentStatus,
    example: ContentStatus.PUBLISHED,
  })
  @IsOptional()
  @IsEnum(ContentStatus)
  status?: ContentStatus;
}
