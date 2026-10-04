import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Provider } from "@/components/ui/provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Fleet Monitor",
  description: "Uptime, SSL, broken links and Lighthouse scores for a fleet of websites.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        {/* Keep Provider a direct child of <body>: Emotion's SSR global <style> tags land here and
            React only skips such unmatched tags while hydrating the body's own children. */}
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
