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
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateReportDto } from './dto/create-report.dto';
import { HandleReportDto } from './dto/handle-report.dto';
import { ListReportsDto } from './dto/list-reports.dto';
import { ReportService } from './report.service';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({
  path: 'reports',
  version: '1',
})
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Report visible content (one report per user per content)',
  })
  @ApiCreatedResponse({ description: 'Created PENDING Report' })
  @ApiConflictResponse({ description: 'Already reported' })
  @ApiNotFoundResponse({ description: 'Content not found' })
  @ApiForbiddenResponse({ description: 'No access to this content' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
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
  @ApiOperation({ summary: 'List reports queue (MODERATOR/ADMIN only)' })
  @ApiOkResponse({ description: '{ items (with content snapshot), total }' })
  @ApiForbiddenResponse({ description: 'Moderator or admin only' })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
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
  @ApiOperation({
    summary: 'Resolve or dismiss a report (MODERATOR/ADMIN only)',
  })
  @ApiOkResponse({ description: 'Updated Report' })
  @ApiNotFoundResponse({ description: 'Report not found' })
  @ApiForbiddenResponse({ description: 'Moderator or admin only' })
  @ApiBadRequestResponse({ description: 'Already handled / validation failed' })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
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
