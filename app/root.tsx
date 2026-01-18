import type { LinksFunction, LoaderFunctionArgs } from "react-router";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useRouteError,
} from "react-router";

import { boundary } from "@shopify/shopify-app-react-router/server";

// ✅ IMPORTANT: In the React Router + Vite stack, Polaris CSS must be imported as a URL.
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: polarisStyles },
];

export async function loader({ request }: LoaderFunctionArgs) {
  // Root loader can be empty; auth typically happens in /app routes.
  // Keeping it simple prevents accidental auth loops.
  return { requestUrl: request.url };
}

export default function Root() {
  // Not strictly required, but keeps loader “used” and debuggable.
  useLoaderData<typeof loader>();

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

// Shopify needs React Router to catch thrown responses so auth headers are preserved.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = boundary.headers;
