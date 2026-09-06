import { NotFoundException } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.service';
import type { NotificationRepository } from './notification.repository';
import { NotificationService } from './notification.service';

const makeViewer = (id: string): AuthenticatedUser => ({
  id,
  sessionId: 'session-1',
  roles: ['USER'],
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

const viewer = makeViewer('user-1');

const notification = {
  id: 'notification-1',
  userId: 'user-1',
  type: NotificationType.REPORT_RESOLVED,
  title: 'Your report has been resolved',
  body: null,
  link: '/reports/report-1',
  readAt: null,
  createdAt: new Date('2026-09-03T08:00:00.000Z'),
};

describe('NotificationService', () => {
  let notificationService: NotificationService;
  let notificationRepository: {
    create: jest.Mock;
    listByUserId: jest.Mock;
    markAsRead: jest.Mock;
    markAllAsRead: jest.Mock;
  };

  beforeEach(() => {
    notificationRepository = {
      create: jest.fn(),
      listByUserId: jest.fn(),
      markAsRead: jest.fn(),
      markAllAsRead: jest.fn(),
    };

    notificationService = new NotificationService(
      notificationRepository as unknown as NotificationRepository,
    );
  });

  it('listMine returns only own notifications with clamped pagination', async () => {
    notificationRepository.listByUserId.mockResolvedValue({
      items: [notification],
      total: 1,
    });

    await expect(
      notificationService.listMine(viewer, { limit: 500, offset: -5 }),
    ).resolves.toEqual({ items: [notification], total: 1 });
    expect(notificationRepository.listByUserId.mock.calls).toEqual([
      ['user-1', { limit: 100, offset: 0 }],
    ]);
  });

  it('markAsRead returns the read notification', async () => {
    notificationRepository.markAsRead.mockResolvedValue({
      ...notification,
      readAt: new Date('2026-09-04T08:00:00.000Z'),
    });

    const result = await notificationService.markAsRead(
      viewer,
      'notification-1',
    );

    expect(notificationRepository.markAsRead.mock.calls).toEqual([
      ['notification-1', 'user-1'],
    ]);
    expect(result.readAt).not.toBeNull();
  });

  it('markAsRead throws 404 for a foreign or missing notification', async () => {
    notificationRepository.markAsRead.mockResolvedValue(null);

    await expect(
      notificationService.markAsRead(viewer, 'missing'),
    ).rejects.toThrow(new NotFoundException('Notification not found'));
  });

  it('markAllAsRead returns the number of marked notifications', async () => {
    notificationRepository.markAllAsRead.mockResolvedValue(3);

    await expect(notificationService.markAllAsRead(viewer)).resolves.toEqual({
      read: 3,
    });
    expect(notificationRepository.markAllAsRead.mock.calls).toEqual([
      ['user-1'],
    ]);
  });

  it('notify stores a notification for the user', async () => {
    notificationRepository.create.mockResolvedValue(notification);

    await expect(
      notificationService.notify('user-1', {
        type: NotificationType.REPORT_RESOLVED,
        title: 'Your report has been resolved',
        link: '/reports/report-1',
      }),
    ).resolves.toEqual(notification);
    expect(notificationRepository.create.mock.calls).toEqual([
      [
        'user-1',
        {
          type: NotificationType.REPORT_RESOLVED,
          title: 'Your report has been resolved',
          link: '/reports/report-1',
        },
      ],
    ]);
  });
});
