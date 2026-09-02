import { guard, json, requirePermission } from "@/lib/api";
import {
  listTeamMembers,
  teamActivityForDepartment,
} from "@/lib/admin/queries";

/**
 * Manager-scoped team report. The department comes from the caller's own
 * record, never from a query parameter, so one manager cannot read another
 * department by editing the URL.
 */
export async function GET(request: Request) {
  return guard(async () => {
    const user = await requirePermission("team.reports.read", request);

    if (!user.department) {
      return json({ department: null, members: [], activity: [] });
    }

    const [members, activity] = await Promise.all([
      listTeamMembers(user.department),
      teamActivityForDepartment(user.department),
    ]);

    return json({ department: user.department, members, activity });
  });
}
