/* eslint-disable */
/**
 * AUTO-GENERATED from the backend OpenAPI snapshot — DO NOT EDIT.
 * Regenerate: npm run generate:api (repo root: make api-schema)
 * Drift gate: npm run api:drift (runs in CI)
 * Source tool: openapi-typescript (types only; runtime = openapi-fetch).
 */
export interface paths {
    "/api/v1/auth/login/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * @description POST /api/v1/auth/login/ — email/password session login (GAP-U01).
         *
         *     Brute-force protection comes from AxesStandaloneBackend in
         *     AUTHENTICATION_BACKENDS: lockouts raise PermissionDenied out of
         *     authenticate() and surface as 429. Failed logins answer a single
         *     generic 401 — never which half (email vs password) was wrong
         *     (no user enumeration).
         */
        post: operations["auth_login_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/logout/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * @description POST /api/v1/auth/logout/ — expires the session (GAP-U02).
         *
         *     Anonymous logout is a 204 no-op, never an error: clients clear local
         *     state regardless, and punishing an already-expired session invites
         *     retry loops.
         */
        post: operations["auth_logout_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/register/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description POST /api/v1/auth/register/ — creates a buyer account. */
        post: operations["auth_register_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/session/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * @description GET /api/v1/auth/session/ — current session user (GAP-U03).
         *
         *     401 for anonymous callers (the frontend maps 401/403 to `null` —
         *     probing the session must never redirect or toast).
         */
        get: operations["auth_session_retrieve"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/cart/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * @description GET /api/v1/cart/ — the authenticated user's active cart (GAP-O01).
         *
         *     Read-only: a GET never creates the cart. Users without one receive an
         *     empty envelope (cart_id=null) — the frontend treats that as "draft only".
         */
        get: operations["cart_retrieve"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/cart/items/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * @description POST /api/v1/cart/items/ — add a published listing (GAP-O02).
         *
         *     Adding the same listing again SUMS the quantity (capped) instead of
         *     duplicating the line (uniq_cart_item_listing constraint).
         */
        post: operations["cart_items_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/cart/items/{item_id}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * @description PATCH/DELETE /api/v1/cart/items/{id}/ (GAP-O05/O06).
         *
         *     Lines are scoped through the requester's ACTIVE cart: foreign or stale
         *     ids answer 404, never another user's data.
         */
        delete: operations["cart_items_destroy"];
        options?: never;
        head?: never;
        /**
         * @description PATCH/DELETE /api/v1/cart/items/{id}/ (GAP-O05/O06).
         *
         *     Lines are scoped through the requester's ACTIVE cart: foreign or stale
         *     ids answer 404, never another user's data.
         */
        patch: operations["cart_items_partial_update"];
        trace?: never;
    };
    "/api/v1/cart/sync/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * @description POST /api/v1/cart/sync/ — merge the guest draft on login (GAP-O07).
         *
         *     Merge contract: same product present on both sides SUMS quantities
         *     (capped at MAX_LINE_QUANTITY); product data (title/price) always comes
         *     from the server's live listing — server wins on conflict. Unknown or
         *     unpublished ids are skipped silently: the draft is best-effort input,
         *     and punishing a login for a stale draft would be hostile UX. Responds
         *     with the full merged envelope so the caller can apply it in one pass.
         */
        post: operations["cart_sync_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/catalog/home/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * @description GET /api/v1/catalog/home/ — hero + curated categories + featured rail.
         *
         *     Curation is explicit and editorial (Category.homepage_rank,
         *     ProductListing.is_featured): nothing "trending" is synthesized from
         *     behavioral data — zero analytics until consent infra v2.
         */
        get: operations["catalog_home_retrieve"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/categories/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * @description GET /api/v1/categories/ — flat category index (GAP-P05).
         *
         *     Two consumers, one payload: the seller listing form needs the UUID
         *     (`id`) for category_id, the search facet needs the URL slug. Both are
         *     returned; names follow Accept-Language.
         */
        get: operations["categories_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/categories/{slug}/products/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * @description GET /api/v1/categories/{slug}/products/ — public category grid (GAP-P02).
         *
         *     Server-side pagination + commerce filters (price range, seller set,
         *     sort). All parameters are non-PII commerce state, safe to share in
         *     URLs (ADR-0009); the frontend island rewrites the query string and
         *     this view re-renders. `in_stock` is accepted but a no-op until the
         *     inventory model lands (MVP-P2) — silently faking stock would breach
         *     ADR-0007, so the storefront omits the toggle for now.
         */
        get: operations["categories_products_retrieve"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orders/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description POST creates (GAP-O08); GET lists history (GAP-O03). */
        get: operations["orders_retrieve"];
        put?: never;
        /** @description POST creates (GAP-O08); GET lists history (GAP-O03). */
        post: operations["orders_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orders/{order_id}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * @description GET /api/v1/orders/{id}/ — confirmation + tracking entry (GAP-O04).
         *
         *     Scoped to the buyer: foreign ids answer 404 (no existence leak).
         */
        get: operations["orders_retrieve_2"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orders/checkout/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description POST /api/v1/orders/checkout/ — requires the Idempotency-Key header. */
        post: operations["orders_checkout_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orders/shipping-options/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description POST /api/v1/orders/shipping-options/ — per-country delivery methods. */
        post: operations["orders_shipping_options_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/products/{slug}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * @description GET /api/v1/products/{slug}/ — public product detail (GAP-P03).
         *
         *     The public identifier is the listing UUID (no slug field yet); the
         *     /p/{slug} route passes it verbatim. Unpublished or unknown ids return
         *     404 — no enumeration of drafts (same posture as the home rail).
         */
        get: operations["products_retrieve"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/products/{slug}/related/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * @description GET /api/v1/products/{slug}/related/ — PDP rail (GAP-P04).
         *
         *     Same-category siblings of a published listing, newest first, capped at
         *     RELATED_LIMIT. The frontend streams this inside Suspense — the rail is
         *     optional merchandising, so an empty list simply renders nothing there.
         *     Unknown or unpublished ids return 404 (same posture as the detail view:
         *     no enumeration of drafts).
         */
        get: operations["products_related_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/search/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * @description POST /api/v1/search/ — full-text search over published listings (GAP-S01).
         *
         *     Commerce filters (category slug, price range, seller name fragment)
         *     apply server-side after the recall pool. `availability`/`delivery` are
         *     accepted but no-ops until inventory/shipping models land — filtering on
         *     data we do not have would be fake UX (ADR-0007).
         */
        post: operations["search_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/search/suggest/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * @description GET /api/v1/search/suggest/ — command-palette suggestions (GAP-S02).
         *
         *     Tiny result sets by design (3 per facet); suggestions are ephemeral
         *     keystroke aids, so a light GET is acceptable here while the full query
         *     stays POST-only.
         */
        get: operations["search_suggest_retrieve"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/sellers/{slug}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description GET /api/v1/sellers/{slug}/ — public seller profile (GAP-V05). */
        get: operations["sellers_retrieve"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/sellers/{slug}/products/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description GET /api/v1/sellers/{slug}/products/ — storefront grid (GAP-V06). */
        get: operations["sellers_products_retrieve"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/shipping/lockers/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description GET /api/v1/shipping/lockers/?country=…&carrier=… — locker picker data. */
        get: operations["shipping_lockers_retrieve"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/tax/vat-id/validate/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description POST /api/v1/tax/vat-id/validate/ — live VIES VAT ID validation. */
        post: operations["tax_vat_id_validate_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        CartAddItemRequest: {
            product_id: string;
            quantity?: number;
        };
        CartSyncLineRequest: {
            product_id: string;
            slug?: string;
            quantity?: number;
        };
        CartSyncRequest: {
            items: components["schemas"]["CartSyncLineRequest"][];
        };
        CategoryHome: {
            slug: string;
            name: string;
            readonly description: string;
            readonly image: string;
        };
        /**
         * @description Flat category index (GAP-P05): UUID for listing forms, slug for
         *     search facets/URLs, localized name for display.
         */
        CategoryPicker: {
            id: string;
            slug: string;
            name: string;
        };
        /** @description Pagination envelope + category meta + facets (GAP-P02). */
        CategoryProductsPage: {
            count: number;
            page: number;
            page_size: number;
            results: components["schemas"]["ListingHome"][];
            category: components["schemas"]["CategoryHome"];
            facets: components["schemas"]["Facets"];
        };
        CheckoutRequest: {
            /** Format: uuid */
            cart_id: string;
            /** @default  */
            shipping_country: components["schemas"]["ShippingCountryEnum"];
        };
        CheckoutResponse: {
            /** Format: uuid */
            order_id: string;
            order_number: string;
            status: string;
            /** Format: decimal */
            total_gross: string;
            currency: string;
        };
        /**
         * @description * `LT` - LT
         *     * `LV` - LV
         *     * `EE` - EE
         * @enum {string}
         */
        CountryEnum: "LT" | "LV" | "EE";
        /** @description Top sellers in a category, for the filter island (GAP-P02). */
        FacetSeller: {
            slug: string;
            name: string;
            count: number;
        };
        Facets: {
            sellers: components["schemas"]["FacetSeller"][];
        };
        Hero: {
            title: string;
            subtitle?: string;
            image?: components["schemas"]["ProductImage"] | null;
        };
        /**
         * @description Envelope for GET /api/v1/catalog/home/ (OpenAPI documentation shape).
         *
         *     `hero` is nullable: served from the admin-managed micro-CMS
         *     (HomeHeroContent); null when no active hero exists and the frontend
         *     renders no hero section (ADR-0007).
         */
        HomeContent: {
            hero: components["schemas"]["Hero"] | null;
            categories: components["schemas"]["CategoryHome"][];
            featured: components["schemas"]["ListingHome"][];
        };
        /**
         * @description * `lt` - lt
         *     * `lv` - lv
         *     * `et` - et
         *     * `en` - en
         * @enum {string}
         */
        LanguageEnum: "lt" | "lv" | "et" | "en";
        /**
         * @description Product detail projection (GAP-P03).
         *
         *     Extends the card projection with a safe HTML rendering of the
         *     description: seller text is escaped per paragraph and wrapped in our
         *     own <p> tags only — the frontend sanitizes again with DOMPurify.
         */
        ListingDetail: {
            id: string;
            readonly slug: string;
            title: string;
            readonly price_gross: string;
            currency?: string;
            readonly image: string;
            readonly images: unknown[];
            readonly description_html: string;
            readonly seller: {
                [key: string]: unknown;
            };
            readonly rating: string;
            readonly vat_note: string;
        };
        /** @description Published-listing card projection for the home featured rail. */
        ListingHome: {
            id: string;
            readonly slug: string;
            title: string;
            readonly price_gross: string;
            currency?: string;
            readonly image: string;
            readonly images: unknown[];
            readonly description_html: string;
            readonly seller: {
                [key: string]: unknown;
            };
            readonly rating: string;
            readonly vat_note: string;
        };
        LockerDirectory: {
            country: string;
            carrier: string;
            source: string;
            lockers: {
                [key: string]: unknown;
            }[];
        };
        LoginRequest: {
            /** Format: email */
            email: string;
            password: string;
            /** @default false */
            remember: boolean;
        };
        /**
         * @description * `courier` - courier
         *     * `dpd_locker` - dpd_locker
         *     * `omniva_locker` - omniva_locker
         * @enum {string}
         */
        MethodEnum: "courier" | "dpd_locker" | "omniva_locker";
        /** @description Either an existing active cart OR explicit lines — never both needed. */
        OrderCreateRequest: {
            /** Format: uuid */
            cart_id?: string;
            items?: components["schemas"]["_OrderLineRequest"][];
            shipping: components["schemas"]["_OrderShippingRequest"];
            vat_id?: string;
        };
        OrderCreated: {
            /** Format: uuid */
            order_id: string;
            order_number: string;
            status: string;
            total_gross: string;
            currency: string;
            client_secret: string | null;
        };
        OrderDetail: {
            /** Format: uuid */
            order_id: string;
            order_number: string;
            status: string;
            currency: string;
            total_gross: string;
            shipping_fee: string;
            shipping_method: string;
            eta_days: string | null;
            items: {
                [key: string]: unknown;
            }[];
        };
        PatchedCartUpdateItemRequest: {
            quantity?: number;
        };
        ProductImage: {
            url: string;
            alt?: string;
            width?: number;
            height?: number;
        };
        /**
         * @description Buyer-facing seller profile.
         *
         *     `slug` derives deterministically from the company name (slugify) —
         *     sellers_app ships no slug column; any consumer of this contract must
         *     use the same derivation (frontend storefront links, facets).
         */
        PublicSeller: {
            readonly slug: string;
            name: string;
            readonly description: string;
            readonly logo_url: string;
            readonly verified: boolean;
            location: string;
            country: string;
            readonly member_since: string;
        };
        RegisterRequest: {
            /** Format: email */
            email: string;
            password: string;
            /** @default en */
            language: components["schemas"]["LanguageEnum"];
        };
        /**
         * @description * `buyer` - buyer
         *     * `seller` - seller
         *     * `admin` - admin
         * @enum {string}
         */
        RoleEnum: "buyer" | "seller" | "admin";
        SearchQueryRequest: {
            q: string;
            page?: number;
            page_size?: number;
            category?: string;
            price_min?: string;
            price_max?: string;
            seller?: string;
            availability?: string;
            delivery?: string;
        };
        SearchResults: {
            results: components["schemas"]["ListingHome"][];
            page: number;
            total_pages: number;
            ranking: string;
        };
        SearchSuggestions: {
            categories: {
                [key: string]: unknown;
            }[];
            products: components["schemas"]["ListingHome"][];
            sellers: {
                [key: string]: unknown;
            }[];
        };
        /** @description Pagination envelope for the seller storefront grid (GAP-V06). */
        SellerProductsPage: {
            count: number;
            page: number;
            page_size: number;
            results: components["schemas"]["ListingHome"][];
        };
        /** @description Consumer-driven against frontend/src/lib/auth.ts SessionUserSchema. */
        SessionUser: {
            id: string;
            /** Format: email */
            email: string;
            role: components["schemas"]["RoleEnum"];
            language?: string;
            is_verified?: boolean;
            seller_slug?: string | null;
        };
        /**
         * @description * `LT` - LT
         *     * `LV` - LV
         *     * `EE` - EE
         * @enum {string}
         */
        ShippingCountryEnum: "LT" | "LV" | "EE";
        ShippingOptions: {
            country: string;
            options: {
                [key: string]: unknown;
            }[];
        };
        ShippingOptionsQueryRequest: {
            country: components["schemas"]["CountryEnum"];
        };
        User: {
            /** Format: uuid */
            readonly id: string;
            /**
             * Email address
             * Format: email
             */
            readonly email: string;
            /** Format: date-time */
            readonly date_joined: string;
        };
        VatIdValidateRequest: {
            vat_id: string;
        };
        VatIdValidateResult: {
            vat_id: string;
            valid: boolean;
            country: string;
            vies_checked: boolean;
            vies_available: boolean;
            source: string;
            name: string;
            address: string;
        };
        _CartEnvelopeSchema: {
            cart_id: string | null;
            items: components["schemas"]["_ItemResponseSchema"][];
        };
        _ItemResponseSchema: {
            id: string;
            product_id: string;
            slug: string;
            title: string;
            price: string;
            currency: string;
            quantity: number;
        };
        _OrderAddressRequest: {
            full_name: string;
            street: string;
            city: string;
            postal_code: string;
            country: components["schemas"]["CountryEnum"];
            phone: string;
        };
        _OrderLineRequest: {
            /** Format: uuid */
            product_id: string;
            quantity: number;
        };
        _OrderShippingRequest: {
            method: components["schemas"]["MethodEnum"];
            locker_id?: string;
            address: components["schemas"]["_OrderAddressRequest"];
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    auth_login_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LoginRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["LoginRequest"];
                "multipart/form-data": components["schemas"]["LoginRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionUser"];
                };
            };
        };
    };
    auth_logout_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description No response body */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    auth_register_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RegisterRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["RegisterRequest"];
                "multipart/form-data": components["schemas"]["RegisterRequest"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["User"];
                };
            };
        };
    };
    auth_session_retrieve: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionUser"];
                };
            };
        };
    };
    cart_retrieve: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["_CartEnvelopeSchema"];
                };
            };
        };
    };
    cart_items_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CartAddItemRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["CartAddItemRequest"];
                "multipart/form-data": components["schemas"]["CartAddItemRequest"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["_ItemResponseSchema"];
                };
            };
        };
    };
    cart_items_destroy: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                item_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["_ItemResponseSchema"];
                };
            };
        };
    };
    cart_items_partial_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                item_id: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["PatchedCartUpdateItemRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["PatchedCartUpdateItemRequest"];
                "multipart/form-data": components["schemas"]["PatchedCartUpdateItemRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["_ItemResponseSchema"];
                };
            };
        };
    };
    cart_sync_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CartSyncRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["CartSyncRequest"];
                "multipart/form-data": components["schemas"]["CartSyncRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["_CartEnvelopeSchema"];
                };
            };
        };
    };
    catalog_home_retrieve: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HomeContent"];
                };
            };
        };
    };
    categories_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CategoryPicker"][];
                };
            };
        };
    };
    categories_products_retrieve: {
        parameters: {
            query?: {
                page?: number;
                page_size?: number;
                price_max?: string;
                price_min?: string;
                /** @description Comma-separated derived seller slugs. */
                sellers?: string;
                sort?: "name" | "newest" | "price_asc" | "price_desc";
            };
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CategoryProductsPage"];
                };
            };
        };
    };
    orders_retrieve: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrderCreated"];
                };
            };
        };
    };
    orders_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OrderCreateRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["OrderCreateRequest"];
                "multipart/form-data": components["schemas"]["OrderCreateRequest"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrderCreated"];
                };
            };
        };
    };
    orders_retrieve_2: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                order_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrderDetail"];
                };
            };
        };
    };
    orders_checkout_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CheckoutRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["CheckoutRequest"];
                "multipart/form-data": components["schemas"]["CheckoutRequest"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CheckoutResponse"];
                };
            };
        };
    };
    orders_shipping_options_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ShippingOptionsQueryRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["ShippingOptionsQueryRequest"];
                "multipart/form-data": components["schemas"]["ShippingOptionsQueryRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ShippingOptions"];
                };
            };
        };
    };
    products_retrieve: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ListingDetail"];
                };
            };
        };
    };
    products_related_list: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ListingHome"][];
                };
            };
        };
    };
    search_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SearchQueryRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["SearchQueryRequest"];
                "multipart/form-data": components["schemas"]["SearchQueryRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SearchResults"];
                };
            };
        };
    };
    search_suggest_retrieve: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SearchSuggestions"];
                };
            };
        };
    };
    sellers_retrieve: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublicSeller"];
                };
            };
        };
    };
    sellers_products_retrieve: {
        parameters: {
            query?: {
                page?: number;
                page_size?: number;
            };
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SellerProductsPage"];
                };
            };
        };
    };
    shipping_lockers_retrieve: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LockerDirectory"];
                };
            };
        };
    };
    tax_vat_id_validate_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VatIdValidateRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["VatIdValidateRequest"];
                "multipart/form-data": components["schemas"]["VatIdValidateRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VatIdValidateResult"];
                };
            };
        };
    };
}
