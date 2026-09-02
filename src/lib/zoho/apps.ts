import { env } from "@/lib/env";
import { zohoFetch, ZohoApiError } from "@/lib/zoho/client";
import "server-only";

/** Normalised shape so one UI component can render any Zoho module. */
export type ModuleData = {
  stats: { label: string; value: string }[];
  columns: { key: string; label: string }[];
  rows: Record<string, string>[];
};

export type ZohoAppKey = "people" | "crm" | "desk" | "books";

export type ZohoApp = {
  key: ZohoAppKey;
  name: string;
  /** The role the brief associates with this application. */
  role: string;
  purpose: string;
  permission: string;
  accent: string;
  /** Where "Open in Zoho" sends the user. */
  deepLink: () => string;
  load: () => Promise<ModuleData>;
};

const dash = (v: unknown): string =>
  v === null || v === undefined || v === "" ? "—" : String(v);

const tld = () => new URL(env.zohoAccountsUrl).hostname.split(".").pop();

// ------------------------------------------------------------------ People
async function loadPeople(): Promise<ModuleData> {
  const res = await zohoFetch<{
    response?: {
      result?: Record<string, string[]>[];
      errors?: { code?: number; message?: string };
    };
  }>({
    // People has its own host, and ignores the shared zohoapis domain.
    url: `${env.zohoPeopleDomain}/people/api/forms/employee/getRecords`,
    query: { sIndex: 1, limit: 25 },
  });

  // People answers HTTP 200 even when it failed, so the body must be checked.
  const failure = res.response?.errors;
  if (failure) {
    throw new ZohoApiError(
      502,
      String(failure.code ?? "people_error"),
      failure.message ?? "Zoho People returned an error.",
      failure.code === 7008
        ? "No Zoho People organisation exists for the service account. " +
          "Provision People at people.zoho.in, then reload."
        : undefined
    );
  }

  // People returns [{ "<recordId>": [ { field: value } ] }] — flatten it.
  const rows = (res.response?.result ?? []).flatMap((entry) =>
    Object.values(entry).flatMap((records) =>
      (records as unknown as Record<string, string>[]).map((r) => ({
        name: dash(`${r.First_Name ?? ""} ${r.Last_Name ?? ""}`.trim()),
        employeeId: dash(r.EmployeeID),
        designation: dash(r.Designation),
        department: dash(r.Department),
        email: dash(r.EmailID),
      }))
    )
  );

  return {
    stats: [{ label: "Employees", value: String(rows.length) }],
    columns: [
      { key: "name", label: "Name" },
      { key: "employeeId", label: "Employee ID" },
      { key: "designation", label: "Designation" },
      { key: "department", label: "Department" },
      { key: "email", label: "Email" },
    ],
    rows,
  };
}

// --------------------------------------------------------------------- CRM
async function loadCrm(): Promise<ModuleData> {
  const res = await zohoFetch<{ data?: Record<string, unknown>[] }>({
    url: "/crm/v8/Leads",
    query: { per_page: 25, fields: "Full_Name,Company,Email,Phone,Lead_Status" },
  });

  const rows = (res.data ?? []).map((lead) => ({
    name: dash(lead.Full_Name),
    company: dash(lead.Company),
    email: dash(lead.Email),
    phone: dash(lead.Phone),
    status: dash(lead.Lead_Status),
  }));

  return {
    stats: [{ label: "Leads", value: String(rows.length) }],
    columns: [
      { key: "name", label: "Lead" },
      { key: "company", label: "Company" },
      { key: "email", label: "Email" },
      { key: "phone", label: "Phone" },
      { key: "status", label: "Status" },
    ],
    rows,
  };
}

