// Normalisation des leads entrants (webhook /api/leads/inbound) : formulaire Brevo,
// lead Meta (via Make), formulaire de landing (Manus), Calendly (invitee.created).
// Pure (testable) : on lit des noms de champs variés, on ressort une structure unique.

import { segmentFromText } from "@/lib/leads/csv";

export type InboundLead = {
  kind: "lead";
  company: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  postalCode: string | null;
  positions: string | null;
  positionsCount: number | null;
  message: string | null;
  source: "formulaire_meta" | "site" | "appel_entrant" | "recommandation" | "terrain" | "autre";
  campaign: string | null;
  segment: string | null;
};

export type InboundCalendly = {
  kind: "calendly";
  action: "created" | "canceled";
  name: string | null;
  email: string | null;
  phone: string | null;
  startsAt: string | null; // ISO
  locationKind: "telephone" | "sur_site" | "visio" | null;
  answers: string | null;
  cancelReason: string | null;
  hostEmail: string | null; // qui tient le créneau (Calendly du setter ≠ Calendly de la direction)
  eventName: string | null; // nom du type d'événement Calendly (« Appel découverte », « RDV 30 min »…)
};

export type Inbound = InboundLead | InboundCalendly;

function normKey(k: string): string {
  return k
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

type Flat = Record<string, string>;

// Aplatit le payload : champs racine, `attributes` (Brevo), `field_data` (Meta), `data`/`contact`/`lead`/`fields`/`form`.
export function flattenPayload(payload: unknown): Flat {
  const out: Flat = {};
  const put = (k: string, v: unknown) => {
    if (v == null) return;
    if (Array.isArray(v)) {
      const first = v.find((x) => x != null && typeof x !== "object");
      if (first != null) put(k, first);
      return;
    }
    if (typeof v === "object") return;
    const s = String(v).trim();
    if (s && !(normKey(k) in out)) out[normKey(k)] = s;
  };
  const walk = (obj: unknown, depth: number) => {
    if (!obj || typeof obj !== "object" || depth > 3) return;
    if (Array.isArray(obj)) {
      // Meta lead ads : [{ name, values: [...] }]
      for (const item of obj) {
        if (item && typeof item === "object" && "name" in item && ("values" in item || "value" in item)) {
          const it = item as { name: string; values?: unknown[]; value?: unknown };
          put(it.name, it.values ?? it.value);
        }
      }
      return;
    }
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (v && typeof v === "object") {
        const nk = normKey(k);
        if (["attributes", "data", "contact", "lead", "fields", "form", "field_data", "properties", "answers", "custom_fields"].includes(nk)) walk(v, depth + 1);
        else if (Array.isArray(v)) put(k, v);
      } else put(k, v);
    }
  };
  walk(payload, 0);
  return out;
}

function pick(flat: Flat, aliases: string[], contains: string[] = []): string | null {
  for (const a of aliases) {
    const v = flat[normKey(a)];
    if (v) return v;
  }
  for (const [k, v] of Object.entries(flat)) {
    if (contains.some((c) => k.includes(c)) && v) return v;
  }
  return null;
}

const SOURCES = ["formulaire_meta", "site", "appel_entrant", "recommandation", "terrain", "autre"] as const;

