import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { ReportStatus } from '@prisma/client';

export class HandleReportDto {
  @ApiProperty({
    enum: [ReportStatus.RESOLVED, ReportStatus.DISMISSED],
    example: ReportStatus.RESOLVED,
    description: 'Moderation decision (only from PENDING)',
  })
  @IsIn([ReportStatus.RESOLVED, ReportStatus.DISMISSED])
  status: ReportStatus;
}
