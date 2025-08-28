import { Link, useLoaderData } from "react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { getClientIP, consumeQuota } from "../utils/quota";

export function meta({ data }: any) {
  return [
    { title: "Document - Markdown Publisher" },
    { name: "description", content: "Published markdown document" },
  ];
}

export async function loader({ params, context, request }: any) {
  const { id } = params;
  
  try {
    const result = await context.cloudflare.env.DB.prepare(
      "SELECT * FROM documents WHERE id = ?"
    ).bind(id).first();

    if (!result) {
      throw new Response("Document not found", { status: 404 });
    }

    // Track view operation (but don't block if quota exceeded for viewing)
    try {
      const ip = await getClientIP(request);
      await consumeQuota(ip, "view", 1, context.cloudflare.env.DB, id);
    } catch (error) {
      console.error("Error tracking view operation:", error);
      // Continue even if quota tracking fails
    }

    return { document: result };
  } catch (error) {
    console.error("Error loading document:", error);
    throw new Response("Document not found", { status: 404 });
  }
}

export default function Document() {
  const { document } = useLoaderData<any>();

  return (
    <div className="min-h-screen bg-gray-50 font-mono">
      {/* Header */}
      <div className="bg-gray-100 border-b border-gray-300 px-4 py-2">
        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="bg-gray-900 text-white font-mono text-xs uppercase px-3 py-1 border border-gray-900 hover:bg-gray-800 transition-colors"
          >
            ← Back
          </Link>
          <p className="text-xs text-gray-600 font-mono">
            {new Date(document.created_at).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric'
            })}
          </p>
        </div>
      </div>

      {/* Document Content */}
      <div className="max-w-4xl mx-auto p-4 sm:p-6">
        <div className="bg-white border border-gray-300 p-4 sm:p-6 overflow-hidden">
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
                // Ensure links and other inline elements don't overflow
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
              {document.content}
            </ReactMarkdown>
          </div>
        </div>

        {/* Footer Info */}
        <div className="mt-6 text-center text-gray-500 font-mono text-xs break-all">
          <p>Document ID: {document.id}</p>
          <p>Created: {new Date(document.created_at).toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
          })}</p>
        </div>
      </div>
    </div>
  );
}
