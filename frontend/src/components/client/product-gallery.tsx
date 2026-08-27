"use client";

/**
 * Product gallery island — interaction state only, no data fetching.
 * First image is the LCP element (priority, eager); thumbnails are lazy.
 */
import Image from "next/image";
import { useState } from "react";

import { BLUR_DATA_URL } from "@/components/rsc/product-card";
import type { ProductImage } from "@/server/catalog";

export function ProductGallery({
  images,
  title,
}: {
  images: ProductImage[];
  title: string;
}) {
  const [active, setActive] = useState(0);
  if (images.length === 0) {
    return (
      <div
        aria-hidden="true"
        className="aspect-square w-full rounded-lg bg-gold-soft"
      />
    );
  }

  const current = images[active] ?? images[0];
  if (!current) {
    return null;
  }

  return (
    <figure className="m-0 space-y-4">
      <Image
        key={current.url}
        src={current.url}
        alt={current.alt || title}
        width={current.width ?? 900}
        height={current.height ?? 900}
        sizes="(min-width: 1024px) 50vw, 100vw"
        priority={active === 0}
        loading={active === 0 ? undefined : "lazy"}
        placeholder="blur"
        blurDataURL={BLUR_DATA_URL}
        className="aspect-square w-full rounded-lg border border-line object-cover"
      />
      {images.length > 1 && (
        <div
          role="group"
          aria-label={`${title} — gallery`}
          className="flex gap-2"
        >
          {images.map((image, index) => (
            <button
              key={image.url}
              type="button"
              onClick={() => setActive(index)}
              aria-pressed={index === active}
              aria-label={`${title} — ${index + 1}/${images.length}`}
              className={`overflow-hidden rounded-md border transition-dignified ${
                index === active
                  ? "border-primary"
                  : "border-line hover:border-line-strong"
              }`}
            >
              <Image
                src={image.url}
                alt=""
                width={72}
                height={72}
                loading="lazy"
                className="aspect-square w-18 object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </figure>
  );
}
