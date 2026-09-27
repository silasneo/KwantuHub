"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type VendorProfile = {
  businessName: string;
  description?: string | null;
  location?: string | null;
  serviceArea?: string | null;
  remoteAvailable: boolean;
  contactEmail?: string | null;
  website?: string | null;
  approvalStatus: string;
  storefront?: Storefront | null;
};
type Storefront = {
  slug: string;
  displayName: string;
  headline?: string | null;
  description?: string | null;
  location?: string | null;
  serviceArea?: string | null;
  remoteAvailable: boolean;
  website?: string | null;
  logoUrl?: string | null;
  coverUrl?: string | null;
};
type User = { name: string; vendorProfile: VendorProfile };
type Category = { id: string; name: string };
type Listing = {
  id: string;
  slug: string;
  title: string;
  status: string;
  listingType: string;
  priceIndication?: string | null;
  media: { url: string }[];
};
type Message = { id: string; body: string; senderId: string };
type Inquiry = {
  id: string;
  subject: string;
  status: string;
  buyer: { name: string; email: string };
  listing: { title: string };
  messages: Message[];
};
type Metrics = { views: number; saves: number; inquiries: number };

const blankListing = {
  title: "",
  description: "",
  categoryId: "",
  listingType: "PRODUCT",
  priceIndication: "",
  location: "",
  remoteAvailable: false,
};

