import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "comprarCasa",
  description: "Portal de gestão de leads e vendedores da imobiliária",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
