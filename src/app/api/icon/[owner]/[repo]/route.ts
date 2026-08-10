import { renderBookIcon } from "@/lib/book-icon";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/icon/[owner]/[repo]">
) {
  const { owner, repo } = await context.params;
  return renderBookIcon(owner, repo);
}