// -------------------------------------------------------------------- Desk
async function loadDesk(): Promise<ModuleData> {
  if (!env.zohoDeskOrgId) {
    throw new ZohoApiError(
      500,
      "missing_org_id",
      "ZOHO_DESK_ORG_ID is not set.",
      "Find it in Zoho Desk under Setup > Developer Space > API."
    );
  }

  const res = await zohoFetch<{ data?: Record<string, unknown>[] }>({
    url: `${env.zohoDeskDomain}/api/v1/tickets`,
    headers: { orgId: env.zohoDeskOrgId },
    query: { limit: 25, sortBy: "-createdTime" },
  });

  const tickets = res.data ?? [];
  const open = tickets.filter((t) => String(t.status).toLowerCase() === "open").length;

  return {
    stats: [
      { label: "Tickets", value: String(tickets.length) },
      { label: "Open", value: String(open) },
    ],
    columns: [
      { key: "ticketNumber", label: "#" },
      { key: "subject", label: "Subject" },
      { key: "status", label: "Status" },
      { key: "priority", label: "Priority" },
      { key: "contact", label: "Contact" },
    ],
    rows: tickets.map((t) => ({
      ticketNumber: dash(t.ticketNumber),
      subject: dash(t.subject),
      status: dash(t.status),
      priority: dash(t.priority),
      contact: dash((t.contact as { firstName?: string; lastName?: string } | null)
        ? `${(t.contact as { firstName?: string }).firstName ?? ""} ${
            (t.contact as { lastName?: string }).lastName ?? ""
          }`.trim()
        : null),
    })),
  };
}

// ------------------------------------------------------------------- Books
async function loadBooks(): Promise<ModuleData> {
  if (!env.zohoBooksOrgId) {
    throw new ZohoApiError(
      500,
      "missing_org_id",
      "ZOHO_BOOKS_ORGANIZATION_ID is not set.",
      "Run `npm run zoho:bootstrap -- --orgs --write` to fill it in."
    );
  }

  const res = await zohoFetch<{ invoices?: Record<string, unknown>[] }>({
    url: "/books/v3/invoices",
    query: { organization_id: env.zohoBooksOrgId, per_page: 25 },
  });

  const invoices = res.invoices ?? [];
  const outstanding = invoices.reduce(
    (sum, inv) => sum + Number(inv.balance ?? 0),
    0
  );

  return {
    stats: [
      { label: "Invoices", value: String(invoices.length) },
      { label: "Outstanding", value: outstanding.toFixed(2) },
    ],
    columns: [
      { key: "number", label: "Invoice" },
      { key: "customer", label: "Customer" },
      { key: "date", label: "Date" },
      { key: "status", label: "Status" },
      { key: "total", label: "Total" },
    ],
    rows: invoices.map((inv) => ({
      number: dash(inv.invoice_number),
      customer: dash(inv.customer_name),
      date: dash(inv.date),
      status: dash(inv.status),
      total: dash(inv.total_formatted ?? inv.total),
    })),
  };
}

export const ZOHO_APPS: Record<ZohoAppKey, ZohoApp> = {
  people: {
    key: "people",
    name: "Zoho People",
    role: "HR",
    purpose: "HR management functions",
    permission: "zoho.people.access",
    accent: "#e11d48",
    deepLink: () => `https://people.zoho.${tld()}`,
    load: loadPeople,
  },
  crm: {
    key: "crm",
    name: "Zoho CRM",
    role: "Sales",
    purpose: "Sales and customer relationship management",
    permission: "zoho.crm.access",
    accent: "#2563eb",
    deepLink: () => `https://crm.zoho.${tld()}`,
    load: loadCrm,
  },
  desk: {
    key: "desk",
    name: "Zoho Desk",
    role: "Support",
    purpose: "Support ticketing and case management",
    permission: "zoho.desk.access",
    accent: "#7c3aed",
    deepLink: () => `https://desk.zoho.${tld()}`,
    load: loadDesk,
  },
  books: {
    key: "books",
    name: "Zoho Books",
    role: "Finance",
    purpose: "Financial and accounting operations",
    permission: "zoho.books.access",
    accent: "#059669",
    deepLink: () =>
      `https://books.zoho.${tld()}/app/${env.zohoBooksOrgId}#/home`,
    load: loadBooks,
  },
};

export const ALL_APPS = Object.values(ZOHO_APPS);

export function isZohoAppKey(value: string): value is ZohoAppKey {
  return value in ZOHO_APPS;
}
