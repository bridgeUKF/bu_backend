import { IsIn } from 'class-validator';
import { ReportStatus } from '@prisma/client';

export class HandleReportDto {
  @IsIn([ReportStatus.RESOLVED, ReportStatus.DISMISSED])
  status: ReportStatus;
}
