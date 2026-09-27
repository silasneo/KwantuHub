import { logoutUser } from "@/lib/services/auth";
import { ok } from "@/lib/api";
export async function POST() {
  await logoutUser();
  return ok({ loggedOut: true });
}
