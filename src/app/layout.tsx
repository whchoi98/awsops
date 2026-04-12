import type { Metadata } from "next";
import "./globals.css";
import SidebarWrapper from "@/components/layout/SidebarWrapper";
import ClientProviders from "@/components/providers/ClientProviders";

export const metadata: Metadata = {
  title: "AWSops Dashboard",
  description: "AWS + Kubernetes resource dashboard powered by Steampipe",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="dark">
      <body className="bg-navy-900 text-gray-100 antialiased">
        <ClientProviders>
          <div className="flex h-screen overflow-hidden">
            <SidebarWrapper />
            <main className="flex-1 overflow-y-auto">
              {children}
            </main>
          </div>
        </ClientProviders>
      </body>
    </html>
  );
}
