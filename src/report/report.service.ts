import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ReportReason, ReportStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.service';
import { ContentService } from '../content/content.service';
import {
  ReportList,
  ReportRecord,
  ReportRepository,
} from './report.repository';

export type { ReportList, ReportRecord } from './report.repository';

export type FileReportInput = {
  reason: ReportReason;
  details?: string;
};

export type ListPagination = {
  limit: number;
  offset: number;
};

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

@Injectable()
export class ReportService {
  constructor(
    private readonly reportRepository: ReportRepository,
    private readonly contentService: ContentService,
  ) {}

  async report(
    viewer: AuthenticatedUser,
    contentId: string,
    input: FileReportInput,
  ): Promise<ReportRecord> {
    await this.contentService.getById(contentId, viewer);

    const existing = await this.reportRepository.findExisting(
      viewer.id,
      contentId,
    );

    if (existing) {
      throw new ConflictException('Already reported');
    }

    return this.reportRepository.createReport(viewer.id, contentId, {
      reason: input.reason,
      details: input.details,
    });
  }

  async listReports(
    viewer: AuthenticatedUser,
    pagination: ListPagination & { status?: ReportStatus },
  ): Promise<ReportList> {
    this.requireModerator(viewer);

    return this.reportRepository.list({
      status: pagination.status,
      ...this.normalizePagination(pagination),
    });
  }

  async handleReport(
    viewer: AuthenticatedUser,
    id: string,
    status: ReportStatus,
  ): Promise<ReportRecord> {
    this.requireModerator(viewer);

    const report = await this.reportRepository.findById(id);

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    if (report.status !== ReportStatus.PENDING) {
      throw new BadRequestException('Report already handled');
    }

    return this.reportRepository.updateStatus(id, status);
  }

  private requireModerator(viewer: AuthenticatedUser): void {
    if (
      !viewer.roles.includes('MODERATOR') &&
      !viewer.roles.includes('ADMIN')
    ) {
      throw new ForbiddenException('Access denied');
    }
  }

  private normalizePagination(pagination: ListPagination): ListPagination {
    const limit = Math.min(
      Math.max(pagination.limit || DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );
    const offset = Math.max(pagination.offset || 0, 0);

    return { limit, offset };
  }
}
