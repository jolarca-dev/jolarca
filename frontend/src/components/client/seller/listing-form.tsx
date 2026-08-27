"use client";

/**
 * Listing create/edit form. Multilingual titles (lt required; lv/en optional
 * — AI translation fills gaps later), rich-text description sanitized with
 * DOMPurify before submission (backend sanitizes again), category +
 * shipping-profile pickers fed by the backend, and a mobile-friendly image
 * manager: multiple files, WebP conversion, drag + keyboard reorder, crop
 * hints (1:1 catalog / 4:3 detail — crops applied by the media queue).
 */
import DOMPurify from "isomorphic-dompurify";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { ContractGapNotice } from "@/components/contract-gap-notice";
import {
  blobToDataUrl,
  convertToWebp,
  isImageFile,
  isWithinSizeLimit,
  MAX_LISTING_IMAGES,
} from "@/lib/image";
import {
  createListing,
  fetchCategories,
  fetchShippingProfiles,
  listingSchema,
  type CategoryOption,
  type ListingLocale,
  type ShippingProfileOption,
} from "@/lib/seller";
import { isContractPending } from "@/stores/cart-store";

interface ListingImage {
  id: string;
  previewUrl: string;
  dataUrl: string;
}

type OptionState<T extends { id: string; name: string }> =
  | { kind: "loading" }
  | { kind: "gap"; gapId: string }
  | { kind: "ready"; options: T[] };

