import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ReportReason } from '@prisma/client';

export class CreateReportDto {
  @IsString()
  @IsUUID()
  contentId: string;

  @IsEnum(ReportReason)
  reason: ReportReason;

  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  details?: string;
}
