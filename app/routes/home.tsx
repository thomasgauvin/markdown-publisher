import { Form, useNavigation } from "react-router";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { generateShortId } from "../utils/id";
import { moderateContent } from "../utils/moderation";
import { getClientIP, consumeQuota, checkQuota } from "../utils/quota";

export function meta() {
  return [
    { title: "Markdown Publisher - Create and Share" },
    { name: "description", content: "Create and publish markdown documents with live preview" },
  ];
}

export async function loader({ request, context }: any) {
  const ip = await getClientIP(request);
  const quota = await checkQuota(ip, context.cloudflare.env.DB);
  
  return { quota };
}

export async function action({ request, context }: any) {
  const formData = await request.formData();
  const content = formData.get("content") as string;

  if (!content) {
    return { error: "Content is required" };
  }

  const ip = await getClientIP(request);

  // Check file size limit (D1 has a 2MB limit per row)
  const contentSize = new TextEncoder().encode(content).length;
  const maxSize = 1.8 * 1024 * 1024; // 1.8MB to leave room for other fields
  
  if (contentSize > maxSize) {
    return { 
      error: `Document is too large (${Math.round(contentSize / 1024)}KB). Maximum size is ${Math.round(maxSize / 1024)}KB.` 
    };
  }

  // Quota check - publishing costs 1 operation
  const quotaResult = await consumeQuota(ip, "publish", 1, context.cloudflare.env.DB);
  if (!quotaResult.success) {
    return { error: quotaResult.error, quota: quotaResult.quota };
  }

  // Rate limiting check (secondary protection)
  const rateLimitKey = `publish:${ip}`;
  
  try {
    const { success } = await context.cloudflare.env.PUBLISH_RATE_LIMITER.limit({ key: rateLimitKey });
    if (!success) {
      // Refund the quota operation since rate limit blocked it
      await context.cloudflare.env.DB.prepare(
        "UPDATE quotas SET remaining_operations = remaining_operations + 1 WHERE ip_address = ?"
      ).bind(ip).run();
      
      return { error: "Rate limit exceeded. Please wait before publishing again." };
    }
  } catch (error) {
    console.error("Rate limiting error:", error);
    // Continue without rate limiting if it fails
  }

  // Content moderation check
  try {
    const moderationResult = await moderateContent(content, context.cloudflare.env.AI);
    if (!moderationResult.safe) {
      // Refund the quota operation since content was blocked
      await context.cloudflare.env.DB.prepare(
        "UPDATE quotas SET remaining_operations = remaining_operations + 1 WHERE ip_address = ?"
      ).bind(ip).run();
      
      return { error: `Content blocked: ${moderationResult.reason}` };
    }
  } catch (error) {
    console.error("Content moderation error:", error);
    // Continue without moderation if it fails
  }

  const id = generateShortId();
  
  try {
    await context.cloudflare.env.DB.prepare(
      "INSERT INTO documents (id, title, content) VALUES (?, ?, ?)"
    ).bind(id, "Untitled Document", content).run();

    // Update the operation log with the document ID
    await context.cloudflare.env.DB.prepare(
      "UPDATE operations SET document_id = ? WHERE ip_address = ? AND document_id IS NULL ORDER BY created_at DESC LIMIT 1"
    ).bind(id, ip).run();

    return { success: true, id, quota: quotaResult.quota };
  } catch (error) {
    console.error("Error saving document:", error);
    
    // Refund the quota operation since save failed
    await context.cloudflare.env.DB.prepare(
      "UPDATE quotas SET remaining_operations = remaining_operations + 1 WHERE ip_address = ?"
    ).bind(ip).run();
    
    return { error: "Failed to save document" };
  }
}

