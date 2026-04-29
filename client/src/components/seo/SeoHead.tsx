import { Helmet } from "react-helmet-async";

export interface SeoHeadProps {
  title: string;
  description: string;
  canonicalUrl?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogType?: string;
  ogImage?: string;
  twitterCard?: "summary" | "summary_large_image";
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
  twitterSite?: string;
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>;
}

const SITE_ORIGIN = "https://fridayreport.ai";

export function SeoHead({
  title,
  description,
  canonicalUrl,
  ogTitle,
  ogDescription,
  ogType = "website",
  ogImage,
  twitterCard = "summary_large_image",
  twitterTitle,
  twitterDescription,
  twitterImage,
  twitterSite,
  jsonLd,
}: SeoHeadProps) {
  const resolvedOgTitle = ogTitle ?? title;
  const resolvedOgDescription = ogDescription ?? description;
  const resolvedTwitterTitle = twitterTitle ?? resolvedOgTitle;
  const resolvedTwitterDescription = twitterDescription ?? resolvedOgDescription;
  const resolvedTwitterImage = twitterImage ?? ogImage;

  const resolvedCanonical =
    canonicalUrl ??
    (typeof window !== "undefined" ? `${SITE_ORIGIN}${window.location.pathname}` : undefined);
  const resolvedOgUrl =
    canonicalUrl ??
    (typeof window !== "undefined" ? window.location.href : undefined);

  const jsonLdString = jsonLd ? JSON.stringify(jsonLd) : null;

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      {resolvedCanonical && <link rel="canonical" href={resolvedCanonical} />}

      <meta property="og:title" content={resolvedOgTitle} />
      <meta property="og:description" content={resolvedOgDescription} />
      <meta property="og:type" content={ogType} />
      {resolvedOgUrl && <meta property="og:url" content={resolvedOgUrl} />}
      {ogImage && <meta property="og:image" content={ogImage} />}

      <meta name="twitter:card" content={twitterCard} />
      <meta name="twitter:title" content={resolvedTwitterTitle} />
      <meta name="twitter:description" content={resolvedTwitterDescription} />
      {resolvedTwitterImage && <meta name="twitter:image" content={resolvedTwitterImage} />}
      {twitterSite && <meta name="twitter:site" content={twitterSite} />}

      {jsonLdString && (
        <script type="application/ld+json">{jsonLdString}</script>
      )}
    </Helmet>
  );
}

export function buildFaqJsonLd(
  faq: Array<{ question: string; answer: string }>,
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}