function useOptions<T extends { id: string; name: string }>(
  fetcher: () => Promise<T[]>,
  gapId: string,
): OptionState<T> {
  const [state, setState] = useState<OptionState<T>>({ kind: "loading" });
  useEffect(() => {
    let cancelled = false;
    fetcher()
      .then((options) => {
        if (!cancelled) setState({ kind: "ready", options });
      })
      .catch(() => {
        // Real errors and contract gaps both render the sanctioned
        // pending surface — we never show invented categories/profiles.
        if (!cancelled) setState({ kind: "gap", gapId });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return state;
}

export function ListingForm() {
  const t = useTranslations("seller");
  const router = useRouter();

  const [titles, setTitles] = useState<Record<ListingLocale, string>>({
    lt: "",
    lv: "",
    en: "",
  });
  const [categoryId, setCategoryId] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("0");
  const [shippingProfileId, setShippingProfileId] = useState("");
  const [images, setImages] = useState<ListingImage[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<"idle" | "pending" | "error">("idle");

  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const categories = useOptions(fetchCategories, "GAP-P05");
  const profiles = useOptions(fetchShippingProfiles, "GAP-V12");

  /* ---------------------------- rich text ------------------------------- */

  function exec(command: string) {
    editorRef.current?.focus();
    document.execCommand(command);
  }

  function sanitizedHtml(): string {
    const raw = editorRef.current?.innerHTML ?? "";
    return DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: ["p", "br", "strong", "em", "u", "ul", "ol", "li"],
    });
  }

  /* ----------------------------- images --------------------------------- */

  async function addFiles(list: FileList | null) {
    setImageError(null);
    if (!list) return;
    const room = MAX_LISTING_IMAGES - images.length;
    const files = Array.from(list).slice(0, room);
    for (const file of files) {
      if (!isImageFile(file) || !isWithinSizeLimit(file)) {
        setImageError(t("listingImageRejected"));
        return;
      }
    }
    for (const file of files) {
      const webp = await convertToWebp(file);
      const dataUrl = await blobToDataUrl(webp);
      setImages((current) => [
        ...current,
        {
          id: `${Date.now()}-${file.name}`,
          previewUrl: URL.createObjectURL(webp),
          dataUrl,
        },
      ]);
    }
  }

  function moveImage(from: number, to: number) {
    setImages((current) => {
      if (to < 0 || to >= current.length) return current;
      const next = [...current];
      const item = next[from];
      if (!item) return current;
      next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  function removeImage(index: number) {
    setImages((current) => {
      const target = current[index];
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((_, i) => i !== index);
    });
  }

  useEffect(
    () => () => {
      // Revoke any previews still around on unmount.
      setImages((current) => {
        current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
        return current;
      });
    },
    [],
  );

  /* ----------------------------- submit --------------------------------- */

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrors([]);

    const stockNumber = Number(stock);
    const draft = {
      titles,
      descriptionHtml: sanitizedHtml(),
      categoryId,
      price,
      currency: "EUR",
      stock: Number.isFinite(stockNumber)
        ? Math.floor(stockNumber)
        : Number.NaN,
      shippingProfileId,
    };
    const result = listingSchema.safeParse(draft);
    if (!result.success) {
      setErrors(result.error.issues.map(() => t("fieldInvalid")));
      document.getElementById("lf-first-error")?.focus();
      return;
    }

    setSubmitting(true);
    setOutcome("idle");
    try {
      await createListing({
        listing: result.data,
        imagesDataUrls: images.map((image) => image.dataUrl),
      });
      router.push("/seller/dashboard");
    } catch (error) {
      setOutcome(isContractPending(error) ? "pending" : "error");
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full rounded-md border border-line bg-surface-raised px-3 py-2 text-ink transition-dignified focus:border-primary focus:outline-2 focus:outline-primary/40";
  const labelClass = "mb-1 block text-sm font-medium text-ink";

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {errors.length > 0 && (
        <div
          id="lf-first-error"
          tabIndex={-1}
          role="alert"
          className="rounded-md bg-danger-soft p-3 text-sm text-ink"
        >
          {t("listingHasErrors", { count: errors.length })}
        </div>
      )}

      {/* Titles — lt required, lv/en optional (AI translation later). */}
      <fieldset className="space-y-3">
        <legend className={labelClass}>{t("listingTitles")}</legend>
        {(["lt", "lv", "en"] as const).map((code) => (
          <div key={code}>
            <label
              htmlFor={`lf-title-${code}`}
              className="text-sm text-ink-muted"
            >
              {t(`lang_${code}`)}
              {code === "lt" ? "" : ` (${t("optional")})`}
            </label>
            <input
              id={`lf-title-${code}`}
              value={titles[code]}
              onChange={(e) =>
                setTitles((current) => ({ ...current, [code]: e.target.value }))
              }
              className={inputClass}
            />
          </div>
        ))}
      </fieldset>

      {/* Description — contentEditable + sanitize-on-submit. */}
      <div>
        <span className={labelClass}>{t("listingDescription")}</span>
        <div className="rounded-md border border-line bg-surface-raised">
          <div className="flex gap-1 border-b border-line p-1">
            {(
              [
                ["bold", t("rteBold")],
                ["italic", t("rteItalic")],
                ["insertUnorderedList", t("rteUl")],
                ["insertOrderedList", t("rteOl")],
              ] as const
            ).map(([command, label]) => (
              <button
                key={command}
                type="button"
                aria-label={label}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => exec(command)}
                className="rounded px-2 py-1 text-sm text-ink-muted transition-dignified hover:bg-primary-soft hover:text-primary-deep"
              >
                {label}
              </button>
            ))}
          </div>
          <div
            ref={editorRef}
            role="textbox"
            aria-multiline="true"
            aria-label={t("listingDescription")}
            contentEditable
            suppressHydrationWarning
            className="min-h-32 p-3 text-ink focus:outline-2 focus:outline-primary/40"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Category */}
        <div>
          <label htmlFor="lf-category" className={labelClass}>
            {t("listingCategory")}
          </label>
          <select
            id="lf-category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            disabled={categories.kind !== "ready"}
            className={inputClass}
          >
            <option value="">{t("selectPlaceholder")}</option>
            {categories.kind === "ready" &&
              categories.options.map((option: CategoryOption) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
          </select>
          {categories.kind === "gap" && (
            <p className="mt-1 text-xs text-ink-faint">{t("optionsPending")}</p>
          )}
        </div>

        {/* Shipping profile */}
        <div>
          <label htmlFor="lf-profile" className={labelClass}>
            {t("listingShippingProfile")}
          </label>
          <select
            id="lf-profile"
            value={shippingProfileId}
            onChange={(e) => setShippingProfileId(e.target.value)}
            disabled={profiles.kind !== "ready"}
            className={inputClass}
          >
            <option value="">{t("selectPlaceholder")}</option>
            {profiles.kind === "ready" &&
              profiles.options.map((option: ShippingProfileOption) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
          </select>
          {profiles.kind === "gap" && (
            <p className="mt-1 text-xs text-ink-faint">{t("optionsPending")}</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="lf-price" className={labelClass}>
            {t("listingPrice")}
          </label>
          <input
            id="lf-price"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="19.99"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="lf-stock" className={labelClass}>
            {t("listingStock")}
          </label>
          <input
            id="lf-stock"
            type="number"
            min={0}
            step={1}
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      {/* Images — multiple, WebP, drag + keyboard reorder, crop hints. */}
      <div>
        <span className={labelClass}>
          {t("listingImages")} ({images.length}/{MAX_LISTING_IMAGES})
        </span>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void addFiles(e.dataTransfer.files);
          }}
          className="rounded-md border-2 border-dashed border-line p-4"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            aria-label={t("listingImages")}
            onChange={(e) => void addFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={images.length >= MAX_LISTING_IMAGES}
            className="rounded-md border border-line px-4 py-2 text-sm text-ink transition-dignified hover:border-line-strong disabled:opacity-50"
          >
            {t("listingAddImages")}
          </button>
          <p className="mt-2 text-xs text-ink-faint">{t("listingImageHint")}</p>
          <p className="text-xs text-ink-faint">{t("listingCropHint")}</p>
        </div>

        {imageError && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {imageError}
          </p>
        )}

        {images.length > 0 && (
          <ul
            className="mt-3 flex flex-wrap gap-3"
            aria-label={t("listingImageOrder")}
          >
            {images.map((image, index) => (
              <li
                key={image.id}
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIndex !== null && dragIndex !== index) {
                    moveImage(dragIndex, index);
                  }
                  setDragIndex(null);
                }}
                className="relative w-24"
              >
                <Image
                  src={image.previewUrl}
                  alt={t("listingImageAlt", { position: index + 1 })}
                  width={96}
                  height={96}
                  className="h-24 w-24 rounded-md border border-line object-cover"
                />
                <div className="mt-1 flex justify-center gap-1">
                  <button
                    type="button"
                    aria-label={t("moveLeft", { position: index + 1 })}
                    onClick={() => moveImage(index, index - 1)}
                    disabled={index === 0}
                    className="rounded border border-line px-1.5 text-xs text-ink disabled:opacity-40"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    aria-label={t("moveRight", { position: index + 1 })}
                    onClick={() => moveImage(index, index + 1)}
                    disabled={index === images.length - 1}
                    className="rounded border border-line px-1.5 text-xs text-ink disabled:opacity-40"
                  >
                    →
                  </button>
                  <button
                    type="button"
                    aria-label={t("removeImage", { position: index + 1 })}
                    onClick={() => removeImage(index)}
                    className="rounded border border-line px-1.5 text-xs text-danger disabled:opacity-40"
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {outcome === "pending" && (
        <div className="space-y-2">
          <p
            role="status"
            className="rounded-md border border-gold/40 bg-gold-soft p-3 text-sm text-ink"
          >
            {t("listingPortalPending")}
          </p>
          <ContractGapNotice gapIds={["GAP-V04"]} />
        </div>
      )}
      {outcome === "error" && (
        <p
          role="alert"
          className="rounded-md bg-danger-soft p-3 text-sm text-ink"
        >
          {t("listingSubmitFailed")}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={
            submitting ||
            categories.kind === "loading" ||
            profiles.kind === "loading"
          }
          className="rounded-md bg-primary px-6 py-2 font-medium text-surface-raised transition-dignified hover:bg-primary-deep disabled:opacity-60"
        >
          {submitting ? t("listingSubmitting") : t("listingSubmit")}
        </button>
      </div>
    </form>
  );
}
