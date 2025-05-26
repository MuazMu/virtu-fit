"use client";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Image from "next/image";

export default function CheckoutPage() {
  const params = useSearchParams();
  const title = params.get("title") || "Sample Product";
  const price = params.get("price") || "$0.00";
  const image = params.get("image") || "/mock-clothes/tee.png";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground py-12">
      <Card className="w-full max-w-md p-8 flex flex-col gap-6 items-center">
        <h1 className="text-2xl font-bold mb-2">Checkout</h1>
        <Image src={image} alt={title} width={128} height={128} className="w-32 h-32 object-contain rounded mb-2" />
        <div className="text-center">
          <div className="font-semibold text-lg">{title}</div>
          <div className="text-muted-foreground text-base mb-2">{price}</div>
        </div>
        <form className="flex flex-col gap-3 w-full">
          <Input type="text" placeholder="Name" required disabled value="John Doe" />
          <Input type="email" placeholder="Email" required disabled value="john@example.com" />
          <Input type="text" placeholder="Address" required disabled value="123 Main St, City" />
          <Button type="submit" className="mt-2" disabled>Pay Now (Mock)</Button>
        </form>
        <div className="text-xs text-muted-foreground mt-2">This is a mock checkout page for demo purposes only.</div>
      </Card>
    </div>
  );
} 