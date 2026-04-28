import { db } from "../db";
import {
  emailDeliveryLog,
  type EmailDeliveryProvider,
  type EmailDeliveryStatus,
} from "@shared/schema";

const MAX_ERROR_LENGTH = 1000;

export interface RecordEmailAttemptInput {
  recipient: string;
  subject: string;
  provider: EmailDeliveryProvider;
  status: EmailDeliveryStatus;
  errorMessage?: string | null;
  messageId?: string | null;
  ccCount?: number;
  hasAttachments?: boolean;
}

export async function recordEmailAttempt(input: RecordEmailAttemptInput): Promise<void> {
  try {
    const trimmedError = input.errorMessage
      ? input.errorMessage.length > MAX_ERROR_LENGTH
        ? input.errorMessage.slice(0, MAX_ERROR_LENGTH)
        : input.errorMessage
      : null;
    await db.insert(emailDeliveryLog).values({
      recipient: input.recipient,
      subject: input.subject,
      provider: input.provider,
      status: input.status,
      errorMessage: trimmedError,
      messageId: input.messageId || null,
      ccCount: input.ccCount ?? 0,
      hasAttachments: !!input.hasAttachments,
    });
  } catch (err) {
    // Never let logging failures break email sending.
    console.error("Failed to record email delivery log entry:", err);
  }
}
