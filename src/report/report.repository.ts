import { Injectable } from '@nestjs/common';
import {
  Prisma,
  ReportReason,
  ReportStatus,
  ContentStatus,
} from '@prisma/client';
import { PrismaService } from '../infrastructure/database/prisma.service';

const reportSelect = {
  id: true,
  reporterId: true,
  contentId: true,
  reason: true,
  details: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ReportSelect;

export type ReportRecord = Prisma.ReportGetPayload<{
  select: typeof reportSelect;
}>;

export type QueuedReport = ReportRecord & {
  content: {
    id: string;
    title: string;
    status: ContentStatus;
    authorId: string;
  };
};

export type CreateReportData = {
  reason: ReportReason;
  details?: string;
};

export type ListReportsQuery = {
  status?: ReportStatus;
  limit: number;
  offset: number;
};

export type ReportList = {
  items: QueuedReport[];
  total: number;
};

@Injectable()
export class ReportRepository {
  constructor(private readonly prismaService: PrismaService) {}

  findExisting(
    reporterId: string,
    contentId: string,
  ): Promise<ReportRecord | null> {
    return this.prismaService.report.findUnique({
      where: { reporterId_contentId: { reporterId, contentId } },
      select: reportSelect,
    });
  }

  findById(id: string): Promise<ReportRecord | null> {
    return this.prismaService.report.findUnique({
      where: { id },
      select: reportSelect,
    });
  }

  createReport(
    reporterId: string,
    contentId: string,
    data: CreateReportData,
  ): Promise<ReportRecord> {
    return this.prismaService.report.create({
      data: {
        reporterId,
        contentId,
        reason: data.reason,
        details: data.details,
        status: ReportStatus.PENDING,
      },
      select: reportSelect,
    });
  }

  async list(query: ListReportsQuery): Promise<ReportList> {
    const where: Prisma.ReportWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    const [items, total] = await Promise.all([
      this.prismaService.report.findMany({
        where,
        select: {
          ...reportSelect,
          content: {
            select: {
              id: true,
              title: true,
              status: true,
              authorId: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
      }),
      this.prismaService.report.count({ where }),
    ]);

    return { items, total };
  }

  updateStatus(id: string, status: ReportStatus): Promise<ReportRecord> {
    return this.prismaService.report.update({
      where: { id },
      data: { status },
      select: reportSelect,
    });
  }
}