export default function VendorDashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Partial<VendorProfile>>({});
  const [storefront, setStorefront] = useState<Partial<Storefront>>({});
  const [categories, setCategories] = useState<Category[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({
    views: 0,
    saves: 0,
    inquiries: 0,
  });
  const [listingForm, setListingForm] = useState(blankListing);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const [
      meResponse,
      storefrontResponse,
      categoryResponse,
      listingResponse,
      inquiryResponse,
      analyticsResponse,
    ] = await Promise.all([
      fetch("/api/v1/auth/me"),
      fetch("/api/v1/storefronts"),
      fetch("/api/v1/categories"),
      fetch("/api/v1/listings?mine=true"),
      fetch("/api/v1/inquiries"),
      fetch("/api/v1/analytics"),
    ]);
    const [
      meBody,
      storefrontBody,
      categoryBody,
      listingBody,
      inquiryBody,
      analyticsBody,
    ] = await Promise.all([
      meResponse.json(),
      storefrontResponse.json(),
      categoryResponse.json(),
      listingResponse.json(),
      inquiryResponse.json(),
      analyticsResponse.json(),
    ]);
    setUser(meBody.data ?? null);
    setProfile(meBody.data?.vendorProfile ?? {});
    setStorefront(
      storefrontBody.data ?? meBody.data?.vendorProfile?.storefront ?? {},
    );
    setCategories(categoryBody.data ?? []);
    setListings(listingBody.data?.items ?? []);
    setInquiries(inquiryBody.data ?? []);
    setMetrics(analyticsBody.data ?? { views: 0, saves: 0, inquiries: 0 });
    if (!listingForm.categoryId && categoryBody.data?.[0]?.id)
      setListingForm((current) => ({
        ...current,
        categoryId: categoryBody.data[0].id,
      }));
  }, [listingForm.categoryId]);

  useEffect(() => {
    void load();
  }, [load]);
  const approved = user?.vendorProfile?.approvalStatus === "APPROVED";

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/v1/vendors", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    setNotice(
      response.ok
        ? "Profile saved and submitted for admin approval."
        : "Profile could not be saved.",
    );
    await load();
  }

  async function saveStorefront(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/v1/storefronts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(storefront),
    });
    setNotice(
      response.ok
        ? "Storefront saved."
        : (await response.json()).error?.message ||
            "Storefront could not be saved.",
    );
    await load();
  }

  async function uploadStorefrontImage(kind: "logo" | "cover", file?: File) {
    if (!file) return;
    const data = new FormData();
    data.set("kind", kind);
    data.set("file", file);
    const response = await fetch("/api/v1/storefronts/media", {
      method: "POST",
      body: data,
    });
    setNotice(
      response.ok
        ? `${kind === "logo" ? "Logo" : "Cover"} uploaded.`
        : (await response.json()).error?.message || "Upload failed.",
    );
    await load();
  }

  async function createListing(event: React.FormEvent) {
    event.preventDefault();
    const slug = `${listingForm.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")}-${Date.now().toString().slice(-6)}`;
    const response = await fetch("/api/v1/listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...listingForm, slug }),
    });
    setNotice(
      response.ok
        ? "Listing saved as a draft."
        : (await response.json()).error?.message ||
            "Listing could not be created.",
    );
    if (response.ok)
      setListingForm({ ...blankListing, categoryId: categories[0]?.id ?? "" });
    await load();
  }

  async function listingAction(
    slug: string,
    action: "publish" | "hide" | "archive",
  ) {
    const response = await fetch(`/api/v1/listings/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setNotice(
      response.ok
        ? `Listing ${action} action completed.`
        : (await response.json()).error?.message ||
            "Listing could not be updated.",
    );
    await load();
  }

  async function uploadListingImage(slug: string, file?: File) {
    if (!file) return;
    const data = new FormData();
    data.set("file", file);
    const response = await fetch(`/api/v1/listings/${slug}/media`, {
      method: "POST",
      body: data,
    });
    setNotice(
      response.ok
        ? "Listing image uploaded."
        : (await response.json()).error?.message || "Upload failed.",
    );
    await load();
  }

  async function reply(inquiryId: string) {
    const body = replyText[inquiryId]?.trim();
    if (!body) return;
    const response = await fetch("/api/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inquiryId, body }),
    });
    setNotice(response.ok ? "Reply sent." : "Reply could not be sent.");
    setReplyText((current) => ({ ...current, [inquiryId]: "" }));
    await load();
  }

  return (
    <main className="dashboard">
      <aside>
        <p className="eyebrow">Vendor portal</p>
        <h2>{user?.vendorProfile?.businessName || "Your dashboard"}</h2>
        <a href="#overview">Overview</a>
        <a href="#profile">Profile</a>
        <a href="#storefront">Storefront</a>
        <a href="#listings">Listings</a>
        <a href="#inquiries">Inquiries</a>
      </aside>
      <section>
        <p className="eyebrow">Vendor dashboard</p>
        <h1 id="overview">
          Build your <em>storefront.</em>
        </h1>
        <p className="copy">
          Complete your profile, pass approval, publish listings, and reply to
          buyer inquiries.
        </p>
        <div className="status-row">
          <div className="notice">
            Approval status:{" "}
            <b>{user?.vendorProfile?.approvalStatus || "Loading"}</b>
          </div>
          <div className="metric">
            <b>{metrics.views}</b>
            <span>Views</span>
          </div>
          <div className="metric">
            <b>{metrics.saves}</b>
            <span>Saves</span>
          </div>
          <div className="metric">
            <b>{metrics.inquiries}</b>
            <span>Inquiries</span>
          </div>
        </div>
        {notice && <div className="notice">{notice}</div>}

        <div className="dashboard-grid">
          <form id="profile" className="panel form" onSubmit={saveProfile}>
            <h2>Vendor profile</h2>
            <label>
              Business name
              <input
                required
                value={profile.businessName ?? ""}
                onChange={(event) =>
                  setProfile({ ...profile, businessName: event.target.value })
                }
              />
            </label>
            <label>
              Description
              <textarea
                value={profile.description ?? ""}
                onChange={(event) =>
                  setProfile({ ...profile, description: event.target.value })
                }
              />
            </label>
            <label>
              Location
              <input
                value={profile.location ?? ""}
                onChange={(event) =>
                  setProfile({ ...profile, location: event.target.value })
                }
              />
            </label>
            <label>
              Service area
              <input
                value={profile.serviceArea ?? ""}
                onChange={(event) =>
                  setProfile({ ...profile, serviceArea: event.target.value })
                }
              />
            </label>
            <label>
              Contact email
              <input
                type="email"
                value={profile.contactEmail ?? ""}
                onChange={(event) =>
                  setProfile({ ...profile, contactEmail: event.target.value })
                }
              />
            </label>
            <label>
              Website
              <input
                type="url"
                value={profile.website ?? ""}
                onChange={(event) =>
                  setProfile({ ...profile, website: event.target.value })
                }
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={profile.remoteAvailable ?? false}
                onChange={(event) =>
                  setProfile({
                    ...profile,
                    remoteAvailable: event.target.checked,
                  })
                }
              />{" "}
              Remote available
            </label>
            <button className="button primary">Save & submit profile</button>
          </form>

          <form
            id="storefront"
            className="panel form"
            onSubmit={saveStorefront}
          >
            <h2>Storefront</h2>
            {!approved && (
              <p className="muted">
                Storefront editing unlocks after approval.
              </p>
            )}
            <label>
              Display name
              <input
                disabled={!approved}
                required
                value={storefront.displayName ?? profile.businessName ?? ""}
                onChange={(event) =>
                  setStorefront({
                    ...storefront,
                    displayName: event.target.value,
                  })
                }
              />
            </label>
            <label>
              Headline
              <input
                disabled={!approved}
                value={storefront.headline ?? ""}
                onChange={(event) =>
                  setStorefront({ ...storefront, headline: event.target.value })
                }
              />
            </label>
            <label>
              Description
              <textarea
                disabled={!approved}
                value={storefront.description ?? ""}
                onChange={(event) =>
                  setStorefront({
                    ...storefront,
                    description: event.target.value,
                  })
                }
              />
            </label>
            <label>
              Location
              <input
                disabled={!approved}
                value={storefront.location ?? ""}
                onChange={(event) =>
                  setStorefront({ ...storefront, location: event.target.value })
                }
              />
            </label>
            <label>
              Service area
              <input
                disabled={!approved}
                value={storefront.serviceArea ?? ""}
                onChange={(event) =>
                  setStorefront({
                    ...storefront,
                    serviceArea: event.target.value,
                  })
                }
              />
            </label>
            <label className="check">
              <input
                disabled={!approved}
                type="checkbox"
                checked={storefront.remoteAvailable ?? false}
                onChange={(event) =>
                  setStorefront({
                    ...storefront,
                    remoteAvailable: event.target.checked,
                  })
                }
              />{" "}
              Remote available
            </label>
            <button disabled={!approved} className="button primary">
              Save storefront
            </button>
            {storefront.slug && (
              <Link
                className="button secondary"
                href={`/vendors/${storefront.slug}`}
              >
                View public storefront
              </Link>
            )}
            <label>
              Logo image
              <input
                disabled={!approved}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) =>
                  uploadStorefrontImage("logo", event.target.files?.[0])
                }
              />
            </label>
            <label>
              Cover image
              <input
                disabled={!approved}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) =>
                  uploadStorefrontImage("cover", event.target.files?.[0])
                }
              />
            </label>
          </form>
        </div>

        <section id="listings" className="panel">
          <h2>Listings</h2>
          <form className="form listing-form" onSubmit={createListing}>
            <label>
              Title
              <input
                disabled={!approved}
                required
                value={listingForm.title}
                onChange={(event) =>
                  setListingForm({ ...listingForm, title: event.target.value })
                }
              />
            </label>
            <label>
              Description
              <textarea
                disabled={!approved}
                required
                value={listingForm.description}
                onChange={(event) =>
                  setListingForm({
                    ...listingForm,
                    description: event.target.value,
                  })
                }
              />
            </label>
            <label>
              Category
              <select
                disabled={!approved}
                required
                value={listingForm.categoryId}
                onChange={(event) =>
                  setListingForm({
                    ...listingForm,
                    categoryId: event.target.value,
                  })
                }
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Type
              <select
                disabled={!approved}
                value={listingForm.listingType}
                onChange={(event) =>
                  setListingForm({
                    ...listingForm,
                    listingType: event.target.value,
                  })
                }
              >
                <option value="PRODUCT">Product</option>
                <option value="SERVICE">Service</option>
              </select>
            </label>
            <label>
              Price indication
              <input
                disabled={!approved}
                value={listingForm.priceIndication}
                onChange={(event) =>
                  setListingForm({
                    ...listingForm,
                    priceIndication: event.target.value,
                  })
                }
              />
            </label>
            <label>
              Location
              <input
                disabled={!approved}
                value={listingForm.location}
                onChange={(event) =>
                  setListingForm({
                    ...listingForm,
                    location: event.target.value,
                  })
                }
              />
            </label>
            <label className="check">
              <input
                disabled={!approved}
                type="checkbox"
                checked={listingForm.remoteAvailable}
                onChange={(event) =>
                  setListingForm({
                    ...listingForm,
                    remoteAvailable: event.target.checked,
                  })
                }
              />{" "}
              Remote / virtual
            </label>
            <button disabled={!approved} className="button primary">
              Save draft
            </button>
          </form>
          <div className="stack">
            {listings.map((listing) => (
              <article className="row-card" key={listing.id}>
                <div>
                  <b>{listing.title}</b>
                  <p className="muted">
                    {listing.status} · {listing.listingType} ·{" "}
                    {listing.priceIndication || "No price indication"}
                  </p>
                  <label className="file-button">
                    Add image
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) =>
                        uploadListingImage(
                          listing.slug,
                          event.target.files?.[0],
                        )
                      }
                    />
                  </label>
                </div>
                <div className="button-row">
                  <Link
                    className="button secondary"
                    href={`/listings/${listing.slug}`}
                  >
                    Preview
                  </Link>
                  {listing.status !== "PUBLISHED" && (
                    <button
                      className="button primary"
                      onClick={() => listingAction(listing.slug, "publish")}
                    >
                      Publish
                    </button>
                  )}
                  {listing.status === "PUBLISHED" && (
                    <button
                      className="button secondary"
                      onClick={() => listingAction(listing.slug, "hide")}
                    >
                      Hide
                    </button>
                  )}
                  <button
                    className="button secondary"
                    onClick={() => listingAction(listing.slug, "archive")}
                  >
                    Archive
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="inquiries" className="panel">
          <h2>Inquiry inbox</h2>
          {inquiries.length === 0 ? (
            <p className="muted">No inquiries yet.</p>
          ) : (
            inquiries.map((inquiry) => (
              <article className="conversation" key={inquiry.id}>
                <b>{inquiry.subject}</b>
                <p className="muted">
                  {inquiry.buyer.name} · {inquiry.buyer.email} ·{" "}
                  {inquiry.listing.title}
                </p>
                {inquiry.messages.map((message) => (
                  <p className="message" key={message.id}>
                    {message.body}
                  </p>
                ))}
                <div className="reply-row">
                  <input
                    value={replyText[inquiry.id] ?? ""}
                    onChange={(event) =>
                      setReplyText((current) => ({
                        ...current,
                        [inquiry.id]: event.target.value,
                      }))
                    }
                    placeholder="Reply to buyer"
                  />
                  <button
                    className="button primary"
                    onClick={() => reply(inquiry.id)}
                  >
                    Reply
                  </button>
                </div>
              </article>
            ))
          )}
        </section>
      </section>
    </main>
  );
}
