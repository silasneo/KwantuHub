import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import {
  canonicalPagePath,
  isPublicPage,
  PUBLIC_PAGES,
  SEO_DESCRIPTION,
  SEO_TITLE,
} from "../../../shared/seo";

type SEOHeadProps = {
  title?: string;
  description?: string;
  canonicalPath?: string;
  ogType?: "website" | "article" | "product";
  jsonLd?: Record<string, unknown>;
  image?: string;
  noindex?: boolean;
};

function setMeta(attribute: "name" | "property", name: string, value?: string) {
  let element = document.head.querySelector<HTMLMetaElement>(
    `meta[${attribute}="${name}"]`
  );
  if (!value) {
    element?.remove();
    return;
  }
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, name);
    document.head.appendChild(element);
  }
  element.content = value;
}

function updateHead({
  title = SEO_TITLE,
  description = SEO_DESCRIPTION,
  canonicalPath,
  ogType = "website",
  jsonLd,
  image,
  noindex,
}: SEOHeadProps) {
  const path = canonicalPagePath(canonicalPath || window.location.pathname);
  const privatePage =
    noindex ||
    !isPublicPage(path) ||
    new URLSearchParams(window.location.search).has("preview");
  const configuredOrigin =
    document.head.querySelector<HTMLMetaElement>('meta[name="kwantu-origin"]')
      ?.content || window.location.origin;
  const url = new URL(path, configuredOrigin).href;
  document.title = title;
  setMeta("name", "description", description);
  setMeta(
    "name",
    "robots",
    privatePage ? "noindex, nofollow" : "index, follow"
  );
  setMeta("property", "og:title", title);
  setMeta("property", "og:description", description);
  setMeta("property", "og:type", ogType);
  setMeta("property", "og:url", url);
  setMeta("property", "og:image", image);
  setMeta("name", "twitter:title", title);
  setMeta("name", "twitter:description", description);
  setMeta("name", "twitter:image", image);
  setMeta("name", "twitter:card", image ? "summary_large_image" : "summary");
  let canonical = document.head.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]'
  );
  if (privatePage) canonical?.remove();
  else {
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = url;
  }
  document.getElementById("kwantuhub-jsonld")?.remove();
  if (jsonLd && !privatePage) {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = "kwantuhub-jsonld";
    script.textContent = JSON.stringify(jsonLd);
    document.head.appendChild(script);
  }
}

/** Runs before page effects so each SPA navigation discards the previous page's metadata. */
export function RouteSEO() {
  const [location] = useLocation();
  const search = useSearch();
  const initial = useRef(true);
  useLayoutEffect(() => {
    if (initial.current) {
      initial.current = false;
      if (document.head.querySelector('meta[name="kwantu-origin"]')) return;
    }
    updateHead({ title: PUBLIC_PAGES[location] || SEO_TITLE });
  }, [location, search]);
  return null;
}

export function SEOHead(props: SEOHeadProps) {
  const [location] = useLocation();
  const search = useSearch();
  const { title, description, canonicalPath, ogType, jsonLd, image, noindex } =
    props;
  useEffect(() => {
    updateHead({ ...props, title: title ? `${title} | KwantuHub` : SEO_TITLE });
  }, [
    title,
    description,
    canonicalPath,
    ogType,
    jsonLd,
    image,
    noindex,
    location,
    search,
  ]);
  return null;
}
