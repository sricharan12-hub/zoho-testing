import { guard, json, requirePermission } from "@/lib/api";
import { listAudit } from "@/lib/admin/queries";

export async function GET(request: Request) {
  return guard(async () => {
    await requirePermission("admin.audit.read", request);

    const url = new URL(request.url);
    const result = await listAudit({
      page: Number(url.searchParams.get("page") ?? 0) || 0,
      action: url.searchParams.get("action"),
      status: url.searchParams.get("status"),
      actor: url.searchParams.get("actor"),
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    });

    return json(result);
  });
}
