import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "zkuat — prove your security posture, disclose nothing",
  description:
    "Prove a codebase satisfies a security policy without revealing the code, the findings, or the dependency list. Zero-knowledge attestation on Midnight.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* Bottom padding clears the mobile dock; it is absent from sm upward. */}
      <body className="min-h-full flex flex-col bg-background text-foreground pb-24 sm:pb-0">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
