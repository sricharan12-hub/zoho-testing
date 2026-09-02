import { guard, json, requireUser } from "@/lib/api";

export async function GET() {
  return guard(async () => {
    const user = await requireUser();
    return json({ user });
  });
}
