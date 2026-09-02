import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateReportDto } from './dto/create-report.dto';
import { HandleReportDto } from './dto/handle-report.dto';
import { ListReportsDto } from './dto/list-reports.dto';
import { ReportService } from './report.service';

@UseGuards(JwtAuthGuard)
@Controller({
  path: 'reports',
  version: '1',
})
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() authUser: AuthenticatedUser,
    @Body() createReportDto: CreateReportDto,
  ) {
    return this.reportService.report(authUser, createReportDto.contentId, {
      reason: createReportDto.reason,
      details: createReportDto.details,
    });
  }

  @Get()
  list(
    @CurrentUser() authUser: AuthenticatedUser,
    @Query() query: ListReportsDto,
  ) {
    return this.reportService.listReports(authUser, {
      status: query.status,
      limit: query.limit ?? 20,
      offset: query.offset ?? 0,
    });
  }

  @Patch(':id')
  handle(
    @CurrentUser() authUser: AuthenticatedUser,
    @Param('id') id: string,
    @Body() handleReportDto: HandleReportDto,
  ) {
    return this.reportService.handleReport(
      authUser,
      id,
      handleReportDto.status,
    );
  }
}