export default function Home({ actionData, loaderData }: any) {
  const [content, setContent] = useState("# Welcome to Markdown Publisher\n\nType your markdown here and see it rendered in real-time!\n\n## Features\n\n- Live preview as you type\n- Clean, minimal design\n- Instant publishing\n- Share documents with anyone\n- Mobile-friendly interface\n- Syntax highlighting for code\n\n**Start writing your markdown document!**");
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  // Get quota info from loader or action data
  const quota = actionData?.quota || loaderData?.quota;
  const isLowQuota = quota && quota.remaining < 10; // Warn when under 10 documents
  const isOutOfQuota = quota && quota.remaining === 0;

  // Calculate content size
  const contentSize = new TextEncoder().encode(content).length;
  const maxSize = 1.8 * 1024 * 1024; // 1.8MB to leave room f or other fields
  const sizeKB = Math.round(contentSize / 1024);
  const maxSizeKB = Math.round(maxSize / 1024);
  const isNearLimit = contentSize > maxSize * 0.8; // Warn at 80%
  const isOverLimit = contentSize > maxSize;

  return (
    <div className="h-screen bg-gray-50 font-mono flex flex-col">
      {/* Header with Publish Button */}
      <div className="bg-gray-100 border-b border-gray-300 p-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 uppercase">MARKDOWN PUBLISHER</h1>
            <p className="text-sm text-gray-600">Preview and publish markdown in a click</p>
          </div>
          
          <div className="flex items-center space-x-4">
            <Form method="post" className="flex items-center space-x-4">
              <input type="hidden" name="content" value={content} />
              
              {/* Quota indicator - only show when 10 or fewer remaining */}
              {quota && quota.remaining <= 10 && (
                <div className={`text-xs font-mono px-2 py-1 border ${
                  quota.remaining === 0
                    ? 'border-red-600 bg-red-50 text-red-800'
                    : 'border-yellow-600 bg-yellow-50 text-yellow-800'
                }`} title="Quota resets in 24 hours">
                  {quota.remaining} documents remaining
                </div>
              )}
              
              {/* File size indicator */}
              <div className={`text-xs font-mono px-2 py-1 border ${
                isOverLimit 
                  ? 'border-red-600 bg-red-50 text-red-800'
                  : isNearLimit 
                    ? 'border-yellow-600 bg-yellow-50 text-yellow-800'
                    : 'border-gray-300 bg-gray-50 text-gray-600'
              }`}>
                {sizeKB}KB / {maxSizeKB}KB
              </div>
              
              <button
                type="submit"
                disabled={isSubmitting || !content.trim() || isOverLimit || isOutOfQuota}
                className="bg-gray-900 text-white font-mono text-sm uppercase px-6 py-2 border border-gray-900 hover:bg-gray-800 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? "PUBLISHING..." : isOutOfQuota ? "QUOTA EXCEEDED" : "PUBLISH DOCUMENT"}
              </button>
            </Form>
          </div>
        </div>
      </div>

      {/* Messages Section */}
      <div className="flex-shrink-0 px-6 pt-6">
        {/* Success/Error Messages */}
        {actionData?.success && (
          <div className="mb-6 border border-green-600 bg-green-50 p-4">
            <div className="text-green-800 font-mono text-sm">
              ✓ Document published successfully! 
              <a 
                href={`/doc/${actionData.id}`} 
                className="ml-2 underline hover:no-underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                View published document →
              </a>
            </div>
          </div>
        )}

          {actionData?.error && (
            <div className="mb-6 border border-red-600 bg-red-50 p-4">
              <div className="text-red-800 font-mono text-sm">
                ✗ {actionData.error}
              </div>
            </div>
          )}
        </div>

        {/* Editor and Preview Grid */}
        <div className="flex-1 px-6 pb-6 min-h-0">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
            {/* Editor Panel */}
            <div className="bg-white border border-gray-300 flex flex-col h-full">
              <div className="bg-gray-100 border-b border-gray-300 p-3 flex-shrink-0">
                <h2 className="text-sm font-bold text-gray-900 uppercase">MARKDOWN EDITOR</h2>
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <div className="flex-1 flex flex-col">
                  <textarea
                    id="content"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="w-full flex-1 p-3 border border-gray-300 font-mono text-sm resize-none focus:outline-none focus:ring-1 focus:ring-gray-500"
                    placeholder="# Start writing your markdown here..."
                  />
                  
                  {/* Size warning */}
                  {isNearLimit && (
                    <div className={`mt-2 text-xs font-mono ${
                      isOverLimit ? 'text-red-600' : 'text-yellow-600'
                    }`}>
                      {isOverLimit 
                        ? `⚠ Document exceeds ${maxSizeKB}KB limit. Please reduce content size.`
                        : `⚠ Document is approaching ${maxSizeKB}KB limit.`
                      }
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Preview Panel */}
            <div className="bg-white border border-gray-300 flex flex-col h-full">
              <div className="bg-gray-100 border-b border-gray-300 p-3 flex-shrink-0">
                <h2 className="text-sm font-bold text-gray-900 uppercase">PREVIEW</h2>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <div className="prose prose-sm max-w-none font-sans break-words overflow-wrap-anywhere">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code(props) {
                        const { children, className, node, ...rest } = props;
                        const match = /language-(\w+)/.exec(className || '');
                        const language = match ? match[1] : '';
                        
                        return match ? (
                          <SyntaxHighlighter
                            style={oneLight as any}
                            language={language}
                            PreTag="div"
                            className="!mt-0 !mb-4 !rounded !text-sm overflow-x-auto"
                          >
                            {String(children).replace(/\n$/, '')}
                          </SyntaxHighlighter>
                        ) : (
                          <code className="bg-gray-100 px-1 py-0.5 rounded text-sm font-mono break-all" {...rest}>
                            {children}
                          </code>
                        );
                      },
                      // Ensure all text elements respect container width
                      p(props) {
                        return <p className="break-words overflow-wrap-anywhere" {...props} />;
                      },
                      h1(props) {
                        return <h1 className="break-words overflow-wrap-anywhere" {...props} />;
                      },
                      h2(props) {
                        return <h2 className="break-words overflow-wrap-anywhere" {...props} />;
                      },
                      h3(props) {
                        return <h3 className="break-words overflow-wrap-anywhere" {...props} />;
                      },
                      h4(props) {
                        return <h4 className="break-words overflow-wrap-anywhere" {...props} />;
                      },
                      h5(props) {
                        return <h5 className="break-words overflow-wrap-anywhere" {...props} />;
                      },
                      h6(props) {
                        return <h6 className="break-words overflow-wrap-anywhere" {...props} />;
                      },
                      // Ensure links don't overflow
                      a(props) {
                        return <a className="break-all" {...props} />;
                      },
                      // Ensure tables are responsive
                      table(props) {
                        return (
                          <div className="overflow-x-auto my-4">
                            <table className="w-full border-collapse border border-gray-300" {...props} />
                          </div>
                        );
                      },
                      thead(props) {
                        return <thead {...props} />;
                      },
                      tbody(props) {
                        return <tbody {...props} />;
                      },
                      tr(props) {
                        return <tr {...props} />;
                      },
                      th(props) {
                        return <th className="border border-gray-300 px-3 py-2 text-left font-bold bg-gray-100 text-gray-900" {...props} />;
                      },
                      td(props) {
                        return <td className="border border-gray-300 px-3 py-2 text-gray-700" {...props} />;
                      },
                    }}
                  >
                    {content}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          </div>
        </div>
    </div>
  );
}