export function normalizeInbound(payload: unknown): Inbound | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;

  // ── Calendly ────────────────────────────────────────────────────────────
  const eventName = typeof p.event === "string" ? p.event : null;
  if (eventName && eventName.startsWith("invitee.") && p.payload && typeof p.payload === "object") {
    const inv = p.payload as Record<string, unknown>;
    const scheduled = (inv.scheduled_event ?? {}) as Record<string, unknown>;
    const location = (scheduled.location ?? {}) as Record<string, unknown>;
    const qa = Array.isArray(inv.questions_and_answers) ? (inv.questions_and_answers as { question?: string; answer?: string }[]) : [];
    const phoneFromQa = qa.find((q) => /t[ée]l|phone|portable|mobile/i.test(q.question ?? ""))?.answer ?? null;
    const phone = (typeof inv.text_reminder_number === "string" && inv.text_reminder_number) || (typeof location.location === "string" && /^\+?[\d\s.]+$/.test(location.location) ? location.location : null) || phoneFromQa;
    const locType = typeof location.type === "string" ? location.type : "";
    const locationKind: InboundCalendly["locationKind"] =
      /phone|call/.test(locType) ? "telephone" : /physical|custom|in_person/.test(locType) ? "sur_site" : /google|zoom|teams|meet|conference/.test(locType) ? "visio" : null;
    const cancellation = (inv.cancellation ?? null) as { reason?: string } | null;
    const memberships = Array.isArray(scheduled.event_memberships) ? (scheduled.event_memberships as { user_email?: string }[]) : [];
    const hostEmail = memberships.find((m) => typeof m.user_email === "string")?.user_email ?? null;
    return {
      kind: "calendly",
      action: eventName === "invitee.canceled" ? "canceled" : "created",
      name: typeof inv.name === "string" ? inv.name : null,
      email: typeof inv.email === "string" ? inv.email : null,
      phone: phone ? String(phone) : null,
      startsAt: typeof scheduled.start_time === "string" ? scheduled.start_time : null,
      locationKind,
      answers: qa.length ? qa.map((q) => `${q.question ?? ""} : ${q.answer ?? ""}`).join(" · ") : null,
      cancelReason: cancellation?.reason ?? null,
      hostEmail,
      eventName: typeof scheduled.name === "string" ? scheduled.name : null,
    };
  }

  // ── Formulaire / Brevo / Meta ───────────────────────────────────────────
  const flat = flattenPayload(payload);
  const company = pick(flat, ["entreprise", "restaurant", "societe", "company", "enseigne", "etablissement", "nom_du_restaurant", "nom_restaurant", "business", "raison_sociale", "organisation"], ["restaurant", "entreprise", "societe", "company"]);
  const email = pick(flat, ["email", "e_mail", "mail", "courriel", "adresse_email"], ["email", "mail"]);
  const phone = pick(flat, ["telephone", "phone", "phone_number", "mobile", "portable", "sms", "tel", "numero", "numero_de_telephone", "whatsapp"], ["telephone", "phone", "portable", "mobile"]);
  const first = pick(flat, ["prenom", "firstname", "first_name", "given_name"]);
  const last = pick(flat, ["nom", "lastname", "last_name", "family_name", "surname"]);
  const full = pick(flat, ["nom_complet", "full_name", "fullname", "name", "contact", "nom_prenom", "prenom_nom", "contact_prenom_nom"]);
  const contactName = full ?? ([first, last].filter(Boolean).join(" ") || null);
  if (!company && !email && !phone) return null;

  const cityRaw = pick(flat, ["ville", "city", "commune", "ville_cp", "localite"]);
  const postal = pick(flat, ["cp", "code_postal", "postal_code", "zip", "zipcode", "postcode"]);
  const cpInCity = cityRaw?.match(/\b(\d{5})\b/)?.[1] ?? null;
  const positions = pick(flat, ["postes", "poste", "positions", "position", "metier", "job", "besoin", "recrutement", "postes_a_pourvoir", "type_de_poste"], ["poste", "besoin"]);
  const nbRaw = pick(flat, ["nb_postes", "nombre_de_postes", "nombre", "positions_count", "count", "nb", "combien"]);
  const message = pick(flat, ["message", "commentaire", "comment", "notes", "note", "precisions", "description"]);
  const utmSource = pick(flat, ["utm_source", "source_utm", "platform", "plateforme"]);
  const sourceRaw = pick(flat, ["source", "canal", "channel", "origine"]);
  const campaign = pick(flat, ["utm_campaign", "campaign", "campagne", "utm_content", "visuel", "ad_name", "adset_name", "form_name"]);
  const segmentRaw = pick(flat, ["type_d_etablissement", "type_etablissement", "segment", "secteur", "type", "categorie"]);

  const sourceNorm = (sourceRaw ?? "").toLowerCase();
  const source: InboundLead["source"] = (SOURCES as readonly string[]).includes(sourceNorm)
    ? (sourceNorm as InboundLead["source"])
    : /facebook|instagram|meta|fb|ig/.test(`${sourceNorm} ${utmSource ?? ""}`.toLowerCase())
      ? "formulaire_meta"
      : /appel|telephone|phone/.test(sourceNorm)
        ? "appel_entrant"
        : /recommand|bouche/.test(sourceNorm)
          ? "recommandation"
          : "site";

  return {
    kind: "lead",
    company: company ?? (contactName ? `Restaurant de ${contactName}` : (email ?? phone ?? "Lead sans nom")),
    contactName,
    phone,
    email,
    city: cityRaw ? cityRaw.replace(/\b\d{5}\b/, "").replace(/[\s,]+$/, "").trim() || null : null,
    postalCode: postal ?? cpInCity,
    positions,
    positionsCount: nbRaw ? Number(nbRaw.replace(/\D/g, "")) || null : null,
    message,
    source,
    campaign,
    segment: segmentFromText(segmentRaw),
  };
}
