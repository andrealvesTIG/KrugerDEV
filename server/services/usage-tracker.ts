import { billingProvider } from "./billing";
import { randomUUID } from "crypto";

export async function checkAndRecordUsage(params: {
  userId: string;
  meterCode: string;
  units?: number;
  action: string;
}): Promise<{ allowed: boolean; error?: string }> {
  try {
    const subscription = await billingProvider.ensureUserHasSubscription(params.userId);
    const check = await billingProvider.checkLimit(subscription.id, params.meterCode, params.units || 1);
    
    if (!check.allowed) {
      return { allowed: false, error: check.reason };
    }
    
    const requestId = `${params.action}-${params.userId}-${Date.now()}-${randomUUID()}`;
    
    const result = await billingProvider.recordUsage({
      subscriptionId: subscription.id,
      meterCode: params.meterCode,
      units: params.units || 1,
      actorUserId: params.userId,
      requestId,
    });
    
    if (!result.success) {
      return { allowed: false, error: result.error };
    }
    
    return { allowed: true };
  } catch (error) {
    console.error("Error in checkAndRecordUsage:", error);
    return { allowed: true };
  }
}

export async function checkUsageLimit(params: {
  userId: string;
  meterCode: string;
  units?: number;
}): Promise<{ allowed: boolean; error?: string; remaining?: number | null }> {
  try {
    const subscription = await billingProvider.ensureUserHasSubscription(params.userId);
    const check = await billingProvider.checkLimit(subscription.id, params.meterCode, params.units || 1);
    
    return {
      allowed: check.allowed,
      error: check.reason,
      remaining: check.remaining,
    };
  } catch (error) {
    console.error("Error in checkUsageLimit:", error);
    return { allowed: true };
  }
}

export async function recordUsageOnly(params: {
  userId: string;
  meterCode: string;
  units?: number;
  action: string;
}): Promise<void> {
  try {
    const subscription = await billingProvider.ensureUserHasSubscription(params.userId);
    const requestId = `${params.action}-${params.userId}-${Date.now()}-${randomUUID()}`;
    
    await billingProvider.recordUsage({
      subscriptionId: subscription.id,
      meterCode: params.meterCode,
      units: params.units || 1,
      actorUserId: params.userId,
      requestId,
    });
  } catch (error) {
    console.error("Error in recordUsageOnly:", error);
  }
}
