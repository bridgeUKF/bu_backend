import { Injectable } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../infrastructure/database/prisma.service';

const notificationSelect = {
  id: true,
  userId: true,
  type: true,
  title: true,
  body: true,
  link: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

export type NotificationRecord = Prisma.NotificationGetPayload<{
  select: typeof notificationSelect;
}>;

export type CreateNotificationData = {
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
};

export type ListNotificationsQuery = {
  limit: number;
  offset: number;
};

export type NotificationList = {
  items: NotificationRecord[];
  total: number;
};

@Injectable()
export class NotificationRepository {
  constructor(private readonly prismaService: PrismaService) {}

  create(
    userId: string,
    data: CreateNotificationData,
  ): Promise<NotificationRecord> {
    return this.prismaService.notification.create({
      data: {
        userId,
        type: data.type,
        title: data.title,
        body: data.body,
        link: data.link,
      },
      select: notificationSelect,
    });
  }

  async listByUserId(
    userId: string,
    query: ListNotificationsQuery,
  ): Promise<NotificationList> {
    const where: Prisma.NotificationWhereInput = { userId };

    const [items, total] = await Promise.all([
      this.prismaService.notification.findMany({
        where,
        select: notificationSelect,
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
      }),
      this.prismaService.notification.count({ where }),
    ]);

    return { items, total };
  }

  async markAsRead(
    id: string,
    userId: string,
  ): Promise<NotificationRecord | null> {
    const existing = await this.prismaService.notification.findFirst({
      where: { id, userId },
      select: notificationSelect,
    });

    if (!existing) {
      return null;
    }

    if (existing.readAt) {
      return existing;
    }

    return this.prismaService.notification.update({
      where: { id },
      data: { readAt: new Date() },
      select: notificationSelect,
    });
  }

  async markAllAsRead(userId: string): Promise<number> {
    const result = await this.prismaService.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });

    return result.count;
  }
}
