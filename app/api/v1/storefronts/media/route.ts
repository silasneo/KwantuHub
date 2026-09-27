import { prisma } from "@/lib/db/prisma";
import { requireVendor } from "@/lib/permissions";
import { saveImage } from "@/lib/storage";
import { error, handleApiError, ok } from "@/lib/api";

export async function POST(request: Request) {
  try {
    const user = await requireVendor();
    if (!user.vendorProfile || user.vendorProfile.approvalStatus !== "APPROVED")
      return error("Vendor approval required", 403);
    const storefront = await prisma.storefront.findUnique({
      where: { vendorId: user.vendorProfile.id },
    });
    if (!storefront)
      return error("Create your storefront before uploading images", 409);
    const form = await request.formData();
    const file = form.get("file");
    const kind = form.get("kind");
    if (!(file instanceof File) || (kind !== "logo" && kind !== "cover"))
      return error("A logo or cover image is required", 422);
    const saved = await saveImage(file, `storefronts/${storefront.id}`);
    const updated = await prisma.storefront.update({
      where: { id: storefront.id },
      data: kind === "logo" ? { logoUrl: saved.url } : { coverUrl: saved.url },
    });
    return ok(updated);
  } catch (err) {
    if (err instanceof Error && err.message === "UNSUPPORTED_FILE_TYPE")
      return error("Only JPEG, PNG, and WebP images are allowed", 422);
    if (err instanceof Error && err.message === "FILE_TOO_LARGE")
      return error("Image must be 5MB or smaller", 422);
    return handleApiError(err);
  }
}
