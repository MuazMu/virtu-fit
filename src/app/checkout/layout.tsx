import { Suspense } from "react";

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return <Suspense>{children}</Suspense>;
} 