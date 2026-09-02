import { guard, json, requirePermission } from "@/lib/api";
import { listPermissions } from "@/lib/admin/queries";

export async function GET(request: Request) {
  return guard(async () => {
    await requirePermission("admin.roles.read", request);
    return json({ permissions: await listPermissions() });
  });
}
