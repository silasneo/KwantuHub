import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";

export default async function BuyerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "BUYER")
    redirect(user.role === "ADMIN" ? "/admin" : "/vendor");
  return children;
}
