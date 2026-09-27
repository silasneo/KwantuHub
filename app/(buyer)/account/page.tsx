"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type WishlistEntry = {
  id: string;
  listingId: string;
  listing: { slug: string; title: string; vendor: { businessName: string } };
};
type Message = {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
};
type Inquiry = {
  id: string;
  subject: string;
  listing: { slug: string; title: string };
  messages: Message[];
};

export default function BuyerAccount() {
  const [wishlist, setWishlist] = useState<WishlistEntry[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);

  const load = useCallback(async () => {
    const [wishlistResponse, inquiryResponse] = await Promise.all([
      fetch("/api/v1/wishlist"),
      fetch("/api/v1/inquiries"),
    ]);
    const [wishlistBody, inquiryBody] = await Promise.all([
      wishlistResponse.json(),
      inquiryResponse.json(),
    ]);
    setWishlist(wishlistBody.data ?? []);
    setInquiries(inquiryBody.data ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(listingId: string) {
    await fetch("/api/v1/wishlist", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId }),
    });
    await load();
  }

  return (
    <main className="shell page">
      <p className="eyebrow">Buyer account</p>
      <h1>
        Your saved <em>connections.</em>
      </h1>
      <div className="dashboard-grid">
        <section className="panel">
          <h2>Saved listings</h2>
          {wishlist.length === 0 ? (
            <p className="muted">You have not saved a listing yet.</p>
          ) : (
            wishlist.map((entry) => (
              <article className="row-card" key={entry.id}>
                <div>
                  <Link href={`/listings/${entry.listing.slug}`}>
                    <b>{entry.listing.title}</b>
                  </Link>
                  <p className="muted">{entry.listing.vendor.businessName}</p>
                </div>
                <button
                  className="button secondary"
                  onClick={() => remove(entry.listingId)}
                >
                  Remove
                </button>
              </article>
            ))
          )}
        </section>
        <section className="panel">
          <h2>Conversations</h2>
          {inquiries.length === 0 ? (
            <p className="muted">No inquiries yet.</p>
          ) : (
            inquiries.map((inquiry) => (
              <article className="conversation" key={inquiry.id}>
                <Link href={`/listings/${inquiry.listing.slug}`}>
                  <b>{inquiry.subject}</b>
                </Link>
                <p className="muted">{inquiry.listing.title}</p>
                {inquiry.messages.map((message) => (
                  <p className="message" key={message.id}>
                    {message.body}
                  </p>
                ))}
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
