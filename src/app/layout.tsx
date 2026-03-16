import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/layout/Sidebar";
import AccountProvider from "@/contexts/AccountContext";

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
    <html lang="en" className="dark">
      <body className="bg-navy-900 text-gray-100 antialiased">
        <AccountProvider>
          <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-y-auto">
              {children}
            </main>
          </div>
        </AccountProvider>
      </body>
    </html>
  );
}
