import axios from "axios";
import { getGraphToken, GRAPH_SCOPE } from "../auth/graph.js";
import { writeStagingFile } from "../staging.js";
import { getConfig } from "../config.js";
import type { Job } from "./base.js";

type A = Record<string, unknown>;

async function fetchPlannerTasks(token: string, planId: string): Promise<A[]> {
  const client = axios.create({
    baseURL: "https://graph.microsoft.com/v1.0",
    timeout: 30_000,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });

  const res = await client.get<{ value: A[] }>(`/planner/plans/${planId}/tasks`);
  const tasks = res.data.value ?? [];

  return tasks
    .filter((t) => t["percentComplete"] !== 100)
    .map((t) => ({
      id: t["id"],
      title: t["title"],
      bucketId: t["bucketId"],
      percentComplete: t["percentComplete"],
      dueDateTime: t["dueDateTime"],
      priority: t["priority"],
      assignments: t["assignments"],
      createdDateTime: t["createdDateTime"],
    }));
}

export const plannerJob: Job = {
  name: "planner",

  async run(stagingDir: string) {
    const token = await getGraphToken(GRAPH_SCOPE);
    const tasks = await fetchPlannerTasks(token, getConfig().planner.planId);
    writeStagingFile(stagingDir, "planner-tasks.json", tasks);
    return { files: ["planner-tasks.json"], records: tasks.length };
  },
};
