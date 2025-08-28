import { getClientIP, getUsageStats } from "../utils/quota";

export async function loader({ request, context }: any) {
  const ip = await getClientIP(request);
  
  try {
    const stats = await getUsageStats(ip, context.cloudflare.env.DB);
    
    if (!stats) {
      return Response.json({ error: "Failed to fetch usage stats" }, { status: 500 });
    }

    return Response.json({
      ip: ip.replace(/\./g, '*'), // Partially mask IP for privacy
      quota: stats.quota,
      usage: {
        operationsToday: stats.operationsToday,
        breakdown: stats.operationBreakdown,
        usagePercentage: stats.usagePercentage
      }
    });
  } catch (error) {
    console.error("Error in quota API:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
