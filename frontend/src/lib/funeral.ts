/**
 * Funeral services vertical — directory + lead generation ONLY (ADR-0008).
 * Hard rules encoded here:
 *  - no prices in any payload type (the backend must not send them);
 *  - consultation requests require only a name and ONE contact method —
 *    grief-aware friction reduction;
 *  - PII from the consultation form is posted to the backend and never
 *    written to client storage.
 */
import { z } from "zod";

import { ApiError, apiClient } from "@/lib/api-client";
import { PHONE_PATTERN } from "@/lib/checkout";

/* -------------------------------------------------------------------------- */
/* Directory constants                                                         */
/* -------------------------------------------------------------------------- */

export const SERVICE_TYPES = [
  "burial",
  "cremation",
  "memorial",
  "monument",
  "counseling",
] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export const FUNERAL_LANGUAGES = ["lt", "lv", "et", "en", "ru", "pl"] as const;
export type FuneralLanguage = (typeof FUNERAL_LANGUAGES)[number];

export interface DirectoryFilters {
  location: string;
  serviceType: ServiceType | "";
  language: FuneralLanguage | "";
}

/* -------------------------------------------------------------------------- */
/* Consultation schema — minimal required fields on purpose                    */
/* -------------------------------------------------------------------------- */

export const consultationSchema = z
  .object({
    name: z.string().trim().min(2),
    phone: z
      .string()
      .trim()
      .optional()
      .or(z.literal(""))
      .refine(
        (value = "") => value === "" || PHONE_PATTERN.test(value),
        "phone_invalid",
      ),
    email: z
      .string()
      .trim()
      .optional()
      .or(z.literal(""))
      .refine(
        (value = "") =>
          value === "" || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value),
        "email_invalid",
      ),
    preferredContact: z.enum(["phone", "email"]),
    serviceType: z.enum(SERVICE_TYPES).optional().or(z.literal("")),
    message: z.string().trim().max(2000).optional().or(z.literal("")),
  })
  .refine((value) => value.phone !== "" || value.email !== "", {
    message: "contact_required",
  });
export type ConsultationDraft = z.infer<typeof consultationSchema>;

export interface ConsultationFieldErrors {
  name?: "required";
  phone?: "invalid";
  email?: "invalid";
  contact?: "required";
}

