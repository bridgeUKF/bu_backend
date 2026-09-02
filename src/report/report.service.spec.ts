import {
  ConflictException,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ContentStatus, ReportReason, ReportStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.service';
import type { ContentService } from '../content/content.service';
import { ReportRepository } from './report.repository';
import { ReportService } from './report.service';

const makeViewer = (id: string, roles: string[]): AuthenticatedUser => ({
  id,
  sessionId: 'session-1',
  roles,
  user: {
    id,
    email: `${id}@example.com`,
    firstName: 'Test',
    lastName: 'User',
    status: 'ACTIVE' as const,
    emailVerifiedAt: new Date('2026-09-03T08:00:00.000Z'),
    createdAt: new Date('2026-09-03T08:00:00.000Z'),
    updatedAt: new Date('2026-09-03T08:00:00.000Z'),
  },
});

const reporter = makeViewer('reporter-1', ['USER']);
const moderator = makeViewer('moderator-1', ['MODERATOR']);

const publishedItem = {
  id: 'content-1',
  authorId: 'author-1',
  kind: 'ARTICLE',
  status: ContentStatus.PUBLISHED,
  title: 'Title',
  body: 'Body',
  likeCount: 0,
  dislikeCount: 0,
  createdAt: new Date('2026-09-03T08:00:00.000Z'),
  updatedAt: new Date('2026-09-03T08:00:00.000Z'),
};

const report = {
  id: 'report-1',
  reporterId: 'reporter-1',
  contentId: 'content-1',
  reason: ReportReason.SPAM,
  details: null,
  status: ReportStatus.PENDING,
  createdAt: new Date('2026-09-03T08:00:00.000Z'),
  updatedAt: new Date('2026-09-03T08:00:00.000Z'),
};

describe('ReportService', () => {
  let reportService: ReportService;
  let reportRepository: {
    findExisting: jest.Mock;
    createReport: jest.Mock;
    findById: jest.Mock;
    list: jest.Mock;
    updateStatus: jest.Mock;
  };
  let contentService: {
    getById: jest.Mock;
  };

  beforeEach(() => {
    reportRepository = {
      findExisting: jest.fn(),
      createReport: jest.fn(),
      findById: jest.fn(),
      list: jest.fn(),
      updateStatus: jest.fn(),
    };
    contentService = {
      getById: jest.fn(),
    };

    reportService = new ReportService(
      reportRepository as unknown as ReportRepository,
      contentService as unknown as ContentService,
    );
  });

  it('report stores a complaint about visible content', async () => {
    contentService.getById.mockResolvedValue(publishedItem);
    reportRepository.findExisting.mockResolvedValue(null);
    reportRepository.createReport.mockResolvedValue(report);

    await expect(
      reportService.report(reporter, 'content-1', {
        reason: ReportReason.SPAM,
      }),
    ).resolves.toEqual(report);

    expect(contentService.getById.mock.calls).toEqual([
      ['content-1', reporter],
    ]);
    expect(reportRepository.createReport.mock.calls).toEqual([
      ['reporter-1', 'content-1', { reason: ReportReason.SPAM }],
    ]);
  });

  it('report rejects a duplicate complaint with 409', async () => {
    contentService.getById.mockResolvedValue(publishedItem);
    reportRepository.findExisting.mockResolvedValue(report);

    await expect(
      reportService.report(reporter, 'content-1', {
        reason: ReportReason.SPAM,
      }),
    ).rejects.toThrow(new ConflictException('Already reported'));

    expect(reportRepository.createReport.mock.calls).toHaveLength(0);
  });

  it('report propagates 404/403 from content visibility', async () => {
    contentService.getById.mockRejectedValue(
      new NotFoundException('Content not found'),
    );

    await expect(
      reportService.report(reporter, 'missing', {
        reason: ReportReason.SPAM,
      }),
    ).rejects.toThrow(new NotFoundException('Content not found'));

    expect(reportRepository.createReport.mock.calls).toHaveLength(0);
  });

  it('listReports returns the queue to a moderator', async () => {
    reportRepository.list.mockResolvedValue({ items: [report], total: 1 });

    await expect(
      reportService.listReports(moderator, { limit: 20, offset: 0 }),
    ).resolves.toEqual({ items: [report], total: 1 });

    expect(reportRepository.list.mock.calls).toEqual([
      [{ limit: 20, offset: 0 }],
    ]);
  });

  it('listReports forbids plain users', async () => {
    await expect(
      reportService.listReports(reporter, { limit: 20, offset: 0 }),
    ).rejects.toThrow(new ForbiddenException('Access denied'));

    expect(reportRepository.list.mock.calls).toHaveLength(0);
  });

  it('handleReport resolves a pending complaint', async () => {
    reportRepository.findById.mockResolvedValue(report);
    reportRepository.updateStatus.mockResolvedValue({
      ...report,
      status: ReportStatus.RESOLVED,
    });

    await expect(
      reportService.handleReport(moderator, 'report-1', ReportStatus.RESOLVED),
    ).resolves.toMatchObject({ status: ReportStatus.RESOLVED });

    expect(reportRepository.updateStatus.mock.calls).toEqual([
      ['report-1', ReportStatus.RESOLVED],
    ]);
  });

  it('handleReport rejects an already handled complaint', async () => {
    reportRepository.findById.mockResolvedValue({
      ...report,
      status: ReportStatus.RESOLVED,
    });

    await expect(
      reportService.handleReport(moderator, 'report-1', ReportStatus.DISMISSED),
    ).rejects.toThrow(new BadRequestException('Report already handled'));

    expect(reportRepository.updateStatus.mock.calls).toHaveLength(0);
  });

  it('handleReport forbids plain users', async () => {
    await expect(
      reportService.handleReport(reporter, 'report-1', ReportStatus.RESOLVED),
    ).rejects.toThrow(new ForbiddenException('Access denied'));

    expect(reportRepository.findById.mock.calls).toHaveLength(0);
  });

  it('handleReport throws 404 for a missing complaint', async () => {
    reportRepository.findById.mockResolvedValue(null);

    await expect(
      reportService.handleReport(moderator, 'missing', ReportStatus.RESOLVED),
    ).rejects.toThrow(new NotFoundException('Report not found'));
  });
});
