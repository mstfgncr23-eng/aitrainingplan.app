import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "FormFlow AI", description: "Doğrulanan çok adımlı antrenman planları" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="tr"><body>{children}</body></html>;
}