export function consultationFieldErrors(
  error: z.ZodError,
): ConsultationFieldErrors {
  const out: ConsultationFieldErrors = {};
  for (const issue of error.issues) {
    const message = issue.message;
    if (message === "contact_required") {
      out.contact ??= "required";
      continue;
    }
    const field = issue.path[0];
    if (field === "name") out.name ??= "required";
    if (field === "phone" && message !== "too_small") out.phone ??= "invalid";
    if (field === "email") out.email ??= "invalid";
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* API — registered gaps until funeral_services_app ships them                 */
/* -------------------------------------------------------------------------- */

/** POST /api/v1/funeral-services/consultation-requests/ (GAP-F01). */
export async function submitConsultationRequest(
  draft: ConsultationDraft,
  providerSlug: string | null,
): Promise<void> {
  const res = await apiClient.POST(
    "/api/v1/funeral-services/consultation-requests/" as never,
    {
      body: {
        name: draft.name,
        phone: draft.phone || undefined,
        email: draft.email || undefined,
        preferred_contact: draft.preferredContact,
        service_type: draft.serviceType || undefined,
        message: draft.message || undefined,
        provider_slug: providerSlug ?? undefined,
      },
    } as never,
  );
  if (!res.response.ok) {
    throw await ApiError.fromResponse(res.response, res.error);
  }
}

export interface FuneralHome {
  slug: string;
  name: string;
  city: string;
  region: string;
  address: string;
  phone: string;
  email: string;
  hours: string;
  services: string[];
  languages: string[];
  /** Respectful exterior/chapel photograph — rendered only when GAP-F02
   * supplies it. Empty string means "no photo"; we never invent imagery. */
  photo: string;
  photoAlt: string;
}

/** GET /api/v1/funeral-services/?location=…&service_type=…&language=… (GAP-F02). */
export async function fetchFuneralDirectory(
  filters: DirectoryFilters,
): Promise<FuneralHome[]> {
  const query: Record<string, string> = {};
  if (filters.location.trim()) query.location = filters.location.trim();
  if (filters.serviceType) query.service_type = filters.serviceType;
  if (filters.language) query.language = filters.language;
  const res = await apiClient.GET(
    "/api/v1/funeral-services/" as never,
    {
      query,
    } as never,
  );
  if (!res.response.ok) {
    throw await ApiError.fromResponse(res.response, res.error);
  }
  const r = (res.data ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(r.results) ? r.results : [];
  const listOfStrings = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === "string")
      : [];
  return raw
    .map((entry): FuneralHome | null => {
      const h = entry as Record<string, unknown>;
      if (typeof h.slug !== "string") return null;
      return {
        slug: h.slug,
        name: typeof h.name === "string" ? h.name : "—",
        city: typeof h.city === "string" ? h.city : "",
        region: typeof h.region === "string" ? h.region : "",
        address: typeof h.address === "string" ? h.address : "",
        phone: typeof h.phone === "string" ? h.phone : "",
        email: typeof h.email === "string" ? h.email : "",
        hours: typeof h.hours === "string" ? h.hours : "",
        services: listOfStrings(h.services),
        languages: listOfStrings(h.languages),
        photo: typeof h.photo_url === "string" ? h.photo_url : "",
        photoAlt: typeof h.photo_alt === "string" ? h.photo_alt : "",
      };
    })
    .filter((row): row is FuneralHome => row !== null);
}

export interface GalleryImage {
  url: string;
  alt: string;
}

export interface TeamMember {
  name: string;
  role: string;
  imageUrl: string;
}

export interface FuneralReview {
  author: string;
  text: string;
  at: string;
}

export interface FuneralHomeDetail extends FuneralHome {
  description: string;
  gallery: GalleryImage[];
  team: TeamMember[];
  reviews: FuneralReview[];
  /** WGS84 for the user-initiated OpenStreetMap embed. */
  latitude: number | null;
  longitude: number | null;
}

/** GET /api/v1/funeral-services/{slug}/ (GAP-F03). */
export async function fetchFuneralHome(
  slug: string,
): Promise<FuneralHomeDetail> {
  const res = await apiClient.GET(
    "/api/v1/funeral-services/{slug}/" as never,
    { params: { path: { slug } } } as never,
  );
  if (!res.response.ok) {
    throw await ApiError.fromResponse(res.response, res.error);
  }
  const r = (res.data ?? {}) as Record<string, unknown>;
  const str = (value: unknown): string =>
    typeof value === "string" ? value : "";
  const numOrNull = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) ? value : null;
  const gallery = Array.isArray(r.gallery) ? r.gallery : [];
  const team = Array.isArray(r.team) ? r.team : [];
  const reviews = Array.isArray(r.reviews) ? r.reviews : [];
  const listOfStrings = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === "string")
      : [];
  return {
    slug: str(r.slug) || slug,
    name: str(r.name) || "—",
    city: str(r.city),
    region: str(r.region),
    address: str(r.address),
    phone: str(r.phone),
    email: str(r.email),
    hours: str(r.hours),
    services: listOfStrings(r.services),
    languages: listOfStrings(r.languages),
    photo: str(r.photo_url),
    photoAlt: str(r.photo_alt),
    description: str(r.description),
    gallery: gallery
      .map((entry): GalleryImage | null => {
        const g = entry as Record<string, unknown>;
        if (typeof g.url !== "string") return null;
        return { url: g.url, alt: typeof g.alt === "string" ? g.alt : "" };
      })
      .filter((g): g is GalleryImage => g !== null),
    team: team
      .map((entry): TeamMember | null => {
        const m = entry as Record<string, unknown>;
        if (typeof m.name !== "string") return null;
        return {
          name: m.name,
          role: typeof m.role === "string" ? m.role : "",
          imageUrl: typeof m.image_url === "string" ? m.image_url : "",
        };
      })
      .filter((m): m is TeamMember => m !== null),
    reviews: reviews
      .map((entry): FuneralReview | null => {
        const v = entry as Record<string, unknown>;
        if (typeof v.text !== "string") return null;
        return {
          author: typeof v.author === "string" ? v.author : "",
          text: v.text,
          at: typeof v.at === "string" ? v.at : "",
        };
      })
      .filter((v): v is FuneralReview => v !== null),
    latitude: numOrNull(r.latitude),
    longitude: numOrNull(r.longitude),
  };
}
