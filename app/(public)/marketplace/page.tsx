"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";

type Category = { id: string; slug: string; name: string };
type Listing = {
  id: string;
  slug: string;
  title: string;
  description: string;
  listingType: string;
  priceIndication?: string;
  location?: string;
  remoteAvailable: boolean;
  category: { name: string };
  vendor: { businessName: string; approvalStatus: string };
  media: { url: string; altText?: string }[];
};

type Filters = {
  q: string;
  category: string;
  type: string;
  location: string;
  price: string;
  remote: boolean;
  verified: boolean;
  sort: string;
};

const defaults: Filters = {
  q: "",
  category: "",
  type: "",
  location: "",
  price: "",
  remote: false,
  verified: true,
  sort: "newest",
};

export default function Marketplace() {
  const [items, setItems] = useState<Listing[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filters, setFilters] = useState(defaults);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);

  const load = useCallback(async (nextFilters: Filters, nextPage: number) => {
    const params = new URLSearchParams({
      page: String(nextPage),
      pageSize: "12",
      sort: nextFilters.sort,
      ...(nextFilters.q ? { q: nextFilters.q } : {}),
      ...(nextFilters.category ? { category: nextFilters.category } : {}),
      ...(nextFilters.type ? { type: nextFilters.type } : {}),
      ...(nextFilters.location ? { location: nextFilters.location } : {}),
      ...(nextFilters.price ? { price: nextFilters.price } : {}),
      ...(nextFilters.remote ? { remote: "true" } : {}),
      ...(nextFilters.verified ? { verified: "true" } : {}),
    });
    window.history.replaceState({}, "", `/marketplace?${params}`);
    const response = await fetch(`/api/v1/search?${params}`);
    const body = await response.json();
    setItems(body.data?.items ?? []);
    setTotal(body.data?.pagination?.total ?? 0);
    setTotalPages(Math.max(1, body.data?.pagination?.totalPages ?? 1));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initial: Filters = {
      q: params.get("q") ?? "",
      category: params.get("category") ?? "",
      type: params.get("type") ?? "",
      location: params.get("location") ?? "",
      price: params.get("price") ?? "",
      remote: params.get("remote") === "true",
      verified: params.get("verified") !== "false",
      sort: params.get("sort") ?? "newest",
    };
    const initialPage = Math.max(1, Number(params.get("page") ?? 1));
    setFilters(initial);
    setPage(initialPage);
    Promise.all([
      fetch("/api/v1/categories").then((response) => response.json()),
      load(initial, initialPage),
    ]).then(([categoryBody]) => {
      setCategories(categoryBody.data ?? []);
    });
  }, [load]);

  function update<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function apply() {
    setPage(1);
    void load(filters, 1);
  }

  function goToPage(nextPage: number) {
    setPage(nextPage);
    void load(filters, nextPage);
  }

  return (
    <main className="shell page">
      <p className="eyebrow">Marketplace / North America</p>
      <h1>
        Find what carries <em>home forward.</em>
      </h1>
      <p className="copy">
        Browse database-backed goods and services from approved diaspora makers.
      </p>
      <div className="filters filters-grid">
        <input
          value={filters.q}
          onChange={(event) => update("q", event.target.value)}
          placeholder="Search listings or vendors"
        />
        <select
          value={filters.category}
          onChange={(event) => update("category", event.target.value)}
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.slug}>
              {category.name}
            </option>
          ))}
        </select>
        <select
          value={filters.type}
          onChange={(event) => update("type", event.target.value)}
        >
          <option value="">Products & services</option>
          <option value="PRODUCT">Products</option>
          <option value="SERVICE">Services</option>
        </select>
        <input
          value={filters.location}
          onChange={(event) => update("location", event.target.value)}
          placeholder="Location"
        />
        <input
          value={filters.price}
          onChange={(event) => update("price", event.target.value)}
          placeholder="Price text, e.g. Contact"
        />
        <select
          value={filters.sort}
          onChange={(event) => update("sort", event.target.value)}
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="title">Title A–Z</option>
        </select>
        <label className="check">
          <input
            type="checkbox"
            checked={filters.remote}
            onChange={(event) => update("remote", event.target.checked)}
          />{" "}
          Remote / virtual
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={filters.verified}
            onChange={(event) => update("verified", event.target.checked)}
          />{" "}
          Approved vendors
        </label>
        <button className="button primary" onClick={apply}>
          Apply filters
        </button>
      </div>
      <div className="market-toolbar">
        <span className="muted">
          Showing {items.length} of {total} listings
        </span>
        <span className="muted">
          Page {page} of {totalPages}
        </span>
      </div>
      <div className="listings">
        {items.map((item) => (
          <Link
            className="listing-card"
            href={`/listings/${item.slug}`}
            key={item.id}
          >
            {item.media[0] ? (
              <Image
                className="card-art image-cover"
                src={item.media[0].url}
                alt={item.media[0].altText || item.title}
                width={640}
                height={360}
              />
            ) : (
              <div className="card-art" />
            )}
            <p className="eyebrow">
              {item.category.name} · {item.listingType}
            </p>
            <h3>{item.title}</h3>
            <p className="clamp">{item.description}</p>
            <p>
              <b>{item.priceIndication || "Contact for details"}</b> ·{" "}
              {item.location}
            </p>
            <p>{item.vendor.businessName} · Approved</p>
          </Link>
        ))}
      </div>
      {items.length === 0 && (
        <div className="empty-state">
          No listings match these filters. Try broadening your search.
        </div>
      )}
      <div className="button-row pager">
        <button
          className="button secondary"
          disabled={page <= 1}
          onClick={() => goToPage(page - 1)}
        >
          Previous
        </button>
        <button
          className="button secondary"
          disabled={page >= totalPages}
          onClick={() => goToPage(page + 1)}
        >
          Next
        </button>
      </div>
    </main>
  );
}
