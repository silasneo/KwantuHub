"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";

type Listing = {
  id: string;
  title: string;
  description: string;
  listingType: string;
  priceIndication?: string | null;
  location?: string | null;
  remoteAvailable: boolean;
  category: { name: string };
  media: { url: string; altText?: string | null }[];
  vendor: { businessName: string; storefront?: { slug: string } | null };
};

export default function ListingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const [item, setItem] = useState<Listing | null>(null);
  const [message, setMessage] = useState("");
  const [feedback, setFeedback] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    params.then(async ({ slug }) => {
      const listingResponse = await fetch(`/api/v1/listings/${slug}`);
      const listingBody = await listingResponse.json();
      setItem(listingBody.data ?? null);
      const wishlistResponse = await fetch("/api/v1/wishlist");
      if (wishlistResponse.ok) {
        const wishlistBody = await wishlistResponse.json();
        setSaved(
          (wishlistBody.data ?? []).some(
            (entry: { listingId: string }) =>
              entry.listingId === listingBody.data?.id,
          ),
        );
      }
    });
  }, [params]);

  if (!item)
    return (
      <main className="shell page">
        <p>Loading listing…</p>
      </main>
    );

  async function toggleSave() {
    const response = await fetch("/api/v1/wishlist", {
      method: saved ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId: item!.id }),
    });
    if (response.status === 401)
      return setFeedback("Sign in as a buyer to save this listing.");
    if (!response.ok)
      return setFeedback("This listing could not be saved right now.");
    setSaved(!saved);
    setFeedback(
      saved ? "Removed from saved listings." : "Saved to your buyer account.",
    );
  }

  async function inquire() {
    const response = await fetch("/api/v1/inquiries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        listingId: item!.id,
        subject: `Inquiry about ${item!.title}`,
        message:
          message || "Hello, I would like to learn more about this listing.",
      }),
    });
    if (response.status === 401)
      return setFeedback("Sign in as a buyer to send an inquiry.");
    if (response.status === 403)
      return setFeedback("Only buyer accounts can send inquiries.");
    if (!response.ok)
      return setFeedback("Your inquiry could not be sent right now.");
    setFeedback("Inquiry sent. The vendor can now reply from their inbox.");
    setMessage("");
  }

  return (
    <main className="shell page">
      <Link href="/marketplace" className="eyebrow">
        ← Back to marketplace
      </Link>
      <section className="detail-grid">
        <div className="gallery">
          {item.media.length ? (
            item.media.map((media) => (
              <Image
                key={media.url}
                className="detail-image"
                src={media.url}
                alt={media.altText || item.title}
                width={720}
                height={520}
              />
            ))
          ) : (
            <div className="detail-art">
              <span>{item.listingType}</span>
            </div>
          )}
        </div>
        <div>
          <p className="eyebrow">{item.category.name} · Approved vendor</p>
          <h1>{item.title}</h1>
          <p className="price">
            {item.priceIndication || "Contact for details"}
          </p>
          <p className="muted">
            {item.location} {item.remoteAvailable ? "· Remote available" : ""}
          </p>
          <p className="copy">{item.description}</p>
          <p className="vendor-line">
            By{" "}
            <Link href={`/vendors/${item.vendor.storefront?.slug || ""}`}>
              {item.vendor.businessName}
            </Link>
          </p>
          <div className="review-summary">
            <b>No verified reviews yet</b>
            <span>Reviews are published only after moderation.</span>
          </div>
          <div className="button-row">
            <button className="button secondary" onClick={toggleSave}>
              {saved ? "Unsave listing" : "Save listing"}
            </button>
          </div>
          <div className="inquiry-box">
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Start a conversation with the vendor"
            />
            <button className="button primary" onClick={inquire}>
              Send inquiry
            </button>
          </div>
          {feedback && (
            <div className="notice">
              {feedback}{" "}
              {feedback.startsWith("Sign in") && (
                <Link href="/login">Sign in →</Link>
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
