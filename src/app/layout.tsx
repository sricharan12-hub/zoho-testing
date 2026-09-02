import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

/**
 * One webfont, not two. Geist Mono was previously loaded on every route for
 * the sake of two table columns in the audit and team views — a second ~23 KB
 * download on every first visit, on every device. Those columns now use the
 * platform's own monospace face (see `--font-mono` in globals.css), which
 * costs nothing to fetch and cannot flash.
 */
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Employee Portal",
  description: "Single sign-on portal for authorised Zoho One services",
};

/**
 * `colorScheme` is what tells the browser to render its own widgets — form
 * controls, scrollbars, the spinner in a date input — in the same theme as the
 * page. Without it a dark portal gets light native controls in Safari, Chrome
 * and Firefox alike. `themeColor` extends the theme to the browser chrome on
 * Android and to the status bar on iOS.
 */
export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0e13" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
