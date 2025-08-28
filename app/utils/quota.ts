// Utility functions for IP-based quota management

const FREE_QUOTA = 50; // Free operations per IP per day
const QUOTA_RESET_HOURS = 24;

export interface QuotaInfo {
  ip: string;
  remaining: number;
  total: number;
  resetTime: string;
  isNewUser: boolean;
}

export interface OperationResult {
  success: boolean;
  quota?: QuotaInfo;
  error?: string;
}

export async function getClientIP(request: Request): Promise<string> {
  // Get real IP from Cloudflare headers
  return request.headers.get("CF-Connecting-IP") || 
         request.headers.get("X-Forwarded-For")?.split(',')[0] || 
         "unknown";
}

export async function checkQuota(ip: string, db: D1Database): Promise<QuotaInfo> {
  try {
    // Get existing quota record
    const existing = await db.prepare(
      "SELECT * FROM quotas WHERE ip_address = ?"
    ).bind(ip).first() as any;

    const now = new Date();
    
    if (!existing) {
      // Create new quota entry for first-time user
      await db.prepare(
        "INSERT INTO quotas (ip_address, remaining_operations, last_reset) VALUES (?, ?, ?)"
      ).bind(ip, FREE_QUOTA, now.toISOString()).run();
      
      return {
        ip,
        remaining: FREE_QUOTA,
        total: FREE_QUOTA,
        resetTime: new Date(now.getTime() + QUOTA_RESET_HOURS * 60 * 60 * 1000).toISOString(),
        isNewUser: true
      };
    }

    const lastReset = new Date(existing.last_reset);
    const hoursSinceReset = (now.getTime() - lastReset.getTime()) / (1000 * 60 * 60);
    
    if (hoursSinceReset >= QUOTA_RESET_HOURS) {
      // Reset quota after 24 hours
      await db.prepare(
        "UPDATE quotas SET remaining_operations = ?, last_reset = ? WHERE ip_address = ?"
      ).bind(FREE_QUOTA, now.toISOString(), ip).run();
      
      return {
        ip,
        remaining: FREE_QUOTA,
        total: FREE_QUOTA,
        resetTime: new Date(now.getTime() + QUOTA_RESET_HOURS * 60 * 60 * 1000).toISOString(),
        isNewUser: false
      };
    }

    // Return current quota
    const resetTime = new Date(lastReset.getTime() + QUOTA_RESET_HOURS * 60 * 60 * 1000);
    return {
      ip,
      remaining: existing.remaining_operations,
      total: FREE_QUOTA,
      resetTime: resetTime.toISOString(),
      isNewUser: false
    };
  } catch (error) {
    console.error("Error checking quota:", error);
    throw error;
  }
}

export async function consumeQuota(
  ip: string, 
  operationType: string, 
  operationCount: number, 
  db: D1Database,
  documentId?: string
): Promise<OperationResult> {
  try {
    // Check current quota
    const quotaInfo = await checkQuota(ip, db);
    
    if (quotaInfo.remaining < operationCount) {
      return {
        success: false,
        quota: quotaInfo,
        error: `Insufficient quota. You have ${quotaInfo.remaining} documents remaining. This action requires ${operationCount} documents.`
      };
    }

    // Deduct from quota
    const newRemaining = quotaInfo.remaining - operationCount;
    await db.prepare(
      "UPDATE quotas SET remaining_operations = ? WHERE ip_address = ?"
    ).bind(newRemaining, ip).run();

    // Log the operation
    await db.prepare(
      "INSERT INTO operations (ip_address, operation_type, operation_count, document_id) VALUES (?, ?, ?, ?)"
    ).bind(ip, operationType, operationCount, documentId || null).run();

    return {
      success: true,
      quota: {
        ...quotaInfo,
        remaining: newRemaining
      }
    };
  } catch (error) {
    console.error("Error consuming quota:", error);
    return {
      success: false,
      error: "Failed to process quota operation"
    };
  }
}

export async function getUsageStats(ip: string, db: D1Database) {
  try {
    const quota = await checkQuota(ip, db);
    
    // Get today's operations
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    const operations = await db.prepare(`
      SELECT operation_type, SUM(operation_count) as total_count, COUNT(*) as operation_instances
      FROM operations 
      WHERE ip_address = ? AND created_at >= ?
      GROUP BY operation_type
      ORDER BY total_count DESC
    `).bind(ip, startOfDay.toISOString()).all();

    const totalOperationsToday = operations.results.reduce((sum: number, op: any) => sum + op.total_count, 0);

    return {
      quota,
      operationsToday: totalOperationsToday,
      operationBreakdown: operations.results,
      usagePercentage: Math.round(((FREE_QUOTA - quota.remaining) / FREE_QUOTA) * 100)
    };
  } catch (error) {
    console.error("Error getting usage stats:", error);
    return null;
  }
}
