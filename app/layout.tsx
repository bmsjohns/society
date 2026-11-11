import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { StaffProvider } from "@/components/StaffContext";
import { ServiceWorker } from "@/components/ServiceWorker";
import "./globals.css";

export const metadata: Metadata = {
  title: "Society Scan",
  description: "Prologue Society member scanning for staff",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Society Scan", statusBarStyle: "black-translucent" },
  icons: { icon: "/brand/p-mark-red.svg", apple: "/icons/icon-192.png" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#AD3B28",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

const noAuth = process.env.DEV_NO_AUTH === "1" && process.env.NODE_ENV !== "production";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const body = (
    <html lang="en-GB">
      <body>
        <StaffProvider>{children}</StaffProvider>
        <ServiceWorker />
      </body>
    </html>
  );
  return noAuth ? body : <ClerkProvider>{body}</ClerkProvider>;
}
