import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.service';
import {
  CreateNotificationData,
  NotificationList,
  NotificationRecord,
  NotificationRepository,
} from './notification.repository';

export type {
  NotificationList,
  NotificationRecord,
} from './notification.repository';

export type ListPagination = {
  limit: number;
  offset: number;
};

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

@Injectable()
export class NotificationService {
  constructor(
    private readonly notificationRepository: NotificationRepository,
  ) {}

  listMine(
    viewer: AuthenticatedUser,
    pagination: ListPagination,
  ): Promise<NotificationList> {
    return this.notificationRepository.listByUserId(
      viewer.id,
      this.normalizePagination(pagination),
    );
  }

  async markAsRead(
    viewer: AuthenticatedUser,
    id: string,
  ): Promise<NotificationRecord> {
    const notification = await this.notificationRepository.markAsRead(
      id,
      viewer.id,
    );

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return notification;
  }

  async markAllAsRead(viewer: AuthenticatedUser): Promise<{ read: number }> {
    const read = await this.notificationRepository.markAllAsRead(viewer.id);

    return { read };
  }

  notify(
    userId: string,
    data: CreateNotificationData,
  ): Promise<NotificationRecord> {
    return this.notificationRepository.create(userId, data);
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
