import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';

// Log-driver mailer (MVP): no SMTP yet. All outgoing mail is written
// to the structured log. Replace with a real driver behind the same
// MailService API when SMTP credentials appear (do not change callers).
@Injectable()
export class MailService {
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {}

  sendVerificationEmail(email: string, token: string): Promise<void> {
    const frontendUrl =
      this.configService.getOrThrow<string>('app.frontendUrl');
    const from = this.configService.get<string>('app.mailFrom');

    this.logger.info(
      {
        to: email,
        from,
        link: `${frontendUrl}/verify-email?token=${token}`,
      },
      'Verification email (log driver, not sent)',
    );

    return Promise.resolve();
  }
}
