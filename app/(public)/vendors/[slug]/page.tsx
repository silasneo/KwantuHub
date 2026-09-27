"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
type Vendor = {
  businessName: string;
  description?: string;
  location?: string;
  remoteAvailable: boolean;
  storefront?: { slug: string; displayName: string; description?: string };
  listings: { slug: string; title: string; priceIndication?: string }[];
};
export default function VendorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const [vendor, setVendor] = useState<Vendor | null>(null);
  useEffect(() => {
    params.then(({ slug }) =>
      fetch(`/api/v1/vendors/${slug}`)
        .then((r) => r.json())
        .then((x) => setVendor(x.data)),
    );
  }, [params]);
  if (!vendor)
    return (
      <main className="shell page">
        <p>Loading storefront…</p>
      </main>
    );
  return (
    <main className="shell page">
      <p className="eyebrow">Verified diaspora vendor</p>
      <h1>{vendor.businessName}</h1>
      <p className="copy">
        {vendor.description || vendor.storefront?.description}
      </p>
      <p className="muted">
        {vendor.location} {vendor.remoteAvailable ? "· Remote available" : ""}
      </p>
      <h2>Listings</h2>
      <div className="card-grid">
        {vendor.listings.map((x) => (
          <Link className="card" key={x.slug} href={`/listings/${x.slug}`}>
            <div className="card-art" />
            <h3>{x.title}</h3>
            <p>{x.priceIndication || "Contact for details"}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
