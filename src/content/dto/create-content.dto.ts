import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ContentKind } from '@prisma/client';

export class CreateContentDto {
  @ApiProperty({ example: 'How to pass exams', maxLength: 200 })
  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Matches(/\S/)
  title: string;

  @ApiProperty({ example: 'Step by step guide...', maxLength: 50000 })
  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(50000)
  body: string;

  @ApiProperty({ enum: ContentKind, example: ContentKind.ARTICLE })
  @IsEnum(ContentKind)
  kind: ContentKind;
}
