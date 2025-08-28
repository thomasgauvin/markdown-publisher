// Utility functions for content moderation using Cloudflare Workers AI

export async function moderateContent(content: string, ai: any): Promise<{ safe: boolean; reason?: string }> {
  try {
    // Use GPT-OSS-20B to analyze the content for malicious patterns
    const response = await ai.run('@cf/openai/gpt-oss-20b', {
      input: `Please analyze the following content for potential security risks, malicious code, harmful content, spam, or inappropriate material. Respond with only "SAFE" if the content is acceptable, or "UNSAFE: [brief reason]" if it should be blocked.

Content to analyze:
${content.substring(0, 20000)}`, // Limit to first 20000 chars for AI analysis
      reasoning: {
        effort: "low" // Use low effort for faster responses
      }
    });

    const aiResponse = response?.response || response?.output || '';
    const responseText = typeof aiResponse === 'string' ? aiResponse : JSON.stringify(aiResponse);
    
    if (responseText.toUpperCase().includes('UNSAFE')) {
      const reason = responseText.split(':')[1]?.trim() || 'Content flagged as potentially harmful';
      return { safe: false, reason };
    }
    
    return { safe: true };
  } catch (error) {
    console.error('Content moderation error:', error);
    // If AI moderation fails, fall back to basic checks
    return basicContentCheck(content);
  }
}

function basicContentCheck(content: string): { safe: boolean; reason?: string } {
  const suspiciousPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /<iframe\b[^>]*>/gi,
    /javascript:/gi,
    /data:text\/html/gi,
    /vbscript:/gi,
    /on\w+\s*=/gi, // Event handlers like onclick, onload, etc.
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(content)) {
      return { safe: false, reason: 'Content contains potentially malicious code' };
    }
  }

  // Check for excessively long content that might be spam
  if (content.length > 50000) { // 50KB limit for basic check
    return { safe: false, reason: 'Content exceeds reasonable length limits' };
  }

  return { safe: true };
}
