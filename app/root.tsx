import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/favicon.ico", sizes: "any" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.status === 403
        ? "You don't have permission to access this resource."
        : error.status === 500
        ? "Internal server error. Please try again later."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    // Only show detailed error info in development
    details = error.message;
    stack = error.stack;
  } else if (error instanceof Error) {
    // In production, show generic message but log the actual error
    console.error('Application error:', error);
    details = "Something went wrong. Please try refreshing the page.";
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white border border-gray-300 p-8 max-w-lg w-full">
        <h1 className="text-2xl font-bold font-mono uppercase text-gray-900 mb-4">{message}</h1>
        <p className="text-gray-700 mb-6 font-mono text-sm">{details}</p>
        
        <div className="flex gap-4">
          <button
            onClick={() => window.location.reload()}
            className="bg-gray-900 text-white font-mono text-xs uppercase px-4 py-2 border border-gray-900 hover:bg-gray-800 transition-colors"
          >
            Refresh Page
          </button>
          <a
            href="/"
            className="bg-white text-gray-900 font-mono text-xs uppercase px-4 py-2 border border-gray-900 hover:bg-gray-100 transition-colors"
          >
            Go Home
          </a>
        </div>
        
        {stack && (
          <details className="mt-6">
            <summary className="cursor-pointer font-mono text-xs text-gray-600 hover:text-gray-900">
              Show technical details
            </summary>
            <pre className="mt-2 p-3 bg-gray-100 text-xs overflow-x-auto font-mono border">
              <code>{stack}</code>
            </pre>
          </details>
        )}
      </div>
    </main>
  );
}
