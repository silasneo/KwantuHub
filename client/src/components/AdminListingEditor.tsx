import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import type { RouterOutputs } from "@/lib/trpc";

type Listing = RouterOutputs["admin"]["listings"][number]["listing"];
type Category = RouterOutputs["admin"]["categories"][number];
export function AdminListingEditor({
  listing,
  categories,
  onClose,
}: {
  listing: Listing;
  categories: Category[];
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [title, setTitle] = useState(listing.title);
  const [description, setDescription] = useState(listing.description ?? "");
  const [categoryId, setCategoryId] = useState(listing.categoryId);
  const [location, setLocation] = useState(listing.location ?? "");
  const [priceIndication, setPrice] = useState(listing.priceIndication ?? "");
  const [remoteAvailable, setRemote] = useState(listing.remoteAvailable);
  const [reason, setReason] = useState("");
  const edit = trpc.admin.editListing.useMutation({
    onSuccess: () => {
      utils.admin.listings.invalidate();
      onClose();
    },
  });
  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open && !edit.isPending) onClose();
      }}
    >
      <DialogContent className="bg-white max-h-[90vh] overflow-auto">
        <DialogTitle>Edit listing</DialogTitle>
        <DialogDescription>
          Metadata only. Ownership, URL, media and publication status are
          preserved. Every edit is audited.
        </DialogDescription>
        <form
          className="space-y-3"
          onSubmit={event => {
            event.preventDefault();
            edit.mutate({
              listingId: listing.id,
              expectedRevision: listing.revision,
              title,
              description,
              categoryId,
              location,
              priceIndication,
              remoteAvailable,
              reason,
            });
          }}
        >
          <label className="block">
            Title
            <input
              required
              minLength={3}
              maxLength={220}
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="block border w-full p-2"
            />
          </label>
          <label className="block">
            Description
            <textarea
              required
              minLength={10}
              maxLength={10000}
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="block border w-full p-2"
            />
          </label>
          <label className="block">
            Category
            <select
              value={categoryId}
              onChange={e => setCategoryId(Number(e.target.value))}
              className="block border p-2"
            >
              {categories.map(category => (
                <option
                  key={category.id}
                  value={category.id}
                  disabled={!category.isActive}
                >
                  {category.name}
                  {category.isActive ? "" : " (inactive)"}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            Location
            <input
              maxLength={160}
              value={location}
              onChange={e => setLocation(e.target.value)}
              className="block border w-full p-2"
            />
          </label>
          <label className="block">
            Price indication
            <input
              maxLength={120}
              value={priceIndication}
              onChange={e => setPrice(e.target.value)}
              className="block border w-full p-2"
            />
          </label>
          <label className="block">
            <input
              type="checkbox"
              checked={remoteAvailable}
              onChange={e => setRemote(e.target.checked)}
            />{" "}
            Remote available
          </label>
          <label className="block">
            Reason
            <input
              required
              minLength={3}
              maxLength={1000}
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="block border w-full p-2"
            />
          </label>
          {edit.error && <p role="alert">{edit.error.message}</p>}
          <button
            disabled={edit.isPending}
            className="brand-gradient text-white rounded p-3"
          >
            Save metadata
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
