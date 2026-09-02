import { ReportReason, ReportStatus } from '@prisma/client';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';

describe('ReportController', () => {
  const authUser = {
    id: 'reporter-1',
    sessionId: 'session-1',
    roles: ['USER'],
    user: {
      id: 'reporter-1',
      email: 'reporter@example.com',
      firstName: 'Rep',
      lastName: 'Orter',
      status: 'ACTIVE' as const,
      emailVerifiedAt: new Date('2026-09-03T08:00:00.000Z'),
      createdAt: new Date('2026-09-03T08:00:00.000Z'),
      updatedAt: new Date('2026-09-03T08:00:00.000Z'),
    },
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

  const setup = () => {
    const reportService = {
      report: jest.fn(),
      listReports: jest.fn(),
      handleReport: jest.fn(),
    };
    const controller = new ReportController(
      reportService as unknown as ReportService,
    );
    return { reportService, controller };
  };

  it('create delegates the complaint with the reporter id', async () => {
    const { reportService, controller } = setup();
    reportService.report.mockResolvedValue(report);

    await expect(
      controller.create(authUser, {
        contentId: 'content-1',
        reason: ReportReason.SPAM,
      }),
    ).resolves.toEqual(report);

    expect(reportService.report.mock.calls).toEqual([
      [authUser, 'content-1', { reason: ReportReason.SPAM }],
    ]);
  });

  it('list delegates the queue query with the viewer', async () => {
    const { reportService, controller } = setup();
    reportService.listReports.mockResolvedValue({ items: [report], total: 1 });

    await expect(
      controller.list(authUser, { limit: 20, offset: 0 }),
    ).resolves.toEqual({ items: [report], total: 1 });

    expect(reportService.listReports.mock.calls).toEqual([
      [authUser, { limit: 20, offset: 0 }],
    ]);
  });

  it('handle delegates the decision with the viewer', async () => {
    const { reportService, controller } = setup();
    reportService.handleReport.mockResolvedValue({
      ...report,
      status: ReportStatus.RESOLVED,
    });

    await expect(
      controller.handle(authUser, 'report-1', {
        status: ReportStatus.RESOLVED,
      }),
    ).resolves.toMatchObject({ status: ReportStatus.RESOLVED });

    expect(reportService.handleReport.mock.calls).toEqual([
      [authUser, 'report-1', ReportStatus.RESOLVED],
    ]);
  });
});
