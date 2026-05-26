import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BingX Agent Dashboard",
  description: "Trading dashboard for OB-Gate / BingX Agent",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body
        className="bg-neutral-950 text-neutral-100 antialiased"
        style={
          {
            "--font-geist-sans":
              '"Segoe UI", "Helvetica Neue", Helvetica, Arial, system-ui, sans-serif',
            "--font-geist-mono":
              '"Cascadia Code", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
          } as React.CSSProperties
        }
      >
        {children}
      </body>
    </html>
  );
}
