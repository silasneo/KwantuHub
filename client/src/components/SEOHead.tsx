import { useEffect } from "react";

type SEOHeadProps = {
  title?: string;
  description?: string;
  canonicalPath?: string;
  ogType?: "website" | "article" | "product";
  jsonLd?: Record<string, any>;
};

export function SEOHead({
  title,
  description,
  canonicalPath,
  ogType = "website",
  jsonLd,
}: SEOHeadProps) {
  useEffect(() => {
    const fullTitle = title
      ? `${title} | KwantuHub`
      : "KwantuHub — African Diaspora Marketplace";
    document.title = fullTitle;

    if (description) {
      let metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) {
        metaDesc.setAttribute("content", description);
      }
    }

    // Set canonical link
    const baseUrl = "https://kwantumkt-lgpadidm.manus.space";
    const canonicalUrl = `${baseUrl}${canonicalPath || window.location.pathname}`;
    let linkCanonical = document.querySelector('link[rel="canonical"]');
    if (!linkCanonical) {
      linkCanonical = document.createElement("link");
      linkCanonical.setAttribute("rel", "canonical");
      document.head.appendChild(linkCanonical);
    }
    linkCanonical.setAttribute("href", canonicalUrl);

    // Set JSON-LD if provided
    let scriptJsonLd = document.querySelector("#kwantuhub-jsonld");
    if (jsonLd) {
      if (!scriptJsonLd) {
        scriptJsonLd = document.createElement("script");
        scriptJsonLd.setAttribute("type", "application/ld+json");
        scriptJsonLd.setAttribute("id", "kwantuhub-jsonld");
        document.head.appendChild(scriptJsonLd);
      }
      scriptJsonLd.textContent = JSON.stringify(jsonLd);
    } else if (scriptJsonLd) {
      scriptJsonLd.remove();
    }
  }, [title, description, canonicalPath, ogType, jsonLd]);

  return null;
}
