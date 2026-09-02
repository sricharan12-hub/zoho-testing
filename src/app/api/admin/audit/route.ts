import { fail, guard, json, requirePermission } from "@/lib/api";
import { listAudit } from "@/lib/admin/queries";

/** A date the filter can actually use, or null if the caller sent nonsense. */
function isValidDate(value: string | null): boolean {
  return value === null || !Number.isNaN(new Date(value).getTime());
}

export async function GET(request: Request) {
  return guard(async () => {
    await requirePermission("admin.audit.read", request);

    const url = new URL(request.url);

    // Left unchecked these reach `new Date(...).toISOString()`, which throws
    // "Invalid time value" and turns a typo in a filter into a 500.
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (!isValidDate(from)) return fail("Invalid `from` date.", 400);
    if (!isValidDate(to)) return fail("Invalid `to` date.", 400);

    const result = await listAudit({
      page: Number(url.searchParams.get("page") ?? 0) || 0,
      action: url.searchParams.get("action"),
      status: url.searchParams.get("status"),
      actor: url.searchParams.get("actor"),
      from,
      to,
    });

    return json(result);
  });
}
