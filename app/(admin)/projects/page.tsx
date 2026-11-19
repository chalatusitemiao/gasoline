import type { Metadata } from "next";
import { ProjectManager } from "@/components/fuel/project-manager";
import { requirePageSession } from "@/lib/auth";

export const metadata: Metadata = { title: "项目档案" };

export default async function ProjectsPage() {
  await requirePageSession("archives:view");
  return <ProjectManager />;
}
